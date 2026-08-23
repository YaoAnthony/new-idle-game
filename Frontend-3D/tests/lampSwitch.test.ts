import { beforeEach, expect, test, vi } from "vitest";
import {
  DEFAULT_MAP_ID,
  Facing,
  FurnitureCapability,
  findPlaceableItem,
  worldToRoomCell,
} from "core";

import { on } from "../src/Game/EventBus";
import {
  isLampOn,
  isSwitchableLamp,
  pruneOrphanLamps,
  replayLampSwitch,
  restoreLamps,
  setLampOn,
  snapshotLamps,
} from "../src/Game/State/lamps";
import {
  clearAllFurniture,
  placeFurniture,
} from "../src/Game/State/world/furniture";
import {
  getCurrentMap,
  getCurrentMapId,
  getRoom,
  getWorld,
} from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 灯的开关。
 *
 * 状态是**世界的**不是本地的：一个房间里关了灯，站在同一间屋子里的人
 * 都该跟着变暗。所以每次本地拉开关都要往 op 通道发一条，而且发的是
 * **绝对状态不是"切一下"**——op 是尽力而为的转发，发 toggle 的话丢一包
 * 两边就永久相反了。这份用例主要钉的就是这两条。
 */

const YARD = () => getCurrentMap().outdoorRoomId;

function yardCell(dx = 0, dy = 0): { x: number; y: number } {
  const yard = getRoom(getCurrentMap().outdoorRoomId)!;
  const cell = worldToRoomCell(yard, 3.5, 16.5);
  return { x: cell.x + dx, y: cell.y + dy };
}

/** 摆一件家具，返回它的 instanceId */
function place(furnitureId: string, dx = 0, dy = 0): string {
  const before = new Set(
    getWorld().placedFurniture.map((item) => item.instanceId),
  );
  const result = placeFurniture(
    furnitureId,
    yardCell(dx, dy),
    Facing.North,
    YARD(),
  );
  expect(result.ok, JSON.stringify(result)).toBe(true);
  const placed = getWorld().placedFurniture.find(
    (item) => !before.has(item.instanceId),
  );
  expect(placed, `${furnitureId} 没摆上`).toBeTruthy();
  return placed!.instanceId;
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  clearAllFurniture();
  restoreLamps(undefined);
});

// ---- 谁身上有开关 ----

test("带 Lighting 能力的家具才有开关，加一盏新灯零代码", () => {
  const lamp = place("furniture_floor_lamp");
  const chest = place("furniture_storage_chest", 1);

  expect(isSwitchableLamp(lamp)).toBe(true);
  expect(isSwitchableLamp(chest)).toBe(false);
});

test("壁炉只是氛围件，没有开关——熄火要连火苗一起藏，那是另一件事", () => {
  const fireplace = findPlaceableItem("furniture_fireplace");

  expect(
    fireplace?.placement.capabilities.includes(FurnitureCapability.Ambience),
  ).toBe(true);
  expect(
    fireplace?.placement.capabilities.includes(FurnitureCapability.Lighting),
  ).toBe(false);
});

test("五盏灯全都挂了 Lighting（落地灯、路灯、月亮灯、蘑菇灯、云朵灯）", () => {
  const lamps = [
    "furniture_floor_lamp",
    "furniture_street_lamp",
    "furniture_moon_lamp",
    "furniture_mushroom_lamp",
    "furniture_cloud_lamp",
  ];

  for (const id of lamps) {
    const definition = findPlaceableItem(id);
    expect(
      definition?.placement.capabilities.includes(FurnitureCapability.Lighting),
      `${id} 少了 Lighting`,
    ).toBe(true);
    // 有开关就得有话说，否则气泡跟着 interactTarget 走之后它会哑掉
    expect(definition?.placement.interactHint, `${id} 没有气泡文案`).toBeTruthy();
  }
});

// ---- 开关本身 ----

