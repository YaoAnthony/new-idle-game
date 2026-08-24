import assert from 'node:assert/strict'
import { test } from 'node:test'

import { GestureKind, Locomotion, NET_LIMITS } from 'core'

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
} from '../src/multiplayer/validate.js'
import { WORLD_REFRESH_KEYS } from 'core'

/**
 * 入站载荷的结构校验。**服务端一个字都不信客户端**——不是防玩家，
 * 是防"任何能连上这个端口的东西"。
 *
 * 这些函数是纯的，所以逐个边界打得起：端到端那份（multiplayer.test.ts）
 * 证明的是"消息真的传到了对面"，这一份证明的是"坏消息一条都进不来"。
 * 两者都要——只有端到端时，一个被悄悄放宽的边界不会让任何用例变红。
 */

const goodTransform = {
  mapId: 'base',
  x: 1.5,
  y: -2,
  heading: 0.75,
  locomotion: Locomotion.Walk,
  liftHeight: 0,
}

// ---- transform ----

test('合法 transform 原样通过', () => {
  assert.deepEqual(parseTransform(goodTransform), goodTransform)
})

test('transform 重建对象：客户端塞的多余字段就地丢弃', () => {
  const parsed = parseTransform({ ...goodTransform, playerId: '伪造的', evil: { a: 1 } })

  assert.deepEqual(parsed, goodTransform)
  assert.equal((parsed as Record<string, unknown>).playerId, undefined)
})

test('transform：不是对象、缺字段、类型不对都拒', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    assert.equal(parseTransform(bad), null, `${JSON.stringify(bad)} 不该通过`)
  }
  assert.equal(parseTransform({ ...goodTransform, mapId: undefined }), null)
  assert.equal(parseTransform({ ...goodTransform, mapId: '' }), null)
  assert.equal(parseTransform({ ...goodTransform, x: '1.5' }), null)
})

test('transform：NaN / Infinity 不能进来', () => {
  // 这类值会一路渗进渲染和物理，表现成"某个人不见了"，最难查
  assert.equal(parseTransform({ ...goodTransform, x: Number.NaN }), null)
  assert.equal(parseTransform({ ...goodTransform, y: Number.POSITIVE_INFINITY }), null)
  assert.equal(parseTransform({ ...goodTransform, heading: Number.NaN }), null)
  assert.equal(parseTransform({ ...goodTransform, liftHeight: Number.NaN }), null)
})

test('transform：坐标和抬升有界', () => {
  assert.ok(parseTransform({ ...goodTransform, x: 10_000 }))
  assert.equal(parseTransform({ ...goodTransform, x: 10_001 }), null)
  assert.equal(parseTransform({ ...goodTransform, y: -10_001 }), null)

  assert.ok(parseTransform({ ...goodTransform, liftHeight: 10 }))
  assert.equal(parseTransform({ ...goodTransform, liftHeight: 10.1 }), null)
  assert.equal(parseTransform({ ...goodTransform, liftHeight: -0.1 }), null, '不能是负的高度')
})

test('transform：locomotion 必须是三个枚举值之一', () => {
  for (const value of [Locomotion.Idle, Locomotion.Walk, Locomotion.Run]) {
    assert.ok(parseTransform({ ...goodTransform, locomotion: value }))
  }
  assert.equal(parseTransform({ ...goodTransform, locomotion: 'fly' }), null)
  assert.equal(parseTransform({ ...goodTransform, locomotion: 0 }), null)
})

test('transform：mapId 长度有上限', () => {
  assert.ok(parseTransform({ ...goodTransform, mapId: 'a'.repeat(64) }))
  assert.equal(parseTransform({ ...goodTransform, mapId: 'a'.repeat(65) }), null)
})

// ---- appearance ----

const goodAppearance = {
  posture: 'stand',
  activity: null,
  heldItem: null,
  restingOn: null,
}

test('合法 appearance 通过；缺省的可选字段归一成 null', () => {
  assert.deepEqual(parseAppearance(goodAppearance), goodAppearance)
  assert.deepEqual(parseAppearance({ posture: 'sit' }), {
    posture: 'sit',
    activity: null,
    heldItem: null,
    restingOn: null,
  })
})

test('appearance：posture 必填且是短字符串', () => {
  assert.equal(parseAppearance({}), null)
  assert.equal(parseAppearance({ posture: '' }), null)
  assert.equal(parseAppearance({ posture: 'a'.repeat(65) }), null)
  assert.equal(parseAppearance(null), null)
})

test('appearance：activity 只能是 null 或短字符串', () => {
  assert.equal(parseAppearance({ posture: 'sit', activity: 'writing' })?.activity, 'writing')
  assert.equal(parseAppearance({ posture: 'sit', activity: 123 }), null)
  assert.equal(parseAppearance({ posture: 'sit', activity: 'a'.repeat(65) }), null)
})

