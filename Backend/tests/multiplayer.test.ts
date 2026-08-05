import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, test } from 'node:test'

import {
  NET_EVENTS,
  NET_PROTOCOL_VERSION,
  type ChatMessageEvent,
  type GestureEvent,
  type SessionCreateOk,
  type SessionJoinOk,
  type TransformEvent,
  type WorldRefreshEvent,
} from 'core'
import { Server as SocketServer } from 'socket.io'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'

import { SOCKET_SERVER_OPTIONS, registerMultiplayer } from '../src/multiplayer/handlers.js'

/**
 * 契约的验收测试（contracts/multiplayer_protocol.md 底部那张清单）。
 *
 * 起一台真 socket.io 服务器 + 真客户端连接，不 mock 传输层——
 * mock 掉 socket.io 的测试只能证明"我调了 emit"，证明不了
 * "对面真的收到了、房间隔离是对的、volatile 没把可靠消息一起丢了"。
 */

/**
 * 存档版本。**服务端不关心具体是几**——它只要求同房相等（见契约）。
 * 所以这里写个固定值就够，不去 import 前端的 SAVE_SCHEMA_VERSION：
 * Backend 依赖 Frontend 会把依赖方向倒过来，而这些用例真正测的是
 * "版本一致放行 / 不一致拒绝"，和那个数字本身无关。
 */
const SAVE_VERSION = 20

/** 一份最小但形状合法的 WorldSave。服务端只做字节封顶，字段无需齐全 */
const world = () => ({
  worldId: 'w-test',
  seed: 1,
  house: { houseId: 'home', regionId: 'forest', styleId: 'default' },
  clock: { timeZoneId: 'Asia/Shanghai' },
  weather: { id: 'sunny' },
  maps: {},
  pets: {},
  placedFurniture: [],
  inventories: {},
  progression: { unlockedFeatureIds: [], events: {} },
})

const profile = (name: string) => ({ name, avatar: { slots: {} } })

const transform = (x: number, y: number) => ({
  mapId: 'home',
  x,
  y,
  heading: 0.75,
  locomotion: 'walk',
  liftHeight: 0,
})

let server: http.Server
let url = ''
const sockets: ClientSocket[] = []

before(async () => {
  server = http.createServer()
  registerMultiplayer(new SocketServer(server, SOCKET_SERVER_OPTIONS))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  url = `http://127.0.0.1:${address.port}`
})

after(async () => {
  for (const socket of sockets) socket.disconnect()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function client(): Promise<ClientSocket> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  sockets.push(socket)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
  return socket
}

/** emitWithAck 的带类型收窄版 */
async function request<T>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return (await socket.emitWithAck(event, payload)) as T
}

/** 等一个事件，一秒不来就失败——比挂死的测试好定位 */
function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`等 ${event} 超时（${timeoutMs}ms）`)),
      timeoutMs,
    )
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

async function host(name = '房主'): Promise<{ socket: ClientSocket; created: SessionCreateOk }> {
  const socket = await client()
  const created = await request<SessionCreateOk>(socket, NET_EVENTS.c2s.sessionCreate, {
    protocolVersion: NET_PROTOCOL_VERSION,
    saveSchemaVersion: SAVE_VERSION,
    profile: profile(name),
    world: world(),
    transform: transform(-8.5, -6),
  })
  assert.equal(created.ok, true, `建房失败：${JSON.stringify(created)}`)
  return { socket, created }
}

async function join(code: string, name = '访客'): Promise<{ socket: ClientSocket; joined: SessionJoinOk }> {
  const socket = await client()
  const joined = await request<SessionJoinOk>(socket, NET_EVENTS.c2s.sessionJoin, {
    protocolVersion: NET_PROTOCOL_VERSION,
    saveSchemaVersion: SAVE_VERSION,
    joinCode: code,
    profile: profile(name),
    transform: transform(0, 0),
  })
  return { socket, joined }
}

// ---- 版本协商 ----

test('协议版本不匹配被拒', async () => {
  const socket = await client()
  const reply = await request<{ ok: boolean; code?: string }>(socket, NET_EVENTS.c2s.sessionCreate, {
    protocolVersion: NET_PROTOCOL_VERSION + 1,
    saveSchemaVersion: SAVE_VERSION,
    profile: profile('x'),
    world: world(),
  })
  assert.equal(reply.ok, false)
  assert.equal(reply.code, 'version_mismatch')
})

test('存档版本和房主不同被拒', async () => {
  const { created } = await host()
  const socket = await client()
  const reply = await request<{ ok: boolean; code?: string }>(socket, NET_EVENTS.c2s.sessionJoin, {
    protocolVersion: NET_PROTOCOL_VERSION,
    saveSchemaVersion: SAVE_VERSION + 1,
    joinCode: created.joinCode,
    profile: profile('旧客户端'),
  })
  assert.equal(reply.ok, false)
  assert.equal(reply.code, 'version_mismatch')
})

// ---- 会话生命周期 ----

