import { chatLogRetention } from "../Data/chat/index.js";
import type { ChatMessage } from "../types/chat.js";
import type { WorldDayId } from "../types/time.js";

/**
 * 消息流的裁剪规则。
 *
 * 放 Core 和放置校验、烹饪规则同理：联机时服务端要跑同一份，
 * 不能让客户端各自决定"留几天"（AGENTS.md：Backend 不得复制一份独立的内容规则）。
 */

/** worldDayId 形如 "2026-07-30"。转成 UTC 天数，好做差 */
function dayNumber(worldDayId: WorldDayId): number | null {
  const [year, month, day] = worldDayId.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * 丢掉太老的消息。
 *
 * 保留 N 天指的是**今天往前数 N 天**（N=3 → 今天、昨天、前天），
 * 不是"最近 72 小时"——玩家说的"三天"是日历上的三天。
 *
 * 认不出日期的记录一律**保留**：宁可多留几条，也不能因为一条脏数据
 * 把玩家的历史吞掉。存档里的东西删了就回不来了。
 */
export function trimChatLog(
  messages: readonly ChatMessage[],
  currentWorldDayId: WorldDayId,
): ChatMessage[] {
  const today = dayNumber(currentWorldDayId);
  if (today === null) return [...messages];

  const oldest = today - (chatLogRetention.days - 1);

  const kept = messages.filter((message) => {
    const day = dayNumber(message.worldDayId);
    if (day === null) return true;
    return day >= oldest;
  });

  // 天数之外再压一道条数上限：挂机一整天刷出几万条命令反馈时，
  // 存档不该跟着涨到几兆。超了就丢最老的那些
  return kept.length > chatLogRetention.maxMessages
    ? kept.slice(kept.length - chatLogRetention.maxMessages)
    : kept;
}
