import { afterEach, beforeEach, expect, test } from "vitest";
import { Facing, PlacementSurface, residentIdOf } from "core";
import { emit, on } from "../src/Game/EventBus";
import { getClock } from "../src/Game/State/clock";
import { restoreInventory, setStackAt } from "../src/Game/State/inventory";
import { clearAllFurniture, replayPlaceFurniture } from "../src/Game/State/world/furniture";
import {
  getCodexProgress,
  isCodexEntrySeen,
  listCodex,
  listCodexTabs,
  restoreCodex,
  snapshotCodex,
  startCodexSystem,
} from "../src/Game/Systems/codex";

/**
 * 图鉴运行时（2026-09-15）：听剧情信号点亮、只点一次、发事件飘 toast、开局对账把已经在家的补上、
 * 状态进存档往返。条目本身是注册表的投影，那一半在 Core/tests/codex.test.ts。
 */
let stop: (() => void) | null = null;

beforeEach(() => {
  restoreInventory([]);
  clearAllFurniture();
  restoreCodex({});
});

afterEach(() => {
  stop?.();
  stop = null;
});

test("codex_家具进背包的信号点亮一条_发事件_飘toast_再来一次不重复", () => {
  stop = startCodexSystem();
  const discovered: string[] = [];
  const changed: string[] = [];
  const toasts: string[] = [];
  const offA = on("codex_discovered", ({ entryId }) => discovered.push(entryId));
  const offB = on("codex_changed", ({ reason }) => changed.push(reason));
  const offC = on("story_toast", ({ localizationKey }) => toasts.push(localizationKey ?? ""));

  expect(isCodexEntrySeen("furniture:furniture_bed")).toBe(false);
  emit("story_signal", { kind: "furniture_obtained", subject: "furniture_bed" });
  expect(isCodexEntrySeen("furniture:furniture_bed")).toBe(true);
  expect(discovered).toEqual(["furniture:furniture_bed"]);
  expect(changed).toEqual(["discovered"]);
  expect(toasts).toEqual(["codex.toast"]);

  emit("story_signal", { kind: "furniture_obtained", subject: "furniture_bed" });
  emit("story_signal", { kind: "furniture_placed", subject: "furniture_bed" });
  expect(discovered).toEqual(["furniture:furniture_bed"]);
  expect(changed).toEqual(["discovered"]);

  const view = listCodex().find((v) => v.entry.id === "furniture:furniture_bed");
  expect(view?.discovery?.seenDayId).toBe(getClock().worldDayId);
  offA();
  offB();
  offC();
});

test("codex_居民只认对视_在场出现不点亮_无关信号不动", () => {
  stop = startCodexSystem();
  emit("story_signal", { kind: "resident_spawned", subject: residentIdOf("shushu") });
  expect(isCodexEntrySeen("resident:shushu")).toBe(false);
  emit("story_signal", { kind: "resident_eye_contact", subject: "shushu" });
  expect(isCodexEntrySeen("resident:shushu")).toBe(true);
  emit("story_signal", { kind: "cook_completed", subject: "furniture_bed" });
  emit("story_signal", { kind: "furniture_placed", subject: "record_minecraft" });
  expect(getCodexProgress().all.seen).toBe(1);
});

test("codex_挂上时对账_背包里的家具和屋里摆着的都补上_对账不飘toast", () => {
  setStackAt(0, { itemId: "furniture_chair", count: 1 });
  setStackAt(1, { itemId: "tomato", count: 3 });
  replayPlaceFurniture({
    instanceId: "test:furniture:table#1",
    furnitureId: "furniture_table",
    placement: { kind: PlacementSurface.Floor, roomId: "living", gridPosition: { x: 0, y: 0 }, facing: Facing.North },
    state: {},
  });
  const toasts: string[] = [];
  const off = on("story_toast", ({ localizationKey }) => toasts.push(localizationKey ?? ""));
  stop = startCodexSystem();
  expect(isCodexEntrySeen("furniture:furniture_chair")).toBe(true);
  expect(isCodexEntrySeen("furniture:furniture_table")).toBe(true);
  expect(getCodexProgress().furniture.seen).toBe(2);
  expect(toasts).toEqual([]);
  off();
});

test("codex_快照与读档往返_读档发restored", () => {
  stop = startCodexSystem();
  emit("story_signal", { kind: "furniture_obtained", subject: "furniture_bed" });
  emit("story_signal", { kind: "resident_eye_contact", subject: "fox_neighbor" });
  const snapshot = snapshotCodex();
  expect(Object.keys(snapshot).sort()).toEqual(["furniture:furniture_bed", "resident:fox_neighbor"]);

  const changed: string[] = [];
  const off = on("codex_changed", ({ reason }) => changed.push(reason));
  restoreCodex({});
  expect(getCodexProgress().all.seen).toBe(0);
  restoreCodex(snapshot);
  expect(isCodexEntrySeen("furniture:furniture_bed")).toBe(true);
  expect(isCodexEntrySeen("resident:fox_neighbor")).toBe(true);
  expect(changed).toEqual(["restored", "restored"]);
  // 快照是拷贝：改快照不改状态
  snapshot["furniture:furniture_bed"]!.seenDayId = "改了";
  expect(listCodex().find((v) => v.entry.id === "furniture:furniture_bed")?.discovery?.seenDayId).not.toBe("改了");
  off();
});

test("codex_页签来自来源表_家具在前居民在后", () => {
  expect(listCodexTabs().map((tab) => tab.section)).toEqual(["furniture", "resident", "crop"]);
  expect(listCodex().length).toBe(getCodexProgress().all.total);
});
