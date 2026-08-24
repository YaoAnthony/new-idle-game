import {
  GestureKind,
  Locomotion,
  NET_LIMITS,
  WORLD_REFRESH_KEYS,
  auditAvatarConfig,
  type NetError,
  type NetErrorCode,
  type ParticipantAppearance,
  type ParticipantGesture,
  type ParticipantTransform,
  type ProfileDraft,
  type WorldOp,
  type WorldRefreshSlices,
} from 'core'

/**
 * 入站载荷的结构校验。**服务端一个字都不信客户端**——不是防玩家，
 * 是防"任何能连上这个端口的东西"：坏一条消息只能换来 bad_request，
 * 不能换来整个房崩掉。
 *
 * 手写而不是上 zod：M1 一共八种消息，形状都很浅，一层依赖换八个
 * 函数不值得。等 op 通道（M2）让消息种类翻倍时再评估。
 *
 * 校验只做**结构**（类型、长度、数值范围），不做游戏规则——
 * 规则校验属于 op 通道（用 Core 的 placement/occupancy），M2 的事。
 */

export function netError(code: NetErrorCode, message: string): NetError {
  return { ok: false, code, message }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isShortString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

/** 世界坐标的合理范围。房子 24×16，给到 ±1e4 已经是"疯了才会有"的余量 */
const POSITION_LIMIT = 10_000

export function parseTransform(value: unknown): ParticipantTransform | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  if (!isShortString(raw.mapId, 64)) return null
  if (!isFiniteNumber(raw.x) || Math.abs(raw.x) > POSITION_LIMIT) return null
  if (!isFiniteNumber(raw.y) || Math.abs(raw.y) > POSITION_LIMIT) return null
  if (!isFiniteNumber(raw.heading) || Math.abs(raw.heading) > 1_000) return null
  if (
    raw.locomotion !== Locomotion.Idle &&
    raw.locomotion !== Locomotion.Walk &&
    raw.locomotion !== Locomotion.Run
  ) {
    return null
  }
  if (!isFiniteNumber(raw.liftHeight) || raw.liftHeight < 0 || raw.liftHeight > 10) {
    return null
  }

  // 重建对象而不是透传：客户端塞的多余字段（不管是 bug 还是恶意）就地丢弃
  return {
    mapId: raw.mapId,
    x: raw.x,
    y: raw.y,
    heading: raw.heading,
    locomotion: raw.locomotion,
    liftHeight: raw.liftHeight,
  }
}

export function parseAppearance(value: unknown): ParticipantAppearance | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  if (!isShortString(raw.posture, 64)) return null

  const activity =
    raw.activity === null || raw.activity === undefined
      ? null
      : isShortString(raw.activity, 64)
        ? raw.activity
        : undefined
  if (activity === undefined) return null

  let heldItem: ParticipantAppearance['heldItem'] = null
  if (raw.heldItem !== null && raw.heldItem !== undefined) {
    const held = raw.heldItem as Record<string, unknown>
    if (!isShortString(held.itemId, 128)) return null
    if (
      !isFiniteNumber(held.quantity) ||
      !Number.isInteger(held.quantity) ||
      held.quantity < 1 ||
      held.quantity > 999
    ) {
      return null
    }
    // 锅里的东西是嵌套结构，逐字段校验不值得——按大小封顶即可：
    // 它只用来渲染，坏数据最多让那口锅画不出来，砸不了房
    if (held.container !== undefined && jsonBytes(held.container) > 8_192) return null
    heldItem = {
      itemId: held.itemId,
      quantity: held.quantity,
      quality: isShortString(held.quality, 32) ? (held.quality as never) : undefined,
      container: held.container as never,
    }
  }

  let restingOn: ParticipantAppearance['restingOn'] = null
  if (raw.restingOn !== null && raw.restingOn !== undefined) {
    const resting = raw.restingOn as Record<string, unknown>
    if (!isShortString(resting.instanceId, 160)) return null
    if (!isShortString(resting.anchorId, 64)) return null
    restingOn = { instanceId: resting.instanceId, anchorId: resting.anchorId }
  }

  return { posture: raw.posture, activity, heldItem, restingOn }
}

