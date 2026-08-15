import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import type { AuthOk, MeOk } from 'core'

import { createRateLimiter } from '../shared/rateLimit.js'
import { authedUserId, requireAuth } from './middleware.js'
import { findById, login, loginWithGoogle, register } from './service.js'
import { signToken } from './tokens.js'
import { accountError, parseCredentials, parseGooglePayload } from './validate.js'

/**
 * /api/auth 的 express 皮：限流 → 校验 → service → 状态码。
 * 业务规则全在 service.ts，这里只做翻译。
 */

/**
 * express 4 不接 async handler 的异常——bcrypt/配置抛一下就是整个进程
 * 未处理拒绝直接退出（上线前实测踩到）。包一层送进错误中间件。
 */
export const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next)
  }

const STATUS_BY_CODE: Record<string, number> = {
  bad_request: 400,
  email_taken: 409,
  email_uses_google: 409,
  invalid_credentials: 401,
  invalid_google_token: 401,
  unauthorized: 401,
  rate_limited: 429,
  not_configured: 503,
}

export function createAuthRouter(): Router {
  const router = Router()

  // 每个 app 一份限流状态（测试里起新 app 就是干净的桶）
  const authLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 10,
    keyOf: (req) => req.ip ?? 'unknown',
  })

  router.post('/register', authLimiter, asyncRoute(async (req, res) => {
    const parsed = parseCredentials(req.body)
    if ('ok' in parsed) return void res.status(400).json(parsed)

    const outcome = await register(parsed.email, parsed.password)
    if ('ok' in outcome) {
      return void res.status(STATUS_BY_CODE[outcome.code] ?? 400).json(outcome)
    }

    const body: AuthOk = { ok: true, token: signToken(outcome.id), user: outcome }
    res.status(201).json(body)
  }))

  router.post('/login', authLimiter, asyncRoute(async (req, res) => {
    const parsed = parseCredentials(req.body)
    if ('ok' in parsed) return void res.status(400).json(parsed)

    const outcome = await login(parsed.email, parsed.password)
    if ('ok' in outcome) {
      return void res.status(STATUS_BY_CODE[outcome.code] ?? 400).json(outcome)
    }

    const body: AuthOk = { ok: true, token: signToken(outcome.id), user: outcome }
    res.json(body)
  }))

  router.post('/google', authLimiter, asyncRoute(async (req, res) => {
    const parsed = parseGooglePayload(req.body)
    if ('ok' in parsed) return void res.status(400).json(parsed)

    const outcome = await loginWithGoogle(parsed.idToken)
    if ('ok' in outcome) {
      return void res.status(STATUS_BY_CODE[outcome.code] ?? 400).json(outcome)
    }

    const body: AuthOk = { ok: true, token: signToken(outcome.id), user: outcome }
    res.json(body)
  }))

  router.get('/me', requireAuth, (_req, res) => {
    const user = findById(authedUserId(res))
    // token 合法但用户没了（比如换了数据库文件）：按未登录处理
    if (!user) {
      return void res.status(401).json(accountError('unauthorized', '未登录或登录已过期'))
    }
    const body: MeOk = { ok: true, user }
    res.json(body)
  })

  return router
}
