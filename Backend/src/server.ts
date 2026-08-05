import 'dotenv/config'

import http from 'node:http'

import { Server as SocketServer } from 'socket.io'

import { createApp } from './app.js'
import { SOCKET_SERVER_OPTIONS, registerMultiplayer } from './multiplayer/handlers.js'

const normalizePort = (value: string) => {
  const port = Number.parseInt(value, 10)

  if (Number.isNaN(port) || port <= 0) {
    return 3001
  }

  return port
}

const app = createApp()
const server = http.createServer(app)
const port = normalizePort(process.env.PORT ?? '3001')
const host = process.env.HOST ?? '127.0.0.1'
const corsOrigin = process.env.CORS_ORIGIN

const io = new SocketServer(server, {
  ...SOCKET_SERVER_OPTIONS,
  cors: {
    origin: corsOrigin
      ? corsOrigin
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : true,
    credentials: true,
  },
})

app.set('io', io)

// 联机会话（协议见 contracts/multiplayer_protocol.md，形状在 Core/types/net）
registerMultiplayer(io)

server.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`)
})
