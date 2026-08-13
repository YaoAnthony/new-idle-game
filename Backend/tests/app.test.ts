import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, test } from 'node:test'

import { createApp } from '../src/app.js'

/**
 * HTTP 外壳。今天只有 /health，但**外壳的行为本身就是契约**：
 * 404 要有错误码、500 不能把内部细节漏出去、超大 body 要被 body-parser
 * 挡在路由之前。这些都是"以后加第一个真 endpoint 时不会重新踩"的东西。
 *
 * 起真服务器 + 真 fetch，不 mock req/res——mock 掉的话，中间件顺序
 * （cors → json → 路由 → 404 → 错误处理）这个最容易搞错的地方一点都测不到。
 */

let server: http.Server
let base = ''

before(async () => {
  // createApp 在调用那一刻读 env，所以要先设好
  process.env.CORS_ORIGIN = 'http://localhost:5173'
  process.env.NODE_ENV = 'test'

  server = http.createServer(createApp())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  base = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('/health 回 200 和服务名', async () => {
  const response = await fetch(`${base}/health`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'new-idle-game-backend',
  })
})

test('不存在的路由回 404，且带上方法和路径（好定位）', async () => {
  const response = await fetch(`${base}/nope`)

  assert.equal(response.status, 404)
  const body = (await response.json()) as { error: { message: string; status: number } }
  assert.equal(body.error.status, 404)
  assert.match(body.error.message, /GET/)
  assert.match(body.error.message, /\/nope/)
})

test('404 对任何方法都成立，不是只有 GET', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const response = await fetch(`${base}/nope`, { method })
    assert.equal(response.status, 404, `${method} 应该也是 404`)
  }
})

test('不暴露 x-powered-by', async () => {
  const response = await fetch(`${base}/health`)
  assert.equal(response.headers.get('x-powered-by'), null)
})

test('CORS 放行配置里的来源，并允许带凭据', async () => {
  const response = await fetch(`${base}/health`, {
    headers: { Origin: 'http://localhost:5173' },
  })

  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
})

test('CORS 不放行配置之外的来源', async () => {
  const response = await fetch(`${base}/health`, {
    headers: { Origin: 'http://evil.example' },
  })

  // cors 中间件对不匹配的来源不回 allow-origin 头，浏览器据此拦下
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('预检请求走得通', async () => {
  const response = await fetch(`${base}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
    },
  })

  assert.ok(response.status === 204 || response.status === 200)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('坏 JSON 被 body-parser 挡下，错误码保留（不是一律 500）', async () => {
  const response = await fetch(`${base}/anything`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ 这不是 JSON',
  })

  assert.equal(response.status, 400)
  const body = (await response.json()) as { error: { status: number; message: string } }
  assert.equal(body.error.status, 400)
  // 400 这类客户端错误要说清楚原因，只有 500 才藏
  assert.ok(body.error.message.length > 0)
})

test('超过 10mb 的 body 在进路由之前就被挡下', async () => {
  const response = await fetch(`${base}/anything`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blob: 'x'.repeat(11_000_000) }),
  })

  assert.equal(response.status, 413)
})

test('合法 JSON body 能过解析，最终落到 404（说明中间件顺序没错）', async () => {
  const response = await fetch(`${base}/anything`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hello: 'world' }),
  })

  assert.equal(response.status, 404)
})

test('错误响应永远是 { error: { message, status } } 这个形状', async () => {
  const response = await fetch(`${base}/nope`)
  const body = (await response.json()) as Record<string, unknown>

  assert.deepEqual(Object.keys(body), ['error'])
  assert.deepEqual(Object.keys(body.error as object).sort(), ['message', 'status'])
})
