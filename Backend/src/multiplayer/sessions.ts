import {
  DEFAULT_MAP_ID,
  Locomotion,
  NET_LIMITS,
  type NetError,
  type ParticipantAppearance,
  type ParticipantTransform,
  type ProfileDraft,
  type PublicPlayerProfile,
  type WireParticipant,
  type WorldRefreshSlices,
  type WorldSave,
} from 'core'

import { newJoinCode, newPlayerId, newSessionId, normalizeJoinCode } from './codes.js'
import { netError } from './validate.js'

/**
 * 会话管理。**纯状态机，不碰 socket.io**——转发、房间广播那层皮在
 * handlers.ts。分开的直接动机是测试：状态机的每条分支（满员、错码、
 * 房主离开）都能用普通函数调用打到，不用起一台真服务器。
 *
 * 全部在内存里。单进程能带几百个 5 人房；重启丢会话在"进房间玩一会儿"
 * 的产品语境下可接受（房主重开一局就是了）。要跨进程/重启保活时再上
 * Redis——那是 M5 的部署问题，不是现在的结构问题。
 */

export type Participant = {
  profile: PublicPlayerProfile
  socketId: string
  /** 最后一次上报。晚加入的人靠它第一帧就把人摆对 */
  transform: ParticipantTransform
  appearance: ParticipantAppearance
}

export type Session = {
  sessionId: string
  joinCode: string
  hostPlayerId: string
  /** 建房时房主报的存档版本。后来者必须相等，服务端不做迁移（见契约） */
  saveSchemaVersion: number
  world: WorldSave
  revision: number
  participants: Map<string, Participant>
}

/** 没上报过 transform 之前的占位。客户端入房后第一拍就会覆盖它 */
const ZERO_TRANSFORM: ParticipantTransform = {
  mapId: DEFAULT_MAP_ID,
  x: 0,
  y: 0,
  heading: 0,
  locomotion: Locomotion.Idle,
  liftHeight: 0,
}

const DEFAULT_APPEARANCE: ParticipantAppearance = {
  heldItem: null,
  restingOn: null,
  posture: 'stand',
  activity: null,
}

type SocketRef = { sessionId: string; playerId: string }

export type LeaveOutcome =
  | { kind: 'none' }
  | { kind: 'guest_left'; session: Session; playerId: string }
  | { kind: 'host_left'; session: Session }

export class SessionManager {
  private readonly sessions = new Map<string, Session>()
  private readonly byJoinCode = new Map<string, string>()
  private readonly bySocket = new Map<string, SocketRef>()

  create(options: {
    socketId: string
    saveSchemaVersion: number
    profile: ProfileDraft
    world: WorldSave
    transform?: ParticipantTransform
  }): { session: Session; playerId: string } | NetError {
    if (this.bySocket.has(options.socketId)) {
      return netError('already_in_session', '这条连接已经在一个房间里了')
    }

    const sessionId = newSessionId()
    // 撞码就重摇。6 位码空间 ~9 亿，同时在线几千房也几乎撞不到，
    // 循环只是把"几乎"变成"绝不"
    let joinCode = newJoinCode()
    while (this.byJoinCode.has(joinCode)) joinCode = newJoinCode()

    const playerId = newPlayerId()
    const session: Session = {
      sessionId,
      joinCode,
      hostPlayerId: playerId,
      saveSchemaVersion: options.saveSchemaVersion,
      world: options.world,
      revision: 0,
      participants: new Map(),
    }
    session.participants.set(playerId, {
      profile: { playerId, ...options.profile },
      socketId: options.socketId,
      transform: options.transform ?? { ...ZERO_TRANSFORM },
      appearance: { ...DEFAULT_APPEARANCE },
    })

    this.sessions.set(sessionId, session)
    this.byJoinCode.set(joinCode, sessionId)
    this.bySocket.set(options.socketId, { sessionId, playerId })

    return { session, playerId }
  }

