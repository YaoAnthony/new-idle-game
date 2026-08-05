import {
  NET_EVENTS,
  NET_LIMITS,
  NET_PROTOCOL_VERSION,
  type AppearanceEvent,
  type ChatMessageEvent,
  type GestureEvent,
  type NetError,
  type ParticipantJoinedEvent,
  type ParticipantLeftEvent,
  type SessionCreateOk,
  type SessionEndedEvent,
  type SessionJoinOk,
  type TransformEvent,
  type WorldOpEvent,
  type WorldRefreshEvent,
  type WorldSave,
} from 'core'
import type { Server as SocketServer, Socket } from 'socket.io'

import { SessionManager } from './sessions.js'
import {
  jsonBytes,
  netError,
  parseAppearance,
  parseChatText,
  parseGesture,
  parseProfileDraft,
  parseRefreshSlices,
  parseTransform,
  parseWorldOp,
} from './validate.js'

/**
 * socket.io 这层皮：事件 ↔ 状态机（sessions.ts）↔ 房间广播。
 *
 * 纪律（Backend AGENTS.md）：
 * - 每个入站载荷先过 validate，坏的回 bad_request，不崩房；
 * - **身份以连接表为准**：广播里的 playerId 一律由服务端查表得出，
 *   载荷里自称的身份直接无视——不然谁都能顶着房主的名字说话；
 * - 日志只记生命周期（建房/解散 + id），不记聊天内容、不记世界数据。
 */

/**
 * socket.io 服务器必须带的传输层配置。
 *
 * `maxHttpBufferSize` 默认只有 1MB，而协议允许的世界快照上限是
 * `NET_LIMITS.maxWorldBytes`（3MB）——不抬的话，合法的大存档在传输层
 * 就被掐断连接，客户端只看到"断开了"，我们的 payload_too_large
 * 永远没机会回。抬到应用层上限的两倍多：**报"太大"的必须是应用层**
 * （有错误码、有人话），传输层那道闸只拦真正的滥用（>8MB）。
 *
 * 导出给 server.ts 和测试共用——测试起的服务器配置若和生产不同，
 * 测过等于没测（这次就是测试先踩出来的）。
 */
export const SOCKET_SERVER_OPTIONS = {
  maxHttpBufferSize: 8_000_000,
} as const

const room = (sessionId: string): string => `s:${sessionId}`

type Ack = (reply: unknown) => void

/** 客户端忘了带 ack 回调时静默丢弃——不能因为坏客户端抛异常 */
const ack = (maybe: unknown): Ack =>
  typeof maybe === 'function' ? (maybe as Ack) : () => {}