export function parseGesture(value: unknown): ParticipantGesture | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  if (raw.kind !== GestureKind.Jump && raw.kind !== GestureKind.Wave) return null
  if (!isFiniteNumber(raw.atMs)) return null

  return { kind: raw.kind, atMs: raw.atMs }
}

export function parseChatText(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = (value as Record<string, unknown>).text
  if (typeof raw !== 'string') return null

  const text = raw.trim()
  if (text.length === 0 || text.length > NET_LIMITS.maxChatLength) return null
  return text
}

export function parseProfileDraft(value: unknown): ProfileDraft | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  if (typeof raw.name !== 'string') return null
  const name = raw.name.trim()
  if (name.length === 0 || name.length > NET_LIMITS.maxNameLength) return null

  if (typeof raw.avatar !== 'object' || raw.avatar === null) return null
  /*
   * 捏脸配置用 Core 的 auditAvatarConfig 校验——服务端复用客户端同一套
   * 规则，这正是 TS 服务端的意义。审计不过不拒连（口头警告都不给）：
   * 老版本客户端的形象引用了新版删掉的零件时，画成默认脸就好，
   * 不该因为一顶帽子进不了朋友的房。
   */
  if (jsonBytes(raw.avatar) > 16_384) return null

  return { name, avatar: raw.avatar as ProfileDraft['avatar'] }
}

/** world / 切片这类大块头只按字节数封顶，内容交给客户端的迁移与审计 */
export function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8')
  } catch {
    // 循环引用等序列化不了的：按超限处理，反正也没法存
    return Number.MAX_SAFE_INTEGER
  }
}

/**
 * world:op 的白名单和大小闸。**不逐字段校验各变体**——op 是尽力而为的
 * 转发（见契约"op 管即时，refresh 管收敛"），各端的 replay 入口自带
 * 防御（未知家具/物品直接跳过），服务端把住两条底线就够：
 * kind 必须认识（不认识 = 更新的客户端或恶意载荷，都不该进房间），
 * 体积必须有界（一条 op 犯不着 64KB，超了就是在灌水）。
 */
const OP_KINDS = new Set([
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
  'bath_water_set',
])

const MAX_OP_BYTES = 65_536

export function parseWorldOp(value: unknown): WorldOp | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.kind !== 'string' || !OP_KINDS.has(raw.kind)) return null
  if (jsonBytes(value) > MAX_OP_BYTES) return null
  return value as WorldOp
}

/**
 * 切片白名单**从 Core 来**，不在这里抄第二份。
 *
 * 抄的那份已经走散过一次：协议 v6 给客户端加了 `lamps` 并每次刷新都发，
 * 这张表没跟上——于是每一次 `world:refresh` 都撞上下面那句"未知切片 =
 * 整条拒绝"被打回，房客连家具、天气都不再同步。没有任何东西报错，
 * 因为拒绝的分支就是 `return null`。
 *
 * Core 那边有编译期断言钉着"类型里的键必须都在表里"，所以现在漏一个的
 * 后果是**编译不过**，不是线上静默失联。这也正合 Backend AGENTS.md 那条：
 * 内容/协议规则只有一份，服务端不得自己复制一份。
 */
const REFRESH_KEYS = new Set<string>(WORLD_REFRESH_KEYS)

export function parseRefreshSlices(value: unknown): WorldRefreshSlices | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  const slices: Record<string, unknown> = {}
  let any = false
  for (const [key, slice] of Object.entries(raw)) {
    if (!REFRESH_KEYS.has(key)) return null // 未知切片=坏客户端，整条拒绝
    if (slice === undefined) continue
    slices[key] = slice
    any = true
  }
  if (!any) return null
  if (jsonBytes(slices) > NET_LIMITS.maxWorldBytes) return null

  return slices as WorldRefreshSlices
}
