import { beforeEach, expect, test } from "vitest";
import {
  DEFAULT_MAP_ID,
  Facing,
  PlacementSurface,
  consignTuning,
  findItemDefinition,
  findPlaceableItem,
  footprintCells,
  roomCellToWorld,
  worldToRoomCell,
} from "core";

import { restoreBuildings } from "../src/Game/State/buildings";
import { debugAdvanceHours } from "../src/Game/State/clock";
import {
  depositGoldTo,
  getGold,
  getGoldCapacity,
  restoreBaseGold,
  takeGoldUpTo,
} from "../src/Game/State/gold";
import { getCount, replaceCounts } from "../src/Game/State/inventory";
import { restorePets } from "../src/Game/State/petsRuntime";
import { addToStorage, clearStorage, getStorage } from "../src/Game/State/storage";
import {
  CONSIGN_BOX_SEED,
  clearAllFurniture,
  placeFurniture,
  seedInitialFurniture,
} from "../src/Game/State/world/furniture";
import { findRoute, invalidateNavGrid } from "../src/Game/Systems/navigation";
import { checkPlacementTarget } from "../src/Game/State/world/placement";
import {
  getCurrentMap,
  getCurrentMapId,
  getRoom,
  getWorld,
} from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { pickupFurniture } from "../src/Game/Systems/placement";
import {
  boxCapacity,
  boxHint,
  boxInventoryIdFor,
  boxPendingRevenue,
  boxSlotsOf,
  canConsign,
  claimBoxRevenue,
  consignBoxIds,
  consignPrice,
  previewConsignRevenue,
  settleBox,
  startConsigning,
} from "../src/Game/Systems/consigning";

/**
 * 寄售箱的接线。**算法在 Core 的用例里钉**（`Core/tests/consign.test.ts`：
 * 八折、取整、每件都成交）。这里钉前端这一层：放进去隔夜就卖、没居民也卖、
 * 钱进箱子自己的抽屉、只认前 N 格、抽屉有钱时搬不走。
 */

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restorePets({}); // 一个居民都没有——寄售箱不该在乎
  restoreBaseGold(0);
  takeGoldUpTo(getGold());
  replaceCounts({});
  clearAllFurniture();
});

/** 院子里摆一只寄售台（4×2：锚点在左上格，往 +x/+z 铺），返回实例 id */
function placeBox(): string {
  const yardId = getCurrentMap().outdoorRoomId;
  const yard = getRoom(yardId)!;
  // 房子东边那片空地（房子 x −10..−1 / z 5..17，领地东沿 x=5）
  const check = placeFurniture(
    "furniture_consign_box",
    worldToRoomCell(yard, 0.5, 8.5),
    Facing.North,
    yardId,
  );
  expect(check.ok, `摆寄售箱失败：${JSON.stringify(check)}`).toBe(true);
  const placed = getWorld().placedFurniture.find(
    (item) => item.furnitureId === "furniture_consign_box",
  )!;
  clearStorage(boxInventoryIdFor(placed.instanceId));
  return placed.instanceId;
}

const valueOf = (itemId: string): number => findItemDefinition(itemId)?.value ?? 0;

test("寄售箱_能寄售的判据和上架一样_有摆放能力的才算家具", () => {
  expect(canConsign("furniture_chair")).toBe(true);
  expect(canConsign("furniture_consign_box")).toBe(true); // 箱子也能寄售箱子
  expect(canConsign("ingredient_tomato")).toBe(false);
  expect(canConsign("gold")).toBe(false);
});

test("寄售价_八折向下取整_面板上的标价就是明早到手的数", () => {
  expect(consignTuning.priceRate).toBe(0.8);
  expect(consignPrice("furniture_table")).toBe(
    Math.floor(valueOf("furniture_table") * 0.8),
  );
  // 100 的东西小店卖 100，这里只给 80——用户定的那句话
  expect(Math.floor(100 * consignTuning.priceRate)).toBe(80);
});

test("寄售箱_放进去隔夜就卖掉_没有居民也卖_钱进箱子自己的抽屉", () => {
  const stop = startConsigning();
  const box = placeBox();
  addToStorage(boxInventoryIdFor(box), "furniture_table", 1);
  addToStorage(boxInventoryIdFor(box), "furniture_chair", 2);

  const forecast = previewConsignRevenue(box);
  expect(forecast).toBe(consignPrice("furniture_table") + consignPrice("furniture_chair") * 2);
  expect(boxPendingRevenue(box)).toBe(0); // 还没翻篇，抽屉是空的

  // 一次翻篇就成交——没有小店那个"建好当天不结"的缓冲
  debugAdvanceHours(24);

  expect(boxSlotsOf(box).filter(Boolean).length).toBe(0); // 箱子空了
  expect(boxPendingRevenue(box)).toBe(forecast); // 预告和实际是同一个数

  // 领：金库装得下多少进多少，剩下的留在箱子里（金币抽屉的规则）
  const room = getGoldCapacity() - getGold();
  const claimed = claimBoxRevenue(box);
  expect(claimed).toBe(Math.min(forecast, room));
  expect(getGold()).toBe(claimed);
  expect(boxPendingRevenue(box)).toBe(forecast - claimed);

  stop();
});