export function registerMultiplayer(io: SocketServer): SessionManager {
  const manager = new SessionManager()

  io.on('connection', (socket: Socket) => {
    socket.on(NET_EVENTS.c2s.sessionCreate, (payload, reply) => {
      const respond = ack(reply)
      const parsed = parseCreatePayload(payload)
      if ('ok' in parsed) return respond(parsed)

      const outcome = manager.create({ socketId: socket.id, ...parsed })
      if ('ok' in outcome) return respond(outcome)

      socket.join(room(outcome.session.sessionId))
      console.log(
        `[mp] session ${outcome.session.sessionId} created (code ${outcome.session.joinCode})`,
      )
      const reply2: SessionCreateOk = {
        ok: true,
        sessionId: outcome.session.sessionId,
        joinCode: outcome.session.joinCode,
        playerId: outcome.playerId,
        revision: outcome.session.revision,
      }
      respond(reply2)
    })

    socket.on(NET_EVENTS.c2s.sessionJoin, (payload, reply) => {
      const respond = ack(reply)
      const parsed = parseJoinPayload(payload)
      if ('ok' in parsed) return respond(parsed)

      const outcome = manager.join({ socketId: socket.id, ...parsed })
      if ('ok' in outcome) return respond(outcome)

      const { session, playerId } = outcome
      socket.join(room(session.sessionId))

      // 先广播再应答都行——socket.io 同一连接内有序，而新人靠应答里的
      // participants 建初始名单，不依赖能不能收到自己那条 joined
      const joined: ParticipantJoinedEvent = {
        participant: manager.wireParticipants(session).find(
          (participant) => participant.profile.playerId === playerId,
        )!,
      }
      socket.to(room(session.sessionId)).emit(NET_EVENTS.s2c.participantJoined, joined)

      const reply2: SessionJoinOk = {
        ok: true,
        sessionId: session.sessionId,
        playerId,
        hostPlayerId: session.hostPlayerId,
        revision: session.revision,
        world: session.world,
        participants: manager
          .wireParticipants(session)
          .filter((participant) => participant.profile.playerId !== playerId),
      }
      respond(reply2)
    })

    socket.on(NET_EVENTS.c2s.sessionLeave, (_payload, reply) => {
      handleDeparture(io, manager, socket)
      ack(reply)({ ok: true })
    })

    socket.on('disconnect', () => {
      handleDeparture(io, manager, socket)
    })

    // ---- 瞬态通道：查表定身份 → 校验 → 转发 ----

    socket.on(NET_EVENTS.c2s.transform, (payload) => {
      const found = manager.find(socket.id)
      if (!found) return
      const transform = parseTransform(payload)
      if (!transform) return

      found.participant.transform = transform
      const event: TransformEvent = {
        playerId: found.participant.profile.playerId,
        transform,
      }
      // volatile：位置包丢一帧无所谓，下一帧就来。挤压积压比补发旧位置值钱
      socket.to(room(found.session.sessionId)).volatile.emit(NET_EVENTS.s2c.transform, event)
    })

    socket.on(NET_EVENTS.c2s.appearance, (payload) => {
      const found = manager.find(socket.id)
      if (!found) return
      const appearance = parseAppearance(payload)
      if (!appearance) return

      found.participant.appearance = appearance
      const event: AppearanceEvent = {
        playerId: found.participant.profile.playerId,
        appearance,
      }
      socket.to(room(found.session.sessionId)).emit(NET_EVENTS.s2c.appearance, event)
    })

    socket.on(NET_EVENTS.c2s.gesture, (payload) => {
      const found = manager.find(socket.id)
      if (!found) return
      const gesture = parseGesture(payload)
      if (!gesture) return

      const event: GestureEvent = {
        playerId: found.participant.profile.playerId,
        gesture,
      }
      socket.to(room(found.session.sessionId)).emit(NET_EVENTS.s2c.gesture, event)
    })

    socket.on(NET_EVENTS.c2s.chat, (payload) => {
      const found = manager.find(socket.id)
      if (!found) return
      const text = parseChatText(payload)
      if (!text) return

      const event: ChatMessageEvent = {
        playerId: found.participant.profile.playerId,
        name: found.participant.profile.name,
        text,
        atMs: Date.now(),
      }
      // 只发给别人：发送者本地已经乐观入列了，回声会变成双份
      socket.to(room(found.session.sessionId)).emit(NET_EVENTS.s2c.chat, event)
    })

    socket.on(NET_EVENTS.c2s.worldOp, (payload) => {
      const found = manager.find(socket.id)
      if (!found) return
      // 满权限模型（2026-08-04）：房客的动作同样转发。分级权限来了在这里查
      const op = parseWorldOp(payload)
      if (!op) return

      const event: WorldOpEvent = {
        playerId: found.participant.profile.playerId,
        op,
      }
      socket.to(room(found.session.sessionId)).emit(NET_EVENTS.s2c.worldOp, event)
    })

    socket.on(NET_EVENTS.c2s.worldRefresh, (payload) => {
      const found = manager.find(socket.id)
      if (!found) return
      // 只有房主能改世界。房客发这个 = 坏客户端，静默丢弃
      if (found.participant.profile.playerId !== found.session.hostPlayerId) return

      const slices = parseRefreshSlices(payload)
      if (!slices) return

      const revision = manager.applyRefresh(found.session, slices)
      const event: WorldRefreshEvent = { revision, slices }
      socket.to(room(found.session.sessionId)).emit(NET_EVENTS.s2c.worldRefresh, event)
    })
  })

  return manager
}

