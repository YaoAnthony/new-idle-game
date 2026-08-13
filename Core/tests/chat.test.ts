import assert from "node:assert/strict";
import { test } from "node:test";

import { ChatMessageKind, type ChatMessage } from "../src/types/chat.js";
import { trimChatLog } from "../src/logic/chat.js";
import { chatLogRetention } from "../src/Data/chat/index.js";

/**
 * 消息流裁剪。这个函数删的是**存档里的东西**，删了就回不来了——
 * 所以每条边界都要盯：保留 N 天是日历上的 N 天（含今天），
 * 认不出日期的记录一律保留，天数之外还有一道条数闸。
 */

function message(id: string, worldDayId: string): ChatMessage {
  return {
    id,
    worldDayId,
    kind: ChatMessageKind.Player,
    atUtc: `${worldDayId}T12:00:00.000Z`,
    text: id,
  };
}

test("保留 N 天指的是日历上的 N 天，含今天", () => {
  const today = "2026-08-12";
  const kept = trimChatLog(
    [
      message("前天", "2026-08-10"),
      message("昨天", "2026-08-11"),
      message("今天", today),
    ],
    today,
  );

  // 默认 3 天 = 今天 + 昨天 + 前天，一条都不该丢
  assert.equal(chatLogRetention.days, 3);
  assert.deepEqual(kept.map((m) => m.id), ["前天", "昨天", "今天"]);
});

test("再老一天就丢掉", () => {
  const kept = trimChatLog(
    [message("大前天", "2026-08-09"), message("今天", "2026-08-12")],
    "2026-08-12",
  );

  assert.deepEqual(kept.map((m) => m.id), ["今天"]);
});

test("跨月末、跨年的天数差要算对", () => {
  const kept = trimChatLog(
    [
      message("旧年", "2025-12-29"),
      message("边界", "2025-12-30"),
      message("除夕", "2025-12-31"),
      message("元旦", "2026-01-01"),
    ],
    "2026-01-01",
  );

  assert.deepEqual(kept.map((m) => m.id), ["边界", "除夕", "元旦"]);
});

test("认不出日期的记录一律保留——脏数据不该吞掉玩家的历史", () => {
  const kept = trimChatLog(
    [message("坏记录", "根本不是日期"), message("老记录", "2020-01-01")],
    "2026-08-12",
  );

  assert.deepEqual(kept.map((m) => m.id), ["坏记录"]);
});

test("当前日期本身坏掉时原样返回，不做任何裁剪", () => {
  const all = [message("a", "2020-01-01"), message("b", "2026-08-12")];
  const kept = trimChatLog(all, "坏掉的今天");

  assert.deepEqual(kept.map((m) => m.id), ["a", "b"]);
  assert.notEqual(kept, all, "要返回新数组，别把调用方的数组交出去");
});

test("条数上限是第二道闸：同一天刷爆也要封顶，且丢的是最老的", () => {
  const today = "2026-08-12";
  const flood = Array.from({ length: chatLogRetention.maxMessages + 50 }, (_, index) =>
    message(String(index), today),
  );

  const kept = trimChatLog(flood, today);

  assert.equal(kept.length, chatLogRetention.maxMessages);
  assert.equal(kept[kept.length - 1].id, String(flood.length - 1), "最新的必须还在");
  assert.equal(kept[0].id, "50", "丢的应该是最老的那 50 条");
});

test("空列表不炸", () => {
  assert.deepEqual(trimChatLog([], "2026-08-12"), []);
});