test('建房→加入→满员→错码', async () => {
  const { created } = await host()
  assert.match(created.joinCode, /^[A-HJ-NP-Z2-9]{6}$/)
  assert.match(created.playerId, /^p-[0-9a-f]{8}$/)

  // 邀请码小写也能进（服务端归一化）
  const first = await join(created.joinCode.toLowerCase(), '第一位')
  assert.equal(first.joined.ok, true)
  assert.equal(first.joined.hostPlayerId, created.playerId)
  // 快照里带先到者（房主）的最后位置
  assert.equal(first.joined.participants.length, 1)
  assert.equal(first.joined.participants[0].transform.x, -8.5)

  for (let i = 2; i <= 4; i += 1) {
    const extra = await join(created.joinCode, `第${i}位`)
    assert.equal(extra.joined.ok, true, `第${i}位应能加入`)
  }
  const sixth = await join(created.joinCode, '第六人')
  assert.equal(sixth.joined.ok, false)
  assert.equal((sixth.joined as unknown as { code: string }).code, 'session_full')

  const wrong = await join('QQQQQQ')
  assert.equal(wrong.joined.ok, false)
  assert.equal((wrong.joined as unknown as { code: string }).code, 'not_found')
})

test('超限载荷被拒：超大世界 / 超长聊天', async () => {
  const socket = await client()
  const reply = await request<{ ok: boolean; code?: string }>(socket, NET_EVENTS.c2s.sessionCreate, {
    protocolVersion: NET_PROTOCOL_VERSION,
    saveSchemaVersion: SAVE_VERSION,
    profile: profile('大世界'),
    world: { ...world(), blob: 'x'.repeat(3_100_000) },
  })
  assert.equal(reply.ok, false)
  assert.equal(reply.code, 'payload_too_large')

  // 超长聊天：静默丢弃（不崩房、别人收不到）
  const { socket: hostSocket, created } = await host()
  const { socket: guestSocket } = await join(created.joinCode)
  guestSocket.emit(NET_EVENTS.c2s.chat, { text: 'x'.repeat(300) })
  guestSocket.emit(NET_EVENTS.c2s.chat, { text: '正常的一条' })
  const received = await nextEvent<ChatMessageEvent>(hostSocket, NET_EVENTS.s2c.chat)
  assert.equal(received.text, '正常的一条') // 超长那条没到，说明被丢了
})

// ---- 瞬态转发 ----

test('transform/gesture/chat 到达对方，身份由服务端认定', async () => {
  const { socket: hostSocket, created } = await host('阿主')
  const { socket: guestSocket, joined } = await join(created.joinCode, '阿客')
  assert.equal(joined.ok, true)

  // guest → host：transform（volatile，连接刚建好时可能没就绪，重发几拍）
  const seen = nextEvent<TransformEvent>(hostSocket, NET_EVENTS.s2c.transform, 2000)
  const pump = setInterval(() => {
    guestSocket.emit(NET_EVENTS.c2s.transform, { ...transform(3.25, 1.5), playerId: '伪造的' })
  }, 40)
  const got = await seen.finally(() => clearInterval(pump))
  assert.equal(got.transform.x, 3.25)
  // 载荷里塞的假身份被无视，playerId 是服务端查表的
  assert.equal(got.playerId, joined.playerId)

  // host → guest：gesture
  const gestureSeen = nextEvent<GestureEvent>(guestSocket, NET_EVENTS.s2c.gesture)
  hostSocket.emit(NET_EVENTS.c2s.gesture, { kind: 'jump', atMs: 123 })
  const gesture = await gestureSeen
  assert.equal(gesture.gesture.kind, 'jump')
  assert.equal(gesture.playerId, created.playerId)

  // chat 带服务端认定的名字
  const chatSeen = nextEvent<ChatMessageEvent>(guestSocket, NET_EVENTS.s2c.chat)
  hostSocket.emit(NET_EVENTS.c2s.chat, { text: '你好呀' })
  const chat = await chatSeen
  assert.equal(chat.name, '阿主')
})

// ---- world:refresh ----

test('房主刷新世界：广播 + 晚加入者拿到新世界；房客刷新被无视', async () => {
  const { socket: hostSocket, created } = await host()
  const { socket: guestSocket } = await join(created.joinCode)

  const seen = nextEvent<WorldRefreshEvent>(guestSocket, NET_EVENTS.s2c.worldRefresh)
  hostSocket.emit(NET_EVENTS.c2s.worldRefresh, {
    droppedItems: [{ id: 'p-x:drop:rice#1', roomId: 'living', position: { x: 1, y: 0, z: 2 }, stack: { stackId: 's', itemId: 'rice', quantity: 1 } }],
  })
  const refresh = await seen
  assert.equal(refresh.revision, 1)
  assert.equal(refresh.slices.droppedItems?.length, 1)

  // 晚加入：快照是刷新后的世界
  const late = await join(created.joinCode, '晚到')
  assert.equal(late.joined.ok, true)
  assert.equal(late.joined.revision, 1)
  assert.equal(late.joined.world.droppedItems?.length, 1)

  // 房客发刷新：静默无视（revision 不动）
  guestSocket.emit(NET_EVENTS.c2s.worldRefresh, { droppedItems: [] })
  await new Promise((resolve) => setTimeout(resolve, 150))
  const latest = await join(created.joinCode, '再来一位')
  assert.equal(latest.joined.ok, true)
  assert.equal(latest.joined.revision, 1)
  assert.equal(latest.joined.world.droppedItems?.length, 1)
})

