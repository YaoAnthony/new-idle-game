import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, beforeEach, test } from 'node:test'

import type {
  AuthOk,
  SaveDeleteOk,
  SaveGetOk,
  SaveHeadOk,
  SavePutConflict,
  SavePutOk,
} from 'core'

import { createApp } from '../src/app.js'
import { getDb, resetDbForTests } from '../src/shared/db.js'

/**
 * /api/saves 的契约验收（contracts/account_protocol.md"云存档并发"节）。
 * revision 乐观锁、writeId 幂等、-1 强制覆盖、prev_* 轮转——
 * 每条语义一条用例，测的就是契约本身。
 */

let server: http.Server | null = null
let base = ''

before(() => {
  process.env.NODE_ENV = 'test'
})

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

/** 结构探测要过的最小假存档（内容不逐字段校验，够形状即可） */
const makeSave = (marker: string, version = 25) => ({
  meta: {
    saveSchemaVersion: version,
    createdAtUtc: '2026-08-01T00:00:00.000Z',
    updatedAtUtc: '2026-08-14T00:00:00.000Z',
  },
  player: { name: marker },
  ownWorld: { worldId: 'world' },
})

async function registerAndToken(): Promise<string> {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'saver@example.com', password: 'hunter22' }),
  })
  const body = (await response.json()) as AuthOk
  return body.token
}

const authed = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
})

const putSave = (
  token: string,
  input: { baseRevision: number; writeId: string; marker: string; version?: number },
) =>
  fetch(`${base}/api/saves/me`, {
    method: 'PUT',
    headers: authed(token),
    body: JSON.stringify({
      baseRevision: input.baseRevision,
      writeId: input.writeId,
      deviceId: 'device-a',
      saveSchemaVersion: input.version ?? 25,
      save: makeSave(input.marker, input.version ?? 25),
    }),
  })

test('saves_requires_auth_on_every_route', async () => {
  for (const [method, path] of [
    ['GET', '/api/saves/me/head'],
    ['GET', '/api/saves/me'],
    ['PUT', '/api/saves/me'],
    ['DELETE', '/api/saves/me'],
  ] as const) {
    const response = await fetch(`${base}${path}`, { method })
    assert.equal(response.status, 401, `${method} ${path}`)
  }
})

test('saves_head_empty_cloud_returns_null_head', async () => {
  // Arrange
  const token = await registerAndToken()

  // Act
  const response = await fetch(`${base}/api/saves/me/head`, { headers: authed(token) })
  const body = (await response.json()) as SaveHeadOk

  // Assert
  assert.equal(response.status, 200)
  assert.equal(body.head, null)
})

test('saves_first_put_with_base_zero_creates_revision_one', async () => {
  // Arrange
  const token = await registerAndToken()

  // Act
  const response = await putSave(token, { baseRevision: 0, writeId: 'w1', marker: 'first' })
  const body = (await response.json()) as SavePutOk

  // Assert
  assert.equal(response.status, 200)
  assert.equal(body.revision, 1)

  const head = (await (
    await fetch(`${base}/api/saves/me/head`, { headers: authed(token) })
  ).json()) as SaveHeadOk
  assert.equal(head.head?.revision, 1)
  assert.equal(head.head?.deviceId, 'device-a')
  /*
   * head 必须带上 lastWriteId：客户端靠它认出"云端这一版是我自己推的，
   * 只是响应没收到"。少了它，关一次标签页就够让单机玩家吃一个
   * "另一台设备改过存档"的假冲突框（见 Features/CloudSave/reconcile）。
   */
  assert.equal(head.head?.lastWriteId, 'w1')
})

test('saves_put_with_matching_base_advances_revision', async () => {
  // Arrange
  const token = await registerAndToken()
  await putSave(token, { baseRevision: 0, writeId: 'w1', marker: 'first' })

  // Act
  const response = await putSave(token, { baseRevision: 1, writeId: 'w2', marker: 'second' })
  const body = (await response.json()) as SavePutOk

  // Assert
  assert.equal(body.revision, 2)
  const full = (await (
    await fetch(`${base}/api/saves/me`, { headers: authed(token) })
  ).json()) as SaveGetOk
  assert.equal((full.save.player as { name: string }).name, 'second')
})

test('saves_put_with_stale_base_conflicts_without_writing', async () => {
  // Arrange：云端已到 revision 2
  const token = await registerAndToken()
  await putSave(token, { baseRevision: 0, writeId: 'w1', marker: 'first' })
  await putSave(token, { baseRevision: 1, writeId: 'w2', marker: 'second' })

  // Act：另一台设备拿着旧基准 1 来写
  const response = await putSave(token, { baseRevision: 1, writeId: 'w3', marker: 'stale' })
  const body = (await response.json()) as SavePutConflict

  // Assert：409 带云端现状，且内容一个字节没变
  assert.equal(response.status, 409)
  assert.equal(body.code, 'revision_conflict')
  assert.equal(body.currentRevision, 2)
  const full = (await (
    await fetch(`${base}/api/saves/me`, { headers: authed(token) })
  ).json()) as SaveGetOk
  assert.equal((full.save.player as { name: string }).name, 'second')
})

