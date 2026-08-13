import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Locomotion, NET_LIMITS, type WorldSave } from 'core'

import { SessionManager, type Session } from '../src/multiplayer/sessions.js'

/**
 * 会话状态机。**纯状态机，不碰 socket.io**——分开的直接动机就是这里：
 * 满员、错码、房主离开这些分支都能用普通函数调用打到，不用起一台真服务器。
 *
 * 端到端那份（multiplayer.test.ts）证明"消息真的传到了对面"；这一份证明
 * "房间的账算得对"。前者跑一次要建连接、等广播，慢且难穷举分支。
 */

const world = () =>
  ({
    worldId: 'w-test',
    seed: 1,
    house: { houseId: 'base', regionId: 'forest', styleId: 'default' },
    clock: { timeZoneId: 'Asia/Shanghai' },
    weather: { seed: 2 },
    maps: {},
    pets: {},
    placedFurniture: [],
    inventories: {},
    progression: { unlockedFeatureIds: [], events: {} },
  }) as unknown as WorldSave

const profile = (name: string) => ({ name, avatar: { slots: {} } as never })

const transform = (x: number, y: number) => ({
  mapId: 'base',
  x,
  y,
  heading: 0,
  locomotion: Locomotion.Idle,
  liftHeight: 0,
})

const SAVE_VERSION = 25

/** 建一个房，返回房主视角的一切。断言失败直接抛，用例里不用再收窄 */
function hostOn(manager: SessionManager, socketId = 'sock-host') {
  const outcome = manager.create({
    socketId,
    saveSchemaVersion: SAVE_VERSION,
    profile: profile('房主'),
    world: world(),
    transform: transform(-8.5, -6),
  })
  assert.ok(!('ok' in outcome), `建房失败：${JSON.stringify(outcome)}`)
  return outcome
}

function joinOn(
  manager: SessionManager,
  joinCode: string,
  socketId: string,
  options: { name?: string; saveSchemaVersion?: number } = {},
) {
  return manager.join({
    socketId,
    joinCode,
    saveSchemaVersion: options.saveSchemaVersion ?? SAVE_VERSION,
    profile: profile(options.name ?? '访客'),
  })
}

// ---- 建房 ----

test('建房：邀请码和玩家 id 的字符集受限，revision 从 0 起', () => {
  const manager = new SessionManager()
  const { session, playerId } = hostOn(manager)

  // 去掉了 I/L/O/0/1 这些互相认错的字符——这个码是要念给朋友听的
  assert.match(session.joinCode, /^[A-HJ-NP-Z2-9]{6}$/)
  // playerId 同时是对象 id 的发号方前缀，所以不得含 ":" 和 "#"
  assert.match(playerId, /^p-[0-9a-f]{8}$/)
  assert.equal(session.hostPlayerId, playerId)
  assert.equal(session.revision, 0)
  assert.equal(manager.sessionCount(), 1)
})

test('建房：同一条连接不能开两个房', () => {
  const manager = new SessionManager()
  hostOn(manager, 'sock-a')

  const again = manager.create({
    socketId: 'sock-a',
    saveSchemaVersion: SAVE_VERSION,
    profile: profile('又来'),
    world: world(),
  })
  assert.ok('ok' in again)
  assert.equal(again.code, 'already_in_session')
  assert.equal(manager.sessionCount(), 1)
})

test('建房：不给初始位置时落零位，第一拍 transform 会纠正', () => {
  const manager = new SessionManager()
  const outcome = manager.create({
    socketId: 'sock-a',
    saveSchemaVersion: SAVE_VERSION,
    profile: profile('房主'),
    world: world(),
  })
  assert.ok(!('ok' in outcome))

  const [participant] = manager.wireParticipants(outcome.session)
  assert.equal(participant.transform.x, 0)
  assert.equal(participant.transform.locomotion, Locomotion.Idle)
  assert.equal(participant.appearance.posture, 'stand')
  assert.equal(participant.appearance.heldItem, null)
})

test('多个房间的邀请码互不相同', () => {
  const manager = new SessionManager()
  const codes = new Set<string>()

  for (let i = 0; i < 40; i += 1) {
    codes.add(hostOn(manager, `sock-${i}`).session.joinCode)
  }
  assert.equal(codes.size, 40)
  assert.equal(manager.sessionCount(), 40)
})

// ---- 入房 ----