  join(options: {
    socketId: string
    joinCode: string
    saveSchemaVersion: number
    profile: ProfileDraft
    transform?: ParticipantTransform
  }): { session: Session; playerId: string } | NetError {
    if (this.bySocket.has(options.socketId)) {
      return netError('already_in_session', '这条连接已经在一个房间里了')
    }

    const sessionId = this.byJoinCode.get(normalizeJoinCode(options.joinCode))
    const session = sessionId ? this.sessions.get(sessionId) : undefined
    if (!session) {
      return netError('not_found', '没有这个邀请码的房间——检查一下拼写，或者请房主重新开房')
    }

    if (session.saveSchemaVersion !== options.saveSchemaVersion) {
      return netError(
        'version_mismatch',
        '你和房主的游戏版本不一致，更新到同一版本再试',
      )
    }

    if (session.participants.size >= NET_LIMITS.maxPlayers) {
      return netError('session_full', `这个房间已经满了（上限 ${NET_LIMITS.maxPlayers} 人）`)
    }

    const playerId = newPlayerId()
    session.participants.set(playerId, {
      profile: { playerId, ...options.profile },
      socketId: options.socketId,
      transform: options.transform ?? { ...ZERO_TRANSFORM },
      appearance: { ...DEFAULT_APPEARANCE },
    })
    this.bySocket.set(options.socketId, { sessionId: session.sessionId, playerId })

    return { session, playerId }
  }

  /**
   * 一条连接退场（主动 leave 和断线走同一条路——对房间来说没区别）。
   *
   * 房主退场 = 会话结束。M1 不做 60s 宽限：宽限期要解决"房主世界谁保管"
   * 和重连鉴权，那是 M4 的一整块，不该在这里顺手糊一半。
   */
  leave(socketId: string): LeaveOutcome {
    const ref = this.bySocket.get(socketId)
    if (!ref) return { kind: 'none' }
    this.bySocket.delete(socketId)

    const session = this.sessions.get(ref.sessionId)
    if (!session) return { kind: 'none' }

    if (ref.playerId === session.hostPlayerId) {
      // 房主走了：整房解散，所有索引一起清，不留可被撞见的悬空邀请码
      for (const participant of session.participants.values()) {
        this.bySocket.delete(participant.socketId)
      }
      this.sessions.delete(session.sessionId)
      this.byJoinCode.delete(session.joinCode)
      return { kind: 'host_left', session }
    }

    session.participants.delete(ref.playerId)
    return { kind: 'guest_left', session, playerId: ref.playerId }
  }

  find(socketId: string): { session: Session; participant: Participant } | undefined {
    const ref = this.bySocket.get(socketId)
    if (!ref) return undefined
    const session = this.sessions.get(ref.sessionId)
    const participant = session?.participants.get(ref.playerId)
    return session && participant ? { session, participant } : undefined
  }

  /**
   * 房主的整片刷新：切片覆盖进会话世界，revision+1。
   * 晚加入的人拿到的快照因此始终是"最后一次刷新之后"的世界。
   */
  applyRefresh(session: Session, slices: WorldRefreshSlices): number {
    if (slices.placedFurniture) session.world.placedFurniture = slices.placedFurniture
    if (slices.droppedItems) session.world.droppedItems = slices.droppedItems
    if (slices.inventories) session.world.inventories = slices.inventories
    if (slices.weather) session.world.weather = slices.weather
    if (slices.clock) session.world.clock = slices.clock
    // 活物（协议 v8）：晚加入的人要拿到房主此刻的活物，不是开房时的
    if (slices.pets) session.world.pets = slices.pets
    session.revision += 1
    return session.revision
  }

  /** 房间成员的线上形态（给 join 应答和 participant:joined 用） */
  wireParticipants(session: Session): WireParticipant[] {
    return [...session.participants.values()].map((participant) => ({
      profile: participant.profile,
      transform: participant.transform,
      appearance: participant.appearance,
    }))
  }

  sessionCount(): number {
    return this.sessions.size
  }
}
