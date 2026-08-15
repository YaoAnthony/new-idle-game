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

/** 生产环境的密钥长度下限。32 字节以下的随手密码扛不住离线爆破 */
const MIN_SECRET_LENGTH = 32

/**
 * 只监听回环地址才算"本机开发"。
 *
 * 判据不用 NODE_ENV：`npm start` 不设它，忘了设就等于宣布自己是开发环境——
 * 而这个判断错了的代价是**任何人都能给任意 userId 伪造 token**，
 * 拿别人的云存档随便读写。绑定地址骗不了人：只要还在 127.0.0.1 上，
 * 外面就够不着；一旦对外监听（0.0.0.0 或公网 IP），密钥必须是真的。
 */
function bindsToLoopbackOnly(): boolean {
  const host = process.env.HOST ?? '127.0.0.1'
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

export function getJwtSecret(): string {
  const value = process.env.AUTH_JWT_SECRET
  if (value && value.length > 0) {
    if (process.env.NODE_ENV === 'production' && value.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `AUTH_JWT_SECRET 太短（生产环境至少 ${MIN_SECRET_LENGTH} 字符）——` +
          '用 `openssl rand -base64 48` 生成一个',
      )
    }
    return value
  }
  if (isTest()) return 'test-secret-not-for-production'

  // 本地开发不该被一个环境变量卡住，但"对外监听"就不再是本地开发了
  if (process.env.NODE_ENV !== 'production' && bindsToLoopbackOnly()) {
    if (!warnedDevSecret) {
      warnedDevSecret = true
      console.warn(
        '[auth] AUTH_JWT_SECRET 未配置，使用仅限本机的开发默认值——' +
          '对外监听或上生产前必须在 .env 里配置',
      )
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