/** 主动 leave 和断线的共同出口 */
function handleDeparture(io: SocketServer, manager: SessionManager, socket: Socket): void {
  const outcome = manager.leave(socket.id)

  if (outcome.kind === 'guest_left') {
    const event: ParticipantLeftEvent = { playerId: outcome.playerId }
    io.to(room(outcome.session.sessionId)).emit(NET_EVENTS.s2c.participantLeft, event)
    socket.leave(room(outcome.session.sessionId))
    return
  }

  if (outcome.kind === 'host_left') {
    const event: SessionEndedEvent = { reason: 'host_left' }
    io.to(room(outcome.session.sessionId)).emit(NET_EVENTS.s2c.sessionEnded, event)
    io.in(room(outcome.session.sessionId)).socketsLeave(room(outcome.session.sessionId))
    console.log(`[mp] session ${outcome.session.sessionId} ended (host left)`)
  }
}

// ---- 握手载荷的组合校验（字段多，单独拆出来保持 handler 可读）----

/**
 * world 的类型标成 WorldSave 但**内容只做了字节封顶**，没逐字段校验——
 * 服务端对世界数据是保管员不是裁判：它原样存、原样发，读懂它的
 * 是客户端（迁移和审计都在那边）。坏世界坑的是上传它的房主自己。
 */
type ParsedCreate = {
  saveSchemaVersion: number
  profile: NonNullable<ReturnType<typeof parseProfileDraft>>
  world: WorldSave
  transform?: NonNullable<ReturnType<typeof parseTransform>>
}

function parseCreatePayload(payload: unknown): ParsedCreate | NetError {
  if (typeof payload !== 'object' || payload === null) {
    return netError('bad_request', '载荷不是对象')
  }
  const raw = payload as Record<string, unknown>

  const versionIssue = checkVersions(raw)
  if (versionIssue) return versionIssue

  const profile = parseProfileDraft(raw.profile)
  if (!profile) return netError('bad_request', '玩家侧写不合法')

  if (typeof raw.world !== 'object' || raw.world === null) {
    return netError('bad_request', '缺少世界数据')
  }
  if (jsonBytes(raw.world) > NET_LIMITS.maxWorldBytes) {
    return netError('payload_too_large', '世界数据超出大小上限')
  }

  const transform = raw.transform === undefined ? undefined : parseTransform(raw.transform)
  if (transform === null) return netError('bad_request', '初始位置不合法')

  return {
    saveSchemaVersion: raw.saveSchemaVersion as number,
    profile,
    world: raw.world as WorldSave,
    transform,
  }
}

function parseJoinPayload(
  payload: unknown,
):
  | {
      saveSchemaVersion: number
      joinCode: string
      profile: NonNullable<ReturnType<typeof parseProfileDraft>>
      transform?: NonNullable<ReturnType<typeof parseTransform>>
    }
  | NetError {
  if (typeof payload !== 'object' || payload === null) {
    return netError('bad_request', '载荷不是对象')
  }
  const raw = payload as Record<string, unknown>

  const versionIssue = checkVersions(raw)
  if (versionIssue) return versionIssue

  if (typeof raw.joinCode !== 'string' || raw.joinCode.trim().length === 0 || raw.joinCode.length > 32) {
    return netError('bad_request', '邀请码不合法')
  }

  const profile = parseProfileDraft(raw.profile)
  if (!profile) return netError('bad_request', '玩家侧写不合法')

  const transform = raw.transform === undefined ? undefined : parseTransform(raw.transform)
  if (transform === null) return netError('bad_request', '初始位置不合法')

  return {
    saveSchemaVersion: raw.saveSchemaVersion as number,
    joinCode: raw.joinCode,
    profile,
    transform,
  }
}

/**
 * 版本双核。协议版本核服务端自己；存档版本这里只核"是个正整数"，
 * 和房主是否相等由 SessionManager.join 判（它才知道房主报的是多少）。
 */
function checkVersions(raw: Record<string, unknown>): NetError | null {
  if (raw.protocolVersion !== NET_PROTOCOL_VERSION) {
    return netError(
      'version_mismatch',
      `协议版本不匹配（服务端 ${NET_PROTOCOL_VERSION}）——更新游戏后再试`,
    )
  }
  if (
    typeof raw.saveSchemaVersion !== 'number' ||
    !Number.isInteger(raw.saveSchemaVersion) ||
    raw.saveSchemaVersion <= 0
  ) {
    return netError('bad_request', '存档版本号不合法')
  }
  return null
}
