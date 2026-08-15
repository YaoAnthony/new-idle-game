import { Router } from 'express'
import type { SaveGetOk, SaveHeadOk, SavePutRequest } from 'core'

import { authedUserId, requireAuth } from '../auth/middleware.js'
import { accountError } from '../auth/validate.js'
import { createRateLimiter } from '../shared/rateLimit.js'
import { getFull, getHead, put } from './service.js'

const STATUS_BY_CODE: Record<string, number> = {
  bad_request: 400,
  payload_too_large: 413,
  invalid_save: 422,
  revision_conflict: 409,
  rate_limited: 429,
}

export function createSavesRouter(): Router {
  const router = Router()
  router.use(requireAuth)

  const putLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 6,
    // requireAuth 在前，locals 里一定有 userId
    keyOf: (req) => (req.res?.locals.userId as string | undefined) ?? (req.ip ?? 'unknown'),
  })

  router.get('/me/head', (_req, res) => {
    const body: SaveHeadOk = { ok: true, head: getHead(authedUserId(res)) }
    res.json(body)
  })

  router.get('/me', (_req, res) => {
    const found = getFull(authedUserId(res))
    if (!found) {
      return void res.status(404).json(accountError('no_save', '云端没有存档'))
    }
    const body: SaveGetOk = { ok: true, revision: found.revision, save: found.save }
    res.json(body)
  })

  router.put('/me', putLimiter, (req, res) => {
    const raw = req.body as Partial<SavePutRequest> | null
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof raw.baseRevision !== 'number' ||
      !Number.isInteger(raw.baseRevision) ||
      raw.baseRevision < -1 ||
      typeof raw.writeId !== 'string' ||
      raw.writeId.length === 0 ||
      raw.writeId.length > 64 ||
      typeof raw.deviceId !== 'string' ||
      raw.deviceId.length === 0 ||
      raw.deviceId.length > 64 ||
      typeof raw.saveSchemaVersion !== 'number'
    ) {
      return void res.status(400).json(accountError('bad_request', '同步参数不合法'))
    }

    const outcome = put(authedUserId(res), {
      baseRevision: raw.baseRevision,
      writeId: raw.writeId,
      deviceId: raw.deviceId,
      saveSchemaVersion: raw.saveSchemaVersion,
      save: raw.save,
    })

    if (outcome.ok) return void res.json(outcome)
    res.status(STATUS_BY_CODE[outcome.code] ?? 400).json(outcome)
  })

  return router
}
