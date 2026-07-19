import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import createError from 'http-errors'
import morgan from 'morgan'

const parseCorsOrigin = () => {
  const origin = process.env.CORS_ORIGIN

  if (!origin) {
    return true
  }

  return origin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
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
  app.use(
    cors({
      origin: parseCorsOrigin(),
      credentials: true,
    }),
  )
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: false }))
  app.use(cookieParser())

  app.get('/health', healthRoute)
  app.use(notFoundRoute)
  app.use(errorHandler)

  return app
}
