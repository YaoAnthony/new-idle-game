import { beforeEach, expect, test } from "vitest";
import type { GameSave } from "core";

import { createLocalSaveRepository } from "../src/Data/Save/SaveRepository";
import { SAVE_KEYS, SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";
import { createIndexDbRepository } from "../src/Data/IndexDB";

/**
 * 本地存档仓库。**治愈游戏丢存档是灾难性的**，所以这里做的是双份轮写：
 * 写主档之前先把当前主档复制到备份，读不出来就回退。
 *
 * 这份用例跑在 fake-indexeddb 上——真的 IDB 语义（事务、版本升级），
 * 不是一个 Map 假装的。备份回退那条路只有在能真的写坏一条记录时才走得到。
 */

const store = createIndexDbRepository<unknown>("gameSaves");

function makeSave(marker: string): GameSave {
  return {
    meta: {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      createdAtUtc: "2026-08-01T00:00:00.000Z",
      updatedAtUtc: `2026-08-12T00:00:00.000Z`,
    },
    player: {
      name: marker,
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
      clock: {} as never,
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
  await store.remove(SAVE_KEYS.main);
  await store.remove(SAVE_KEYS.backup);
});

test("没有存档时是新玩家，不是失败", () => {
  const repository = createLocalSaveRepository();

  return Promise.all([
    repository.load().then((outcome) => expect(outcome.kind).toBe("empty")),
    repository.hasSave().then((has) => expect(has).toBe(false)),
  ]);
});

test("存进去读得出来", async () => {
  const repository = createLocalSaveRepository();

  expect(await repository.save(makeSave("阿主"))).toEqual({ ok: true });
  expect(await repository.hasSave()).toBe(true);

  const outcome = await repository.load();
  expect(outcome.kind).toBe("loaded");
  expect(outcome.kind === "loaded" && outcome.source).toBe("main");
  expect(outcome.kind === "loaded" && outcome.save.player.name).toBe("阿主");
});

test("第二次存档之前，上一份主档被复制进备份", async () => {
  const repository = createLocalSaveRepository();

  await repository.save(makeSave("第一次"));
  await repository.save(makeSave("第二次"));

  const backup = await store.get(SAVE_KEYS.backup);
  expect(backup.ok).toBe(true);
  const value = backup.ok && "data" in backup ? (backup.data.value as GameSave) : null;
  expect(value?.player.name).toBe("第一次");
});

test("第一次存档时还没有主档，不该因为没东西可备份而失败", async () => {
  const repository = createLocalSaveRepository();

  expect(await repository.save(makeSave("开局"))).toEqual({ ok: true });
  const backup = await store.get(SAVE_KEYS.backup);
  expect(backup.ok && "data" in backup).toBe(false);
});

test("主档被改坏时自动回退到备份，并把来源告诉调用方", async () => {
  const repository = createLocalSaveRepository();
  await repository.save(makeSave("好的那份"));
  await repository.save(makeSave("新的那份")); // 这一步把"好的那份"推进备份

  // 模拟写了一半 / 被手改坏的主档
  await store.upsert(SAVE_KEYS.main, { meta: { saveSchemaVersion: 1 }, 半个存档: true });

  const outcome = await repository.load();
  expect(outcome.kind).toBe("loaded");
  // 来源必须报出来——治愈游戏里悄悄回退比丢档更糟
  expect(outcome.kind === "loaded" && outcome.source).toBe("backup");
  expect(outcome.kind === "loaded" && outcome.save.player.name).toBe("好的那份");
});

test("两边都坏了才算失败，而且要带上原因", async () => {
  const repository = createLocalSaveRepository();

  await store.upsert(SAVE_KEYS.main, { 坏的: true });
  await store.upsert(SAVE_KEYS.backup, { 也是坏的: true });

  const outcome = await repository.load();
  expect(outcome.kind).toBe("failed");
  expect(outcome.kind === "failed" && outcome.message.length).toBeGreaterThan(0);
});

test("结构校验挡得住缺胳膊少腿的记录", async () => {
  const repository = createLocalSaveRepository();

  const broken: unknown[] = [
    null,
    "字符串",
    {},
    { meta: { saveSchemaVersion: 1 } },
    { meta: { saveSchemaVersion: 1 }, player: {}, ownWorld: {} }, // 缺 placedFurniture / maps
    { meta: {}, player: {}, ownWorld: { placedFurniture: [], maps: {} } }, // 缺版本号
  ];

  for (const value of broken) {
    await store.upsert(SAVE_KEYS.main, value);
    expect(await repository.hasSave(), `${JSON.stringify(value)} 不该被当成存档`).toBe(false);
  }
});

test("比客户端更新的存档不会被静默降级——降级会把新字段悄悄抹掉", async () => {
  const repository = createLocalSaveRepository();
  const future = makeSave("未来");
  future.meta.saveSchemaVersion = SAVE_SCHEMA_VERSION + 5;
  await store.upsert(SAVE_KEYS.main, future);

  const outcome = await repository.load();
  expect(outcome.kind).toBe("failed");
});

test("老版本的存档在读出来时自动迁到最新", async () => {
  const repository = createLocalSaveRepository();
  const old = makeSave("老档");
  old.meta.saveSchemaVersion = 1;
  await store.upsert(SAVE_KEYS.main, old);

  const outcome = await repository.load();
  expect(outcome.kind).toBe("loaded");
  expect(outcome.kind === "loaded" && outcome.save.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
});

test("clear 之后回到新玩家状态", async () => {
  const repository = createLocalSaveRepository();
  await repository.save(makeSave("一"));
  await repository.save(makeSave("二"));

  await repository.clear();

  expect(await repository.hasSave()).toBe(false);
  expect((await repository.load()).kind).toBe("empty");
});

test("只有备份还在时也算有存档，继续游戏该出现", async () => {
  const repository = createLocalSaveRepository();
  await store.upsert(SAVE_KEYS.backup, makeSave("只剩备份"));

  expect(await repository.hasSave()).toBe(true);
  const outcome = await repository.load();
  expect(outcome.kind === "loaded" && outcome.source).toBe("backup");
});
