import {
  Facing,
  PlacementSurface,
  findPlaceableItem,
  type BathWater,
  type GridPosition,
  type HeldStack,
  type PlaceableItem,
  type PlacedFurniture,
} from "core";
import { emit } from "../../EventBus";
import { nextObjectId } from "../ids";
import {
  checkPlacementTarget,
  defaultPlacementRoom,
  type LocalPlacementCheck,
  type PlacementTarget,
} from "./placement.js";
import { worldState } from "./state.js";

/**
 * 已放置家具的增删 + 槽位内容（灶眼上的锅、砧板上的菜）。
 * 所有耐久操作的唯一入口——联机时同一批操作发给 Server 校验。
 */

/**
 * 家具实例 id 的 kind 段。发号规则和格式见 State/ids——
 * 结果形如 `local:furniture:furniture_chair#3`。
 *
 * 导出是给 v19 迁移用的：那条迁移要把老 id（`furniture_chair#3`，
 * 只有名字没有 kind）补成新格式，两边必须用同一个字面量，
 * 各写一份的话改一处漏一处，续号会从 1 重来直接撞上老家具。
 */
export const FURNITURE_ID_KIND = "furniture";

function nextInstanceId(furnitureId: string): string {
  return nextObjectId(FURNITURE_ID_KIND, furnitureId);
}

/**
 * 已放置家具的定义。**furnitureId 现在就是物品 id**——合并之后
 * 摆在地上的和背包里躺着的是同一条数据，不再需要两边换算。
 */
export function getDefinition(
  furnitureId: string,
): PlaceableItem | undefined {
  return findPlaceableItem(furnitureId);
}

/**
 * 插入一件已经成形的家具实例。**op 通道的共用底座**：
 * 本地放置和重放别人的放置走的都是它，区别只在上层——
 * 本地那层发 world_op，重放那层不发（防回环，见 EventBus 注释）。
 */
function insertPlacedFurniture(placed: PlacedFurniture): void {
  worldState.placedFurniture = [...worldState.placedFurniture, placed];
  emit("world_changed", { reason: "furniture_placed" });
}

export function placeFurnitureAt(
  furnitureId: string,
  target: PlacementTarget,
): LocalPlacementCheck {
  const check = checkPlacementTarget(furnitureId, target);
  if (!check.ok) return check;

  // 摆进哪一间由落点说了算（期 1：院子也是一间）。不指定时走那条
  // "主屋在场就主屋、收起来就院子"的兜底——见 defaultPlacementRoom
  const roomId = target.roomId ?? defaultPlacementRoom();
  const placed: PlacedFurniture = {
    instanceId: nextInstanceId(furnitureId),
    furnitureId,
    placement:
      target.kind === PlacementSurface.Floor
        ? {
            kind: PlacementSurface.Floor,
            roomId,
            gridPosition: target.gridPosition,
            facing: target.facing,
          }
        : target.kind === PlacementSurface.Surface
          ? {
              kind: PlacementSurface.Surface,
              roomId,
              hostInstanceId: target.hostInstanceId,
              gridPosition: target.gridPosition,
              facing: target.facing,
            }
          : {
            kind: PlacementSurface.Wall,
            roomId,
            wallId: target.wallId,
            gridPosition: target.gridPosition,
            facing: Facing.North,
          },
    state: {},
  };

  insertPlacedFurniture(placed);
  emit("world_op", { op: { kind: "furniture_placed", placed } });
  emit("story_signal", { kind: "furniture_placed", subject: furnitureId });
  return check;
}

/**
 * 重放房里其他人摆的家具。不做占用校验——对方那边已经校过，
 * 极端竞争下摆出重叠由房主的整片刷新收敛（契约里记了这条取舍）。
 */
export function replayPlaceFurniture(placed: PlacedFurniture): void {
  if (
    worldState.placedFurniture.some(
      (item) => item.instanceId === placed.instanceId,
    )
  ) {
    return;
  }
  if (!findPlaceableItem(placed.furnitureId)) return;
  insertPlacedFurniture(placed);
}

/** 地面放置的简写（开局摆设、调试命令用） */
export function placeFurniture(
  furnitureId: string,
  gridPosition: GridPosition,
  facing: Facing,
  /** 摆进哪一间。不给走 defaultPlacementRoom（主屋在场就主屋，收起就院子） */
  roomId?: string,
): LocalPlacementCheck {
  return placeFurnitureAt(furnitureId, {
    kind: PlacementSurface.Floor,
    gridPosition,
    facing,
    ...(roomId ? { roomId } : {}),
  });
}

/**
 * 清空房间里所有家具（测试房间用）。
 * 不把家具换回物品——这是调试操作，不是玩法里的"收拾东西"。
 */
export function clearAllFurniture(): void {
  if (worldState.placedFurniture.length === 0) return;

  worldState.placedFurniture = [];
  emit("world_changed", { reason: "cleared" });
}

