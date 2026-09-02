import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, worldToRoomCell } from "core";

import { restoreBuildings } from "../src/Game/State/buildings";
import {
  depositGoldTo,
  getGold,
  getGoldCapacity,
  restoreBaseGold,
  takeGoldUpTo,
} from "../src/Game/State/gold";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMap, getCurrentMapId, getRoom, getWorld } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import {
  claimRevenue,
  pendingRevenueOf,
  revenueHintOf,
  stashRevenue,
  type RevenueHolder,
} from "../src/Game/Systems/goldDrawer";

/**
 * 金币抽屉的接线（规则本身在 Core 的 goldDrawer.test 里钉）。
 * 这里钉两件事：建筑和家具**两种实例**都能当抽屉，而且走的是同一条规则；
 * 提示三态和领取用的是同一把尺子。
 */

const SHOP: RevenueHolder = { kind: "building", instanceId: "shop-1" };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([
    {
      instanceId: "shop-1",
      buildingId: "furniture_shop",
      x: 4.5,
      z: 12.5,
      elevation: 0,
      facing: Facing.North,
      levelId: "l1",
    },
  ]);
  restoreBaseGold(0);
  takeGoldUpTo(getGold()); // 金库清空，容量才是真的空位
  clearAllFurniture();
});

/** 院子里摆一把椅子，拿它当"产金币的家具" */
function placeChair(): RevenueHolder {
  const yardId = getCurrentMap().outdoorRoomId;
  const yard = getRoom(yardId)!;
  const check = placeFurniture(
    "furniture_chair",
    worldToRoomCell(yard, 3.5, 16.5),
    Facing.North,
    yardId,
  );
  expect(check.ok, `摆椅子失败：${JSON.stringify(check)}`).toBe(true);
  const placed = getWorld().placedFurniture.find(
    (item) => item.furnitureId === "furniture_chair",
  )!;
  return { kind: "furniture", instanceId: placed.instanceId };
}

test("抽屉_产出不看金库_装得下多少领多少_剩下的留在建筑里", () => {
  const room = getGoldCapacity() - getGold();
  expect(room).toBeLessThan(120); // 钱匣 10 枚，120 肯定装不下——正是要测的情形

  stashRevenue(SHOP, 120);
  expect(pendingRevenueOf(SHOP)).toBe(120); // 进抽屉时一分不砍

  expect(claimRevenue(SHOP)).toBe(room); // 领到的 = 金库空位
  expect(getGold()).toBe(room);
  expect(pendingRevenueOf(SHOP)).toBe(120 - room); // 其余还在建筑里
});

test("抽屉_家具也能当抽屉_走同一条规则", () => {
  const chair = placeChair();
  const room = getGoldCapacity() - getGold();

  stashRevenue(chair, 30);
  expect(pendingRevenueOf(chair)).toBe(30);

  expect(claimRevenue(chair)).toBe(Math.min(30, room));
  expect(pendingRevenueOf(chair)).toBe(30 - Math.min(30, room));

  // 抽屉记在家具实例状态上，跟着 placedFurniture 进存档
  const placed = getWorld().placedFurniture.find((item) => item.instanceId === chair.instanceId);
  expect(placed?.state.pendingRevenue).toBe(30 - Math.min(30, room));
});

test("抽屉_腾出空位再来_能把剩下的领走", () => {
  stashRevenue(SHOP, 120);
  claimRevenue(SHOP); // 第一次：领满金库
  const left = pendingRevenueOf(SHOP);
  expect(left).toBeGreaterThan(0);

  takeGoldUpTo(getGold()); // 把钱花掉，金库又空了
  const second = claimRevenue(SHOP);
  expect(second).toBe(Math.min(left, getGoldCapacity()));
  expect(pendingRevenueOf(SHOP)).toBe(left - second);
});

test("抽屉_金库满着_一分领不到也一分不丢", () => {
  stashRevenue(SHOP, 12);
  depositGoldTo(getGoldCapacity());
  expect(getGoldCapacity() - getGold()).toBe(0);

  expect(claimRevenue(SHOP)).toBe(0);
  expect(pendingRevenueOf(SHOP)).toBe(12);
});

test("提示_三态和领取用同一把尺子", () => {
  expect(revenueHintOf(SHOP)).toBe("empty");

  // 8 < 钱匣的 10：空金库一次领得光，最后才能走到"空"
  stashRevenue(SHOP, 8);
  expect(revenueHintOf(SHOP)).toBe("claimable");

  depositGoldTo(getGoldCapacity()); // 金库塞满
  expect(revenueHintOf(SHOP)).toBe("vault_full"); // 有钱但领不动：说"金库满"，不说"领取"
  expect(claimRevenue(SHOP)).toBe(0); // 提示说不能领，按下去也确实什么都没有

  takeGoldUpTo(getGold());
  expect(revenueHintOf(SHOP)).toBe("claimable");
  expect(claimRevenue(SHOP)).toBe(8);
  expect(revenueHintOf(SHOP)).toBe("empty");
});

test("抽屉_家具领空之后_存档里不留一个pendingRevenue0", () => {
  const chair = placeChair();
  stashRevenue(chair, 5);
  expect(claimRevenue(chair)).toBe(5);

  const placed = getWorld().placedFurniture.find((item) => item.instanceId === chair.instanceId);
  expect(placed?.state.pendingRevenue).toBeUndefined();
});
