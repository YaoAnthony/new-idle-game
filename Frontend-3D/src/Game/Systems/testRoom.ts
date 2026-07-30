import {
  Facing,
  FloorLayer,
  PlacementSurface,
  furnitureDefinitions,
  type FurnitureDefinition,
} from "core";
import { setHeld } from "../State/heldItem";
import { addItem, restoreInventory } from "../State/inventory";
import {
  clearAllFurniture,
  getWorld,
  placeFurnitureAt,
} from "../State/worldRuntime";

/**
 * 测试房间：把每一件家具各摆一件、互不重叠地铺开，好逐个功能过一遍。
 *
 * **坐标一个都不硬编码**——挨着格子试放，合法性交给 Core 的
 * checkPlacement 判断（门窗开口、占用、压到角色都由它拒绝）。
 * 所以以后加家具、改房间尺寸、换屋子风格，这个函数都不用动。
 */

/**
 * 不摆进测试房间的东西。
 * 纸箱是"刚搬进来还没收拾"的过场道具，不是家具——测试时只会挡路。
 */
const EXCLUDED_FURNITURE_IDS = new Set(["cardboard_box", "cardboard_stack"]);

/** 测试要用到的库存。每样都给够，免得测到一半材料不够 */
const TEST_INVENTORY: Array<[string, number]> = [
  // 厨具与盛器
  ["wok", 1],
  ["tall_pot", 1],
  ["plate", 2],
  // 食材（这个世界的）
  ["egg", 6],
  ["tomato", 6],
  ["rice", 6],
  ["green_pepper", 4],
  ["pork", 4],
  ["century_egg", 4],
  ["baby_cabbage", 4],
  // 现实世界带来的稀罕物
  ["cheese", 4],
  // 工作台材料
  ["wood", 40],
  ["plank", 20],
  ["stick", 20],
  ["sugarcane", 20],
  ["leather", 10],
  ["graphite", 5],
  ["iron_ingot", 10],
  ["root", 5],
  ["paper", 20],
];

export type TestRoomReport = {
  placed: string[];
  /** 放不下的家具。房间被填满或位置全被门窗占掉时出现 */
  skipped: string[];
  /** 摆完之后还走得通的格子数 */
  walkableCells: number;
  /**
   * 连通区域数。**必须是 1**——大于 1 说明有家具把某块地圈死了，
   * 角色走不进去。这是"摆得开"的硬判据，比肉眼看画面可靠。
   */
  walkableRegions: number;
};

/**
 * 数一数空地被切成了几块。
 *
 * 摆得密不密看画面很难说清，但"角色还能不能走到每个角落"是可以算的：
 * 从任意空格泛洪，能一次覆盖所有空格就说明没围死。
 */
function analyseWalkability(): Pick<
  TestRoomReport,
  "walkableCells" | "walkableRegions"
> {
  const { room, occupancy } = getWorld();
  const { width, height } = room.floorGrid;
  const key = (x: number, y: number): string => `${x},${y}`;

  const open = new Set<string>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!occupancy.blocked.has(key(x, y))) open.add(key(x, y));
    }
  }

  const unvisited = new Set(open);
  let regions = 0;

  while (unvisited.size > 0) {
    regions += 1;
    const start = unvisited.values().next().value as string;
    const queue = [start];
    unvisited.delete(start);

    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!.split(",").map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const next = key(cx + dx, cy + dy);
        if (!unvisited.has(next)) continue;
        unvisited.delete(next);
        queue.push(next);
      }
    }
  }

  return { walkableCells: open.size, walkableRegions: regions };
}

/**
 * 行式排布：从左上角开始一行一行放，每件之间留一格空隙。
 *
 * 留空隙不只是为了好看——空格连成的通道保证角色永远走得出来，
 * 密铺会把人围死在家具中间。
 */