test('入房：邀请码大小写和首尾空格都不该是"房间不存在"', () => {
  const manager = new SessionManager()
  const { session } = hostOn(manager)

  const outcome = joinOn(manager, `  ${session.joinCode.toLowerCase()} `, 'sock-guest')
  assert.ok(!('ok' in outcome))
  assert.equal(outcome.session.sessionId, session.sessionId)
})

test('入房：错码 → not_found', () => {
  const manager = new SessionManager()
  hostOn(manager)

  const outcome = joinOn(manager, 'QQQQQQ', 'sock-guest')
  assert.ok('ok' in outcome)
  assert.equal(outcome.code, 'not_found')
})

test('入房：存档版本必须和房主相等——服务端自己不做迁移', () => {
  const manager = new SessionManager()
  const { session } = hostOn(manager)

  const outcome = joinOn(manager, session.joinCode, 'sock-guest', {
    saveSchemaVersion: SAVE_VERSION + 1,
  })
  assert.ok('ok' in outcome)
  assert.equal(outcome.code, 'version_mismatch')
})

test('入房：满员之后拒绝，上限就是 NET_LIMITS 那个数', () => {
  const manager = new SessionManager()
  const { session } = hostOn(manager)

  for (let i = 1; i < NET_LIMITS.maxPlayers; i += 1) {
    const outcome = joinOn(manager, session.joinCode, `sock-${i}`, { name: `第${i}位` })
    assert.ok(!('ok' in outcome), `第 ${i} 位该进得来`)
  }
  assert.equal(session.participants.size, NET_LIMITS.maxPlayers)

  const overflow = joinOn(manager, session.joinCode, 'sock-overflow')
  assert.ok('ok' in overflow)
  assert.equal(overflow.code, 'session_full')
})

test('入房：已经在房里的连接不能再进一个房', () => {
  const manager = new SessionManager()
  const first = hostOn(manager, 'sock-a')
  const second = hostOn(manager, 'sock-b')

  const outcome = joinOn(manager, second.session.joinCode, 'sock-a')
  assert.ok('ok' in outcome)
  assert.equal(outcome.code, 'already_in_session')
  // 第一个房的成员数没被改坏
  assert.equal(first.session.participants.size, 1)
})

test('入房的每个人都拿到独立的 playerId', () => {
  const manager = new SessionManager()
  const { session, playerId } = hostOn(manager)

  const ids = new Set([playerId])
  for (let i = 1; i < NET_LIMITS.maxPlayers; i += 1) {
    const outcome = joinOn(manager, session.joinCode, `sock-${i}`)
    assert.ok(!('ok' in outcome))
    ids.add(outcome.playerId)
  }
  assert.equal(ids.size, NET_LIMITS.maxPlayers, 'playerId 撞了的话对象 id 前缀就不唯一了')
})

// ---- 查表 ----

test('find 按连接查身份；不在房里的连接查不到', () => {
  const manager = new SessionManager()
  const { session, playerId } = hostOn(manager)

  const found = manager.find('sock-host')
  assert.equal(found?.participant.profile.playerId, playerId)
  assert.equal(found?.session.sessionId, session.sessionId)
  assert.equal(manager.find('从没连过'), undefined)
})

test('wireParticipants 只给公开侧写 + 最后一帧状态', () => {
  const manager = new SessionManager()
  const { session } = hostOn(manager)
  joinOn(manager, session.joinCode, 'sock-guest', { name: '阿客' })

  const wire = manager.wireParticipants(session)
  assert.equal(wire.length, 2)
  assert.deepEqual(Object.keys(wire[0]).sort(), ['appearance', 'profile', 'transform'])
  // 晚加入的人靠这个第一帧就把先到者摆对，而不是先看到一个站在原点的人
  assert.equal(wire[0].transform.x, -8.5)
  assert.equal((wire[0] as { socketId?: string }).socketId, undefined, '连接 id 不该漏出去')
})

// ---- 离场 ----

test('房客退场：只删他一个，房还在，邀请码还能用', () => {
  const manager = new SessionManager()
  const { session } = hostOn(manager)
  const guest = joinOn(manager, session.joinCode, 'sock-guest')
  assert.ok(!('ok' in guest))

  const outcome = manager.leave('sock-guest')
  assert.equal(outcome.kind, 'guest_left')
  assert.equal(outcome.kind === 'guest_left' && outcome.playerId, guest.playerId)
  assert.equal(session.participants.size, 1)
  assert.equal(manager.sessionCount(), 1)
  assert.equal(manager.find('sock-guest'), undefined)

  // 位置腾出来了，新人能进
  assert.ok(!('ok' in joinOn(manager, session.joinCode, 'sock-new')))
})

