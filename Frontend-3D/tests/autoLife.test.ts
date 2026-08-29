import { expect, test } from "vitest";
import { autoLifeTuning, decideBreak } from "core";

/**
 * 自动生活的决策（Core 纯函数）。
 *
 * 这些用例钉的是**行为契约**，不是具体数字——数字全从 `autoLifeTuning`
 * 现读，调平衡不该弄红测试（内容零硬编码在测试侧的对应物）。
 */

const T = autoLifeTuning;

/** 一份"坐了很久、不饿、骰子最差"的基线快照，各用例在它上面改一个变量 */
const settled = {
  hunger: 100,
  edibleCount: 99,
  secondsSinceBreak: T.minWorkSeconds + 1,
};

test("autoLife_饿了且存粮够_起身吃饭", () => {
  const plan = decideBreak(
    { ...settled, hunger: T.hungerThreshold - 1 },
    1, // 骰子最差也要去：吃饭是需求驱动，不掷骰子
  );
  expect(plan?.kind).toBe("eat");
  expect(plan!.dwellSeconds).toBeGreaterThan(0);
});

test("autoLife_饿了但存粮见底_饿着也不吃", () => {
  // 保险丝：自动模式动真库存，最后几份留给玩家自己决定
  const plan = decideBreak(
    {
      ...settled,
      hunger: T.hungerThreshold - 1,
      edibleCount: T.minEdibleCount - 1,
    },
    1,
  );
  expect(plan).toBeNull();
});

test("autoLife_刚回工位_粘性期内谁都拽不动", () => {
  // 行为长而稳是"声音是本体"的直接推论：音景频繁切换是噪音
  const plan = decideBreak(
    {
      hunger: T.hungerThreshold - 1, // 饿
      edibleCount: 99, //              有粮
      secondsSinceBreak: T.minWorkSeconds - 1, // 但刚坐下
    },
    0, // 骰子也最好
  );
  expect(plan).toBeNull();
});

test("autoLife_不饿时小概率溜达_骰子说了算", () => {
  expect(decideBreak(settled, T.strollChance - 0.001)?.kind).toBe("stroll");
  expect(decideBreak(settled, T.strollChance + 0.001)).toBeNull();
});

test("autoLife_吃饭优先于溜达", () => {
  // 同一次评估里两个都触发时，需求赢过演出
  const plan = decideBreak({ ...settled, hunger: T.hungerThreshold - 1 }, 0);
  expect(plan?.kind).toBe("eat");
});
