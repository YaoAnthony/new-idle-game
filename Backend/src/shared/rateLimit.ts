import type { RequestHandler } from 'express'
import type { AccountError } from 'core'

/**
 * 内存滑动窗口限流。单进程够用（和联机会话同一个判断：要跨进程时
 * 再上 Redis，那是部署问题不是结构问题）。
 *
 * 防的不是玩家，是脚本：撞库、密码喷洒、失控客户端的重试风暴。
 * 正常玩家一分钟登录不了十次。
 */

type Bucket = number[]

export function createRateLimiter(options: {
  windowMs: number
  max: number
  /** 取限流键：登录/注册按 IP，PUT saves 按 userId */
  keyOf: (req: Parameters<RequestHandler>[0]) => string
}): RequestHandler {
  const buckets = new Map<string, Bucket>()

  return (req, res, next) => {
    const now = Date.now()
    const key = options.keyOf(req)

    const bucket = (buckets.get(key) ?? []).filter((at) => now - at < options.windowMs)
    if (bucket.length >= options.max) {
      buckets.set(key, bucket)
      const body: AccountError = {
        ok: false,
        code: 'rate_limited',
        message: '请求太频繁，稍后再试',
      }
      res.status(429).json(body)
      return
    }

    bucket.push(now)
    buckets.set(key, bucket)

    // 桶数量封顶：长时间运行不能无限攒 key（每个 IP 一条）
    if (buckets.size > 10_000) {
      for (const [candidate, times] of buckets) {
        if (times.every((at) => now - at >= options.windowMs)) buckets.delete(candidate)
      }
    }

    next()
  }
}
