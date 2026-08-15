import { randomUUID } from 'node:crypto'

import bcrypt from 'bcrypt'
import { OAuth2Client } from 'google-auth-library'
import type { AccountError, AccountUser } from 'core'

import { getGoogleClientId } from '../shared/config.js'
import { getDb } from '../shared/db.js'
import { accountError } from './validate.js'

/**
 * 账号的业务规则。纯函数式的"输入 → 用户或错误"，不碰 express——
 * 和 multiplayer 的 sessions.ts 同一个理由：每条分支都能用普通调用打到。
 *
 * 合并策略（契约"账号语义"节）刻意不对称：
 * - Google 登录可以**链接**到同邮箱的密码账号——Google 已证明邮箱所有权；
 * - 密码注册**不能**接管同邮箱的 google-only 账号——注册者证明不了
 *   这个邮箱是他的（v1 没有邮箱验证）。
 */

const BCRYPT_COST = 12

/** 恒定时序用的假哈希：查无此人时也 compare 一次，让两条路耗时一致 */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST)

type UserRow = {
  id: string
  email: string
  password_hash: string | null
  google_sub: string | null
  created_at_utc: string
}

function toAccountUser(row: UserRow): AccountUser {
  return {
    id: row.id,
    email: row.email,
    hasPassword: row.password_hash !== null,
    createdAtUtc: row.created_at_utc,
  }
}

function findByEmail(email: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined
}

export async function register(
  email: string,
  password: string,
): Promise<AccountUser | AccountError> {
  const existing = findByEmail(email)
  if (existing) {
    return existing.password_hash !== null
      ? accountError('email_taken', '这个邮箱已经注册过了')
      : accountError('email_uses_google', '这个邮箱是用 Google 注册的，请用 Google 登录')
  }

  const row: UserRow = {
    id: randomUUID(),
    email,
    password_hash: await bcrypt.hash(password, BCRYPT_COST),
    google_sub: null,
    created_at_utc: new Date().toISOString(),
  }
  getDb()
    .prepare(
      'INSERT INTO users (id, email, password_hash, google_sub, created_at_utc) VALUES (?, ?, ?, ?, ?)',
    )
    .run(row.id, row.email, row.password_hash, row.google_sub, row.created_at_utc)

  return toAccountUser(row)
}

export async function login(email: string, password: string): Promise<AccountUser | AccountError> {
  const row = findByEmail(email)

  // 三种失败（查无此人 / google-only / 密码错）都要跑一次 compare 再统一回
  // invalid_credentials——耗时一致 + 文案一致，不泄露账号存在性
  const hash = row?.password_hash ?? DUMMY_HASH
  const matches = await bcrypt.compare(password, hash)

  if (!row || row.password_hash === null || !matches) {
    return accountError('invalid_credentials', '邮箱或密码不对')
  }
  return toAccountUser(row)
}

let googleClient: OAuth2Client | null = null

export async function loginWithGoogle(idToken: string): Promise<AccountUser | AccountError> {
  const clientId = getGoogleClientId()
  if (!clientId) {
    return accountError('not_configured', '服务端未配置 Google 登录')
  }

  let sub: string
  let email: string
  try {
    googleClient ??= new OAuth2Client(clientId)
    const ticket = await googleClient.verifyIdToken({ idToken, audience: clientId })
    const payload = ticket.getPayload()
    // email_verified 必须为 true：Google 允许未验证邮箱的账号存在，
    // 那种邮箱证明不了所有权，链接到密码账号就成了接管漏洞
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return accountError('invalid_google_token', 'Google 登录校验失败')
    }
    sub = payload.sub
    email = payload.email.toLowerCase()
  } catch {
    return accountError('invalid_google_token', 'Google 登录校验失败')
  }

  const db = getDb()

  const bySub = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub) as
    | UserRow
    | undefined
  if (bySub) return toAccountUser(bySub)

  const byEmail = findByEmail(email)
  if (byEmail) {
    // 链接：同邮箱的密码账号第一次用 Google 登录
    db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(sub, byEmail.id)
    return toAccountUser({ ...byEmail, google_sub: sub })
  }

  const row: UserRow = {
    id: randomUUID(),
    email,
    password_hash: null,
    google_sub: sub,
    created_at_utc: new Date().toISOString(),
  }
  db.prepare(
    'INSERT INTO users (id, email, password_hash, google_sub, created_at_utc) VALUES (?, ?, ?, ?, ?)',
  ).run(row.id, row.email, row.password_hash, row.google_sub, row.created_at_utc)

  return toAccountUser(row)
}

export function findById(userId: string): AccountUser | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as
    | UserRow
    | undefined
  return row ? toAccountUser(row) : null
}
