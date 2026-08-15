import type { RequestHandler } from 'express'
import type { AccountError } from 'core'

import { verifyToken } from './tokens.js'

/**
 * Bearer 鉴权。express 的 Request 不便全局扩容（会影响 multiplayer 那边的
 * 类型），用 res.locals 传 userId——只有过了这道闸的路由才读得到。
 */

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  const verified = token ? verifyToken(token) : null

  if (!verified) {
    const body: AccountError = { ok: false, code: 'unauthorized', message: '未登录或登录已过期' }
    res.status(401).json(body)
    return
  }

  res.locals.userId = verified.userId
  next()
}

export function authedUserId(res: Parameters<RequestHandler>[1]): string {
  return res.locals.userId as string
}
