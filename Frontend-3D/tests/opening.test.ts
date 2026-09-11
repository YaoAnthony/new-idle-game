import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, DOOR_NOTE_FLAG } from "core";
import { emit, on } from "../src/Game/EventBus";
import { initDoors, listDoors, restoreDoors } from "../src/Game/State/doorsRuntime";
import { restoreResidents } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { getFlag, restoreFlags } from "../src/Game/Systems/flags";
import { doorNoteOf, readDoorNote } from "../src/Game/Systems/doorNote";
import { letterText } from "../src/Game/Systems/mail";
import { getFiredStoryRuleIds, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { restoreProgression } from "../src/Game/Systems/events";
import { choose, getActiveDialogue, end as endDialogue } from "../src/Game/Systems/dialogue";
import { getCount, restoreInventory } from "../src/Game/State/inventory";

/**
 * 居民系统 14 · 开场：新档 game_started → 大门上有条子；按 F 拿下来就没了；读档（不发 game_started）和老档（没旗子）都没有。
 * 2026-09-09：条子是一只信封——拿下来进背包 + 弹"拆开 / 再看看"；拆开才摊信纸；信封不消耗，按 F 能再问。
 */
let stop: (() => void) | null = null;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreResidents({});
  restoreFlags(undefined);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  restoreInventory([]);
  endDialogue();
  initDoors();
});

afterEach(() => {
  stop?.();
  stop = null;
});

function frontDoor() {
  const door = listDoors().find((item) => item.definition.id === "front_door");
  expect(door).toBeTruthy();
  return door!;
}

test("opening_新档_门上有条子_三行原文_读一次就没了_其他门没有", () => {
  stop = startStorySystem(true);
  expect(getFlag(DOOR_NOTE_FLAG)).toBe("witch_first");
  expect(getFiredStoryRuleIds()).toContain("opening_note");
  const door = frontDoor();
  expect(doorNoteOf(door)).toBe("witch_first");
  for (const other of listDoors().filter((item) => item.definition.id !== "front_door")) expect(doorNoteOf(other)).toBeNull();

  const opened: string[] = [];
  const off = on("note_open_requested", ({ letterId }) => opened.push(letterId));
  expect(readDoorNote(door)).toBe(true);
  // 拿下来：门上没了、信封进背包、旁白问"拆开 / 再看看"——信纸还没开
  expect(getFlag(DOOR_NOTE_FLAG)).toBeUndefined();
  expect(doorNoteOf(door)).toBeNull();
  expect(readDoorNote(door)).toBe(false);
  expect(getCount("witch_letter")).toBe(1);
  expect(getActiveDialogue()?.dialogueId).toBe("opening_envelope");
  expect(opened).toEqual([]);

  // 再看看：什么都不发生，信封还在
  choose("later");
  expect(getActiveDialogue()).toBeNull();
  expect(opened).toEqual([]);
  expect(getCount("witch_letter")).toBe(1);

  // 拿着信封按 F → 同一段旁白再来；拆开 → 信纸摊开，信封不消耗
  emit("story_signal", { kind: "item_used", subject: "witch_letter" });
  expect(getActiveDialogue()?.dialogueId).toBe("opening_envelope");
  choose("open");
  off();
  expect(opened).toEqual(["witch_first"]);
  expect(getCount("witch_letter")).toBe(1);
  expect(letterText({ letterId: "witch_first" })).toBe("徒弟，我出门了哈，屋子你随便用\n\n但要是房子给我搞成猪窝的话，那你就完蛋了");
});

test("opening_读档不发game_started_老档没旗子_都没有条子", () => {
  stop = startStorySystem(false);
  expect(getFlag(DOOR_NOTE_FLAG)).toBeUndefined();
  expect(doorNoteOf(frontDoor())).toBeNull();
  // 读过的档：规则记在 firedStoryRuleIds 里，再发一次 game_started 也不会再贴
  stop();
  restoreFiredStoryRules(["opening_note"]);
  stop = startStorySystem(true);
  expect(getFlag(DOOR_NOTE_FLAG)).toBeUndefined();
});

test("opening_大门开场锁着_两箱拆完后放下一件家具才开", () => {
  stop = startStorySystem(true);
  const door = frontDoor();
  expect(door.locked).toBe(true);
  expect(door.interact()).toBe("locked");
  expect(door.open).toBe(false);

  // 只拆一箱、摆了东西也不开
  emit("story_signal", { kind: "unpacked", subject: "moving_tools" });
  emit("story_signal", { kind: "furniture_placed", subject: "stove" });
  expect(door.locked).toBe(true);

  // 第二箱拆了还没摆——要等放下一件的那一拍
  emit("story_signal", { kind: "unpacked", subject: "moving_furniture" });
  expect(getFiredStoryRuleIds()).toContain("opening_boxes_unpacked");
  expect(door.locked).toBe(true);
  emit("story_signal", { kind: "furniture_placed", subject: "furniture_table" });
  expect(getFiredStoryRuleIds()).toContain("opening_home_tidy");
  expect(door.locked).toBe(false);
  expect(door.interact()).toBe("opened");
});

test("opening_老档带着locked=false读进来_不上锁", () => {
  stop = startStorySystem(false);
  // 读档优先：存档里这扇门没锁，defaultLocked 不作数
  const saved = listDoors().map((item) => ({ refId: item.refId, definitionId: item.definition.id, locked: false }));
  restoreDoors(saved);
  initDoors();
  expect(frontDoor().locked).toBe(false);
});

test("opening_场景重建后大门仍锁着_剧情锁不能只套一次", () => {
  // 真实顺序：剧情系统先启动（锁到了，门还没建），场景再建门；开发模式 StrictMode 还会把场景拆了重建一遍
  stop = startStorySystem(true);
  expect(frontDoor().locked).toBe(true);
  initDoors();
  expect(frontDoor().locked, "重建门之后锁丢了——第一版就是这样让大门直接开的").toBe(true);
  initDoors();
  expect(frontDoor().locked).toBe(true);
  expect(frontDoor().interact()).toBe("locked");
});