function layoutFloorFurniture(
  definitions: FurnitureDefinition[],
  report: TestRoomReport,
): void {
  const { floorGrid } = getWorld().room;

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const definition of definitions) {
    const { width: w, height: h } = definition.footprint;
    let placed = false;

    while (!placed && cursorY + h <= floorGrid.height) {
      if (cursorX + w > floorGrid.width) {
        // 换行：空一行当通道
        cursorX = 0;
        cursorY += rowHeight + 1;
        rowHeight = 0;
        continue;
      }

      const check = placeFurnitureAt(definition.id, {
        kind: PlacementSurface.Floor,
        gridPosition: { x: cursorX, y: cursorY },
        facing: Facing.North,
      });

      if (check.ok) {
        placed = true;
        report.placed.push(definition.id);
        cursorX += w + 1;
        rowHeight = Math.max(rowHeight, h);
      } else {
        // 这一格不行（门口、压到角色、被地毯外的东西占了）就往右挪一格
        cursorX += 1;
      }
    }

    if (!placed) report.skipped.push(definition.id);
  }
}

/**
 * 墙饰单独排：墙面有自己的坐标系，而且门窗开口会挡掉一片位置，
 * 所以同样是逐格试放而不是算位置。
 */
function layoutWallFurniture(
  definitions: FurnitureDefinition[],
  report: TestRoomReport,
): void {
  const walls = Object.values(getWorld().room.walls);

  for (const definition of definitions) {
    let placed = false;

    for (const wall of walls) {
      if (placed) break;

      for (let y = 0; y + definition.footprint.height <= wall.grid.height; y += 1) {
        if (placed) break;

        for (let x = 0; x + definition.footprint.width <= wall.grid.width; x += 1) {
          const check = placeFurnitureAt(definition.id, {
            kind: PlacementSurface.Wall,
            wallId: wall.wallId,
            gridPosition: { x, y },
          });

          if (check.ok) {
            placed = true;
            report.placed.push(definition.id);
            break;
          }
        }
      }
    }

    if (!placed) report.skipped.push(definition.id);
  }
}

/**
 * 清空房间 → 每件家具各摆一件 → 备齐测试库存。
 *
 * 摆放顺序有讲究：
 * 1. 地毯类（Covering）**先铺**——它和桌椅不在同一层，可以被压在下面，
 *    先铺才铺得开，后铺就只能挤在空地上了
 * 2. 大件在前小件在后——大件挑不到位置的风险高，先给它选
 * 3. 墙饰最后，它和地面互不干扰
 */
export function setupTestRoom(): TestRoomReport {
  clearAllFurniture();

  const report: TestRoomReport = {
    placed: [],
    skipped: [],
    walkableCells: 0,
    walkableRegions: 0,
  };

  const usable = furnitureDefinitions.filter(
    (definition) => !EXCLUDED_FURNITURE_IDS.has(definition.id),
  );

  const byAreaDesc = (a: FurnitureDefinition, b: FurnitureDefinition): number =>
    b.footprint.width * b.footprint.height -
    a.footprint.width * a.footprint.height;

  const floor = usable.filter(
    (definition) => definition.placementSurface === PlacementSurface.Floor,
  );

  layoutFloorFurniture(
    floor
      .filter((definition) => definition.floorLayer === FloorLayer.Covering)
      .sort(byAreaDesc),
    report,
  );
  layoutFloorFurniture(
    floor
      .filter((definition) => definition.floorLayer !== FloorLayer.Covering)
      .sort(byAreaDesc),
    report,
  );
  layoutWallFurniture(
    usable
      .filter(
        (definition) => definition.placementSurface === PlacementSurface.Wall,
      )
      .sort(byAreaDesc),
    report,
  );

  // 先清空再发放：反复跑这条指令应该得到同一个房间，
  // 而不是每次都在原来的基础上再堆一份（跑三次就 3 口锅、88 根木头）
  restoreInventory([]);
  setHeld(null);
  for (const [itemId, quantity] of TEST_INVENTORY) addItem(itemId, quantity);

  return { ...report, ...analyseWalkability() };
}
