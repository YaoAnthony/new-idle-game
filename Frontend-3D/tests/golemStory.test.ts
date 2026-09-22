import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_MAP_ID, GOLEM_CONSTRUCTION_FEATURE, residentIdOf } from "core";
import { handle } from "../src/Game/EventBus";
import { getResidents, restoreResidents, seedInitialCreatures } from "../src/Game/State/residentsRuntime";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMapId } from "../src/Game/State/world/maps";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { choose, end, getActiveDialogue, startDialogue } from "../src/Game/Systems/dialogue";
import { isFeatureUnlocked, restoreProgression, setEventStage } from "../src/Game/Systems/events";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";

/**
 * 居民系统 22 · 石傀儡三形态的剧情接线：
 * 第二只手装上 → 他说"阿咔咔咔"（golem_arms）；拿着图纸找他说完 → 解锁建造；
 * 解锁之后按 F 是「咔咔？」，选「建点什么」→ 开建造面板（open_build_shop）。
 * 按键那一下（拿着图纸按 F 交给他而不是选址）在 RoomScene，这里从对话开始验。
 */

const GOLEM = residentIdOf("stone_golem");
let stopStory: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreResidents({});
  clearAllFurniture();
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  stopStory = startStorySystem(false);
});

afterEach(() => {
  while (getActiveDialogue()) end();
  stopStory?.();
  stopStory = null;
  restoreResidents({});
  vi.useRealTimers();
});

function seedGolem() {
  seedInitialCreatures();
  return getResidents().find((resident) => resident.definitionId === "stone_golem")!;
}

test("golemStory_第二只手装上_他说阿咔咔咔_第一只不说", () => {
  // Arrange
  const golem = seedGolem();
  golem.attachPart("head");
  golem.attachPart("arm_left");
  vi.advanceTimersByTime(2000);
  expect(getActiveDialogue()).toBeNull();

  // Act
  golem.attachPart("arm_right");
  vi.advanceTimersByTime(2000);

  // Assert
  expect(getActiveDialogue()?.dialogueId).toBe("golem_arms");
  expect(getActiveDialogue()?.residentId).toBe(GOLEM);
});

test("golemStory_图纸那段说完_解锁建造_只解一次", () => {
  // Arrange
  const golem = seedGolem();
  golem.assemble();
  vi.advanceTimersByTime(2000);
  while (getActiveDialogue()) end();
  expect(isFeatureUnlocked(GOLEM_CONSTRUCTION_FEATURE)).toBe(false);

  // Act：拿着图纸按 F 开的就是这段（RoomScene），说完
  startDialogue("golem_blueprint", GOLEM);
  end();

  // Assert
  expect(isFeatureUnlocked(GOLEM_CONSTRUCTION_FEATURE)).toBe(true);
});

test("golemStory_解锁之后按F是咔咔问句_选建点什么才开建造面板_选没事不开", () => {
  // Arrange
  const golem = seedGolem();
  golem.assemble();
  vi.advanceTimersByTime(2000);
  while (getActiveDialogue()) end();
  setEventStage("golem_intro", "talked", "completed");
  startDialogue("golem_blueprint", GOLEM);
  end();
  const opened: number[] = [];
  // 开面板是指令（request/handle），不是事件；测试里没有面板，这里当那一个处理方
  const off = handle("build_shop_open_requested", () => {
    opened.push(1);
  });

  try {
    // Act 1：按 F 答的是问句，不是面板
    const offer = golem.interact({ x: golem.x + 1, z: golem.z });
    expect(offer).toEqual({ kind: "dialogue", dialogueId: "golem_ready" });

    // Act 2：选「没事」
    startDialogue("golem_ready", GOLEM);
    choose("nothing");
    vi.advanceTimersByTime(500);
    expect(opened).toHaveLength(0);
    expect(getActiveDialogue()).toBeNull();

    // Act 3：选「建点什么」→ 对话先收、面板再开
    startDialogue("golem_ready", GOLEM);
    choose("build");
    expect(getActiveDialogue()).toBeNull();
    vi.advanceTimersByTime(500);
    expect(opened).toHaveLength(1);
  } finally {
    off();
  }
});

test("golemStory_没解锁时按F照旧是咔咔或省略号_不给问句", () => {
  const golem = seedGolem();
  golem.assemble();
  vi.advanceTimersByTime(2000);
  while (getActiveDialogue()) end();
  expect(golem.interact({ x: golem.x + 1, z: golem.z })).toEqual({ kind: "dialogue", dialogueId: "golem_first_talk" });
});
