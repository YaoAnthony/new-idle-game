import { beforeEach, expect, test } from "vitest";
import { CreatureRole, DEFAULT_MAP_ID, findItemDefinition } from "core";

import { hydrateGameSave, serializeGameSave } from "../src/Data/Save/serialize";
import { clearAllFurniture, seedInitialFurniture } from "../src/Game/State/world/furniture";
import {
  getResidents,
  restoreResidents,
  seedInitialCreatures,
} from "../src/Game/State/residentsRuntime";
import { getCurrentMap, getCurrentMapId, getWorld } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 石傀儡（期 A：到场 → 装头 → 苏醒）。
 *
 * 钉的是**三条只有接上运行时才成立**的事：
 * - 开场他缺着头、坐在院子里，而且**自己醒不过来**（`dormant`）；
 * - 装上头就醒，而且不用再戳一下；
 * - 存档往返两个方向都不丢（装过的还是醒的、没装的还是瘫的）。
 *
 * 外观（模型、动画）不在这儿测。
 */

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreResidents({});
  clearAllFurniture();
});

/** 开局的那尊。seed 之后取唯一一只 worker */
function seedGolem() {
  seedInitialCreatures();
  return getResidents().find((resident) => resident.role === CreatureRole.Worker)!;
}

test("开场：石傀儡坐在院子里、没有头、而且叫不醒", () => {
  const golem = seedGolem();

  expect(golem, "开局没摆石傀儡").toBeTruthy();
  expect(golem.definitionId).toBe("stone_golem");
  expect(golem.attachedParts.has("head"), "开场就带着头就没谜题了").toBe(false);
  expect(golem.dormant).toBe(true);
  expect(golem.state).toBe("sleeping");

  /*
   * **叫不醒**是这条的重点：`wakeUp()` 是公开方法，别处（比如日常对话
   * 的"睡着就先叫醒"那句）会调它。缺零件时它必须是个空操作，否则玩家
   * 还没找到头，傀儡自己站起来了。
   */
  golem.wakeUp();
  expect(golem.state).toBe("sleeping");
});

test("装上头就自己醒过来，不用再戳一下", () => {
  const golem = seedGolem();

  golem.attachPart("head");

  expect(golem.dormant).toBe(false);
  expect(golem.state).toBe("idle");
});

test("干活的不吃不喝：饿到底也不会去找吃的", () => {
  const golem = seedGolem();
  golem.attachPart("head");

  // Arrange：饿到不能再饿、渴到不能再渴
  golem.needs.hunger = 0;
  golem.needs.thirst = 0;
  golem.state = "idle";
  golem.idleTimer = 0;

  // Act：推一帧，让它选下一件事做
  golem.tick(0.1, { x: 0, z: 0 });

  // Assert：绝不会进"去吃"或"去喝"。这两支对石头不成立
  expect(["eat", "drink"]).not.toContain(golem.state);
});

test("头摆在院子里，是件捡得起来的家具，不挡路", () => {
  seedInitialFurniture();

  const placed = getWorld().placedFurniture.find(
    (item) => item.furnitureId === "golem_head",
  );
  expect(placed, "开局没摆石傀儡的头").toBeTruthy();
  expect(placed!.placement.roomId).toBe(getCurrentMap().outdoorRoomId);

  const definition = findItemDefinition("golem_head")!;
  // 靠 golemPart 认，不靠物品 id——装配交互查的就是这个字段
  expect(definition.golemPart).toBe("head");
  expect(definition.placement?.interactHint?.action).toBe("pickup");
  // 一颗石头脑袋不该挡住走路
  expect(definition.placement?.blocksMovement).toBe(false);
});

test("存档往返：装过头的还是醒的，没装的还是瘫的", () => {
  const golem = seedGolem();
  golem.attachPart("head");

  hydrateGameSave(serializeGameSave());
  const awake = getResidents().find((resident) => resident.role === CreatureRole.Worker)!;
  expect(awake.attachedParts.has("head")).toBe(true);
  expect(awake.dormant).toBe(false);

  awake.attachedParts.delete("head");
  awake.fallAsleep();

  hydrateGameSave(serializeGameSave());
  const dormant = getResidents().find((resident) => resident.role === CreatureRole.Worker)!;
  expect(dormant.attachedParts.has("head")).toBe(false);
  expect(dormant.dormant).toBe(true);
  expect(dormant.state).toBe("sleeping");
});

test("老存档没有 attachedParts 字段：宠物按零件齐全算，不能集体瘫在地上", () => {
  restoreResidents({
    "resident-shushu": {
      residentId: "resident-shushu",
      definitionId: "shushu",
      roomId: "living",
      position: { mapId: DEFAULT_MAP_ID, x: 0, y: 0, heading: 0 },
      affectionStage: "stranger",
      growth: 0,
      needs: { hunger: 80, thirst: 80 },
      // 注意：没有 attachedParts
    } as never,
  });

  const cat = getResidents()[0];
  expect(cat.dormant, "宠物没有零件这回事，永远不该休眠").toBe(false);
});