test('saves_put_same_write_id_is_idempotent', async () => {
  // Arrange
  const token = await registerAndToken()
  await putSave(token, { baseRevision: 0, writeId: 'w1', marker: 'first' })

  // Act：响应丢了，客户端拿同一个 writeId 重试（基准已经旧了也没关系）
  const retry = await putSave(token, { baseRevision: 0, writeId: 'w1', marker: 'first' })
  const body = (await retry.json()) as SavePutOk

  // Assert：直接返回成功，revision 没有再涨
  assert.equal(retry.status, 200)
  assert.equal(body.revision, 1)
})

test('saves_put_force_overwrite_ignores_base_and_keeps_prev_backup', async () => {
  // Arrange：云端 revision 2
  const token = await registerAndToken()
  await putSave(token, { baseRevision: 0, writeId: 'w1', marker: 'first' })
  await putSave(token, { baseRevision: 1, writeId: 'w2', marker: 'second' })

  // Act：冲突框里玩家点了"用本机"
  const response = await putSave(token, { baseRevision: -1, writeId: 'w3', marker: 'mine' })
  const body = (await response.json()) as SavePutOk

  // Assert：写入成功 revision+1，被覆盖的那份进了 prev_*
  assert.equal(body.revision, 3)
  const row = getDb()
    .prepare('SELECT prev_revision, prev_payload FROM cloud_saves')
    .get() as { prev_revision: number; prev_payload: string }
  assert.equal(row.prev_revision, 2)
  assert.equal((JSON.parse(row.prev_payload).player as { name: string }).name, 'second')
})

test('saves_put_oversized_payload_returns_413', async () => {
  // Arrange
  const token = await registerAndToken()
  const huge = makeSave('huge')
  ;(huge.player as Record<string, unknown>).blob = 'x'.repeat(4_100_000)

  // Act
  const response = await fetch(`${base}/api/saves/me`, {
    method: 'PUT',
    headers: authed(token),
    body: JSON.stringify({
      baseRevision: 0,
      writeId: 'w1',
      deviceId: 'device-a',
      saveSchemaVersion: 25,
      save: huge,
    }),
  })

  // Assert
  assert.equal(response.status, 413)
})

test('saves_put_schema_version_mismatch_returns_422', async () => {
  // Arrange
  const token = await registerAndToken()
  const save = makeSave('bad', 25)

  // Act：顶层报 26，meta 里是 25
  const response = await fetch(`${base}/api/saves/me`, {
    method: 'PUT',
    headers: authed(token),
    body: JSON.stringify({
      baseRevision: 0,
      writeId: 'w1',
      deviceId: 'device-a',
      saveSchemaVersion: 26,
      save,
    }),
  })

  // Assert
  assert.equal(response.status, 422)
})

test('saves_get_without_cloud_save_returns_404', async () => {
  // Arrange
  const token = await registerAndToken()

  // Act
  const response = await fetch(`${base}/api/saves/me`, { headers: authed(token) })

  // Assert
  assert.equal(response.status, 404)
  const body = (await response.json()) as { code: string }
  assert.equal(body.code, 'no_save')
})

test('saves_delete_removes_cloud_save_and_head_goes_null', async () => {
  // Arrange
  const token = await registerAndToken()
  await putSave(token, { baseRevision: 0, writeId: 'w1', marker: 'to-delete' })

  // Act
  const response = await fetch(`${base}/api/saves/me`, {
    method: 'DELETE',
    headers: authed(token),
  })
  const body = (await response.json()) as SaveDeleteOk

  // Assert
  assert.equal(response.status, 200)
  assert.equal(body.deleted, true)

  const head = (await (
    await fetch(`${base}/api/saves/me/head`, { headers: authed(token) })
  ).json()) as SaveHeadOk
  assert.equal(head.head, null)

  const full = await fetch(`${base}/api/saves/me`, { headers: authed(token) })
  assert.equal(full.status, 404)
})

test('saves_delete_without_cloud_save_is_not_an_error', async () => {
  // Arrange：玩家要的结果（云端没有我的档）本来就成立了
  const token = await registerAndToken()

  // Act
  const response = await fetch(`${base}/api/saves/me`, {
    method: 'DELETE',
    headers: authed(token),
  })
  const body = (await response.json()) as SaveDeleteOk

  // Assert
  assert.equal(response.status, 200)
  assert.equal(body.deleted, false)
})

test('saves_delete_keeps_a_recoverable_copy_until_next_upload', async () => {
  // Arrange
  const token = await registerAndToken()
  await putSave(token, { baseRevision: 0, writeId: 'w1', marker: 'precious' })

  // Act：删掉
  await fetch(`${base}/api/saves/me`, { method: 'DELETE', headers: authed(token) })

  // Assert：人工还捞得到（点错卡的后悔药）
  const kept = getDb()
    .prepare('SELECT payload FROM deleted_cloud_saves')
    .get() as { payload: string } | undefined
  assert.ok(kept)
  assert.match(kept.payload, /precious/)

  // Act：删完之后重新传一份（走首传分支）
  const again = await putSave(token, { baseRevision: 0, writeId: 'w2', marker: 'fresh-start' })
  const body = (await again.json()) as SavePutOk
  assert.equal(body.revision, 1)

  // Assert：有了新档之后那份副本被清掉，保留期是有界的
  const after = getDb().prepare('SELECT payload FROM deleted_cloud_saves').get()
  assert.equal(after, undefined)
})
