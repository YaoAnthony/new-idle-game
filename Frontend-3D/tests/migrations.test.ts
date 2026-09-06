import { describe, expect, test } from "vitest";
import { Facing, facingToHeading, type GameSave } from "core";

import { migrateSave, migrations } from "../src/Data/Save/migrations";
import { SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";

/**
 * 迁移链。这是整个前端**最不能坏**的一块——它加工的是玩家已经存在磁盘上
 * 的东西，错了不是"功能不对"，是丢档。
 *
 * 头一条用例（版本常数必须等于链尾）不是形式主义：v19 真的漏过一次，
 * 后果不是"少迁一次"，而是**每次读档都把最后几条迁移重跑一遍**——
 * migrateSave 只比较存档里记的版本，不看这个常数。当时差点把带发号方
 * 前缀的 id 套成两层。
 */

/** 一份最小但形状完整的当前版本存档 */
function currentSave(): GameSave {
  return {
    meta: {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      createdAtUtc: "2026-08-01T00:00:00.000Z",
      updatedAtUtc: "2026-08-12T00:00:00.000Z",
    },
    player: {
      name: "旅人",
      avatar: { slots: {}, palettes: {} } as never,
      actionChains: [],
      character: {
        inventory: [],
        needs: { hunger: 80, fatigue: 70 },
        position: { mapId: "base", x: 0, y: 0, heading: 0 },
      },
      discoveredRecipeIds: [],
      actionEntries: [],
    },
    ownWorld: {
      worldId: "world",
      seed: 1,
      house: { houseId: "base", regionId: "forest", styleId: "default" },
      clock: {
        timeZoneId: "Asia/Shanghai",
        timePolicyId: "default",
        lastObservedUtc: "2026-08-12T00:00:00.000Z",
        lastObservedSource: "device",
        lastObservedWorldDayId: "2026-08-12",
      },
      weather: {
        seed: 2,
        lastResolvedWorldDayId: "2026-08-12",
        schedule: [],
        overrides: [],
      },
      maps: {},
      pets: {},
      placedFurniture: [],
      droppedItems: [],
      inventories: {},
      progression: { unlockedFeatureIds: [], events: {} },
    },
  } as GameSave;
}

/** 同一份存档，但记成某个老版本（用来驱动迁移链） */
function saveAtVersion(version: number, patch: (save: GameSave) => void = () => {}): GameSave {
  const save = currentSave();
  save.meta.saveSchemaVersion = version;
  patch(save);
  return save;
}

// ---- 链本身的形状 ----

test("SAVE_SCHEMA_VERSION 必须等于迁移链里最大的 to", () => {
  const highest = Math.max(...migrations.map((migration) => migration.to));

  expect(SAVE_SCHEMA_VERSION).toBe(highest);
});

test("链上的版本号严格递增、不重复、不跳号", () => {
  const targets = migrations.map((migration) => migration.to);

  expect(targets).toEqual([...targets].sort((a, b) => a - b));
  expect(new Set(targets).size).toBe(targets.length);

  // 从 2 开始逐个 +1（v1 是初始版本，没有迁移）
  expect(targets[0]).toBe(2);
  for (let i = 1; i < targets.length; i += 1) {
    expect(targets[i]).toBe(targets[i - 1] + 1);
  }
});

test("每条迁移都真的是个函数", () => {
  for (const migration of migrations) {
    expect(typeof migration.migrate, `v${migration.to}`).toBe("function");
  }
});

// ---- migrateSave 的调度 ----

test("已经是最新版：不跑任何迁移", () => {
  const result = migrateSave(currentSave());

  expect(result.ok).toBe(true);
  expect(result.ok && result.migrated).toBe(false);
  expect(result.ok && result.save.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
});

test("比客户端更新的存档：拒绝打开，并告诉玩家去更新", () => {
  const future = currentSave();
  future.meta.saveSchemaVersion = SAVE_SCHEMA_VERSION + 1;

  const result = migrateSave(future);
  expect(result.ok).toBe(false);
  // 说人话，不是抛异常也不是静默降级——降级会把新字段悄悄抹掉
  expect(result.ok === false && result.message).toMatch(/更新/);
});

test("从最老的版本一路升到最新，不抛异常", () => {
  const result = migrateSave(saveAtVersion(1));

  expect(result.ok).toBe(true);
  expect(result.ok && result.migrated).toBe(true);
  expect(result.ok && result.save.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
});

test("没记版本号的远古存档当 0 处理，整条链都要跑", () => {
  const ancient = currentSave();
  // 故意造一份缺字段的坏档（tsconfig 没开 strict，这里编译得过）
  ancient.meta.saveSchemaVersion = undefined as unknown as number;

  const result = migrateSave(ancient);
  expect(result.ok).toBe(true);
  expect(result.ok && result.save.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
});

test("从每一个中间版本起步都能升到最新", () => {
  // 一条迁移假设了前一条没造出来的字段时，只测"从 v1 开始"是发现不了的
  for (let version = 1; version <= SAVE_SCHEMA_VERSION; version += 1) {
    const result = migrateSave(saveAtVersion(version));

    expect(result.ok, `从 v${version} 起步失败了`).toBe(true);
    expect(result.ok && result.save.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
  }
});

test("迁移过一遍之后再迁一遍不会有变化（可重入）", () => {
  const first = migrateSave(saveAtVersion(1));
  expect(first.ok).toBe(true);
  if (!first.ok) return;

  const snapshot = JSON.stringify(first.save);
  const second = migrateSave(first.save);

  expect(second.ok && second.migrated).toBe(false);
  expect(JSON.stringify(second.ok && second.save)).toBe(snapshot);
});

// ---- 几条有真实逻辑的迁移 ----

describe("v19：四向朝向换成连续弧度 + id 补发号方前缀", () => {
  test("玩家和宠物的 facing 都换成 heading", () => {
    const save = saveAtVersion(18, (draft) => {
      // @ts-expect-error 老形状：有 facing 没有 heading
      draft.player.character.position = { mapId: "home", x: 1, y: 2, facing: Facing.East };
      draft.ownWorld.pets = {
        // @ts-expect-error 同上，老形状没有 heading
        "pet-1": { definitionId: "moss_wisp", position: { x: 0, y: 0, facing: Facing.West } },
      };
    });

    const result = migrateSave(save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const position = result.save.player.character.position as Record<string, unknown>;
    expect(position.heading).toBe(facingToHeading(Facing.East));
    expect(position.facing).toBeUndefined();

    // v36 会把 `pet-1` 迁成 `resident-1`（键和 residentId 一起）
    const resident = result.save.ownWorld.pets["resident-1"].position as unknown as Record<string, unknown>;
    expect(resident.heading).toBe(facingToHeading(Facing.West));
  });

  test("已经是新形状的位置不被二次加工", () => {
    const save = saveAtVersion(18, (draft) => {
      draft.player.character.position = { mapId: "home", x: 1, y: 2, heading: 0.75 };
    });

    const result = migrateSave(save);
    expect(result.ok && result.save.player.character.position?.heading).toBe(0.75);
  });

  test("家具和掉落物的 id 补成三段式，重放一次也不会套两层", () => {
    const save = saveAtVersion(18, (draft) => {
      draft.ownWorld.placedFurniture = [
        {
          instanceId: "furniture_chair#3",
          furnitureId: "furniture_chair",
          placement: { kind: "floor", roomId: "living", gridPosition: { x: 1, y: 1 }, facing: "north" },
          state: {},
        } as never,
      ];
      draft.ownWorld.droppedItems = [
        {
          id: "drop:rice#8",
          roomId: "living",
          position: { x: 0, y: 0, z: 0 },
          stack: { stackId: "s", itemId: "rice", quantity: 1 },
        } as never,
      ];
    });

    const result = migrateSave(save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const furnitureId = result.save.ownWorld.placedFurniture[0].instanceId;
    const dropId = result.save.ownWorld.droppedItems?.[0].id ?? "";

    // 目标形状 <issuer>:<kind>:<name>#<n>——家具原来只有名字，两段都要补
    expect(furnitureId.split(":").length).toBe(3);
    // 掉落物原来已经带 kind 段，只补 issuer
    expect(dropId.split(":").length).toBe(3);
    // 关键：绝不能出现 local:local:
    expect(furnitureId).not.toMatch(/local:local:/);
    expect(dropId).not.toMatch(/local:local:/);
  });
});

describe("v21：快捷栏并入背包，stackId 重新编码", () => {
  function migrateInventory(stackIds: string[]) {
    const save = saveAtVersion(20, (draft) => {
      draft.player.character.inventory = stackIds.map((stackId, index) => ({
        stackId,
        itemId: "wood",
        quantity: index + 1,
      }));
    });

    const result = migrateSave(save);
    expect(result.ok).toBe(true);
    return result.ok ? result.save.player.character.inventory : [];
  }

  test("hotbar:N 落到前 8 格，backpack:N 顺延到它后面", () => {
    const inventory = migrateInventory(["hotbar:0", "hotbar:7", "backpack:0", "backpack:23"]);
    const slots = inventory.map((stack) => stack.stackId);

    expect(slots).toContain("slot:0");
    expect(slots).toContain("slot:7");
    expect(slots).toContain("slot:8");
    expect(slots).toContain("slot:31");
  });

  test("同号的 hotbar 和 backpack 不会撞进同一格——那是一次静默的物品丢失", () => {
    const inventory = migrateInventory(["hotbar:3", "backpack:3"]);

    expect(inventory).toHaveLength(2);
    expect(new Set(inventory.map((stack) => stack.stackId)).size).toBe(2);
  });

  test("认不出前缀的记录直接丢弃，而不是猜一个位置塞进去", () => {
    const inventory = migrateInventory(["hotbar:0", "凭空捏造:1", "backpack:999", "hotbar:-1"]);

    expect(inventory.map((stack) => stack.stackId)).toEqual(["slot:0"]);
  });
});

describe("v24：起始图 home 退役，改名 base", () => {
  test("地图键和玩家位置一起改名", () => {
    const save = saveAtVersion(23, (draft) => {
      draft.ownWorld.maps = { home: { mapId: "home", rooms: {} } };
      draft.player.character.position = { mapId: "home", x: 0, y: 0, heading: 0 };
    });

    const result = migrateSave(save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.save.ownWorld.maps.home).toBeUndefined();
    expect(result.save.ownWorld.maps.base?.mapId).toBe("base");
    expect(result.save.player.character.position?.mapId).toBe("base");
  });

  test("已经有 base 的存档不被覆盖", () => {
    const save = saveAtVersion(23, (draft) => {
      draft.ownWorld.maps = {
        home: { mapId: "home", rooms: {} },
        base: { mapId: "base", rooms: { living: { roomId: "living" } as never } },
      };
    });

    const result = migrateSave(save);
    expect(result.ok && Object.keys(result.save.ownWorld.maps.base.rooms)).toEqual(["living"]);
  });
});

describe("v25：庭院补长椅和路灯", () => {
  test("老档补上四件庭院家具", () => {
    const result = migrateSave(saveAtVersion(24));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const added = result.save.ownWorld.placedFurniture;
    expect(added.filter((p) => p.furnitureId === "furniture_garden_bench")).toHaveLength(2);
    expect(added.filter((p) => p.furnitureId === "furniture_street_lamp")).toHaveLength(2);
    // 发号方前缀是 migration:，和 local: / 玩家 id 都不会撞号
    expect(added.every((p) => p.instanceId.startsWith("migration:"))).toBe(true);
  });

  test("已经有的存档不重复补（否则每次读档都多四件）", () => {
    const save = saveAtVersion(24, (draft) => {
      draft.ownWorld.placedFurniture = [
        {
          instanceId: "local:furniture:furniture_garden_bench#1",
          furnitureId: "furniture_garden_bench",
          placement: { kind: "floor", roomId: "yard", gridPosition: { x: 0, y: 0 }, facing: "south" },
          state: {},
        } as never,
      ];
    });

    const result = migrateSave(save);
    expect(result.ok && result.save.ownWorld.placedFurniture).toHaveLength(1);
  });
});

describe("v36：活物实例 id pet-* → resident-<definitionId>，四处一起迁", () => {
  test("pets 的键和字段、信号计数、报纸买主、工地认领人全部换新格式", () => {
    const save = saveAtVersion(35, (draft) => {
      draft.ownWorld.pets = {
        // @ts-expect-error 老形状：字段还叫 petId
        "pet-slime": { petId: "pet-slime", definitionId: "slime_neighbor", roomId: "yard", position: { x: 1, y: 2, heading: 0 }, affectionStage: "stranger", growth: 0, needs: {} },
        // @ts-expect-error 同上；表里没有的短名按 resident-<原样> 处理
        "pet-stone_golem": { petId: "pet-stone_golem", definitionId: "stone_golem", roomId: "yard", position: { x: 3, y: 4, heading: 0 }, affectionStage: "stranger", growth: 0, needs: {} },
      };
      draft.ownWorld.progression = {
        ...draft.ownWorld.progression,
        signalCounts: {
          "pet_spawned|pet-slime": 1,
          "pet_spawned": 2,
          "resident_moved_in|slime_neighbor": 1,
          // 已经是新键的（同一份档里混着）要和老键合并计数
          "resident_spawned|resident-slime_neighbor": 1,
        },
      };
      draft.ownWorld.dayFacts = [
        { worldDayId: "2026-09-01", actions: [], goldIn: 0, goldOut: 0, headlines: [{ kind: "shop_sold", subject: "furniture_chair|pet-fox" }, { kind: "theft" }] },
      ];
      draft.ownWorld.buildings = [
        { instanceId: "local:building:gold_jar#1", buildingId: "gold_jar", x: 0, z: 0, elevation: 0, facing: Facing.North, levelId: "l1", construction: { targetLevelId: "l1", workerId: "pet-stone_golem", startUtc: "2026-09-01T00:00:00.000Z" } },
      ];
    });

    const result = migrateSave(save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const world = result.save.ownWorld;

    expect(Object.keys(world.pets).sort()).toEqual(["resident-slime_neighbor", "resident-stone_golem"]);
    expect(world.pets["resident-slime_neighbor"].residentId).toBe("resident-slime_neighbor");
    expect((world.pets["resident-slime_neighbor"] as unknown as Record<string, unknown>).petId).toBeUndefined();
    expect(world.pets["resident-slime_neighbor"].position).toEqual({ x: 1, y: 2, heading: 0 });

    expect(world.progression.signalCounts).toEqual({
      "resident_spawned|resident-slime_neighbor": 2,
      "resident_spawned": 2,
      "resident_moved_in|slime_neighbor": 1,
    });
    expect(world.dayFacts?.[0].headlines).toEqual([{ kind: "shop_sold", subject: "furniture_chair|resident-fox_neighbor" }, { kind: "theft" }]);
    expect(world.buildings?.[0].construction?.workerId).toBe("resident-stone_golem");
  });

  test("重跑一次不套两层、映射表外的短名只换前缀", () => {
    const save = saveAtVersion(35, (draft) => {
      draft.ownWorld.pets = {
        // @ts-expect-error 老形状：字段还叫 petId
        "pet-otter": { petId: "pet-otter", definitionId: "otter_trader", roomId: "yard", position: { x: 0, y: 0, heading: 0 }, affectionStage: "stranger", growth: 0, needs: {} },
      };
    });
    const first = migrateSave(save);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.keys(first.save.ownWorld.pets)).toEqual(["resident-otter_trader"]);

    const again = migrateSave(first.save);
    expect(again.ok && Object.keys(again.save.ownWorld.pets)).toEqual(["resident-otter_trader"]);
  });
});


describe("v46：个人剧情线——小镇补解锁、已搬来的三位补阶段", () => {
  test("老档：小镇通着、咕噜的灯做完了 → town_travel + arc_slime=lamp_lit + arc_fox=delivered_to_town", () => {
    const save = saveAtVersion(45, (draft) => {
      draft.ownWorld.pets = {
        "resident-slime_neighbor": { residentId: "resident-slime_neighbor", definitionId: "slime_neighbor" } as never,
        "resident-fox_neighbor": { residentId: "resident-fox_neighbor", definitionId: "fox_neighbor" } as never,
      };
      draft.ownWorld.favors = { slime_wants_lamp: { residentId: "slime_neighbor", offeredDayId: "2026-08-10", expiresDayId: "2026-08-17", state: "done" } };
    });
    const result = migrateSave(save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const progression = result.save.ownWorld.progression;
    expect(progression.unlockedFeatureIds).toContain("town_travel");
    expect(progression.events.arc_slime?.currentStageId).toBe("lamp_lit");
    expect(progression.events.arc_fox?.currentStageId).toBe("delivered_to_town");
    expect(progression.events.arc_spirit).toBeUndefined();
    expect(progression.events.arc_slime?.firstTriggeredWorldDayId).toBe("2026-08-12");
  });

  test("没人搬来的老档只补小镇，不立任何线", () => {
    const result = migrateSave(saveAtVersion(45));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.ownWorld.progression.unlockedFeatureIds).toEqual(["town_travel"]);
    expect(Object.keys(result.save.ownWorld.progression.events)).toEqual([]);
  });
});

describe("v47/v48：主屋户型重写——洗手间没了、石台 4×4、台阶格上的家具收回背包", () => {
  test("老档 living 带着洗手间的墙和门 → 墙门清空、石台 4×4、那扇门的状态删掉、台阶格上的椅子进背包", () => {
    const save = saveAtVersion(46, (draft) => {
      draft.ownWorld.maps = {
        base: {
          mapId: "base",
          rooms: {
            living: {
              roomId: "living", floorGrid: { width: 9, height: 12 }, walls: {}, floor: 0,
              interiorWalls: [{ from: { x: 3, y: 0 }, axis: "y", length: 3 }],
              interiorDoorways: [{ doorwayId: "doorway-bath", cell: { x: 1, y: 3 }, axis: "x", span: 1, doorId: "room_door_single" }],
              zones: [{ zoneId: "bath", kind: "bath", rect: { x: 0, y: 0, width: 3, height: 3 } }],
            } as never,
          },
        },
      };
      draft.ownWorld.doors = [{ refId: "doorway-bath", definitionId: "room_door_single", locked: false }, { refId: "south-door", definitionId: "front_door", locked: false }];
      draft.ownWorld.placedFurniture = [
        { instanceId: "c1", furnitureId: "furniture_chair", placement: { kind: "floor", roomId: "living", gridPosition: { x: 1, y: 3 }, facing: "north" } } as never,
        { instanceId: "c2", furnitureId: "furniture_chair", placement: { kind: "floor", roomId: "living", gridPosition: { x: 5, y: 8 }, facing: "north" } } as never,
      ];
    });
    const result = migrateSave(save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const living = result.save.ownWorld.maps.base.rooms.living;
    expect(living.interiorWalls).toEqual([]);
    expect(living.interiorDoorways).toEqual([]);
    expect(living.zones?.some((zone) => zone.kind === "bath")).toBe(false);
    expect(living.platforms?.[0].rect).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    expect(result.save.ownWorld.doors?.map((door) => door.refId)).toEqual(["south-door"]);
    expect(result.save.ownWorld.placedFurniture.map((placed) => placed.instanceId)).toEqual(["c2"]);
    expect(result.save.player.character.inventory.some((stack) => stack.itemId === "furniture_chair")).toBe(true);
  });
});