test('appearance：手持物的数量必须是 1~999 的整数', () => {
  const held = (quantity: unknown) => ({
    posture: 'stand',
    heldItem: { itemId: 'wok', quantity },
  })

  assert.ok(parseAppearance(held(1)))
  assert.ok(parseAppearance(held(999)))
  assert.equal(parseAppearance(held(0)), null)
  assert.equal(parseAppearance(held(1000)), null)
  assert.equal(parseAppearance(held(1.5)), null)
  assert.equal(parseAppearance(held('1')), null)
  assert.equal(parseAppearance(held(Number.NaN)), null)
})

test('appearance：锅里的东西按大小封顶，坏数据最多让那口锅画不出来', () => {
  const withContainer = (container: unknown) => ({
    posture: 'stand',
    heldItem: { itemId: 'wok', quantity: 1, container },
  })

  assert.ok(parseAppearance(withContainer({ items: [], heatSeconds: 0 })))
  assert.equal(parseAppearance(withContainer({ blob: 'x'.repeat(9000) })), null)
})

test('appearance：认不出的品质被丢掉，而不是整条拒绝', () => {
  const parsed = parseAppearance({
    posture: 'stand',
    heldItem: { itemId: 'wok', quantity: 1, quality: 12345 },
  })

  assert.ok(parsed)
  assert.equal(parsed.heldItem?.quality, undefined)
})

test('appearance：restingOn 两个 id 都得是短字符串', () => {
  const resting = (value: unknown) => ({ posture: 'sit', restingOn: value })

  assert.deepEqual(parseAppearance(resting({ instanceId: 'chair#1', anchorId: 'seat' }))?.restingOn, {
    instanceId: 'chair#1',
    anchorId: 'seat',
  })
  assert.equal(parseAppearance(resting({ instanceId: 'chair#1' })), null)
  assert.equal(parseAppearance(resting({ instanceId: 'a'.repeat(161), anchorId: 'seat' })), null)
})

// ---- gesture ----

test('gesture 只认白名单里的两种', () => {
  assert.deepEqual(parseGesture({ kind: GestureKind.Jump, atMs: 1 }), {
    kind: GestureKind.Jump,
    atMs: 1,
  })
  assert.ok(parseGesture({ kind: GestureKind.Wave, atMs: 0 }))
  assert.equal(parseGesture({ kind: 'dance', atMs: 1 }), null)
  assert.equal(parseGesture({ kind: GestureKind.Jump, atMs: 'now' }), null)
  assert.equal(parseGesture({ kind: GestureKind.Jump, atMs: Number.NaN }), null)
  assert.equal(parseGesture(null), null)
})

// ---- chat ----

test('聊天：去首尾空白，空串和纯空白都拒', () => {
  assert.equal(parseChatText({ text: '  你好呀  ' }), '你好呀')
  assert.equal(parseChatText({ text: '' }), null)
  assert.equal(parseChatText({ text: '   ' }), null)
  assert.equal(parseChatText({ text: 123 }), null)
  assert.equal(parseChatText(null), null)
})

test('聊天长度上限就是 NET_LIMITS 那个数，不是另抄的魔数', () => {
  assert.ok(parseChatText({ text: 'x'.repeat(NET_LIMITS.maxChatLength) }))
  assert.equal(parseChatText({ text: 'x'.repeat(NET_LIMITS.maxChatLength + 1) }), null)
})

test('聊天：长度按 trim 之后算', () => {
  const padded = `  ${'x'.repeat(NET_LIMITS.maxChatLength)}  `
  assert.equal(parseChatText({ text: padded })?.length, NET_LIMITS.maxChatLength)
})

// ---- profile ----

const goodProfile = { name: '阿主', avatar: { slots: {} } }

test('侧写：名字 trim、非空、有长度上限；avatar 必须是对象', () => {
  assert.deepEqual(parseProfileDraft({ ...goodProfile, name: '  阿主  ' })?.name, '阿主')

  assert.equal(parseProfileDraft({ ...goodProfile, name: '' }), null)
  assert.equal(parseProfileDraft({ ...goodProfile, name: '   ' }), null)
  assert.equal(parseProfileDraft({ ...goodProfile, name: 'x'.repeat(NET_LIMITS.maxNameLength + 1) }), null)
  assert.ok(parseProfileDraft({ ...goodProfile, name: 'x'.repeat(NET_LIMITS.maxNameLength) }))

  assert.equal(parseProfileDraft({ name: '阿主' }), null)
  assert.equal(parseProfileDraft({ name: '阿主', avatar: 'nope' }), null)
  assert.equal(parseProfileDraft({ name: '阿主', avatar: null }), null)
})

test('侧写：捏脸数据审计不过也放行——不该因为一顶帽子进不了朋友的房', () => {
  // 老客户端的形象引用了新版删掉的零件时，画成默认脸就好
  const parsed = parseProfileDraft({ name: '老客户端', avatar: { slots: { hat: '早就删了的帽子' } } })
  assert.ok(parsed)
})

test('侧写：捏脸数据仍按字节封顶', () => {
  assert.equal(
    parseProfileDraft({ name: '灌水', avatar: { blob: 'x'.repeat(20_000) } }),
    null,
  )
})

// ---- world op ----

