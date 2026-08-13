import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, test } from 'node:test'

import {
  NET_EVENTS,
  NET_PROTOCOL_VERSION,
  type AppearanceEvent,
  type ChatMessageEvent,
  type SessionCreateOk,
  type SessionJoinOk,
} from 'core'
import { Server as SocketServer } from 'socket.io'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'

import { SOCKET_SERVER_OPTIONS, registerMultiplayer } from '../src/multiplayer/handlers.js'

/**
 * socket.io 那层皮，补 multiplayer.test.ts 没覆盖到的几处。那一份走的是
 * 契约验收清单（版本协商、生命周期、瞬态转发、refresh、op、离场）；
 * 这一份专挑**坏客户端和边角**：
 *
 * - 忘了带 ack 回调会不会把服务端打崩；
 * - 不在任何房间里的连接乱发消息会怎样；
 * - 两个房间之间会不会串消息；
 * - appearance 通道（那一份只测了 transform/gesture/chat）。
 */

const SAVE_VERSION = 25

const world = () => ({
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
})

const profile = (name: string) => ({ name, avatar: { slots: {} } })

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

function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等 ${event} 超时`)), timeoutMs)
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

/** 一段时间内**不该**收到某个事件 */
async function expectSilence(socket: ClientSocket, event: string, ms = 200): Promise<void> {
  let received: unknown
  const listener = (payload: unknown) => {
    received = payload
  }
  socket.on(event, listener)
  await new Promise((resolve) => setTimeout(resolve, ms))
  socket.off(event, listener)
  assert.equal(received, undefined, `不该收到 ${event}，却收到了 ${JSON.stringify(received)}`)
}

async function host(name = '房主') {
  const socket = await client()
  const created = (await socket.emitWithAck(NET_EVENTS.c2s.sessionCreate, {
    protocolVersion: NET_PROTOCOL_VERSION,
    saveSchemaVersion: SAVE_VERSION,
    profile: profile(name),
    world: world(),
  })) as SessionCreateOk
  assert.equal(created.ok, true)
  return { socket, created }
}

async function join(code: string, name = '访客') {
  const socket = await client()
  const joined = (await socket.emitWithAck(NET_EVENTS.c2s.sessionJoin, {
    protocolVersion: NET_PROTOCOL_VERSION,
    saveSchemaVersion: SAVE_VERSION,
    joinCode: code,
    profile: profile(name),
  })) as SessionJoinOk
  return { socket, joined }
}

// ---- 握手载荷 ----

test('建房：载荷不是对象 / 缺侧写 / 位置不合法，各回各的错误码', async () => {
  const socket = await client()
  const ask = (payload: unknown) =>
    socket.emitWithAck(NET_EVENTS.c2s.sessionCreate, payload) as Promise<{
      ok: boolean
      code?: string
    }>

  assert.equal((await ask('我是一个字符串')).code, 'bad_request')
  assert.equal((await ask(null)).code, 'bad_request')

  const base = {
    protocolVersion: NET_PROTOCOL_VERSION,
    saveSchemaVersion: SAVE_VERSION,
    world: world(),
  }
  assert.equal((await ask({ ...base })).code, 'bad_request', '缺侧写')
  assert.equal((await ask({ ...base, profile: profile('x'), world: undefined })).code, 'bad_request', '缺世界')
  assert.equal(
    (await ask({ ...base, profile: profile('x'), transform: { mapId: '' } })).code,
    'bad_request',
    '位置不合法',
  )
  // 前面几条都没让这条连接进房，所以现在还能正常建房
  const good = (await ask({ ...base, profile: profile('阿主') })) as SessionCreateOk
  assert.equal(good.ok, true)
})

test('存档版本必须是正整数', async () => {
  const socket = await client()
  const ask = (saveSchemaVersion: unknown) =>
    socket.emitWithAck(NET_EVENTS.c2s.sessionCreate, {
      protocolVersion: NET_PROTOCOL_VERSION,
      saveSchemaVersion,
      profile: profile('x'),
      world: world(),
    }) as Promise<{ ok: boolean; code?: string }>

  assert.equal((await ask('25')).code, 'bad_request')
  assert.equal((await ask(0)).code, 'bad_request')
  assert.equal((await ask(-1)).code, 'bad_request')
  assert.equal((await ask(25.5)).code, 'bad_request')
})

test('入房：邀请码必须是有长度的字符串', async () => {
  const { created } = await host()
  const socket = await client()
  const ask = (joinCode: unknown) =>
    socket.emitWithAck(NET_EVENTS.c2s.sessionJoin, {
      protocolVersion: NET_PROTOCOL_VERSION,
      saveSchemaVersion: SAVE_VERSION,
      joinCode,
      profile: profile('x'),
    }) as Promise<{ ok: boolean; code?: string }>

  assert.equal((await ask('')).code, 'bad_request')
  assert.equal((await ask('   ')).code, 'bad_request')
  assert.equal((await ask(123)).code, 'bad_request')
  assert.equal((await ask('x'.repeat(33))).code, 'bad_request')
  assert.equal((await ask(created.joinCode)).ok, true)
})

// ---- 坏客户端不该打崩服务端 ----

test('忘了带 ack 回调时静默丢弃，不因此抛异常', async () => {
  const socket = await client()

  // 不带回调直接 emit：服务端的 ack() 会包一个空函数
  socket.emit(NET_EVENTS.c2s.sessionCreate, {
    protocolVersion: NET_PROTOCOL_VERSION,
    saveSchemaVersion: SAVE_VERSION,
    profile: profile('无回调'),
    world: world(),
  })
  socket.emit(NET_EVENTS.c2s.sessionLeave, {})

  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(socket.connected, true, '服务端不该因为坏客户端断开连接')

  // 服务端还活着：另一条连接照常建房
  const { created } = await host('还活着')
  assert.equal(created.ok, true)
})

test('不在任何房间里的连接乱发瞬态消息：静默丢弃', async () => {
  const socket = await client()

  socket.emit(NET_EVENTS.c2s.transform, { mapId: 'base', x: 1, y: 1, heading: 0, locomotion: 'walk', liftHeight: 0 })
  socket.emit(NET_EVENTS.c2s.appearance, { posture: 'stand' })
  socket.emit(NET_EVENTS.c2s.gesture, { kind: 'jump', atMs: 1 })
  socket.emit(NET_EVENTS.c2s.chat, { text: '有人吗' })
  socket.emit(NET_EVENTS.c2s.worldOp, { kind: 'item_removed', id: 'x' })
  socket.emit(NET_EVENTS.c2s.worldRefresh, { droppedItems: [] })

  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(socket.connected, true)
})

test('坏 appearance / 坏 gesture 被丢掉，好的照常到', async () => {
  const { socket: hostSocket, created } = await host('阿主')
  const { socket: guestSocket, joined } = await join(created.joinCode, '阿客')
  assert.equal(joined.ok, true)

  const seen = nextEvent<AppearanceEvent>(hostSocket, NET_EVENTS.s2c.appearance)

  guestSocket.emit(NET_EVENTS.c2s.appearance, { posture: '' }) // 空 posture
  guestSocket.emit(NET_EVENTS.c2s.appearance, { heldItem: { itemId: 'wok', quantity: 0 } }) // 缺 posture
  guestSocket.emit(NET_EVENTS.c2s.appearance, {
    posture: 'sit',
    activity: 'writing',
    heldItem: { itemId: 'wok', quantity: 1 },
    playerId: '伪造的',
  })

  const event = await seen
  assert.equal(event.appearance.posture, 'sit', '前两条坏的应该已经被丢掉了')
  assert.equal(event.appearance.activity, 'writing')
  assert.equal(event.appearance.heldItem?.itemId, 'wok')
  // 身份一律服务端查表，载荷里自称的直接无视
  assert.equal(event.playerId, joined.playerId)
})

test('appearance 会被记住：晚加入的人第一帧就看到别人端着锅、坐着', async () => {
  const { socket: hostSocket, created } = await host()
  hostSocket.emit(NET_EVENTS.c2s.appearance, {
    posture: 'sit',
    heldItem: { itemId: 'wok', quantity: 1 },
  })
  await new Promise((resolve) => setTimeout(resolve, 100))

  const { joined } = await join(created.joinCode, '晚到')
  assert.equal(joined.ok, true)
  const hostWire = joined.participants.find((p) => p.profile.playerId === created.playerId)
  assert.equal(hostWire?.appearance.posture, 'sit')
  assert.equal(hostWire?.appearance.heldItem?.itemId, 'wok')
})

// ---- 房间隔离 ----

test('两个房之间不串消息', async () => {
  const roomA = await host('A 房主')
  const roomB = await host('B 房主')
  const guestA = await join(roomA.created.joinCode, 'A 房客')
  assert.equal(guestA.joined.ok, true)

  const seenInA = nextEvent<ChatMessageEvent>(roomA.socket, NET_EVENTS.s2c.chat)
  const silenceInB = expectSilence(roomB.socket, NET_EVENTS.s2c.chat, 300)

  guestA.socket.emit(NET_EVENTS.c2s.chat, { text: '只有 A 房听得见' })

  const received = await seenInA
  assert.equal(received.text, '只有 A 房听得见')
  await silenceInB
})

test('聊天不回声给发送者——本地已经乐观入列了，回声会变成双份', async () => {
  const { socket: hostSocket, created } = await host()
  const { socket: guestSocket } = await join(created.joinCode)

  const silence = expectSilence(guestSocket, NET_EVENTS.s2c.chat, 300)
  const seen = nextEvent<ChatMessageEvent>(hostSocket, NET_EVENTS.s2c.chat)

  guestSocket.emit(NET_EVENTS.c2s.chat, { text: '喂' })

  await seen
  await silence
})

// ---- 主动离场 ----

test('主动 leave 之后这条连接自由了，可以再开一个房', async () => {
  const { created } = await host()
  const { socket: guestSocket } = await join(created.joinCode)

  const reply = (await guestSocket.emitWithAck(NET_EVENTS.c2s.sessionLeave, {})) as { ok: boolean }
  assert.equal(reply.ok, true)

  const own = (await guestSocket.emitWithAck(NET_EVENTS.c2s.sessionCreate, {
    protocolVersion: NET_PROTOCOL_VERSION,
    saveSchemaVersion: SAVE_VERSION,
    profile: profile('自立门户'),
    world: world(),
  })) as SessionCreateOk
  assert.equal(own.ok, true)
})

test('leave 之后不再收到原房间的广播', async () => {
  const { socket: hostSocket, created } = await host()
  const { socket: guestSocket } = await join(created.joinCode)

  await guestSocket.emitWithAck(NET_EVENTS.c2s.sessionLeave, {})

  const silence = expectSilence(guestSocket, NET_EVENTS.s2c.chat, 300)
  hostSocket.emit(NET_EVENTS.c2s.chat, { text: '还在吗' })
  await silence
})
