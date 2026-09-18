/**
 * 后端地址的唯一解析点。**HTTP 和 socket 都从这里拿**，别处不许读 VITE_BACKEND_*（netBoundary.test 看门）。
 *
 * 构建时在 `.env.local` 里挑本地还是云端（2026-09-16）：
 *
 *   VITE_BACKEND_TARGET=local | cloud
 *   VITE_BACKEND_URL_LOCAL=http://localhost:3001      # 不填就是这个
 *   VITE_BACKEND_URL_CLOUD=https://api.xxx.com        # 选 cloud 时必填
 *
 * 为什么是一个开关 + 两个地址，而不是一个地址来回改：两个地址都留在文件里，切换只动一个词，
 * 不会出现"改完忘了改回来、本地开发一直打线上"。Vite 把这些值**编译进产物**，
 * 换目标要重新 build（Electron 包同理）。
 *
 * 老写法 `VITE_BACKEND_URL` 仍然认，且优先级最高——已有的 .env 不用动。
 */

export type BackendEnv = Record<string, string | boolean | undefined>;

export function resolveBackendUrl(env: BackendEnv): string {
  const legacy = str(env.VITE_BACKEND_URL);
  if (legacy) return trimSlash(legacy);

  const target = str(env.VITE_BACKEND_TARGET) ?? "local";
  if (target === "local") {
    return trimSlash(str(env.VITE_BACKEND_URL_LOCAL) ?? "http://localhost:3001");
  }
  if (target === "cloud") {
    const cloud = str(env.VITE_BACKEND_URL_CLOUD);
    if (!cloud) {
      throw new Error("VITE_BACKEND_TARGET=cloud 但没填 VITE_BACKEND_URL_CLOUD——见 deploy/frontend.env.example");
    }
    if (!cloud.startsWith("https://")) {
      // https 页面调 http 接口会被浏览器当混合内容拦掉，Google 登录也只认 https 来源
      console.warn(`[api] VITE_BACKEND_URL_CLOUD 不是 https（${cloud}），线上会被浏览器拦`);
    }
    return trimSlash(cloud);
  }
  throw new Error(`VITE_BACKEND_TARGET 只能是 local 或 cloud，拿到的是 "${target}"`);
}

function str(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export const BACKEND_URL = resolveBackendUrl(import.meta.env as BackendEnv);
