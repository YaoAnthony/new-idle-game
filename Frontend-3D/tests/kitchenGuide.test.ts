import { afterEach, beforeEach, expect, test } from "vitest";
import { emit, on } from "../src/Game/EventBus";
import { restoreFlags } from "../src/Game/Systems/flags";
import { restoreProgression } from "../src/Game/Systems/events";
import { getFiredStoryRuleIds, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { findGuideDefinition } from "../src/Components/Guide/guides";

/**
 * 灶台教程：第一次把灶台放下弹一次引导，之后不再弹；别的家具不弹。
 * 引导内容表里 kitchen 这条要有图——规则弹了、面板却画占位框，等于没教。
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

test("kitchenGuide_放下灶台弹一次_再放不弹_别的家具不弹", () => {
  stop = startStorySystem(true);
  const opened: string[] = [];
  const off = on("guide_open_requested", ({ guideId }) => opened.push(guideId));

  emit("story_signal", { kind: "furniture_placed", subject: "furniture_table" });
  expect(opened).toEqual([]);

  emit("story_signal", { kind: "furniture_placed", subject: "stove" });
  expect(opened).toEqual(["kitchen"]);
  expect(getFiredStoryRuleIds()).toContain("kitchen_first_stove");

  emit("story_signal", { kind: "furniture_placed", subject: "stove" });
  expect(opened).toEqual(["kitchen"]);
  off();
});

test("kitchenGuide_内容表里有图", () => {
  const guide = findGuideDefinition("kitchen");
  expect(guide?.image).toMatch(/tutorial_kitchen\.webp$/);
});