function deletePlacedFurniture(instanceId: string): boolean {
  const before = worldState.placedFurniture.length;
  const next = worldState.placedFurniture.filter(
    (item) => item.instanceId !== instanceId,
  );

  if (next.length === before) return false;

  worldState.placedFurniture = next;
  emit("world_changed", { reason: "furniture_removed" });
  return true;
}

export function removeFurniture(instanceId: string): boolean {
  if (!deletePlacedFurniture(instanceId)) return false;
  // 拆箱、收家具都从这里走——联机时别人立刻看到它消失，不等刷新
  emit("world_op", { op: { kind: "furniture_removed", instanceId } });
  return true;
}

/** 重放房里其他人收走的家具。不存在就当已经收走了（op 可能晚到） */
export function replayRemoveFurniture(instanceId: string): void {
  deletePlacedFurniture(instanceId);
}

/**
 * 开局摆设：刚搬进来的第一天。
 *
 * 2026-07-30 定稿：开局**只有两个纸箱**，就摆在玄关门口。
 *
 * 以前铺满了灶台、书架、储物箱和三堆纸箱——那是"别人住过的屋子"。
 * 现在的第一眼是**空房子加两个箱子**：所有东西都在箱子里，
 * 玩家亲手拆开、亲手摆出来，家才是自己布置的。
 * 装什么见 Core 的 Data/loot（工具一箱、家什一箱）。
 *
 * **落地窗前那五格（北墙 x17~21）永远不摆开局家具**——那是整个庭院
 * 构图的画框，新档第一眼不能被自家灶台挡住（玩家自己想堵是他的自由）。
 */
export function seedInitialFurniture(): void {
  if (worldState.placedFurniture.length > 0) return;

  /*
   * 开局摆设按**女巫小屋**的户型摆（2026-08-22，默认的家换了）。
   * 格号是 9×12 那张图的，见 Maps/base/layout.ts 的 generateCottageL1。
   *
   * 原来这里有 2LDK 的一套：两个纸箱在 (2,3)/(4,4)、浴室南端一只 4×3 的
   * 日式浴缸、前庭两把长椅两盏路灯。那些坐标在 9×12 里全不成立
   * （(2,3) 是洗手间的门洞），浴缸塞不进 3×3 的洗手间，前庭随 T12 拆了。
   * 2LDK 从此是 LV3，它的那套摆设等房屋升级那条线接上时跟着它回来。
   */
  const pieces: Array<{
    furnitureId: string;
    gridPosition: GridPosition;
    facing: Facing;
    state?: Record<string, unknown>;
    /** 摆进哪个房间。不写 = 主房间（屋里）。院子是另一个房间，要写 */
    roomId?: string;
  }> = [
    // 搬家纸箱：LDK 西侧，别挡门口
    {
      furnitureId: "cardboard_stack",
      gridPosition: { x: 0, y: 6 },
      facing: Facing.East,
      state: { lootTableId: "moving_tools" },
    },
    {
      furnitureId: "cardboard_box",
      gridPosition: { x: 0, y: 8 },
      facing: Facing.South,
      state: { lootTableId: "moving_furniture" },
    },
    /*
     * 壁炉贴东墙、朝西，正对屋外的烟囱——里外对得上是"这是一栋真房子"
     * 的细节。**fixed**：它是房子的一部分，拿不走（烟囱可不会跟着走）。
     */
    {
      // 行 6 = LDK 分区的中行：HouseBuilder 的烟囱按同一条规则落在东墙
      // 这一段的正上方，里外对得上
      furnitureId: "furniture_fireplace",
      gridPosition: { x: 7, y: 6 },
      facing: Facing.West,
      state: { fixed: true },
    },
    // 床在卧室靠北墙，床头朝北
    {
      furnitureId: "furniture_bed",
      gridPosition: { x: 4, y: 0 },
      facing: Facing.South,
    },
    /*
     * 院子里的井（2026-08-22）：**全游戏的水源**。宠物渴了走过来喝。
     *
     * 以前水源是 L 形橱柜台面的水槽，而橱柜从开局纸箱里换成了 2×1 的
     * 独立灶台（小屋放不下 6×4 的橱柜）——水源因此搬到屋外。森林里的
     * 小屋本来也不该有自来水。
     *
     * 院子格 (27, 25) = 世界 x −13..−11 / z −2..0（格号 = 世界坐标 −
     * 领地西北角 (−40, −27)）：在门前那片院子的西侧，离房子西墙
     * （x = −10）一格，也不挡从大门往北走的那条路。
     * **fixed**：井挖在地里，拿不走。
     */
    {
      furnitureId: "well",
      gridPosition: { x: 27, y: 25 },
      facing: Facing.South,
      state: { fixed: true },
      roomId: worldState.map.outdoorRoomId,
    },
  ];

  worldState.placedFurniture = pieces.map((piece) => ({
    instanceId: nextInstanceId(piece.furnitureId),
    furnitureId: piece.furnitureId,
    placement: {
      kind: PlacementSurface.Floor as const,
      roomId: piece.roomId ?? worldState.room.roomId,
      gridPosition: piece.gridPosition,
      facing: piece.facing,
    },
    state: piece.state ?? {},
  }));

  emit("world_changed", { reason: "seeded" });
}

