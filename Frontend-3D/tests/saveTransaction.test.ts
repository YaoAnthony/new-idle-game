import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GameSave } from "core";

import { startAutosave } from "../src/Data/Save/autosave";
import { hydrateGameSave, isRestoring, serializeGameSave } from "../src/Data/Save/serialize";
import { loadSaveIntoRuntime } from "../src/Data/Save/runtime";
import { SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";
import { emit, on } from "../src/Game/EventBus";
import { getEventProgress, restoreProgression } from "../src/Game/Systems/events";

/**
 * 读档事务。守的是审计 2026-09-13 抓到的两条：
 *
 * 1. **读到一半就存盘**：`restoreProgression` 每个事件 emit 一次
 *    `event_progress_changed`，那条是自动存档的立即写触发点，而写盘是同步
 *    serialize 的——此刻后面二十多片还是上一个世界的值。做客回家那条路上写下去
 *    的是"自家世界 + 房主的信箱和成就"。修法是事务：期间 `isRestoring()` 为真，
 *    自动存档闭嘴，结束发一条 `save_applied`。
 * 2. **不迁移就灌**：云冲突框选"用云端"直接 `hydrateGameSave(cloudSave)`。
 *    修法是入口只留 `loadSaveIntoRuntime`，迁移在里面。
 */

const repository = { save: vi.fn(async () => ({ ok: true as const })) };

vi.mock("../src/Data/Save/SaveRepository", () => ({
  getSaveRepository: () => repository,
}));

/** 一份带着"已推进的剧情事件"的档：restoreProgression 会为它发事件 */
function saveWithProgress(): GameSave {
  const save = serializeGameSave();
  save.ownWorld.progression.events = {
    test_event: {
      currentStageId: "stage_two",
      status: "active",
      firstTriggeredAtUtc: "2026-09-13T00:00:00.000Z",
      firstTriggeredWorldDayId: "2026-09-13",
    },
  } as never;
  return save;
}

let stopAutosave: (() => void) | null = null;

beforeEach(() => {
  repository.save.mockClear();
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
});

afterEach(() => {
  stopAutosave?.();
  stopAutosave = null;
});

describe("事务", () => {
  test("test_save_transaction_hydrate_does_not_write_to_disk_midway", () => {
    // Arrange：自动存档挂上，剧情节点是立即写
    stopAutosave = startAutosave();
    const save = saveWithProgress();

    // Act
    hydrateGameSave(save);

    // Assert：读档期间一笔都没写；事务结束后事件才算数
    expect(repository.save).not.toHaveBeenCalled();
    expect(isRestoring()).toBe(false);
    expect(Object.keys(getEventProgress())).toEqual(["test_event"]);

    // 对照：事务外的同一条事件照样立即写
    emit("event_progress_changed", { eventId: "test_event", stageId: "stage_two" });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  test("test_save_transaction_emits_save_applied_once_with_mode", () => {
    const applied = vi.fn();
    const off = on("save_applied", applied);

    hydrateGameSave(serializeGameSave(), "new_game");

    off();
    expect(applied).toHaveBeenCalledTimes(1);
    expect(applied.mock.calls[0][0].mode).toBe("new_game");
    expect(applied.mock.calls[0][0].keys).toContain("world.maps");
  });

  test("test_save_transaction_is_restoring_is_true_only_inside", () => {
    let seenInside: boolean | null = null;
    const off = on("world_changed", () => {
      if (seenInside === null) seenInside = isRestoring();
    });

    hydrateGameSave(serializeGameSave());

    off();
    // restoreWorld 发 world_changed 时正在事务里
    expect(seenInside).toBe(true);
    expect(isRestoring()).toBe(false);
  });
});

describe("迁移入口", () => {
  test("test_load_save_into_runtime_migrates_old_schema_before_hydrating", () => {
    const old = serializeGameSave();
    // v53 是空迁移；从 52 进来必须被抬到当前版本，而不是原样灌
    old.meta.saveSchemaVersion = SAVE_SCHEMA_VERSION - 1;

    const outcome = loadSaveIntoRuntime(old);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.save.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  test("test_load_save_into_runtime_rejects_newer_schema", () => {
    const applied = vi.fn();
    const off = on("save_applied", applied);
    const future = serializeGameSave();
    future.meta.saveSchemaVersion = SAVE_SCHEMA_VERSION + 1;

    const outcome = loadSaveIntoRuntime(future);

    off();
    expect(outcome.ok).toBe(false);
    // 拒了就不许灌
    expect(applied).not.toHaveBeenCalled();
  });
});
