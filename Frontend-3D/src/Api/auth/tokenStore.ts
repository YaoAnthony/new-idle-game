/**
 * JWT 的唯一存取点（用户拍板：localStorage）。**token 不出 Api 层**——
 * Redux 里只放用户信息，游戏层更是碰不到；netBoundary.test.ts
 * 盯着这个键名不许在 Api/ 之外出现。
 */

const STORAGE_KEY = "idle-home:auth-token";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage 被禁用：等同没登录
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // 存不上就是"这次会话内有效"，刷新后要重新登录——不值得打断流程
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 清不掉也没什么可做的
  }
}