// ---- 家具槽位内容（灶眼上的锅、砧板上的菜） ----
//
// 存在 PlacedFurnitureState.slotContents 里（Core 早就定义好了），
// 所以放在灶台上的锅连着锅里煮到几分一起进存档，不需要另开一张表。

export function getSlotContent(
  instanceId: string,
  slotId: string,
): HeldStack | null {
  const stack = worldState.placedFurniture.find(
    (item) => item.instanceId === instanceId,
  )?.state.slotContents?.[slotId];
  if (!stack) return null;

  return {
    itemId: stack.itemId,
    quality: stack.state?.quality,
    container: stack.state?.container,
  };
}

/** 写入槽位。null = 清空。返回是否真的写进去了 */
function writeSlotContent(
  instanceId: string,
  slotId: string,
  content: HeldStack | null,
): boolean {
  const placed = worldState.placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  if (!placed) return false;

  const slotContents = { ...(placed.state.slotContents ?? {}) };

  if (content === null) {
    delete slotContents[slotId];
  } else {
    slotContents[slotId] = {
      // 槽位是唯一的，stackId 直接用位置编码，读档后不会撞号
      stackId: `${instanceId}:${slotId}`,
      itemId: content.itemId,
      quantity: 1,
      state: { quality: content.quality, container: content.container },
    };
  }

  placed.state = { ...placed.state, slotContents };
  emit("kitchen_changed", { instanceId, slotId });
  return true;
}

export function setSlotContent(
  instanceId: string,
  slotId: string,
  content: HeldStack | null,
): boolean {
  if (!writeSlotContent(instanceId, slotId, content)) return false;
  // 投料/拿起/起锅/倒掉在数据上都是一次置位，一种 op 全兜住
  emit("world_op", {
    op: { kind: "kitchen_slot_set", instanceId, slotId, content },
  });
  return true;
}

/** 重放房里其他人的厨房操作 */
export function replaySlotContent(
  instanceId: string,
  slotId: string,
  content: HeldStack | null,
): void {
  writeSlotContent(instanceId, slotId, content);
}

// ---- 浴缸的水 ----

function writeBathWater(instanceId: string, water: BathWater | null): boolean {
  const placed = worldState.placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  if (!placed) return false;
  const current = placed.state.water;
  // 幂等：同值再设跳过（op 通道可能重复送达）
  if (
    (current === undefined && water === null) ||
    (current && water && current.level === water.level && current.flow === water.flow)
  ) {
    return true;
  }
  const next = { ...placed.state };
  if (water === null) delete next.water;
  else next.water = water;
  placed.state = next;
  emit("bath_changed", { instanceId });
  return true;
}

/**
 * 浴缸水位**转折点**：开始注水 / 满 / 开始放水 / 空。null = 空缸。
 * 只有转折点发 op（联机各端按同一速率自己推进，中间不逐帧发）。
 */
export function setBathWater(instanceId: string, water: BathWater | null): boolean {
  if (!writeBathWater(instanceId, water)) return false;
  emit("world_op", {
    op: {
      kind: "bath_water_set",
      instanceId,
      level: water?.level ?? 0,
      flow: water?.flow ?? "still",
    },
  });
  return true;
}

/** 重放房里其他人的浴缸操作（level 0 + still = 空缸） */
export function replayBathWater(
  instanceId: string,
  level: number,
  flow: BathWater["flow"],
): void {
  writeBathWater(instanceId, level <= 0 && flow === "still" ? null : { level, flow });
}

/**
 * 每帧推进涨落。**故意不发事件、不发 op**——水位每帧都在动；视图每帧
 * 直接读状态（BathAnimator），联机只同步转折点。到顶/到底由 Systems/bath
 * 判定并走 setBathWater 发转折。
 */
export function advanceBathWater(instanceId: string, level: number): void {
  const placed = worldState.placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  if (!placed?.state.water) return;
  placed.state = { ...placed.state, water: { ...placed.state.water, level } };
}

/**
 * 累加加热秒数。**故意不发事件**——它每帧都在动，
 * 发事件会把整条总线刷爆。进度条由渲染层每帧直接读状态。
 */
export function advanceSlotHeat(
  instanceId: string,
  slotId: string,
  seconds: number,
): void {
  const container = worldState.placedFurniture.find(
    (item) => item.instanceId === instanceId,
  )?.state.slotContents?.[slotId]?.state?.container;
  if (!container) return;

  container.heatSeconds += seconds;
}
