import 'dotenv/config'

import http from 'node:http'

import { Server as SocketServer } from 'socket.io'

import { createApp } from './app.js'

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

io.on('connection', (socket) => {
  socket.emit('server:ready', {
    ok: true,
  })
})

server.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`)
})
