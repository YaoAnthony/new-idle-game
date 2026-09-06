import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, DOOR_NOTE_FLAG } from "core";
import { on } from "../src/Game/EventBus";
import { initDoors, listDoors } from "../src/Game/State/doorsRuntime";
import { restoreResidents } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { getFlag, restoreFlags } from "../src/Game/Systems/flags";
import { doorNoteOf, readDoorNote } from "../src/Game/Systems/doorNote";
import { letterText } from "../src/Game/Systems/mail";
import { getFiredStoryRuleIds, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { restoreProgression } from "../src/Game/Systems/events";

/**
 * 居民系统 14 · 开场：新档 game_started → 大门上有条子；按 F 读一次就没了；读档（不发 game_started）和老档（没旗子）都没有。
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
  off();
  expect(opened).toEqual(["witch_first"]);
  expect(letterText({ letterId: "witch_first" })).toBe("学徒，我出门了哈，屋子你随便用\n\n对了，我之前捣鼓了个石头傀儡，脑袋不知道滚哪儿去了，你有空找找\n\n别把我屋子弄成猪窝，不然回来你就完蛋了");
  expect(getFlag(DOOR_NOTE_FLAG)).toBeUndefined();
  expect(doorNoteOf(door)).toBeNull();
  expect(readDoorNote(door)).toBe(false);
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
