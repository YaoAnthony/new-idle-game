import { ACCOUNT_LIMITS, type AccountError, type AccountErrorCode } from 'core'

/**
 * 入站载荷的结构校验。手写而不是上 express-validator/zod——
 * 三个端点各两三个字段，风格对齐 multiplayer/validate.ts：
 * **服务端一个字都不信客户端**，坏载荷只换来 400，不崩进程。
 */

export function accountError(code: AccountErrorCode, message: string): AccountError {
  return { ok: false, code, message }
}

/** 够用的邮箱形状检查：有且只有一个 @，两侧非空，@ 后有点。不追 RFC 全文 */
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@')
  if (at <= 0 || at !== value.lastIndexOf('@') || at === value.length - 1) return false
  const domain = value.slice(at + 1)
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

export type Credentials = { email: string; password: string }

/** register 和 login 共用：email 小写归一在这里做，后面所有比对都用归一后的 */
export function parseCredentials(payload: unknown): Credentials | AccountError {
  if (typeof payload !== 'object' || payload === null) {
    return accountError('bad_request', '载荷不是对象')
  }
  const raw = payload as Record<string, unknown>

  if (typeof raw.email !== 'string') return accountError('bad_request', '缺少邮箱')
  const email = raw.email.trim().toLowerCase()
  if (email.length === 0 || email.length > ACCOUNT_LIMITS.maxEmailLength || !looksLikeEmail(email)) {
    return accountError('bad_request', '邮箱格式不对')
  }

  if (typeof raw.password !== 'string') return accountError('bad_request', '缺少密码')
  // 长度按字节算：bcrypt 的 72 上限是字节，多字节字符按字符数算会放进截断区
  const passwordBytes = Buffer.byteLength(raw.password, 'utf8')
  if (
    passwordBytes < ACCOUNT_LIMITS.minPasswordLength ||
    passwordBytes > ACCOUNT_LIMITS.maxPasswordLength
  ) {
    return accountError(
      'bad_request',
      `密码长度需要 ${ACCOUNT_LIMITS.minPasswordLength}–${ACCOUNT_LIMITS.maxPasswordLength} 字节`,
    )
  }

  return { email, password: raw.password }
}

export function parseGooglePayload(payload: unknown): { idToken: string } | AccountError {
  if (typeof payload !== 'object' || payload === null) {
    return accountError('bad_request', '载荷不是对象')
  }
  const idToken = (payload as Record<string, unknown>).idToken
  // Google idToken 是三段 base64，正常一两千字节；8KB 封顶挡灌水
  if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > 8_192) {
    return accountError('bad_request', 'idToken 不合法')
  }
  return { idToken }
}
