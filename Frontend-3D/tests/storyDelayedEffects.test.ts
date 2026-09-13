import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { residentIdOf } from "core";
import { emit } from "../src/Game/EventBus";
import { getResident, removeResident } from "../src/Game/State/residentsRuntime";
import { end, getActiveDialogue } from "../src/Game/Systems/dialogue";
import { restoreProgression } from "../src/Game/Systems/events";
import {
  fireStoryRuleById,
  restoreFiredStoryRules,
  restorePoolMisses,
  restoreSignalCounts,
  startStorySystem,
} from "../src/Game/Systems/story";

/**
 * 剧情的延迟效果（delayMs、等面板关掉再登场）到点时，得还是排它的那个世界、剧情系统还挂着才跑。
 *
 * 回归的是：排着的时候回了标题 / 读了另一个档 / 进了别人家，到点照跑，东西落进当时的那个世界。
 * 反方向也钉住：bootstrap effect 在同一个世界里拆了立刻重挂，排着的不能丢。
 */

/** 唯一的效果是 800ms 后开 reporter_names_the_paper */
const DELAYED_DIALOGUE_RULE = "newspaper_gift_received";
/** 等面板关了再登场（spawn_resident）+ 6s 后开对话 */
const PANEL_WAITING_RULE = "otter_arrives";
const OTTER = residentIdOf("otter_trader");

let stop: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  removeResident(OTTER);
  stop = startStorySystem(false);
});

afterEach(() => {
  stop?.();
  stop = null;
  emit("blocking_panel_changed", { open: false });
  while (getActiveDialogue()) end();
  removeResident(OTTER);
  vi.useRealTimers();
});

test("story_延迟对话_世界没换_到点照开", () => {
  expect(fireStoryRuleById(DELAYED_DIALOGUE_RULE)).toBe("fired");
  expect(getActiveDialogue()).toBeNull();

  vi.advanceTimersByTime(1000);

  expect(getActiveDialogue()?.dialogueId).toBe("reporter_names_the_paper");
});

test("story_延迟对话排着时换了世界_到点不开", () => {
  fireStoryRuleById(DELAYED_DIALOGUE_RULE);

  // 读档 / 开新档 / 回自己家：存档注册表都会把 firedStoryRuleIds 整份灌一遍
  restoreFiredStoryRules([]);
  vi.advanceTimersByTime(1000);

  expect(getActiveDialogue()).toBeNull();
});

test("story_延迟对话排着时剧情系统拆了没再挂_到点不开", () => {
  fireStoryRuleById(DELAYED_DIALOGUE_RULE);

  // 回标题 / 进了别人家：剧情系统拆了，不再挂回来
  stop?.();
  stop = null;
  vi.advanceTimersByTime(1000);

  expect(getActiveDialogue()).toBeNull();
});

test("story_同一个世界里拆了立刻重挂_排着的照开", () => {
  fireStoryRuleById(DELAYED_DIALOGUE_RULE);

  // bootstrap effect 依赖一变整个重跑：同一拍里拆了又挂
  stop?.();
  stop = startStorySystem(false);
  vi.advanceTimersByTime(1000);

  expect(getActiveDialogue()?.dialogueId).toBe("reporter_names_the_paper");
});

test("story_等面板关了再登场_面板关了就来", () => {
  emit("blocking_panel_changed", { open: true });
  fireStoryRuleById(PANEL_WAITING_RULE);
  vi.advanceTimersByTime(5000);
  expect(getResident(OTTER)).toBeUndefined();

  emit("blocking_panel_changed", { open: false });
  vi.advanceTimersByTime(10_000);

  expect(getResident(OTTER)).toBeDefined();
});

test("story_等面板关的时候换了世界_面板关了也不登场也不开口", () => {
  emit("blocking_panel_changed", { open: true });
  fireStoryRuleById(PANEL_WAITING_RULE);

  restoreFiredStoryRules([]);
  emit("blocking_panel_changed", { open: false });
  vi.advanceTimersByTime(10_000);

  expect(getResident(OTTER)).toBeUndefined();
  expect(getActiveDialogue()).toBeNull();
});
