import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, beforeEach, test } from 'node:test'

import jwt from 'jsonwebtoken'
import type { AuthOk, MeOk } from 'core'

import { createApp } from '../src/app.js'
import { resetDbForTests } from '../src/shared/db.js'

/**
 * /api/auth 的契约验收（contracts/account_protocol.md"账号语义"节）。
 * 起真服务器 + 真 fetch，走完整中间件链——限流、body 解析、错误处理
 * 都是被测对象的一部分。
 *
 * Google 登录只测"未配置回 503"：verifyIdToken 打的是 Google 的公钥端点，
 * 单测不该出网；链接/建号的分支逻辑靠 service 层的类型约束 + 手工验收。
 */

let server: http.Server | null = null
let base = ''

before(() => {
  process.env.NODE_ENV = 'test'
  delete process.env.GOOGLE_CLIENT_ID
})

// 每条用例一台新 app：数据库和限流桶都是干净的，用例之间零串扰
beforeEach(async () => {
  server?.close()
  resetDbForTests()
  server = http.createServer(createApp())
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  base = `http://127.0.0.1:${address.port}`
})

after(() => {
  server?.close()
})

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const GOOD = { email: 'Player@Example.com', password: 'hunter22' }

test('auth_register_valid_returns_token_and_normalized_email', async () => {
  // Arrange & Act
  const response = await post('/api/auth/register', GOOD)
  const body = (await response.json()) as AuthOk

  // Assert
  assert.equal(response.status, 201)
  assert.equal(body.ok, true)
  assert.ok(body.token.length > 0)
  assert.equal(body.user.email, 'player@example.com')
  assert.equal(body.user.hasPassword, true)
})

test('auth_register_duplicate_email_returns_email_taken', async () => {
  // Arrange
  await post('/api/auth/register', GOOD)

  // Act：大小写不同也算同一个邮箱
  const response = await post('/api/auth/register', { ...GOOD, email: 'PLAYER@example.com' })
  const body = (await response.json()) as { ok: false; code: string }

  // Assert
  assert.equal(response.status, 409)
  assert.equal(body.code, 'email_taken')
})

test('auth_register_bad_payloads_return_bad_request', async () => {
  for (const payload of [
    null,
    {},
    { email: 'not-an-email', password: 'hunter22' },
    { email: 'a@b.com', password: 'short' }, // < 8 字节
    { email: 'a@b.com', password: 'x'.repeat(73) }, // > bcrypt 72 字节
  ]) {
    const response = await post('/api/auth/register', payload)
    assert.equal(response.status, 400, JSON.stringify(payload))
  }
})

test('auth_login_correct_password_returns_token', async () => {
  // Arrange
  await post('/api/auth/register', GOOD)

  // Act
  const response = await post('/api/auth/login', GOOD)
  const body = (await response.json()) as AuthOk

  // Assert
  assert.equal(response.status, 200)
  assert.equal(body.user.email, 'player@example.com')
})

test('auth_login_wrong_password_and_unknown_email_same_error', async () => {
  // Arrange
  await post('/api/auth/register', GOOD)

  // Act
  const wrongPassword = await post('/api/auth/login', { ...GOOD, password: 'wrong-pass' })
  const unknownEmail = await post('/api/auth/login', {
    email: 'nobody@example.com',
    password: 'hunter22',
  })

  // Assert：两条失败路径状态码和错误码完全一致，不泄露账号存在性
  assert.equal(wrongPassword.status, 401)
  assert.equal(unknownEmail.status, 401)
  const bodyA = (await wrongPassword.json()) as { code: string }
  const bodyB = (await unknownEmail.json()) as { code: string }
  assert.equal(bodyA.code, 'invalid_credentials')
  assert.equal(bodyB.code, 'invalid_credentials')
})

test('auth_google_without_server_config_returns_not_configured', async () => {
  // Act
  const response = await post('/api/auth/google', { idToken: 'anything' })
  const body = (await response.json()) as { code: string }

  // Assert
  assert.equal(response.status, 503)
  assert.equal(body.code, 'not_configured')
})