test("出厂即亮：没被动过的灯是开着的", () => {
  const lamp = place("furniture_floor_lamp");

  expect(isLampOn(lamp)).toBe(true);
  // 而且**不占存档条目**——每摆一盏就写一条永不改变的记录是浪费
  expect(snapshotLamps()).toEqual({});
});

test("关掉再开回来，状态跟着走", () => {
  const lamp = place("furniture_floor_lamp");

  setLampOn(lamp, false);
  expect(isLampOn(lamp)).toBe(false);

  setLampOn(lamp, true);
  expect(isLampOn(lamp)).toBe(true);
});

test("拉开关会广播一条 op，发的是绝对状态不是『切一下』", () => {
  const lamp = place("furniture_floor_lamp");
  const ops: unknown[] = [];
  const off = on("world_op", ({ op }) => ops.push(op));

  setLampOn(lamp, false);
  off();

  expect(ops).toEqual([{ kind: "lamp_switched", instanceId: lamp, on: false }]);
});

test("设成同一档不发 op，也不发事件（幂等）", () => {
  const lamp = place("furniture_floor_lamp");
  setLampOn(lamp, false);

  const changed = vi.fn();
  const ops = vi.fn();
  const offChanged = on("lamp_changed", changed);
  const offOps = on("world_op", ops);

  setLampOn(lamp, false);
  offChanged();
  offOps();

  expect(changed).not.toHaveBeenCalled();
  expect(ops).not.toHaveBeenCalled();
});

test("没有开关的家具拉不动", () => {
  const chest = place("furniture_storage_chest");

  setLampOn(chest, false);

  expect(isLampOn(chest)).toBe(true);
  expect(snapshotLamps()).toEqual({});
});

// ---- 联机重放 ----

test("重放别人拉的开关不回环（不发 op）", () => {
  const lamp = place("furniture_floor_lamp");
  const ops = vi.fn();
  const off = on("world_op", ops);

  replayLampSwitch(lamp, false);
  off();

  expect(isLampOn(lamp)).toBe(false);
  expect(ops).not.toHaveBeenCalled();
});

test("同一条 op 重放几次都收敛到同一档（op 通道不保证不重复）", () => {
  const lamp = place("furniture_floor_lamp");

  replayLampSwitch(lamp, false);
  replayLampSwitch(lamp, false);
  replayLampSwitch(lamp, false);

  expect(isLampOn(lamp)).toBe(false);
});

// ---- 存档 ----

test("存档只带被动过手的那几盏，往返一致", () => {
  const off1 = place("furniture_floor_lamp");
  const off2 = place("furniture_street_lamp", 1);
  place("furniture_moon_lamp", 0, 1); // 没动过，不该进存档

  setLampOn(off1, false);
  setLampOn(off2, false);
  const saved = snapshotLamps();

  expect(Object.keys(saved).sort()).toEqual([off1, off2].sort());

  restoreLamps(undefined);
  expect(isLampOn(off1)).toBe(true);

  restoreLamps(saved);
  expect(isLampOn(off1)).toBe(false);
  expect(isLampOn(off2)).toBe(false);
});

test("老存档没有这个字段，读出来全是亮的（零迁移）", () => {
  const lamp = place("furniture_floor_lamp");

  restoreLamps(undefined);

  expect(isLampOn(lamp)).toBe(true);
});

test("家具拆了留下的孤儿条目会被清掉，不在存档里越积越多", () => {
  const lamp = place("furniture_floor_lamp");
  setLampOn(lamp, false);

  pruneOrphanLamps(["别的家具"]);

  expect(snapshotLamps()).toEqual({});
});

test("读档整表重灌发一条空 instanceId 的事件（表现层据此全刷）", () => {
  const changed = vi.fn();
  const off = on("lamp_changed", changed);

  restoreLamps({ "某盏灯": { on: false } });
  off();

  expect(changed).toHaveBeenCalledWith({ instanceId: "" });
});
