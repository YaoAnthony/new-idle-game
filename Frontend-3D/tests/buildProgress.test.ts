import { expect, test } from "vitest";

import { describeRemaining } from "../src/Components/BuildProgress/BuildProgress";

/**
 * 工地胶囊上的倒计时（2026-09-19 用户："应该精确到秒"）。
 *
 * 两条规矩：
 * - 一小时以内报到秒——真正盯着看的是最后这几分钟，原来只能显示"1分"然后突然完工；
 *   一小时以上仍按天 / 时 / 分说，不然一栋要建两天的楼数字一直在跳。
 * - **不写"还剩"**：一个每秒变小的数字本身就是倒计时，用户 2026-09-19 定的。
 */

test("倒计时_只有数字_不写还剩", () => {
  // 一个每秒变小的数字本身就是倒计时，不需要一个词来说明它是倒计时
  expect(describeRemaining(45_000)).toBe("45秒");
  expect(describeRemaining(1_000)).toBe("1秒");
});

test("倒计时_一小时以内报分和秒", () => {
  expect(describeRemaining(90_500)).toBe("1分 30秒");
  expect(describeRemaining(59 * 60_000 + 59_000)).toBe("59分 59秒");
});

test("倒计时_一小时以上不报秒_避免数字一直跳", () => {
  expect(describeRemaining(60 * 60_000)).toBe("1小时 0分");
  expect(describeRemaining(((2 * 24 + 3) * 60 + 15) * 60_000 + 7_000)).toBe("2天 3小时 15分");
});

test("倒计时_到点了说马上好", () => {
  expect(describeRemaining(0)).toBe("马上好");
  expect(describeRemaining(-5_000)).toBe("马上好");
  // 999 毫秒也还没到一秒，说"马上好"而不是"还剩 0秒"
  expect(describeRemaining(999)).toBe("马上好");
});
