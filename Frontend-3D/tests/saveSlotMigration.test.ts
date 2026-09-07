import { beforeEach, expect, test } from "vitest";
import type { GameSave } from "core";

import { createIndexDbRepository } from "../src/Data/IndexDB";
import {
  resetSlotMigrationForTests,
  startSlotMigration,
  whenSlotsReady,
} from "../src/Data/Save/slotMigration";
import { getActiveSlot, keysForSlot, SAVE_SLOT_IDS } from "../src/Data/Save/slots";
import { SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";

/**
 * 单档 → 多槽的搬家。
 *
 * 这是整个多槽改动里**唯一会动玩家已有存档**的一步，所以每条路都要有
 * 用例：搬家搬对了、有账号的不动、跑过的不重跑、目标槽有东西时绝不覆盖。
 * 搬错的表现是玩家打开游戏发现家没了——没有比这更糟的 bug。
 */

const store = createIndexDbRepository<unknown>("gameSaves");

function makeSave(name: string): GameSave {
  return {
    meta: {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      createdAtUtc: "2026-08-01T00:00:00.000Z",
      updatedAtUtc: "2026-08-12T00:00:00.000Z",
    },
    player: { name } as never,
    ownWorld: { worldId: "world" } as never,
  } as GameSave;
}

async function nameAt(key: string): Promise<string | null> {
  const record = await store.get(key);
  if (!record.ok || !("data" in record)) return null;
  return (record.data.value as GameSave).player.name;
}

beforeEach(async () => {
  for (const slot of SAVE_SLOT_IDS) {
    const keys = keysForSlot(slot);
    await store.remove(keys.main);
    await store.remove(keys.backup);
    await store.remove(keys.conflict);
  }
  localStorage.clear();
  resetSlotMigrationForTests();
});

test("游客的老档搬进 A 槽，主档备份后悔药一起走", async () => {
  const legacy = keysForSlot("cloud");
  await store.upsert(legacy.main, makeSave("主档"));
  await store.upsert(legacy.backup, makeSave("备份"));
  await store.upsert(legacy.conflict, makeSave("后悔药"));

  const outcome = await startSlotMigration(false);

  expect(outcome.kind).toBe("moved_to_a");
  const target = keysForSlot("a");
  expect(await nameAt(target.main)).toBe("主档");
  expect(await nameAt(target.backup)).toBe("备份");
  expect(await nameAt(target.conflict)).toBe("后悔药");
  // 老键腾空，否则下次登录时云对账会看见一份幽灵档
  expect(await nameAt(legacy.main)).toBeNull();
  expect(await nameAt(legacy.backup)).toBeNull();
  expect(getActiveSlot()).toBe("a");
});

test("有账号时老档原地不动——它是云端那份的镜像", async () => {
  const legacy = keysForSlot("cloud");
  await store.upsert(legacy.main, makeSave("云镜像"));

  const outcome = await startSlotMigration(true);

  expect(outcome.kind).toBe("kept_in_cloud");
  expect(await nameAt(legacy.main)).toBe("云镜像");
  expect(await nameAt(keysForSlot("a").main)).toBeNull();
  expect(getActiveSlot()).toBe("cloud");
});

test("全新玩家没有可搬的，活动槽落在 A", async () => {
  const outcome = await startSlotMigration(false);

  expect(outcome.kind).toBe("nothing_to_move");
  expect(getActiveSlot()).toBe("a");
});

test("跑过一次就不再跑——第二次不会把新写的档又搬走", async () => {
  await startSlotMigration(false);
  resetSlotMigrationForTests();

  // 搬完之后玩家在云槽（登录了）玩出一份新档
  const legacy = keysForSlot("cloud");
  await store.upsert(legacy.main, makeSave("后来的云档"));

  const outcome = await startSlotMigration(false);

  expect(outcome.kind).toBe("already_done");
  expect(await nameAt(legacy.main)).toBe("后来的云档");
  expect(await nameAt(keysForSlot("a").main)).toBeNull();
});

test("A 槽已经有档时绝不覆盖，老档留在旧键上等人来捞", async () => {
  await store.upsert(keysForSlot("a").main, makeSave("A 槽在玩的"));
  await store.upsert(keysForSlot("cloud").main, makeSave("老档"));

  const outcome = await startSlotMigration(false);

  expect(outcome.kind).toBe("target_occupied");
  expect(await nameAt(keysForSlot("a").main)).toBe("A 槽在玩的");
  expect(await nameAt(keysForSlot("cloud").main)).toBe("老档");
});

test("whenSlotsReady 等到搬完才放行", async () => {
  await store.upsert(keysForSlot("cloud").main, makeSave("主档"));

  // 故意不 await 搬家本身，只 await 这道闸
  void startSlotMigration(false);
  await whenSlotsReady();

  expect(await nameAt(keysForSlot("a").main)).toBe("主档");
});

test("没启动过搬家时 whenSlotsReady 直接放行，不挂死", async () => {
  await expect(whenSlotsReady()).resolves.toBeUndefined();
});
