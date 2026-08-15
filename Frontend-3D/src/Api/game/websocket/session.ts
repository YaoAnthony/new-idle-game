import {
  NET_EVENTS,
  NET_PROTOCOL_VERSION,
  type NetError,
  type ParticipantTransform,
  type ProfileDraft,
  type SessionCreateOk,
  type SessionJoinOk,
  type WorldSave,
} from "core";

import { ensureConnected } from "./connection.js";

/**
 * 三条**带应答**的会话请求。协议版本在这里填，调用方不用知道有这回事——
 * 少一个能忘的地方。
 *
 * 返回 `XxxOk | NetError` 原样透出：错误码和人话文案都在里面，
 * 怎么告诉玩家是上层的事（做客失败要进消息记录，不是弹窗）。
 */

export type CreateSessionRequest = {
  saveSchemaVersion: number;
  profile: ProfileDraft;
  world: WorldSave;
  transform?: ParticipantTransform;
};

export async function createSession(
  request: CreateSessionRequest,
): Promise<SessionCreateOk | NetError> {
  const socket = await ensureConnected();
  return (await socket.emitWithAck(NET_EVENTS.c2s.sessionCreate, {
    protocolVersion: NET_PROTOCOL_VERSION,
    ...request,
  })) as SessionCreateOk | NetError;
}

export type JoinSessionRequest = {
  saveSchemaVersion: number;
  joinCode: string;
  profile: ProfileDraft;
  transform?: ParticipantTransform;
};

export async function joinSession(
  request: JoinSessionRequest,
): Promise<SessionJoinOk | NetError> {
  const socket = await ensureConnected();
  return (await socket.emitWithAck(NET_EVENTS.c2s.sessionJoin, {
    protocolVersion: NET_PROTOCOL_VERSION,
    ...request,
  })) as SessionJoinOk | NetError;
}

/**
 * 告诉服务器"我走了"。
 *
 * 连不上就静默吞掉——**服务器都联系不上了，本地照样要把状态收干净**，
 * 这条失败不该阻止回家。超时给得比默认短：离场是即时反馈的操作。
 */
export async function leaveSession(): Promise<void> {
  try {
    const socket = await ensureConnected(1500);
    await socket.emitWithAck(NET_EVENTS.c2s.sessionLeave, {});
  } catch {
    // 见上
  }
}
