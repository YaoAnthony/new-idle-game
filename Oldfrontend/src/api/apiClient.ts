// apiClient.ts
import axios from "axios";
import { getEnv } from "../config/env";

const { backendUrl } = getEnv();

/**
 * 公开访问用 axios 实例：
 * - baseURL: backendUrl
 * - withCredentials: true（如果你需要带 cookie，例如 refresh / 匿名会话）
 * - 不加任何 Authorization 头
 */
export const publicHttp = axios.create({
    baseURL: backendUrl,
    withCredentials: true,
});

// 可按需添加通用拦截器（这里不加鉴权）
publicHttp.interceptors.response.use(
    (res) => res,
    (err) => Promise.reject(err)
);