test('房主退场：整房解散，所有连接的登记一起清', () => {
  const manager = new SessionManager()
  const { session } = hostOn(manager)
  joinOn(manager, session.joinCode, 'sock-g1')
  joinOn(manager, session.joinCode, 'sock-g2')

  const outcome = manager.leave('sock-host')
  assert.equal(outcome.kind, 'host_left')
  assert.equal(manager.sessionCount(), 0)

  // 房客的连接登记也要清掉，否则他们再也开不了新房
  assert.equal(manager.find('sock-g1'), undefined)
  assert.ok(!('ok' in hostOn(manager, 'sock-g1')), '房客散场后应该能自己开房')
})

test('房主退场：老邀请码作废，不留可被撞见的悬空码', () => {
  const manager = new SessionManager()
  const { session } = hostOn(manager)
  manager.leave('sock-host')

  const outcome = joinOn(manager, session.joinCode, 'sock-late')
  assert.ok('ok' in outcome)
  assert.equal(outcome.code, 'not_found')
})

test('退场是幂等的：重复调用、陌生连接都返回 none', () => {
  const manager = new SessionManager()
  const { session } = hostOn(manager)
  joinOn(manager, session.joinCode, 'sock-guest')

  assert.equal(manager.leave('sock-guest').kind, 'guest_left')
  assert.equal(manager.leave('sock-guest').kind, 'none')
  assert.equal(manager.leave('从没连过').kind, 'none')
})

// ---- 世界刷新 ----

function sessionOf(manager: SessionManager): Session {
  return hostOn(manager).session
}

test('刷新：切片覆盖会话世界，revision 每次 +1', () => {
  const manager = new SessionManager()
  const session = sessionOf(manager)

  const first = manager.applyRefresh(session, {
    droppedItems: [{ id: 'd1' } as never],
  })
  assert.equal(first, 1)
  assert.equal(session.world.droppedItems?.length, 1)

  const second = manager.applyRefresh(session, { placedFurniture: [{ instanceId: 'f1' } as never] })
  assert.equal(second, 2)
  assert.equal(session.world.placedFurniture.length, 1)
  // 上一次刷的切片没被这一次抹掉——切片是"变哪片发哪片"
  assert.equal(session.world.droppedItems?.length, 1)
})

test('刷新：没给的切片一个字都不动', () => {
  const manager = new SessionManager()
  const session = sessionOf(manager)
  const clockBefore = session.world.clock

  manager.applyRefresh(session, { droppedItems: [] })
  assert.equal(session.world.clock, clockBefore)
})

test('刷新：空切片也照样推进 revision（晚加入者据此对齐）', () => {
  const manager = new SessionManager()
  const session = sessionOf(manager)

  assert.equal(manager.applyRefresh(session, {}), 1)
})

test('晚加入的人拿到的是最后一次刷新之后的世界', () => {
  const manager = new SessionManager()
  const { session } = hostOn(manager)
  manager.applyRefresh(session, { droppedItems: [{ id: 'd1' } as never] })

  const late = joinOn(manager, session.joinCode, 'sock-late')
  assert.ok(!('ok' in late))
  assert.equal(late.session.revision, 1)
  assert.equal(late.session.world.droppedItems?.length, 1)
})

/**
 * 协议 v4 加了 `gramophones` 切片：`WorldRefreshSlices` 里有它，
 * `validate.ts` 的 REFRESH_KEYS 也放它进来——但 `applyRefresh` 没有对应的
 * 那一行，所以它落不进会话世界。
 *
 * 后果只打到**晚加入的人**：房里已有的人靠 `world:op` 的
 * `gramophone_record_set` 实时收到换唱片，而后进来的人拿到的快照里
 * 唱片机还装着旧唱片，从此和别人听到的不是同一张。
 *
 * 标成 todo 而不是删掉：这条是真的该成立，只是修它属于改 Backend 代码，
 * 不在"补测试"这次的范围里。修法是 applyRefresh 里补一行
 * `if (slices.gramophones) session.world.gramophones = slices.gramophones`。
 */
test('刷新：gramophones 切片应当落进会话世界', { todo: '见上方注释，applyRefresh 缺这一行' }, () => {
  const manager = new SessionManager()
  const session = sessionOf(manager)

  manager.applyRefresh(session, { gramophones: { 'g#1': { recordItemId: 'record_b' } } })
  assert.deepEqual(session.world.gramophones, { 'g#1': { recordItemId: 'record_b' } })
})
