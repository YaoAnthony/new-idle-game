import { ChatMessageKind, trimChatLog, type ChatMessage } from "core";
import { emit } from "../EventBus";
import { getClock } from "./clock";

/**
 * 消息流的运行时状态。
 *
 * 一条流装下所有东西（玩家打的字 / 命令反馈 / 剧情提示 / NPC 说话），
 * 靠 `kind` 区分渲染。分成几条流是很自然的第一直觉，但那样每加一种消息
 * 就要挑一条流放，而玩家眼里它们本来就是按时间先后发生的同一串事。
 *
 * **裁剪规则不在这里**——"留几天"是 Core 的 trimChatLog，联机时服务端
 * 跑同一份。这一层只负责"什么时候裁"。
 */

let messages: ChatMessage[] = [];
let counter = 0;

function nextId(): string {
  counter += 1;
  return `msg#${counter}`;
}

export function listChatMessages(): readonly ChatMessage[] {
  return messages;
}

/**
 * 记一条。
 *
 * **每写一条就裁一次**，而不是等到存盘再裁：裁剪只在存盘时做的话，
 * 一整天不存盘就能让内存里堆出几万条，而聊天面板每次打开都要渲染它们。
 * 裁一次是一趟 filter，几百条的量级完全无所谓。
 */
export function pushChatMessage(input: {
  kind: ChatMessageKind;
  text: string;
  speaker?: string;
  sourceKey?: string;
}): ChatMessage | null {
  const text = input.text.trim();
  if (text.length === 0) return null;

  const message: ChatMessage = {
    id: nextId(),
    worldDayId: getClock().worldDayId,
    atUtc: new Date().toISOString(),
    kind: input.kind,
    text,
    speaker: input.speaker,
    sourceKey: input.sourceKey,
  };

  messages = trimChatLog([...messages, message], message.worldDayId);
  emit("chat_message", { id: message.id, kind: message.kind });
  return message;
}

/** 命令反馈、系统提示 */
export function pushSystemMessage(text: string): void {
  pushChatMessage({ kind: ChatMessageKind.System, text });
}

// ---- 存档 ----

export function snapshotChatLog(): ChatMessage[] {
  // 存盘时再裁一次：跨天之后玩家可能一条都没说，写入路径就一直没被走到
  return trimChatLog(messages, getClock().worldDayId);
}

export function restoreChatLog(saved: ChatMessage[] | undefined): void {
  // 读档时也裁：存档可能是三天前存的，那时候的"最近三天"现在已经过期了
  messages = trimChatLog(saved ?? [], getClock().worldDayId);

  // id 形如 "msg#42"，续号从存档里的最大值往后接，避免撞号
  counter = messages.reduce((max, message) => {
    const suffix = Number(message.id.split("#")[1]);
    return Number.isInteger(suffix) && suffix > max ? suffix : max;
  }, 0);

  emit("chat_message", { id: "", kind: ChatMessageKind.System });
}
