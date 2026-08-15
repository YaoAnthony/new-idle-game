import {
  ACCOUNT_LIMITS,
  type GameSave,
  type SaveGetOk,
  type SaveHead,
  type SaveHeadOk,
  type SavePutConflict,
  type SavePutOk,
} from "core";

import { request, type HttpResult } from "../http";

/**
 * 本项目 tsconfig 没开 strict，`if (result.ok)` 之后判别式不会窄化，
 * 统一用 `in` 取失败分支的字段（同 SaveRepository.ts 的处理）。
 */
function failureOf(result: HttpResult<unknown>): {
  kind: "offline" | "unauthorized" | "server";
  status?: number;
  body?: unknown;
} {
  return "kind" in result
    ? result
    : { kind: "server" };
}

/**
 * /api/saves 的类型化客户端（协议见 contracts/account_protocol.md）。
 * 同步引擎（Features/CloudSave）只认识这四个函数，
 * revision/writeId 这些并发语义的**决策**在引擎里，这里只是搬运。
 */

export type HeadOutcome =
  | { kind: "ok"; head: SaveHead | null }
  | { kind: "offline" }
  | { kind: "unauthorized" };

export async function fetchHead(timeoutMs = 5_000): Promise<HeadOutcome> {
  const result = await request<SaveHeadOk>("/api/saves/me/head", { timeoutMs });
  if (result.ok && "body" in result) return { kind: "ok", head: result.body.head };
  if (failureOf(result).kind === "unauthorized") return { kind: "unauthorized" };
  return { kind: "offline" };
}

export type FetchFullOutcome =
  | { kind: "ok"; revision: number; save: GameSave }
  | { kind: "no_save" }
  | { kind: "offline" }
  | { kind: "unauthorized" };

export async function fetchFull(): Promise<FetchFullOutcome> {
  const result = await request<SaveGetOk>("/api/saves/me", { timeoutMs: 30_000 });
  if (result.ok && "body" in result) {
    return { kind: "ok", revision: result.body.revision, save: result.body.save };
  }
  const failure = failureOf(result);
  if (failure.kind === "unauthorized") return { kind: "unauthorized" };
  if (failure.kind === "server" && failure.status === 404) return { kind: "no_save" };
  return { kind: "offline" };
}

export type PushInput = {
  baseRevision: number;
  writeId: string;
  deviceId: string;
  saveSchemaVersion: number;
  save: GameSave;
};

export type PushOutcome =
  | { kind: "ok"; revision: number; updatedAtUtc: string }
  | { kind: "conflict"; conflict: SavePutConflict }
  | { kind: "rejected" }   // 413/422/400：这份档推不上去，重试也没用
  | { kind: "offline" }
  | { kind: "unauthorized" };

export async function push(input: PushInput, timeoutMs = 30_000): Promise<PushOutcome> {
  const result = await request<SavePutOk>("/api/saves/me", {
    method: "PUT",
    body: input,
    timeoutMs,
  });

  if (result.ok && "body" in result) {
    return { kind: "ok", revision: result.body.revision, updatedAtUtc: result.body.updatedAtUtc };
  }
  const failure = failureOf(result);
  if (failure.kind === "unauthorized") return { kind: "unauthorized" };
  if (failure.kind === "server") {
    if (failure.status === 409) {
      return { kind: "conflict", conflict: failure.body as SavePutConflict };
    }
    // 429 属于"过会儿再来"，按 offline 的退避路径走
    if (failure.status === 429) return { kind: "offline" };
    return { kind: "rejected" };
  }
  return { kind: "offline" };
}

/**
 * pagehide 专用：keepalive fetch 在页面卸载后仍会被浏览器送完，
 * 但请求体有 64KB 硬限——超限**不发**（发了也必失败），
 * 返回 false 让调用方知道只能靠下次启动补推。响应不等（页面都要没了）。
 */
export function pushKeepalive(input: PushInput): boolean {
  const bytes = new Blob([JSON.stringify(input)]).size;
  if (bytes > ACCOUNT_LIMITS.keepaliveSafeBytes) return false;

  void request("/api/saves/me", {
    method: "PUT",
    body: input,
    keepalive: true,
    timeoutMs: 8_000,
  });
  return true;
}
