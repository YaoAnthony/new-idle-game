import { beforeEach, describe, expect, test, vi } from "vitest";
import type { GameSave } from "core";

import { createIndexDbRepository } from "../src/Data/IndexDB";
import {
  createCloudBoundRepository,
  createLocalSaveRepository,
  getSaveRepository,
  resetSaveRepository,
  setCloudRepositoryFactory,
} from "../src/Data/Save/SaveRepository";
import {
  keysForSlot,
  SAVE_SLOT_IDS,
  setActiveSlot,
} from "../src/Data/Save/slots";
import { describeSaveSlot, listSaveSlots } from "../src/Data/Save/slotSummary";
import { SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";

/**
 * 存档槽位（A / B / C / 云）。
 *
 * 这份用例守的是**多槽之后最容易毁档的三件事**：
 * 1. 槽之间串键——写 A 把 B 顶掉；
 * 2. 本地槽被云同步带上天——A/B/C 必须永远拿纯本地仓库；
 * 3. 列表页读摘要时被坏档炸掉——四张卡有一张读不出来，整页就白了。
 */

const store = createIndexDbRepository<unknown>("gameSaves");

function makeSave(overrides: Partial<GameSave> = {}): GameSave {
  return {
    meta: {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      createdAtUtc: "2026-08-01T00:00:00.000Z",
      updatedAtUtc: "2026-08-12T00:00:00.000Z",
    },
    player: {
      name: "住户",
      avatar: { slots: {} } as never,
      actionGroups: [],
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
    ...overrides,
  } as GameSave;
}

async function wipeAllSlots(): Promise<void> {
  for (const slot of SAVE_SLOT_IDS) {
    const keys = keysForSlot(slot);
    await store.remove(keys.main);
    await store.remove(keys.backup);
    await store.remove(keys.conflict);
  }
}

beforeEach(async () => {
  await wipeAllSlots();
  localStorage.clear();
  setCloudRepositoryFactory(null);
  resetSaveRepository();
});

describe("键推导", () => {
  test("云槽沿用老键，改了就是让已登录玩家吃假冲突框", () => {
    expect(keysForSlot("cloud")).toEqual({
      main: "world",
      backup: "world.backup",
      conflict: "world.conflict",
    });
  });

  test("四个槽的九个键两两不重合", () => {
    const all = SAVE_SLOT_IDS.flatMap((slot) => Object.values(keysForSlot(slot)));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("槽之间互不串", () => {
  test("写 A 不动 B，也不动云槽", async () => {
    await createLocalSaveRepository("a").save(makeSave({ player: { name: "A 的家" } as never }));

    expect(await createLocalSaveRepository("b").hasSave()).toBe(false);
    expect(await createLocalSaveRepository("cloud").hasSave()).toBe(false);

    const loaded = await createLocalSaveRepository("a").load();
    expect(loaded.kind).toBe("loaded");
    expect(loaded.kind === "loaded" ? loaded.save.player.name : null).toBe("A 的家");
  });

  test("删 A 不动 B", async () => {
    await createLocalSaveRepository("a").save(makeSave());
    await createLocalSaveRepository("b").save(makeSave());

    await createLocalSaveRepository("a").clear();

    expect(await createLocalSaveRepository("a").hasSave()).toBe(false);
    expect(await createLocalSaveRepository("b").hasSave()).toBe(true);
  });
});

describe("云挂点只套在云槽上", () => {
  test("本地槽拿到的永远是纯本地仓库", () => {
    setCloudRepositoryFactory((local) =>
      createCloudBoundRepository(local, () => {}),
    );
    resetSaveRepository();

    expect(getSaveRepository("a").mode).toBe("local_only");
    expect(getSaveRepository("b").mode).toBe("local_only");
    expect(getSaveRepository("c").mode).toBe("local_only");
    expect(getSaveRepository("cloud").mode).toBe("cloud_sync");
  });

  test("玩本地槽时写盘不会惊动云同步", async () => {
    const pushed: string[] = [];
    setCloudRepositoryFactory((local) =>
      createCloudBoundRepository(local, (save) => pushed.push(save.player.name)),
    );
    resetSaveRepository();

    await getSaveRepository("a").save(makeSave({ player: { name: "本地" } as never }));
    expect(pushed).toEqual([]);

    await getSaveRepository("cloud").save(makeSave({ player: { name: "云" } as never }));
    expect(pushed).toEqual(["云"]);
  });
});

describe("活动槽", () => {
  test("不传槽时取的就是活动槽", async () => {
    setActiveSlot("b");
    await getSaveRepository().save(makeSave({ player: { name: "B 的家" } as never }));

    expect(await createLocalSaveRepository("b").hasSave()).toBe(true);
    expect(await createLocalSaveRepository("a").hasSave()).toBe(false);
  });

  /*
   * 下面两条都要绕开模块级的内存缓存（`active`）——同一个模块实例里
   * setActiveSlot 之后就再也不读 localStorage 了，不 resetModules 的话
   * 测的是缓存不是读取路径。
   */
  test("重新开页面时从 localStorage 认回上次的槽", async () => {
    setActiveSlot("c");
    vi.resetModules();

    const fresh = await import("../src/Data/Save/slots");
    expect(fresh.getActiveSlot()).toBe("c");
  });

  test("存储里是垃圾值时回退到兜底槽，不抛", async () => {
    localStorage.setItem("idle-home:active-slot", "z");
    vi.resetModules();

    const fresh = await import("../src/Data/Save/slots");
    // 兜底是 A 槽。正常情况下轮不到它——slotMigration 每次启动都会写下
    // 显式的活动槽，见 saveSlotMigration.test.ts
    expect(fresh.getActiveSlot()).toBe("a");
  });
});

describe("槽位摘要", () => {
  test("空槽就是空槽", async () => {
    const summary = await describeSaveSlot("a");
    expect(summary.state).toBe("empty");
    expect(summary.dayCount).toBeNull();
  });

  test("有档时算得出第几天、金币和字节数", async () => {
    await createLocalSaveRepository("a").save(
      makeSave({
        ownWorld: {
          ...makeSave().ownWorld,
          baseGold: 7,
          buildings: [
            { instanceId: "j1", buildingId: "gold_jar", state: { stored: 120 } },
            { instanceId: "j2", buildingId: "gold_jar", state: { stored: 30 } },
            { instanceId: "b1", buildingId: "bed", state: { stored: 999 } },
          ],
        } as never,
      }),
    );

    const summary = await describeSaveSlot("a");
    expect(summary.state).toBe("occupied");
    // 建档 08-01，最后一天 08-12 → 第 12 天（建档那天算第 1 天）
    expect(summary.dayCount).toBe(12);
    // 钱匣 7 + 两只罐 150；床里的 stored 不是钱
    expect(summary.gold).toBe(157);
    expect(summary.bytes).toBeGreaterThan(0);
    expect(summary.savedAtUtc).toBe("2026-08-12T00:00:00.000Z");
    expect(summary.tooNew).toBe(false);
  });

  test("比客户端新的存档标出来（能看能删，进不去）", async () => {
    const keys = keysForSlot("b");
    await store.upsert(keys.main, {
      ...makeSave(),
      meta: {
        saveSchemaVersion: SAVE_SCHEMA_VERSION + 1,
        createdAtUtc: "2026-08-01T00:00:00.000Z",
        updatedAtUtc: "2026-08-20T00:00:00.000Z",
      },
    });

    const summary = await describeSaveSlot("b");
    expect(summary.state).toBe("occupied");
    expect(summary.tooNew).toBe(true);
  });

  test("主档写坏了就退到备份，并且说明这是备份", async () => {
    const keys = keysForSlot("c");
    await store.upsert(keys.backup, makeSave());
    await store.upsert(keys.main, { meta: { saveSchemaVersion: "坏了" } });

    const summary = await describeSaveSlot("c");
    expect(summary.state).toBe("occupied");
    expect(summary.fromBackup).toBe(true);
  });

  test("两边都读不出来是 unreadable，不是 empty——空的会被新建盖掉", async () => {
    const keys = keysForSlot("c");
    await store.upsert(keys.main, { 随手写的: true });

    const summary = await describeSaveSlot("c");
    expect(summary.state).toBe("unreadable");
  });

  test("列表按 A / B / C / 云 的顺序返回四张卡", async () => {
    const summaries = await listSaveSlots();
    expect(summaries.map((item) => item.slot)).toEqual(["a", "b", "c", "cloud"]);
  });
});

describe("摘要里的外观（存档舞台要把角色立起来）", () => {
  test("合法的外观原样带出来", async () => {
    const { defaultAvatarConfig } = await import("core");
    const avatar = defaultAvatarConfig();
    await createLocalSaveRepository("a").save(
      makeSave({ player: { ...makeSave().player, avatar } as never }),
    );
    const summary = await describeSaveSlot("a");
    expect(summary.avatar).toEqual(avatar);
  });

  test("引用了不存在零件的外观是 null——舞台退回默认外观，不能整张不显示", async () => {
    const { defaultAvatarConfig } = await import("core");
    const broken = { ...defaultAvatarConfig(), hairId: "hair_that_was_deleted" };
    await createLocalSaveRepository("b").save(
      makeSave({ player: { ...makeSave().player, avatar: broken } as never }),
    );
    const summary = await describeSaveSlot("b");
    expect(summary.state).toBe("occupied");
    expect(summary.avatar).toBeNull();
  });
});