test('op：只认白名单里的 kind', () => {
  const known = [
    'furniture_placed',
    'furniture_removed',
    'kitchen_slot_set',
    'item_thrown',
    'item_settled',
    'item_removed',
    'storage_box_set',
    'daily_board_ticked',
    'daily_board_claimed',
    'gramophone_record_set',
  ]

  for (const kind of known) {
    assert.ok(parseWorldOp({ kind }), `${kind} 应该在白名单里`)
  }
  assert.equal(parseWorldOp({ kind: 'rm_rf_world' }), null)
  assert.equal(parseWorldOp({ kind: 123 }), null)
  assert.equal(parseWorldOp({}), null)
  assert.equal(parseWorldOp(null), null)
})

test('op：体积有界——一条 op 犯不着 64KB', () => {
  assert.ok(parseWorldOp({ kind: 'item_settled', item: { id: 'x' } }))
  assert.equal(parseWorldOp({ kind: 'item_settled', blob: 'x'.repeat(70_000) }), null)
})

test('op：不逐字段校验各变体（尽力而为的转发，各端 replay 自带防御）', () => {
  // 字段乱七八糟但 kind 认识、体积没超 → 放行，接收方自己跳过坏数据
  assert.ok(parseWorldOp({ kind: 'furniture_placed', placed: '这不是家具' }))
})

// ---- refresh 切片 ----

test('切片：认识的键放行，一个都没有时拒绝', () => {
  assert.deepEqual(parseRefreshSlices({ droppedItems: [] }), { droppedItems: [] })
  assert.ok(parseRefreshSlices({ weather: { seed: 1 }, clock: { timeZoneId: 'Asia/Shanghai' } }))
  assert.equal(parseRefreshSlices({}), null)
  assert.equal(parseRefreshSlices(null), null)
})

test('切片：出现不认识的键就整条拒绝（坏客户端）', () => {
  assert.equal(parseRefreshSlices({ droppedItems: [], evil: 1 }), null)
  assert.equal(parseRefreshSlices({ ownWorld: {} }), null)
})

/**
 * 上面那条的**反面**，而缺的一直是这一面。
 *
 * 2026-08-23 审计发现：协议 v6 给客户端加了 `lamps`、每次刷新都发，
 * 而服务端白名单是抄的一份字面量、没跟上——于是**每一次 world:refresh
 * 都被整条打回**，房客连家具、天气都不再同步。全程没有任何东西变红，
 * 因为拒绝的分支就是 `return null`，而当时只有"坏键要拒绝"那条用例。
 *
 * 现在白名单从 Core 来（`WORLD_REFRESH_KEYS`，那边有编译期断言钉着
 * 类型和表一致），这条用例守的是运行时那一半：**表里的每一片都真的
 * 放得进来**。由表驱动而不是手写键名，所以加片时它不会烂。
 */
test('切片：客户端真会发的每一片都放得进来（lamps 那次就是漏在这儿）', () => {
  const full: Record<string, unknown> = {}
  for (const key of WORLD_REFRESH_KEYS) full[key] = {}

  const parsed = parseRefreshSlices(full)
  assert.ok(parsed, `整片刷新被拒了，白名单和 WORLD_REFRESH_KEYS 走散了`)
  assert.deepEqual(Object.keys(parsed).sort(), [...WORLD_REFRESH_KEYS].sort())

  // 逐片单发也要放行——房主端将来若改成挑着发，不该有哪一片进不来
  for (const key of WORLD_REFRESH_KEYS) {
    assert.ok(parseRefreshSlices({ [key]: {} }), `切片 ${key} 被拒了`)
  }
})

test('切片：协议 v4 的 gramophones 是合法切片', () => {
  assert.deepEqual(parseRefreshSlices({ gramophones: { 'g#1': { recordItemId: 'record_a' } } }), {
    gramophones: { 'g#1': { recordItemId: 'record_a' } },
  })
})

test('切片：undefined 的值跳过，全是 undefined 等于没给', () => {
  assert.deepEqual(parseRefreshSlices({ droppedItems: undefined, weather: [] }), { weather: [] })
  assert.equal(parseRefreshSlices({ droppedItems: undefined }), null)
})

test('切片：整体按世界大小上限封顶', () => {
  assert.equal(
    parseRefreshSlices({ droppedItems: [{ blob: 'x'.repeat(NET_LIMITS.maxWorldBytes) }] }),
    null,
  )
})

// ---- 工具 ----

test('jsonBytes 算的是 UTF-8 字节数，序列化不了的按超限处理', () => {
  assert.equal(jsonBytes('ab'), 4) // 带引号
  assert.ok(jsonBytes('中') > jsonBytes('a'), '中文一个字不止一个字节')

  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.equal(jsonBytes(cyclic), Number.MAX_SAFE_INTEGER, '循环引用也存不下，按超限处理')
})

test('netError 形状固定，客户端靠 ok === false 收窄', () => {
  const error = netError('not_found', '没有这个房间')
  assert.deepEqual(error, { ok: false, code: 'not_found', message: '没有这个房间' })
})
