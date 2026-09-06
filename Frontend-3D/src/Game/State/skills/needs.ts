import {
  FurnitureCapability,
  GiftTier,
  PlacementSurface,
  findItemDefinition,
  findPlaceableItem,
  findResidentTaste,
  footprintCells,
  roomCellToWorld,
} from "core";
import { findDroppedItem, listDroppedItems, removeDroppedItem } from "../droppedItems";
import { getRoom, getWorld } from "../worldRuntime";
import { priorityOf } from "../residentAgent";
import type { Intent } from "../actions";
import type { Skill } from "./types";

/**
 * 饿了找吃、渴了找喝（原 `chooseNextActivity` 的前两支 + `arriveAtErrand` /
 * `finishBusy` 的吃喝半边，2026-09-06 搬出来）。
 *
 * - 饿了 → 找**地上扔着的**能吃的东西（尊重口味表，inedible 不碰）。
 *   和扔掷系统天然打通：扔个煎蛋过去，它会自己颠颠地走过来吃掉。
 * - 渴了 → 找带 WaterSource 能力的家具（现在是橱柜的水槽）凑过去喝。
 *
 * 走过去的路上可以被更要紧的事抢走；吃到一半不行（`lockAfterLastWalk`）。
 * 已经在找吃的就不重复决策。
 */

/** 饱食/水分低于这条线就开始主动找吃找喝 */
const NEED_SEEK_THRESHOLD = 35;
const EAT_SECONDS = 2.6;
const DRINK_SECONDS = 3.2;

export const needsSkill: Skill = {
  id: "needs",
  decide: ({ agent, current }) => {
    if (current?.skillId === "needs") return null;
    if (agent.needs.hunger < NEED_SEEK_THRESHOLD) {
      const intent = seekFood(agent);
      if (intent) return intent;
    }
    if (agent.needs.thirst < NEED_SEEK_THRESHOLD) {
      const intent = seekWater(agent);
      if (intent) return intent;
    }
    return null;
  },
};

type Agent = Parameters<NonNullable<Skill["decide"]>>[0]["agent"];

function seekFood(agent: Agent): Intent | null {
  const taste = findResidentTaste(agent.definitionId);

  let best: { id: string; x: number; z: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entity of listDroppedItems()) {
    const definition = findItemDefinition(entity.stack.itemId);
    // 只吃"食物"；口味表明说不能吃的不碰（生米生肉对它是真的没法吃）
    if (!definition?.food) continue;
    if (taste?.inedible.includes(entity.stack.itemId)) continue;

    const distance = Math.hypot(entity.x - agent.x, entity.z - agent.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { id: entity.id, x: entity.x, z: entity.z };
    }
  }
  if (!best) return null;

  const spot = agent.findSpotNear(best.x, best.z, agent.radius + 0.9);
  if (!spot) return null;
  const droppedId = best.id;
  const food = best;

  return {
    skillId: "needs",
    priority: priorityOf("needs"),
    interruptible: true,
    lockAfterLastWalk: true,
    steps: [
      { verb: "walk_to", x: spot.x, z: spot.z },
      { verb: "stand", seconds: EAT_SECONDS, facing: food, state: "eat", flavor: "eating" },
    ],
    idleAfter: 2 + Math.random() * 2,
    onArrive: (body) => {
      // 路上被玩家捡走了 → 白跑一趟，回去发呆（这本身就挺像猫的）
      const entity = findDroppedItem(droppedId);
      if (!entity) return false;
      if (Math.hypot(entity.x - body.x, entity.z - body.z) > body.radius + 1.2) return false;
      return true;
    },
    onDone: (body) => {
      const entity = removeDroppedItem(droppedId);
      if (!entity) return;
      const itemId = entity.stack.itemId;
      const tier = taste?.loved.includes(itemId)
        ? GiftTier.Loved
        : taste?.disliked.includes(itemId)
          ? GiftTier.Disliked
          : GiftTier.Liked;
      body.feed(itemId, tier);
    },
  };
}

function seekWater(agent: Agent): Intent | null {
  const { placedFurniture } = getWorld();

  for (const placed of placedFurniture) {
    const item = findPlaceableItem(placed.furnitureId);
    if (!item?.placement.capabilities.includes(FurnitureCapability.WaterSource)) continue;
    if (placed.placement.kind !== PlacementSurface.Floor) continue;

    // 家具中心 = 占地格的平均。水槽在台面哪一端注册表没说，先凑到家具边上喝
    const cells = footprintCells(
      placed.placement.gridPosition,
      item.placement.footprint,
      placed.placement.facing,
      item.placement.footprintMask,
    );
    // 家具的格号属于**它自己那个房间**，不是这只生物脚下的那个
    const furnitureRoom = getRoom(placed.placement.roomId) ?? getWorld().room;
    let sumX = 0;
    let sumZ = 0;
    for (const cell of cells) {
      const p = roomCellToWorld(furnitureRoom, cell.x, cell.y);
      sumX += p.x;
      sumZ += p.z;
    }
    const center = { x: sumX / cells.length, z: sumZ / cells.length };

    const spot = agent.findSpotNear(center.x, center.z, agent.radius + 2.2);
    if (!spot) continue;

    return {
      skillId: "needs",
      priority: priorityOf("needs"),
      interruptible: true,
      lockAfterLastWalk: true,
      steps: [
        { verb: "walk_to", x: spot.x, z: spot.z },
        { verb: "stand", seconds: DRINK_SECONDS, facing: center, state: "drink", flavor: "drinking" },
      ],
      idleAfter: 2 + Math.random() * 2,
      onDone: (body) => {
        body.needs.thirst = Math.min(100, body.needs.thirst + 60);
        body.mood = Math.min(100, body.mood + 3);
      },
    };
  }
  return null;
}
