import {
  ACCOUNT_LIMITS,
  FORCE_OVERWRITE_REVISION,
  type AccountError,
  type GameSave,
  type SaveHead,
  type SavePutConflict,
  type SavePutOk,
} from 'core'

import { getDb } from '../shared/db.js'
import { accountError } from '../auth/validate.js'

/**
 * 云存档：每用户一行，revision 乐观锁 + writeId 幂等 + prev_* 一份轮转备份。
 * 语义表在 contracts/account_protocol.md"云存档并发"节，这里逐条对应。
 *
 * 服务端是保管员不是裁判：payload 只做字节封顶 + 顶层结构探测，
 * 不逐字段校验，不做迁移——坏档坑的是上传它的玩家自己，
 * 读得懂它的（迁移、审计）都在客户端。
 */

type SaveRow = {
  user_id: string
  revision: number
  save_schema_version: number
  payload: string
  byte_size: number
  device_id: string
  last_write_id: string
  updated_at_utc: string
  prev_payload: string | null
  prev_revision: number | null
}

function findRow(userId: string): SaveRow | undefined {
  return getDb().prepare('SELECT * FROM cloud_saves WHERE user_id = ?').get(userId) as
    | SaveRow
    | undefined
}

export function getHead(userId: string): SaveHead | null {
  const row = findRow(userId)
  if (!row) return null
  return {
    revision: row.revision,
    updatedAtUtc: row.updated_at_utc,
    saveSchemaVersion: row.save_schema_version,
    byteSize: row.byte_size,
    deviceId: row.device_id,
  }
}

export function getFull(userId: string): { revision: number; save: GameSave } | null {
  const row = findRow(userId)
  if (!row) return null
  return { revision: row.revision, save: JSON.parse(row.payload) as GameSave }
}

export type PutInput = {
  baseRevision: number
  writeId: string
  deviceId: string
  saveSchemaVersion: number
  save: unknown
}

export function put(userId: string, input: PutInput): SavePutOk | SavePutConflict | AccountError {
  // ---- 结构探测（不逐字段）----
  if (typeof input.save !== 'object' || input.save === null) {
    return accountError('invalid_save', '存档不是对象')
  }
  const meta = (input.save as { meta?: { saveSchemaVersion?: unknown } }).meta
  if (
    typeof meta?.saveSchemaVersion !== 'number' ||
    !Number.isInteger(meta.saveSchemaVersion) ||
    meta.saveSchemaVersion <= 0 ||
    meta.saveSchemaVersion !== input.saveSchemaVersion
  ) {
    return accountError('invalid_save', '存档版本号不合法或与请求不一致')
  }

  let payload: string
  try {
    payload = JSON.stringify(input.save)
  } catch {
    return accountError('invalid_save', '存档无法序列化')
  }
  const byteSize = Buffer.byteLength(payload, 'utf8')
  if (byteSize > ACCOUNT_LIMITS.maxSaveBytes) {
    return accountError('payload_too_large', '存档超出大小上限')
  }

  const db = getDb()
  const run = db.transaction((): SavePutOk | SavePutConflict => {
    const row = findRow(userId)

    // 幂等命中：上次写成功了但响应丢了，客户端拿着同一个 writeId 重试
    if (row && row.last_write_id === input.writeId) {
      return { ok: true, revision: row.revision, updatedAtUtc: row.updated_at_utc }
    }

    const conflict = (): SavePutConflict => ({
      ok: false,
      code: 'revision_conflict',
      message: '云端存档已被更新',
      currentRevision: row!.revision,
      currentUpdatedAtUtc: row!.updated_at_utc,
      currentSaveSchemaVersion: row!.save_schema_version,
      currentDeviceId: row!.device_id,
    })

    const now = new Date().toISOString()

    if (!row) {
      // 无档时 -1（强制覆盖）也接受——没有可覆盖的东西，语义等同首传
      if (input.baseRevision !== 0 && input.baseRevision !== FORCE_OVERWRITE_REVISION) {
        // 客户端以为有档（带着旧基准）但云端是空的（比如换了库）：
        // 按冲突报出去让客户端重走对账，别静默当首传
        return {
          ok: false,
          code: 'revision_conflict',
          message: '云端没有存档，请重新同步',
          currentRevision: 0,
          currentUpdatedAtUtc: now,
          currentSaveSchemaVersion: 0,
          currentDeviceId: '',
        }
      }
      db.prepare(
        `INSERT INTO cloud_saves
           (user_id, revision, save_schema_version, payload, byte_size,
            device_id, last_write_id, updated_at_utc, prev_payload, prev_revision)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      ).run(userId, input.saveSchemaVersion, payload, byteSize, input.deviceId, input.writeId, now)
      return { ok: true, revision: 1, updatedAtUtc: now }
    }

    const matches =
      input.baseRevision === row.revision || input.baseRevision === FORCE_OVERWRITE_REVISION
    if (!matches) return conflict()

    const nextRevision = row.revision + 1
    db.prepare(
      `UPDATE cloud_saves SET
         revision = ?, save_schema_version = ?, payload = ?, byte_size = ?,
         device_id = ?, last_write_id = ?, updated_at_utc = ?,
         prev_payload = ?, prev_revision = ?
       WHERE user_id = ?`,
    ).run(
      nextRevision,
      input.saveSchemaVersion,
      payload,
      byteSize,
      input.deviceId,
      input.writeId,
      now,
      // 一份轮转备份：这次写坏了，人工还能从 prev 捞回上一份
      row.payload,
      row.revision,
      userId,
    )
    return { ok: true, revision: nextRevision, updatedAtUtc: now }
  })

  return run()
}
