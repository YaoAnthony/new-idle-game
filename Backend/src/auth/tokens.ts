import jwt from 'jsonwebtoken'

import { getJwtSecret } from '../shared/config.js'

/**
 * JWT 签发与校验。payload 只放 userId——email 之类会变的东西不进 token，
 * 变了还得等 30 天过期才一致。v1 不做撤销/refresh（见契约）：
 * 过期重新登录，登出只是前端忘掉 token。
 */

const EXPIRES_IN = '30d'

export function signToken(userId: string): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: EXPIRES_IN })
}

/** 过期、篡改、格式坏，一律 null——调用方只需要知道"这 token 不算数" */
export function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, getJwtSecret())
    if (typeof payload !== 'object' || payload === null) return null
    const userId = (payload as { userId?: unknown }).userId
    if (typeof userId !== 'string' || userId.length === 0) return null
    return { userId }
  } catch {
    return null
  }
}