test("寄售箱_只认前N格_多出来的不卖也不丢", () => {
  const box = placeBox();
  const capacity = boxCapacity();
  expect(capacity).toBe(consignTuning.slots);

  // 比格子多一件（都是不同的家具，各占一格）
  const items = [
    "furniture_table",
    "furniture_chair",
    "furniture_stool",
    "furniture_cushion",
    "furniture_bookshelf",
  ];
  expect(items.length).toBe(capacity + 1);
  for (const itemId of items) addToStorage(boxInventoryIdFor(box), itemId, 1);

  const sold = settleBox(box);
  expect(sold.length).toBe(capacity);
  expect(boxPendingRevenue(box)).toBe(
    items.slice(0, capacity).reduce((sum, id) => sum + consignPrice(id), 0),
  );
  // 第 5 件还躺在库存第 5 格，没卖也没蒸发
  expect(getStorage(boxInventoryIdFor(box))[capacity]?.itemId).toBe(items[capacity]);
});

test("寄售箱_抽屉里有钱时搬不走_领掉才能收回背包", () => {
  const box = placeBox();
  addToStorage(boxInventoryIdFor(box), "furniture_table", 1); // 9 块，钱匣装得下
  settleBox(box);
  expect(boxPendingRevenue(box)).toBeGreaterThan(0);

  expect(pickupFurniture(box)).toMatchObject({ ok: false, reason: "not_empty" });

  const pending = boxPendingRevenue(box);
  expect(pending).toBeLessThanOrEqual(getGoldCapacity()); // 一张桌子的货款钱匣装得下
  expect(claimBoxRevenue(box)).toBe(pending);
  expect(boxPendingRevenue(box)).toBe(0);

  const picked = pickupFurniture(box);
  expect(picked.ok).toBe(true);
  expect(getCount("furniture_consign_box")).toBe(1);
});

test("寄售箱_金库满着_按钮说金库满_领到0一分不丢", () => {
  const box = placeBox();
  addToStorage(boxInventoryIdFor(box), "furniture_table", 1);
  settleBox(box);
  const pending = boxPendingRevenue(box);

  depositGoldTo(getGoldCapacity());
  expect(boxHint(box)).toBe("vault_full");
  expect(claimBoxRevenue(box)).toBe(0);
  expect(boxPendingRevenue(box)).toBe(pending);

  takeGoldUpTo(getGold());
  expect(boxHint(box)).toBe("claimable");
});

test("寄售箱_空箱翻篇什么也不发生_箱子拆了就不再结算", () => {
  const box = placeBox();
  expect(consignBoxIds()).toEqual([box]);
  expect(settleBox(box)).toEqual([]);
  expect(boxPendingRevenue(box)).toBe(0);

  clearAllFurniture();
  expect(consignBoxIds()).toEqual([]);
});

test("开局_门口旁边就有一只寄售箱_不压门洞_不挡从门口往北的路", () => {
  clearAllFurniture();
  seedInitialFurniture();
  invalidateNavGrid();

  const yardId = getCurrentMap().outdoorRoomId;
  const box = getWorld().placedFurniture.find(
    (p) => p.furnitureId === "furniture_consign_box",
  );
  expect(box, "开局没摆寄售箱").toBeTruthy();
  expect(box!.placement.roomId).toBe(yardId);
  expect(box!.placement.gridPosition).toEqual(CONSIGN_BOX_SEED.gridPosition);
  expect(box!.state.fixed, "寄售箱是普通家具，拿得走").toBeUndefined();
  expect(consignBoxIds()).toEqual([box!.instanceId]); // 开局结算认得它

  /*
   * 大门在小屋世界**北**面：门洞占 x −4..−2、z=5 那条线，屋外是 z<5。
   * 台子是 4×2：每一格都要在屋外、贴着墙外那两排、全在门洞西侧——
   * "门口旁边"，不是院子中间，也不是压着门。
   */
  const yard = getRoom(yardId)!;
  const footprint = findPlaceableItem("furniture_consign_box")!.placement.footprint;
  expect(footprint).toEqual({ width: 4, height: 2 }); // 大件（用户定：起码 2×4）
  const cells = footprintCells(box!.placement.gridPosition, footprint, box!.placement.facing);
  expect(cells).toHaveLength(8);
  for (const cell of cells) {
    const at = roomCellToWorld(yard, cell.x + 0.5, cell.y + 0.5);
    expect(at.z, `格 ${cell.x},${cell.y} 进屋了`).toBeLessThan(5);
    expect(at.z, `格 ${cell.x},${cell.y} 离墙太远`).toBeGreaterThan(2);
    expect(at.x + 0.5, `格 ${cell.x},${cell.y} 压到门洞`).toBeLessThanOrEqual(-4);
    expect(at.x, `格 ${cell.x},${cell.y} 跑到墙角外面去了`).toBeGreaterThan(-10);
  }

  // 这个位置是真的摆得下（占用/领地/挡路那套校验），不是写死了一个数
  clearAllFurniture();
  const check = checkPlacementTarget(CONSIGN_BOX_SEED.furnitureId, {
    kind: PlacementSurface.Floor,
    gridPosition: CONSIGN_BOX_SEED.gridPosition,
    facing: CONSIGN_BOX_SEED.facing,
    roomId: yardId,
  });
  expect(check.ok, JSON.stringify(check)).toBe(true);
  seedInitialFurniture();
  invalidateNavGrid();

  // 从门口正中往北走得通
  const route = findRoute({ x: -3, z: 4.5 }, { x: -3, z: -4 });
  expect(route, "寄售台把大门前的路堵了").not.toBeNull();
});

test("寄售台_只能摆在院子里_屋里摆不下", () => {
  const living = getWorld().room.roomId;
  const check = placeFurniture("furniture_consign_box", { x: 3, y: 3 }, Facing.North, living);
  expect(check).toMatchObject({ ok: false, reason: "outdoor_only" });
});
