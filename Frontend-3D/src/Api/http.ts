import { getAuthToken } from "./auth/tokenStore";

/**
 * 到 Backend 的 REST 封装。**HTTP 和 socket 一样归 Api 层管**——
 * BACKEND_URL、Bearer 头、超时这些传输细节不出这个目录
 * （netBoundary.test.ts 看门）。
 */

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  "http://localhost:3001";

export type HttpFailureKind =
  /** 网络不可达 / 超时 / 后端挂了——调用方应该无感知退回本地 */
  | "offline"
  /** 401：token 过期或无效——调用方应该清登录态 */
  | "unauthorized"
  /** 其他非 2xx：带上解析出的错误体 */
  | "server";

export type HttpResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; kind: HttpFailureKind; status?: number; body?: unknown };

export async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
    keepalive?: boolean;
  } = {},
): Promise<HttpResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      keepalive: options.keepalive ?? false,
    });

    // 错误体也是契约的一部分（AccountError），解析失败不算致命
    const body = (await response.json().catch(() => undefined)) as T | undefined;

    if (response.ok) {
      return { ok: true, status: response.status, body: body as T };
    }
    if (response.status === 401) {
      return { ok: false, kind: "unauthorized", status: 401, body };
    }
    return { ok: false, kind: "server", status: response.status, body };
  } catch {
    // fetch 抛异常 = 网络层失败（连不上、DNS、超时中断），一律 offline
    return { ok: false, kind: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

/** RTK Query 的 baseUrl 也从这里拿，别在别处再读一遍环境变量 */
export function backendUrl(): string {
  return BACKEND_URL;
}
