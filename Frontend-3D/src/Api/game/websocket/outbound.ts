import {
  NET_EVENTS,
  type ParticipantAppearance,
  type ParticipantGesture,
  type ParticipantTransform,
  type WorldOp,
  type WorldRefreshSlices,
  type ResidentKeyframesEvent,
} from "core";

import { ensureConnected, isConnected, rawSocket } from "./connection.js";

/**
 * 出站的六种消息。都是**发出去就不管**——需要应答的三条会话请求在 session.ts。
 *
 * 没连上时静默丢弃而不是排队：这些全是"此刻的状态"（位置、外观、一次动作），
 * 补发一条几秒前的位置没有意义，而排队会在重连那一刻喷一串陈旧数据出去。
 * 真断了的话 `onDisconnect` 会把整场会话收掉，也轮不到这里补救。
 */
function send(event: string, payload: unknown): void {
  if (!isConnected()) return;
  rawSocket().emit(event, payload);
}

/**
 * 位置。**每帧都可能变**，所以走 volatile 语义那一侧——服务端那边
 * 用的就是 volatile 转发（丢一帧无所谓，下一帧就来）。
 * 节流和"变了才发"的判断在 `Game/Multiplayer/sync.ts`，不在这一层。
 */
export function sendTransform(transform: ParticipantTransform): void {
  send(NET_EVENTS.c2s.transform, { ...transform });
}

export function sendAppearance(appearance: ParticipantAppearance): void {
  send(NET_EVENTS.c2s.appearance, appearance);
}

export function sendGesture(gesture: ParticipantGesture): void {
  send(NET_EVENTS.c2s.gesture, gesture);
}

export function sendChat(text: string): void {
  send(NET_EVENTS.c2s.chat, { text });
}

/**
 * 一次世界突变。
 *
 * 这条**允许在还没连上时触发**（State 层的写入口一律喊一声，不问在不在联机），
 * 所以走 ensureConnected 而不是直接判断——但连不上就丢掉，不抛：
 * 单机时这条订阅本来就该空转。
 */
export function sendWorldOp(op: WorldOp): void {
  void ensureConnected(1500)
    .then((socket) => socket.emit(NET_EVENTS.c2s.worldOp, op))
    .catch(() => {});
}

/** 房主的整片刷新。只有房主发得出去，服务端那边也会再核一次身份 */
export function sendWorldRefresh(slices: WorldRefreshSlices): void {
  send(NET_EVENTS.c2s.worldRefresh, slices);
}

/** 房主的活物关键帧（协议 v8）。只有房主发得出去，服务端会再核一次身份 */
export function sendResidentKeyframes(event: ResidentKeyframesEvent): void {
  send(NET_EVENTS.c2s.residents, event);
}
