import assert from "node:assert/strict";
import { test } from "node:test";
import { codexSources } from "../src/Data/codex/index.js";
import { placeableItems, itemDefinitions } from "../src/Data/items/index.js";
import { residentDefinitions, residentIdOf } from "../src/Data/residents/index.js";
import {
  auditCodexContent,
  codexEntriesForSignal,
  codexProgress,
  listCodexEntries,
  listCodexSections,
} from "../src/logic/codex.js";
import { ItemCategory } from "../src/types/items.js";

/**
 * 图鉴是注册表的投影：条目数 = 各来源枚举之和，信号 → 条目 id 的映射按来源表的规则走，
 * 算出来的 id 不在表里就丢。
 */

test("codex_内容审计干净", () => {
  assert.deepEqual(auditCodexContent(), []);
});

test("codex_条目数等于各来源枚举之和_家具是能摆的家具_居民是全部定义", () => {
  const entries = listCodexEntries();
  const furniture = placeableItems().filter((item) => item.category === ItemCategory.Furniture);
  assert.equal(entries.filter((e) => e.section === "furniture").length, furniture.length);
  assert.equal(entries.filter((e) => e.section === "resident").length, residentDefinitions.length);
  assert.equal(entries.length, furniture.length + residentDefinitions.length);
  // 分区顺序：家具在前
  assert.deepEqual(listCodexSections().map((s) => s.section), ["furniture", "resident"]);
  assert.equal(entries[0]!.section, "furniture");
});

test("codex_条目不复制注册表字段_名字介绍图都是键", () => {
  const bed = listCodexEntries().find((e) => e.id === "furniture:furniture_bed");
  assert.ok(bed);
  assert.equal(bed.sourceId, "furniture_bed");
  assert.equal(bed.nameKey, "item.furniture_bed");
  assert.equal(bed.descKey, "item.furniture_bed.desc");
  assert.equal(bed.icon.iconKey, "items/furniture_bed");
  assert.equal(bed.groupKey, "codex.group.surface.floor");
  const shushu = listCodexEntries().find((e) => e.id === "resident:shushu");
  assert.ok(shushu);
  assert.equal(shushu.nameKey, "pet.shushu");
  assert.equal(shushu.icon.iconKey, "residents/shushu");
});

test("codex_家具进背包或摆出来都点亮_不是家具的能摆物丢掉", () => {
  assert.deepEqual(codexEntriesForSignal({ kind: "furniture_obtained", subject: "furniture_bed" }), [
    "furniture:furniture_bed",
  ]);
  assert.deepEqual(codexEntriesForSignal({ kind: "furniture_placed", subject: "furniture_bed" }), [
    "furniture:furniture_bed",
  ]);
  // 唱片能摆但不是家具
  const record = itemDefinitions.find((item) => item.id === "record_minecraft");
  assert.ok(record && record.placement && record.category !== ItemCategory.Furniture);
  assert.deepEqual(codexEntriesForSignal({ kind: "furniture_placed", subject: "record_minecraft" }), []);
  // 根本不存在的
  assert.deepEqual(codexEntriesForSignal({ kind: "furniture_obtained", subject: "nope" }), []);
  // 没 subject
  assert.deepEqual(codexEntriesForSignal({ kind: "furniture_obtained" }), []);
});

test("codex_居民出现用实例id_来访和搬入用定义id_无关信号不点", () => {
  assert.deepEqual(codexEntriesForSignal({ kind: "resident_spawned", subject: residentIdOf("shushu") }), [
    "resident:shushu",
  ]);
  assert.deepEqual(codexEntriesForSignal({ kind: "resident_spawned", subject: "shushu" }), []);
  assert.deepEqual(codexEntriesForSignal({ kind: "visitor_arrived", subject: "fox_neighbor" }), [
    "resident:fox_neighbor",
  ]);
  assert.deepEqual(codexEntriesForSignal({ kind: "resident_moved_in", subject: "slime_neighbor" }), [
    "resident:slime_neighbor",
  ]);
  assert.deepEqual(codexEntriesForSignal({ kind: "cook_completed", subject: "furniture_bed" }), []);
});

test("codex_进度按分区和总计", () => {
  const empty = codexProgress({});
  assert.equal(empty.all.seen, 0);
  assert.equal(empty.all.total, listCodexEntries().length);
  const some = codexProgress({
    "furniture:furniture_bed": { seenDayId: "d1" },
    "resident:shushu": { seenDayId: "d1" },
    "furniture:not_a_thing": { seenDayId: "d1" },
  });
  assert.equal(some.furniture.seen, 1);
  assert.equal(some.resident.seen, 1);
  assert.equal(some.all.seen, 2);
  assert.equal(some.furniture.total, codexSources[0]!.list().length);
});
