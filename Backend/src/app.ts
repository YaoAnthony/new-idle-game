import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import createError from 'http-errors'
import morgan from 'morgan'

import { createAuthRouter } from './auth/routes.js'
import { createSavesRouter } from './saves/routes.js'

const configuredOrigins = (): string[] =>
  (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

/** http://localhost:5174 / http://127.0.0.1:3000 这类本机开发地址 */
const isLocalhostOrigin = (origin: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)

/**
 * CORS 白名单。
 *
 * **非生产环境一律放行本机地址**，不管 CORS_ORIGIN 配的是哪个端口。
 * 起因是实测踩到：`.env` 里写着 5173，而 Frontend-3D 的 dev server 在
 * 5174，于是所有 REST 请求（登录、云存档）被浏览器预检拦死——而联机
 * 一切正常，因为 websocket 不走预检。表现是"游戏好好的，只有登录不通"，
 * 排查起来极费时间，而这只是个端口号。
 *
 * 生产环境不放宽：CORS_ORIGIN 没配就一个跨域都不认（`false`），
 * 要放行必须显式列出来。
 */
const corsOrigin: cors.CorsOptions['origin'] = (origin, callback) => {
  // 同源请求、curl、服务端之间的调用没有 Origin 头，照常放行
  if (!origin) return callback(null, true)

  const allowed = configuredOrigins()
  if (allowed.includes(origin)) return callback(null, true)
  if (process.env.NODE_ENV !== 'production' && isLocalhostOrigin(origin)) {
    return callback(null, true)
  }
  // 没配 CORS_ORIGIN 时保持原来的"全放"，避免改坏既有部署
  return callback(null, allowed.length === 0 && process.env.NODE_ENV !== 'production')
}

const healthRoute: RequestHandler = (_request, response) => {
  response.json({
    ok: true,
    service: 'new-idle-game-backend',
  })
}

const notFoundRoute: RequestHandler = (request, _response, next) => {
  next(createError(404, `Route not found: ${request.method} ${request.originalUrl}`))
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const status = typeof error.status === 'number' ? error.status : 500

  response.status(status).json({
    error: {
      message: status === 500 ? 'Internal Server Error' : error.message,
      status,
    },
  })
}

export const createApp = () => {
  const app = express()

  app.disable('x-powered-by')

  /*
   * 反向代理后面必须认 X-Forwarded-For，否则 req.ip 一律是代理那一个地址，
   * 按 IP 分桶的限流会从"防撞库"退化成"全服共用一个配额"——一个人狂点
   * 登录就把所有人挡在门外。**默认不开**：没有代理时信这个头等于让
   * 任何人自报 IP 绕过限流。部署在代理后面时用 TRUST_PROXY 显式打开
   * （值同 express 的 trust proxy：1 = 只信最近一跳，最常见）。
   */
  const trustProxy = process.env.TRUST_PROXY
  if (trustProxy) {
    const hops = Number.parseInt(trustProxy, 10)
    app.set('trust proxy', Number.isNaN(hops) ? trustProxy : hops)
  }
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    }),
  )
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: false }))
  app.use(cookieParser())

  app.get('/health', healthRoute)
  // 协议见 contracts/account_protocol.md，形状在 Core/types/account
  app.use('/api/auth', createAuthRouter())
  app.use('/api/saves', createSavesRouter())
  app.use(notFoundRoute)
  app.use(errorHandler)

  return app
}
