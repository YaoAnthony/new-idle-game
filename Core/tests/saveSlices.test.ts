import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLAYER_SLICE_KEYS,
  WIRE_KEY_TO_SLICE,
  WORLD_REFRESH_KEYS,
  WORLD_SLICE_KEYS,
  WORLD_SLICE_POLICY,
  wireKeyOf,
} from "../src/types/saveSlices.js";
import {
  readPlayerSlice,
  readWorldSlice,
  writePlayerSlice,
  writeWorldSlice,
} from "../src/logic/saveSlices.js";
import type { PlayerSave } from "../src/types/player.js";
import type { WorldSave } from "../src/types/world.js";

/**
 * 持久状态注册表（`types/saveSlices.ts`）的运行时守卫。
 *
 * 编译期那几条断言管的是"漏登记"；这里管的是编译期**拦不住**的那几手：
 * - 表写成类型注解而不是 `as const satisfies` → `sync` 拓宽成 string，派生的
 *   刷新键静默清空，编译照样绿。所以第一条用例把线上键名**逐字**钉死；
 * - `sync: "none"` 不带 reason → "忘了登记"和"故意不同步"从此分不清；
 * - 嵌套键（progression.xxx / character.xxx）的读写要能往返。
 */

/** 协议 v13 的 15 个线上键。改这份清单 = 改协议，先抬 NET_PROTOCOL_VERSION */
const PROTOCOL_V13_REFRESH_KEYS = [
  "placedFurniture",
  "droppedItems",
  "inventories",
  "weather",
  "clock",
  "gramophones",
  "lamps",
  "buildings",
  "unlockedFeatureIds",
  "pets",
  "favors",
  "porch",
  "interiors",
  "mailbox",
  "flags",
];

test("刷新切片的线上键和协议 v13 逐字相等", () => {
  assert.deepEqual([...WORLD_REFRESH_KEYS].sort(), [...PROTOCOL_V13_REFRESH_KEYS].sort());
});

test("每个 sync:none 都写了理由", () => {
  for (const key of WORLD_SLICE_KEYS) {
    const policy = WORLD_SLICE_POLICY[key];
    if (policy.sync !== "none") continue;
    assert.ok(
      policy.reason && policy.reason.trim().length > 0,
      `${key} 登记为不同步却没写理由——"忘了"和"故意"要分得清`,
    );
  }
});

test("线上键 ↔ 存档键的映射双向一致", () => {
  for (const wire of WORLD_REFRESH_KEYS) {
    const slice = WIRE_KEY_TO_SLICE[wire];
    assert.ok(slice, `线上键 ${wire} 找不到存档键`);
    assert.equal(wireKeyOf(slice), wire);
  }
  assert.equal(WIRE_KEY_TO_SLICE.unlockedFeatureIds, "progression.unlockedFeatureIds");
});

test("键表没有重复、没有漏（和类型层的穷举互为备份）", () => {
  assert.equal(new Set(WORLD_SLICE_KEYS).size, WORLD_SLICE_KEYS.length);
  assert.equal(new Set(PLAYER_SLICE_KEYS).size, PLAYER_SLICE_KEYS.length);
  // progression 展开了八片：漏一片这里的数就对不上
  assert.equal(WORLD_SLICE_KEYS.filter((key) => key.startsWith("progression.")).length, 8);
  assert.equal(PLAYER_SLICE_KEYS.filter((key) => key.startsWith("character.")).length, 6);
});

test("嵌套键读写往返", () => {
  const world = { progression: { unlockedFeatureIds: [], events: {} } } as unknown as WorldSave;
  writeWorldSlice(world, "progression.stats", { furniture_placed: 3 });
  writeWorldSlice(world, "baseGold", 7);
  assert.deepEqual(readWorldSlice(world, "progression.stats"), { furniture_placed: 3 });
  assert.equal(world.progression.stats?.furniture_placed, 3);
  assert.equal(readWorldSlice(world, "baseGold"), 7);

  const player = { character: {} } as unknown as PlayerSave;
  writePlayerSlice(player, "character.needs", { hunger: 50, fatigue: 60 });
  writePlayerSlice(player, "name", "旅人");
  assert.deepEqual(readPlayerSlice(player, "character.needs"), { hunger: 50, fatigue: 60 });
  assert.equal(player.character.needs.hunger, 50);
  assert.equal(readPlayerSlice(player, "name"), "旅人");
});

test("值为 undefined 也照写：可选片的键要在，形状才和手写那版一致", () => {
  const world = { progression: { unlockedFeatureIds: [], events: {} } } as unknown as WorldSave;
  writeWorldSlice(world, "dailyBoard", undefined);
  assert.ok("dailyBoard" in world);
  assert.equal(world.dailyBoard, undefined);
});