test('auth_me_valid_token_returns_user', async () => {
  // Arrange
  const registered = (await (await post('/api/auth/register', GOOD)).json()) as AuthOk

  // Act
  const response = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${registered.token}` },
  })
  const body = (await response.json()) as MeOk

  // Assert
  assert.equal(response.status, 200)
  assert.equal(body.user.id, registered.user.id)
})

test('auth_me_missing_tampered_and_expired_tokens_return_401', async () => {
  // Arrange：过期 token 用同一个测试密钥签，但 exp 在过去
  const expired = jwt.sign({ userId: 'someone' }, 'test-secret-not-for-production', {
    expiresIn: '-1s',
  })

  for (const headers of [
    {},
    { Authorization: 'Bearer not-a-jwt' },
    { Authorization: `Bearer ${expired}` },
  ]) {
    // Act
    const response = await fetch(`${base}/api/auth/me`, { headers })

    // Assert
    assert.equal(response.status, 401, JSON.stringify(headers))
  }
})

test('auth_register_rate_limited_after_burst', async () => {
  // Act：register/login 共享同一个 IP 桶（10 次/分钟），连打 12 发
  const statuses: number[] = []
  for (let i = 0; i < 12; i++) {
    const response = await post('/api/auth/login', {
      email: `probe${i}@example.com`,
      password: 'hunter22',
    })
    statuses.push(response.status)
  }

  // Assert
  assert.ok(statuses.includes(429), `expected a 429 in ${statuses.join(',')}`)
})

/*
 * 回归：查重和插入之间隔着一个 `await bcrypt.hash`，哈希跑在线程池里、
 * 事件循环这期间会去处理别的请求——同一个邮箱的两个并发注册可以双双
 * 通过查重。数据库的 UNIQUE 约束会拦住第二条（它没错），但抛出去就是
 * 500，玩家看到"服务器炸了"而不是"这邮箱注册过了"。
 */
test('auth_concurrent_register_same_email_returns_conflict_not_500', async () => {
  // Arrange & Act：两发同时出门，谁先落库不确定
  const [first, second] = await Promise.all([
    post('/api/auth/register', { email: 'racer@example.com', password: 'hunter22' }),
    post('/api/auth/register', { email: 'racer@example.com', password: 'hunter22' }),
  ])
  const statuses = [first.status, second.status].sort()

  // Assert：一个 201 一个 409，绝不能出现 500
  assert.deepEqual(statuses, [201, 409], `got ${statuses.join(',')}`)

  const loser = first.status === 409 ? first : second
  const body = (await loser.json()) as { code?: string }
  assert.equal(body.code, 'email_taken')
})

/*
 * 回归：JWT 密钥的兜底范围。
 *
 * 原来的判据是 `NODE_ENV !== 'production'` 就发开发默认密钥——而
 * `npm start` 根本不设 NODE_ENV。部署时忘了设，服务器就用一个写死在
 * 源码里的密钥签发 token，任何人都能给**任意 userId** 伪造凭证，
 * 别人的云存档随便读随便覆盖。绑定地址骗不了人，改用它当判据。
 */
test('auth_dev_jwt_secret_refused_when_listening_beyond_loopback', async () => {
  // Arrange：借用真实模块，逐个还原被改动的环境变量
  const { getJwtSecret } = await import('../src/shared/config.js')
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    HOST: process.env.HOST,
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET,
  }
  delete process.env.NODE_ENV
  delete process.env.AUTH_JWT_SECRET

  try {
    // Act & Assert：回环上照旧发开发默认值，本机开发不该被卡住
    process.env.HOST = '127.0.0.1'
    assert.equal(typeof getJwtSecret(), 'string')

    // 一旦对外监听，缺密钥必须炸——沉默地用弱密钥才是最坏的结果
    process.env.HOST = '0.0.0.0'
    assert.throws(() => getJwtSecret(), /AUTH_JWT_SECRET/)

    // 生产环境的短密钥同样拒绝：扛不住离线爆破
    process.env.NODE_ENV = 'production'
    process.env.AUTH_JWT_SECRET = 'short'
    assert.throws(() => getJwtSecret(), /太短/)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
