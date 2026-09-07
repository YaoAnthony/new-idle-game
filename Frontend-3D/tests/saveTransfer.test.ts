import { beforeEach, expect, test } from "vitest";
import type { GameSave } from "core";

import { createIndexDbRepository } from "../src/Data/IndexDB";
import { createLocalSaveRepository } from "../src/Data/Save/SaveRepository";
import { keysForSlot, SAVE_SLOT_IDS } from "../src/Data/Save/slots";
import { exportSlot, importIntoSlot } from "../src/Data/Save/transfer";
import { SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";

/**
 * 存档的进出口。这份用例几乎全是**该拒绝什么**——导入是唯一一条让外面的
 * 字节进到玩家存档里的路，判据松一格，代价就是一个读不出来的家。
 */

const store = createIndexDbRepository<unknown>("gameSaves");

function makeSave(name: string, version = SAVE_SCHEMA_VERSION): GameSave {
  return {
    meta: {
      saveSchemaVersion: version,
      createdAtUtc: "2026-08-01T00:00:00.000Z",
      updatedAtUtc: "2026-08-12T00:00:00.000Z",
    },
    player: {
      name,
      avatar: { slots: {} } as never,
      actionChains: [],
      character: { inventory: [], needs: { hunger: 50, fatigue: 50 } },
      discoveredRecipeIds: [],
      actionEntries: [],
    },
    ownWorld: {
      worldId: "world",
      seed: 1,
      house: { houseId: "base", regionId: "forest", styleId: "default" },
      clock: { lastObservedWorldDayId: "2026-08-12" } as never,
      weather: {} as never,
      maps: {},
      pets: {},
      placedFurniture: [],
      inventories: {},
      progression: { unlockedFeatureIds: [], events: {} },
    },
  } as GameSave;
}

beforeEach(async () => {
  for (const slot of SAVE_SLOT_IDS) {
    const keys = keysForSlot(slot);
    await store.remove(keys.main);
    await store.remove(keys.backup);
    await store.remove(keys.conflict);
  }
});

test("导出再导入另一个槽：内容一致，文件名认得出来", async () => {
  await createLocalSaveRepository("a").save(makeSave("小家"));

  const exported = await exportSlot("a");
  expect(exported.ok).toBe(true);
  if (!exported.ok) return;

  // 第 12 天（08-01 建档 → 08-12），槽名和日期都在名字里
  expect(exported.filename).toContain("A");
  expect(exported.filename).toContain("第12天");
  expect(exported.filename.endsWith(".json")).toBe(true);

  const imported = await importIntoSlot("b", exported.text);
  expect(imported.ok).toBe(true);

  const loaded = await createLocalSaveRepository("b").load();
  expect(loaded.kind === "loaded" ? loaded.save.player.name : null).toBe("小家");
});

test("空槽才收：占用的槽要先删", async () => {
  await createLocalSaveRepository("a").save(makeSave("原来的"));
  const exported = await exportSlot("a");
  if (!exported.ok) throw new Error("导出失败");

  const blocked = await importIntoSlot("a", exported.text);
  expect(blocked.ok).toBe(false);
  expect(blocked.ok === false ? blocked.reason : null).toBe("occupied");

  // 原来的档一个字节没动
  const loaded = await createLocalSaveRepository("a").load();
  expect(loaded.kind === "loaded" ? loaded.save.player.name : null).toBe("原来的");
});

test("空槽导不出东西", async () => {
  const exported = await exportSlot("c");
  expect(exported.ok).toBe(false);
});

test("坏 JSON 被挡住", async () => {
  const outcome = await importIntoSlot("a", "{ 这不是 json");
  expect(outcome.ok).toBe(false);
  expect(await createLocalSaveRepository("a").hasSave()).toBe(false);
});

test("别的游戏的 JSON 被挡住", async () => {
  const outcome = await importIntoSlot(
    "a",
    JSON.stringify({ game: "another-game", level: 3, hp: 100 }),
  );
  expect(outcome.ok).toBe(false);
});

test("包装对但里面不是存档，也挡住", async () => {
  const outcome = await importIntoSlot(
    "a",
    JSON.stringify({
      game: "my-isekai-home",
      kind: "save",
      formatVersion: 1,
      exportedAtUtc: "2026-09-07T00:00:00.000Z",
      slot: "a",
      save: { meta: { saveSchemaVersion: 48 } },
    }),
  );
  expect(outcome.ok).toBe(false);
});

test("裸的 GameSave 也收——没有包装不代表不是自家的档", async () => {
  const outcome = await importIntoSlot("a", JSON.stringify(makeSave("裸档")));
  expect(outcome.ok).toBe(true);
  expect(await createLocalSaveRepository("a").hasSave()).toBe(true);
});

test("比本机新的存档拒收，并说清楚该怎么办", async () => {
  const outcome = await importIntoSlot(
    "b",
    JSON.stringify(makeSave("未来的档", SAVE_SCHEMA_VERSION + 1)),
  );
  expect(outcome.ok).toBe(false);
  expect(outcome.ok === false ? outcome.reason : null).toBe("too_new");
  expect(await createLocalSaveRepository("b").hasSave()).toBe(false);
});

test("老版本的存档收，并且当场迁到当前版本", async () => {
  const outcome = await importIntoSlot(
    "b",
    JSON.stringify(makeSave("老档", SAVE_SCHEMA_VERSION - 1)),
  );

  expect(outcome.ok).toBe(true);
  if (!outcome.ok) return;
  expect(outcome.save.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
});

test("超大文件在解析之前就被挡掉", async () => {
  // 9 MB 的合法 JSON：判据必须是体积，不是"解析失败"
  const huge = JSON.stringify({ padding: "x".repeat(9 * 1024 * 1024) });
  const outcome = await importIntoSlot("a", huge);

  expect(outcome.ok).toBe(false);
  expect(outcome.ok === false ? outcome.reason : null).toBe("too_big");
});

test("空文件被挡住", async () => {
  const outcome = await importIntoSlot("a", "");
  expect(outcome.ok).toBe(false);
});
