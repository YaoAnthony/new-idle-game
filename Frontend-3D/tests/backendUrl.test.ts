import { expect, test } from "vitest";
import { resolveBackendUrl } from "../src/Api/backendUrl";

/** 构建时用 .env 挑本地 / 云端后端（2026-09-16）。老的 VITE_BACKEND_URL 仍然认且优先 */

test("backendUrl_不配就是本地默认", () => {
  expect(resolveBackendUrl({})).toBe("http://localhost:3001");
  expect(resolveBackendUrl({ VITE_BACKEND_TARGET: "local" })).toBe("http://localhost:3001");
});

test("backendUrl_local_用 URL_LOCAL_并去掉尾斜杠", () => {
  expect(resolveBackendUrl({ VITE_BACKEND_TARGET: "local", VITE_BACKEND_URL_LOCAL: "http://192.168.1.8:3001/" })).toBe(
    "http://192.168.1.8:3001",
  );
});

test("backendUrl_cloud_用 URL_CLOUD_没填就报错", () => {
  expect(resolveBackendUrl({ VITE_BACKEND_TARGET: "cloud", VITE_BACKEND_URL_CLOUD: "https://api.example.com/" })).toBe(
    "https://api.example.com",
  );
  expect(() => resolveBackendUrl({ VITE_BACKEND_TARGET: "cloud" })).toThrow(/VITE_BACKEND_URL_CLOUD/);
  expect(() => resolveBackendUrl({ VITE_BACKEND_TARGET: "cloud", VITE_BACKEND_URL_CLOUD: "" })).toThrow();
});

test("backendUrl_老的 VITE_BACKEND_URL 优先级最高", () => {
  expect(
    resolveBackendUrl({ VITE_BACKEND_URL: "http://old.local:3001", VITE_BACKEND_TARGET: "cloud", VITE_BACKEND_URL_CLOUD: "https://x" }),
  ).toBe("http://old.local:3001");
});

test("backendUrl_target 写错直接报错", () => {
  expect(() => resolveBackendUrl({ VITE_BACKEND_TARGET: "prod" })).toThrow(/local 或 cloud/);
});
