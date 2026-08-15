/**
 * 环境配置的唯一读取点。**缺关键项在启动那一刻 fail-fast**——
 * 让"忘了配 secret"表现为一行清楚的启动报错，而不是第一个用户
 * 登录时的 500。test 环境给内置默认值，测试不需要 .env。
 */

/**
 * 惰性读，不在模块顶层算——测试的 before() 钩子设 NODE_ENV 时，
 * 模块早就 import 完了；顶层快照会把测试悄悄导向磁盘上的真库。
 */
const isTest = () => process.env.NODE_ENV === 'test'

function required(name: string, testDefault: string): string {
  const value = process.env[name]
  if (value && value.length > 0) return value
  if (isTest()) return testDefault
  throw new Error(`缺少环境变量 ${name}——在 Backend/.env 里配置（见 .env.example）`)
}

let warnedDevSecret = false

export function getJwtSecret(): string {
  const value = process.env.AUTH_JWT_SECRET
  if (value && value.length > 0) return value
  if (isTest()) return 'test-secret-not-for-production'
  // 本地开发不该被一个环境变量卡住，但生产缺 secret 必须炸
  if (process.env.NODE_ENV !== 'production') {
    if (!warnedDevSecret) {
      warnedDevSecret = true
      console.warn('[auth] AUTH_JWT_SECRET 未配置，使用开发默认值——生产环境必须在 .env 里配置')
    }
    return 'insecure-dev-secret'
  }
  throw new Error('缺少环境变量 AUTH_JWT_SECRET——在 Backend/.env 里配置（见 .env.example）')
}

/** 未配置返回 null：Google 登录路由回 503 not_configured，不崩服务 */
export function getGoogleClientId(): string | null {
  const value = process.env.GOOGLE_CLIENT_ID
  return value && value.length > 0 ? value : null
}

export function getDbPath(): string {
  if (isTest()) return ':memory:'
  return process.env.DB_PATH ?? 'data/app.db'
}
