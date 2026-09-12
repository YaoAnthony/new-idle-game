import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FurnitureCapability, PlacementSurface, findLootTable, findPlaceableItem } from "core";
import { emit, on } from "../src/Game/EventBus";
import { clearAllFurniture, JOURNAL_TABLE_SEED, seedInitialFurniture } from "../src/Game/State/world/furniture";
import { getWorld } from "../src/Game/State/worldRuntime";
import { restoreFlags } from "../src/Game/Systems/flags";
import { isFeatureUnlocked, restoreProgression } from "../src/Game/Systems/events";
import { getFiredStoryRuleIds, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { findGuideDefinition } from "../src/Components/Guide/guides";

/**
 * 开场二 · 桌上的日记本（2026-09-12）：
 * 新世界桌子不在纸箱里、屋里有一张，桌上摆着日记本；拿走（journal_taken）→ 开 diary 功能 + 弹一次教程。
 */
let stop: (() => void) | null = null;

beforeEach(() => {
  restoreFlags(undefined);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
});

afterEach(() => {
  stop?.();
  stop = null;
});

test("journal_纸箱里没有桌子_屋里种了一张_日记本摆在它上面", () => {
  const boxItems = ["moving_tools", "moving_furniture"].flatMap((id) => findLootTable(id)!.entries.map((e) => e.itemId));
  expect(boxItems).not.toContain("furniture_table");

  clearAllFurniture();
  seedInitialFurniture();
  const placed = getWorld().placedFurniture;
  const table = placed.find((p) => p.furnitureId === "furniture_table");
  expect(table).toBeTruthy();
  expect(table!.placement.kind).toBe(PlacementSurface.Floor);
  expect(table!.placement.kind === PlacementSurface.Floor && table!.placement.gridPosition).toEqual(JOURNAL_TABLE_SEED.gridPosition);

  const journal = placed.find((p) => p.furnitureId === "journal");
  expect(journal).toBeTruthy();
  expect(journal!.placement.kind).toBe(PlacementSurface.Surface);
  if (journal!.placement.kind === PlacementSurface.Surface) {
    expect(journal!.placement.hostInstanceId).toBe(table!.instanceId);
  }
  // 只有这一本，而且它带 Journal 能力（RoomScene 按能力分派 F）
  expect(placed.filter((p) => p.furnitureId === "journal")).toHaveLength(1);
  expect(findPlaceableItem("journal")?.placement.capabilities).toContain(FurnitureCapability.Journal);
});

test("journal_拿走一次_开功能_弹一次教程_再发不弹", () => {
  stop = startStorySystem(true);
  expect(isFeatureUnlocked("diary")).toBe(false);
  const opened: string[] = [];
  const off = on("guide_open_requested", ({ guideId }) => opened.push(guideId));

  // 教程晚 0.65 s 才弹（先让按钮弹出来、星星散完），功能是当场开的
  vi.useFakeTimers();
  emit("story_signal", { kind: "journal_taken", subject: "journal" });
  expect(isFeatureUnlocked("diary")).toBe(true);
  expect(getFiredStoryRuleIds()).toContain("opening_journal");
  expect(opened).toEqual([]);
  vi.advanceTimersByTime(700);
  expect(opened).toEqual(["diary"]);

  emit("story_signal", { kind: "journal_taken", subject: "journal" });
  vi.advanceTimersByTime(700);
  expect(opened).toEqual(["diary"]);
  vi.useRealTimers();
  off();
  // 内容表里有这条（图可以先没有，面板画占位）
  expect(findGuideDefinition("diary")?.titleKey).toBe("guide.diary.title");
  expect(findGuideDefinition("diary")?.images).toEqual(["/ui/tutorial_mission_1.webp", "/ui/tutorial_mission_2.webp"]);
});
