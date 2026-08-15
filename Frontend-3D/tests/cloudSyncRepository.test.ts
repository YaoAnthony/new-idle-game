import { beforeEach, describe, expect, test } from "vitest";
import type { GameSave } from "core";

import { createIndexDbRepository } from "../src/Data/IndexDB";
import {
  createCloudBoundRepository,
  createLocalSaveRepository,
  getSaveRepository,
  resetSaveRepository,
  setCloudRepositoryFactory,
  stashMainToConflict,
} from "../src/Data/Save/SaveRepository";
import { SAVE_KEYS, SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";

/**
 * 云挂点仓库的三条纪律（跑在 fake-indexeddb 上）：
 * 1. save 本地成功才通知云端（onSaved），本地失败不通知；
 * 2. onSaved 抛不抛、云推没推成功，都不影响本地写盘的结果——
 *    "Backend 不可用时必须保留有效离线行为"；
 * 3. 工厂/重建的接缝：resetSaveRepository 后按工厂重建。
 */

const store = createIndexDbRepository<unknown>("gameSaves");

function makeSave(marker: string): GameSave {
  return {
    meta: {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      createdAtUtc: "2026-08-01T00:00:00.000Z",
      updatedAtUtc: "2026-08-14T00:00:00.000Z",
    },
    player: {
      name: marker,
      avatar: { slots: {} } as never,
      missions: { daily: [], primary: [] },
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
      droppedItems: [],
      inventories: {},
      gramophones: {},
    } as never,
  };
}

beforeEach(async () => {
  await store.clear();
  setCloudRepositoryFactory(null);
  resetSaveRepository();
});

describe("createCloudBoundRepository", () => {
  test("cloud_repo_save_success_notifies_with_the_saved_snapshot", async () => {
    // Arrange
    const seen: GameSave[] = [];
    const repo = createCloudBoundRepository(createLocalSaveRepository(), (save) =>
      seen.push(save),
    );
    const save = makeSave("hello");

    // Act
    const outcome = await repo.save(save);

    // Assert
    expect(outcome.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(save);
    expect(repo.mode).toBe("cloud_sync");
  });

  test("cloud_repo_load_delegates_to_local_untouched", async () => {
    // Arrange：本地写好一份，再用云挂点仓库读
    const local = createLocalSaveRepository();
    await local.save(makeSave("local-truth"));
    const repo = createCloudBoundRepository(local, () => {
      throw new Error("load 不该触发云通知");
    });

    // Act
    const outcome = await repo.load();

    // Assert
    expect(outcome.kind).toBe("loaded");
    if (outcome.kind === "loaded") {
      expect(outcome.save.player.name).toBe("local-truth");
    }
  });

  test("cloud_repo_factory_swaps_on_reset", async () => {
    // Arrange：默认纯本地
    expect(getSaveRepository().mode).toBe("local_only");

    // Act：装工厂 + 重建（authBridge 在登录翻转时做的事）
    setCloudRepositoryFactory((local) => createCloudBoundRepository(local, () => {}));
    resetSaveRepository();

    // Assert
    expect(getSaveRepository().mode).toBe("cloud_sync");
  });
});

describe("stashMainToConflict", () => {
  test("stash_copies_current_main_to_conflict_key", async () => {
    // Arrange
    const local = createLocalSaveRepository();
    await local.save(makeSave("precious"));

    // Act
    await stashMainToConflict();

    // Assert：conflict 键有整份主档
    const record = await store.get(SAVE_KEYS.conflict);
    expect(record.ok).toBe(true);
    if (record.ok && "data" in record) {
      expect((record.data.value as GameSave).player.name).toBe("precious");
    }
  });

  test("stash_without_main_save_is_a_noop", async () => {
    // Act
    await stashMainToConflict();

    // Assert
    const record = await store.get(SAVE_KEYS.conflict);
    expect(record.ok).toBe(false);
  });
});