// ---- world:op（协议 v2：任何参与者的世界操作即时转发）----

test('房客的 world:op 转发给房主，身份服务端认定；坏 op 丢弃', async () => {
  const { socket: hostSocket, created } = await host()
  const { socket: guestSocket, joined } = await join(created.joinCode)

  // 坏的先发：未知 kind、超大载荷，都该被静默丢弃
  guestSocket.emit(NET_EVENTS.c2s.worldOp, { kind: 'rm_rf_world' })
  guestSocket.emit(NET_EVENTS.c2s.worldOp, {
    kind: 'item_settled',
    item: { blob: 'x'.repeat(70_000) },
  })

  const seen = nextEvent<{ playerId: string; op: { kind: string; id?: string } }>(
    hostSocket,
    NET_EVENTS.s2c.worldOp,
  )
  guestSocket.emit(NET_EVENTS.c2s.worldOp, {
    kind: 'item_thrown',
    id: `${joined.playerId}:drop:rice#1`,
    roomId: 'living',
    stack: { stackId: 'drop:rice', itemId: 'rice', quantity: 1 },
    from: { x: 1, z: 2 },
    heading: 0.5,
  })
  const got = await seen
  // 前面两条坏的没到，第一条到的就是合法那条
  assert.equal(got.op.kind, 'item_thrown')
  assert.equal(got.playerId, joined.playerId)

  // 反向：房主的 op 到房客
  const backSeen = nextEvent<{ playerId: string; op: { kind: string } }>(
    guestSocket,
    NET_EVENTS.s2c.worldOp,
  )
  hostSocket.emit(NET_EVENTS.c2s.worldOp, {
    kind: 'furniture_removed',
    instanceId: 'local:furniture:cardboard_box#1',
  })
  const back = await backSeen
  assert.equal(back.op.kind, 'furniture_removed')
  assert.equal(back.playerId, created.playerId)
})

test('每日任务的两种 op 在白名单内，双向转发', async () => {
  const { socket: hostSocket, created } = await host()
  const { socket: guestSocket, joined } = await join(created.joinCode)

  // 房客打勾 → 房主收到，带服务端认定的身份和绝对进度
  const tickSeen = nextEvent<{ playerId: string; op: Record<string, unknown> }>(
    hostSocket,
    NET_EVENTS.s2c.worldOp,
  )
  guestSocket.emit(NET_EVENTS.c2s.worldOp, {
    kind: 'daily_board_ticked',
    worldDayId: '2026-08-05',
    progress: 2,
  })
  const tick = await tickSeen
  assert.equal(tick.op.kind, 'daily_board_ticked')
  assert.equal(tick.op.progress, 2)
  assert.equal(tick.playerId, joined.playerId)

  // 房主领奖 → 房客收到
  const claimSeen = nextEvent<{ playerId: string; op: Record<string, unknown> }>(
    guestSocket,
    NET_EVENTS.s2c.worldOp,
  )
  hostSocket.emit(NET_EVENTS.c2s.worldOp, {
    kind: 'daily_board_claimed',
    worldDayId: '2026-08-05',
  })
  const claim = await claimSeen
  assert.equal(claim.op.kind, 'daily_board_claimed')
  assert.equal(claim.playerId, created.playerId)
})

// ---- 离场 ----

test('房客断开广播 participant:left；房主断开广播 session:ended 且邀请码作废', async () => {
  const { socket: hostSocket, created } = await host()
  const { socket: guestSocket, joined } = await join(created.joinCode)

  const leftSeen = nextEvent<{ playerId: string }>(hostSocket, NET_EVENTS.s2c.participantLeft)
  guestSocket.disconnect()
  const left = await leftSeen
  assert.equal(left.playerId, joined.playerId)

  const { socket: secondGuest, joined: rejoined } = await join(created.joinCode, '回锅')
  assert.equal(rejoined.ok, true)

  const endedSeen = nextEvent<{ reason: string }>(secondGuest, NET_EVENTS.s2c.sessionEnded)
  hostSocket.disconnect()
  const ended = await endedSeen
  assert.equal(ended.reason, 'host_left')

  // 会话已销毁：老邀请码进不来了
  const ghost = await join(created.joinCode, '摸空门')
  assert.equal(ghost.joined.ok, false)
  assert.equal((ghost.joined as unknown as { code: string }).code, 'not_found')
})
