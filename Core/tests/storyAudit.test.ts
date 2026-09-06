import assert from "node:assert/strict";
import { test } from "node:test";

import {
  auditEventDefinitions,
  auditStoryContent,
  auditTrigger,
} from "../src/logic/storyAudit.js";
import type { StoryTrigger } from "../src/types/story.js";

/**
 * 开机点名的两块新地皮（期 0 · 小动物经济圈）：
 *
 * 1. **抽签池引用**：poolId 写错 = 那位邻居静默永不出现，和 subject
 *    写错同一类病，必须开机就报。
 * 2. **事件自己的文案键**：上一版六个事件漏了 16 个键而全部测试是绿的
 *    ——audit 只查"规则引用的事件存在吗"，从来不看事件自己。
 *
 * 正式注册表是模块级常量，测试没法往里塞坏数据，所以这两块的内部
 * 函数（auditTrigger / auditEventDefinitions）导出来直接喂 fixture。
 */

const at = (patch: Partial<StoryTrigger>): StoryTrigger =>
  ({ signal: "day_started", ...patch }) as StoryTrigger;

test("poolId 和 chance 不能同时写——一个是迟早会来，一个是撞见的", () => {
  const problems = auditTrigger("测试规则", at({ poolId: "resident_arrival", chance: 0.5 }));
  assert.ok(problems.some((p) => p.includes("不能同时写")), problems.join("\n"));
});

test("poolId 必须在 storyPools 里登记过", () => {
  const bad = auditTrigger("测试规则", at({ poolId: "no_such_pool" }));
  assert.ok(bad.some((p) => p.includes("没有在 storyPools 里登记")), bad.join("\n"));

  // visitor_arrival 是登记过的（09 起访客池替下了 resident_arrival），单独写不报
  const good = auditTrigger("测试规则", at({ poolId: "visitor_arrival" }));
  assert.deepEqual(good, []);
});

test("事件自己的文案键也要查——上次漏了 16 个而测试全绿", () => {
  const known = new Set(["event.theft", "event.theft.stage.armed"]);
  const checkText = (where: string, key: string): string | null =>
    known.has(key) ? null : `${where}：文案键 "${key}" 没有条目`;

  const problems: string[] = [];
  const collect = (where: string, key: string): void => {
    const problem = checkText(where, key);
    if (problem) problems.push(problem);
  };

  problems.push(
    ...auditEventDefinitions(
      [
        {
          id: "theft",
          localizationKey: "event.theft",
          stages: [
            { stageId: "armed", localizationKey: "event.theft.stage.armed" },
            // 这个键没有条目 → 该报
            { stageId: "done", localizationKey: "event.theft.stage.done" },
          ],
        },
        // 一个阶段都没有 → set_event_stage 无处可写，该报
        { id: "empty_event", localizationKey: "event.theft", stages: [] },
      ],
      collect,
    ),
  );

  assert.ok(
    problems.some((p) => p.includes("event.theft.stage.done")),
    problems.join("\n"),
  );
  assert.ok(
    problems.some((p) => p.includes("一个阶段都没有")),
    problems.join("\n"),
  );
});

test("阶段 id 重复要报——重复的 stageId 会让 set_event_stage 二义", () => {
  const problems = auditEventDefinitions(
    [
      {
        id: "dup",
        localizationKey: "k",
        stages: [
          { stageId: "s1", localizationKey: "k1" },
          { stageId: "s1", localizationKey: "k2" },
        ],
      },
    ],
    () => {},
  );
  assert.ok(problems.some((p) => p.includes("stageId 重复")), problems.join("\n"));
});

test("正式注册表本身过审（storyRules/事件都是空的也不该报）", () => {
  // 不传 hasLocalizationKey = 跳过文案检查，只查引用关系
  assert.deepEqual(auditStoryContent(), []);
});
