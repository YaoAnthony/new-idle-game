import { randomBytes, randomInt } from 'node:crypto'

/**
 * 邀请码字母表：去掉了 I/L/O/0/1 这些互相认错的字符。
 * 6 位 ≈ 8.9 亿组合，对"口头念给朋友"的场景绰绰有余；
 * 地址式邀请码（"forest 3 号小屋"）是产品层的糖，以后铺在这上面。
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function newJoinCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}

/** 用户输入的邀请码先归一化再查表：大小写、首尾空格都不该是"房间不存在" */
export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/**
 * 玩家 id。**它同时是客户端对象 id 的发号方前缀**（`<playerId>:drop:rice#8`），
 * 所以字符集必须避开分隔符 `:` 和 `#`——hex 天然满足。
 * 8 位 hex 在单个会话（≤5 人）里撞不上；它不是全局账号 id，只活一场会话。
 */
export function newPlayerId(): string {
  return `p-${randomBytes(4).toString('hex')}`
}

export function newSessionId(): string {
  return `s-${randomBytes(8).toString('hex')}`
}
