import {
  Facing,
  PlacementSurface,
  WallOpeningKind,
  findItemDefinition,
  findPlaceableItem,
  generateHouse,
  roomStyleDefinitions,
  type GameSave,
  type InventoryStack,
} from "core";
import {
  BACKPACK_SIZE,
  HOTBAR_SIZE,
} from "../../Game/State/inventory";
import { SAVE_SCHEMA_VERSION } from "./types";

/**
 * 在槽位式背包的序列化数组里找一个空格，返回 "backpack:N" / "hotbar:N"。
 * 背包优先（快捷栏留给玩家的常用摆放），全满返回 null——
 * 32 格全满的概率极低，真发生也宁可少还一件，不能写坏格式带崩整份存档。
 */
function firstFreeSlot(inventory: InventoryStack[]): string | null {
  const used = new Set(inventory.map((stack) => stack.stackId));
  for (let i = 0; i < BACKPACK_SIZE; i += 1) {
    if (!used.has(`backpack:${i}`)) return `backpack:${i}`;
  }
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    if (!used.has(`hotbar:${i}`)) return `hotbar:${i}`;
  }
  return null;
}

/**
 * 迁移链。加载时从存档记录的版本一路升到当前版本。
 *
 * 规则（AGENTS.md 的硬性要求）：**每次改 Core 类型都要问一次"需要迁移吗"**。
 * 加可选字段通常不需要——给默认值即可；改结构或改字段含义必须补一条。
 */
type Migration = {
  /** 迁移完成后存档达到的版本 */
  to: number;
  migrate: (save: GameSave) => GameSave;
};

/**
 * v9 之前的存档里，`placedFurniture.furnitureId` 记的还是**旧家具 id**。
 * v6/v7/v8 要按它查定义（算占地、折算回背包），所以得先过一遍改名表。
 *
 * 这些老迁移原来调的是 `findItemByFurnitureId`——那个函数查的是**当前**注册表里
 * 的 `placeableFurnitureId` 字段。它随注册表变，正是迁移不该有的性质：
 * 字段删掉的那天，v7 就会认不出老档里的家具，几十件东西静默蒸发。
 * 换成查冻结的 `LEGACY_FURNITURE_ID`，行为和写它们那天完全一样，且从此不会再变。
 */
function legacyItem(furnitureId: string) {
  return findItemDefinition(LEGACY_FURNITURE_ID[furnitureId] ?? furnitureId);
}

export const migrations: Migration[] = [
  // v2（2026-07-29 镜头改为锁定屋内）：墙高 3→4、北墙窗洞 2×1→2×2。
  // 房间几何是实存的（不在加载时重新生成），所以旧存档要在这里补齐。
  // 只增墙面、窗洞原位变高一格，已放置的家具不会失效——
  // 墙饰的合法位置只增不减（墙变高），窗洞扩大处本来就禁止放墙饰（blocks_opening），
  // 唯一例外是恰好挂在窗洞新增那一行上的墙饰，开发期存档手动处理即可。
  {
    to: 2,
    migrate: (save) => {
      for (const map of Object.values(save.ownWorld.maps ?? {})) {
        for (const room of Object.values(map.rooms ?? {})) {
          for (const wall of Object.values(room.walls ?? {})) {
            if (wall.grid.height < 4) wall.grid = { ...wall.grid, height: 4 };
            for (const opening of wall.openings ?? []) {
              if (
                opening.kind === WallOpeningKind.Window &&
                opening.size.height < 2
              ) {
                opening.size = { ...opening.size, height: 2 };
              }
            }
          }
        }
      }
      return save;
    },
  },

  // v3（2026-07-29 宠物换成元素凝聚体）：物种从写实动物改成原创生物，
  // definitionId 全变了。老存档里的宠物按屋子风格一一对应迁过去，
  // 好感度和位置原样保留——玩家养出来的关系不能因为换皮丢掉。
  {
    to: 3,
    migrate: (save) => {
      const renamed: Record<string, string> = {
        chinchilla: "moss_wisp",
        otter: "foam_wisp",
        hedgehog: "ember_wisp",
      };

      for (const pet of Object.values(save.ownWorld.pets ?? {})) {
        const next = renamed[pet.definitionId];
        if (next) pet.definitionId = next;
      }
      return save;
    },
  },

  // v4（2026-07-29 行动清单）：行动从"填表即开始"改成"先保存、后启动"，
  // PlayerSave 多了 actionEntries。老存档补个空数组即可，没有可迁移的历史数据。
  {
    to: 4,
    migrate: (save) => {
      save.player.actionEntries ??= [];
      return save;
    },
  },

  // v5（2026-07-29 厨房系统）：烹饪从"面板里选配方"改成"真的在锅里做"。
  //
  // 1. `cooking_pot` 拆成 `wok`（开局自带的炒锅）和 `tall_pot`（工作台合成），
  //    老存档里的锅一律当炒锅——第一天流程要用的就是它。
  // 2. 锅的 stackLimit 变成 1（容器内容挂在单个 stack 上），
  //    所以合过堆的老存档要拆开；多出来的直接丢，因为一口就够用。
  // 3. 手上那一格是新加的，老存档没有 → 空手。
  {
    to: 5,
    migrate: (save) => {
      let keptWok = false;

      save.player.character.inventory = save.player.character.inventory
        .map((stack) => {
          if (stack.itemId !== "cooking_pot") return stack;
          return { ...stack, itemId: "wok", quantity: 1 };
        })
        .filter((stack) => {
          if (stack.itemId !== "wok") return true;
          if (keptWok) return false;
          keptWok = true;
          return true;
        });

      save.player.character.heldItem ??= null;
      return save;
    },
  },

  // v6（2026-07-30 落地窗）：北墙右侧的 2×2 小窗换成 5×3 贴地落地窗。
  // 房间几何是实存的（联机一致性要求，不在加载时重新生成），所以老存档
  // 要在这里动墙。两件事：
  // 1. 右侧小窗删掉、加落地窗（位置和 roomGeometry.northWindows 一致）
  // 2. 北墙上与新窗洞重叠的墙饰（比如挂在旧窗上的窗帘）撤下退回背包——
  //    不能凭空消失，那是玩家的东西
  {
    to: 6,
    migrate: (save) => {
      for (const map of Object.values(save.ownWorld.maps ?? {})) {
        for (const room of Object.values(map.rooms ?? {})) {
          const north = room.walls?.north;
          if (!north) continue;
          if (north.openings.some((o) => o.openingId === "north-floor-window")) {
            continue;
          }

          const style = north.openings.find(
            (o) => o.kind === WallOpeningKind.Window,
          )?.visualId;

          // 右半墙的窗都算"旧右窗"（老存档只有一扇，条件宽松点更稳）
          north.openings = north.openings.filter(
            (o) =>
              !(
                o.kind === WallOpeningKind.Window &&
                o.gridPosition.x >= Math.floor(north.grid.width / 2)
              ),
          );

          north.openings.push({
            openingId: "north-floor-window",
            kind: WallOpeningKind.Window,
            gridPosition: { x: north.grid.width - 7, y: 0 },
            size: { width: 5, height: 3 },
            visualId: style ?? "window_round_wood",
          });

          // 新窗洞的矩形（墙面网格坐标）
          const zone = {
            minX: north.grid.width - 7,
            maxX: north.grid.width - 3,
            minY: 0,
            maxY: 2,
          };

          save.ownWorld.placedFurniture = (
            save.ownWorld.placedFurniture ?? []
          ).filter((placed) => {
            if (placed.placement.kind !== PlacementSurface.Wall) return true;
            if (placed.placement.wallId !== "north") return true;

            const definition = findPlaceableItem(
              LEGACY_FURNITURE_ID[placed.furnitureId] ?? placed.furnitureId,
            )?.placement;
            const w = definition?.footprint.width ?? 1;
            const h = definition?.footprint.height ?? 1;
            const { x, y } = placed.placement.gridPosition;
            const overlaps =
              x <= zone.maxX && x + w - 1 >= zone.minX &&
              y <= zone.maxY && y + h - 1 >= zone.minY;
            if (!overlaps) return true;

            // 撤下的墙饰退回背包。**stackId 必须是 "backpack:N" 槽位编码**——
            // restoreInventory 靠它定位格子，写别的格式会被当坏记录静默丢弃，
            // 东西就真的凭空消失了（审查抓出来的教训）。
            const item = legacyItem(placed.furnitureId);
            if (item) {
              const slot = firstFreeSlot(save.player.character.inventory);
              if (slot) {
                save.player.character.inventory.push({
                  stackId: slot,
                  itemId: item.id,
                  quantity: 1,
                });
              }
            }
            return false;
          });
        }
      }
      return save;
    },
  },

  // v7（2026-07-30 房子扩建成 2LDK）：单间 16×12 换成 24×16 的两房一厅。
  // 房间几何整个重生成（迁移是唯一被允许"重算几何"的地方）；
  // 所有已放置家具打包回背包——旧坐标在新户型里毫无意义，与其算一套
  // "尽量原位"的映射不如让玩家重新布置，搬新家本身就是玩法（定案）。
  // 同类家具先合堆再入槽（受 stackLimit），槽位不够的极端情况宁可少还。
  {
    to: 7,
    migrate: (save) => {
      const style =
        roomStyleDefinitions.find(
          (item) => item.id === save.ownWorld.house?.styleId,
        ) ?? roomStyleDefinitions[0];

      for (const map of Object.values(save.ownWorld.maps ?? {})) {
        for (const roomId of Object.keys(map.rooms ?? {})) {
          map.rooms[roomId] = generateHouse({ roomId, style });
        }
      }

      // 家具 → 物品数量统计。**家具不是孤立的物**：储物箱里存着东西
      // （ownWorld.inventories）、灶台槽位上架着锅、锅里还有食材
      // （slotContents 及其 state.container）。只打包外层家具的话，
      // 读档时 pruneOrphanStorages 会把箱内物品当孤儿库存整体删掉，
      // 锅和菜则直接蒸发——全部要清点进背包（审查抓出来的两条丢货路径）。
      const counts = new Map<string, number>();
      const collect = (itemId: string, quantity: number) => {
        counts.set(itemId, (counts.get(itemId) ?? 0) + quantity);
      };

      for (const placed of save.ownWorld.placedFurniture ?? []) {
        const item = legacyItem(placed.furnitureId);
        if (item) collect(item.id, 1);

        // 槽位内容：锅本身 + 锅里的食材（生食材照收，做到一半的过程丢弃）
        for (const stack of Object.values(placed.state?.slotContents ?? {})) {
          if (!stack) continue;
          collect(stack.itemId, stack.quantity);
          for (const inner of stack.state?.container?.items ?? []) {
            collect(inner.itemId, inner.quantity);
          }
        }

        // 储物箱内容：把对应库存整个倒出来，再删掉库存条目本身
        const storageId = placed.state?.storageInventoryId;
        if (storageId && save.ownWorld.inventories?.[storageId]) {
          for (const stack of save.ownWorld.inventories[storageId].stacks) {
            collect(stack.itemId, stack.quantity);
          }
          delete save.ownWorld.inventories[storageId];
        }
      }
      /**
       * 清空后重放灶台：它是房子自带设施、没有物品映射（不能被拾起），
       * 打包流程会让它静默消失——而读档路径不跑 seedInitialFurniture，
       * 不重放的话老档迁移后厨房永久废掉。位置和新档的 seed 一致
       * （开放厨房区，北墙西段小窗旁）。
       */
      const firstRoomId = Object.keys(
        Object.values(save.ownWorld.maps ?? {})[0]?.rooms ?? {},
      )[0];
      save.ownWorld.placedFurniture = firstRoomId
        ? [
            {
              instanceId: "stove#v7",
              furnitureId: "stove",
              placement: {
                kind: PlacementSurface.Floor,
                roomId: firstRoomId,
                gridPosition: { x: 8, y: 0 },
                facing: Facing.North,
              },
              state: {},
            },
          ]
        : [];

      for (const [itemId, total] of counts) {
        const limit = findItemDefinition(itemId)?.stackLimit ?? 1;
        let remaining = total;
        while (remaining > 0) {
          const slot = firstFreeSlot(save.player.character.inventory);
          if (!slot) break;
          const take = Math.min(limit, remaining);
          save.player.character.inventory.push({
            stackId: slot,
            itemId,
            quantity: take,
          });
          remaining -= take;
        }
      }

      // 宠物的旧坐标可能落进新内墙里，全部归到客厅中央附近
      let offset = 0;
      for (const pet of Object.values(save.ownWorld.pets ?? {})) {
        pet.position = { ...pet.position, x: 2 + offset, y: -3 };
        offset += 1;
      }

      return save;
    },
  },

  // v8（2026-07-30 房子加深 + 开放式厨房）：
  // 1. 24×16 → 24×20。卡住的从来不是宽度是进深——L 形厨房的台面+中岛
  //    加两条走道就吃掉 4 格，原来 LDK 只有 8 格深，客厅只剩 2.5 米。
  // 2. 灶台换成 L 形整体橱柜。老存档里地上的灶台和背包里的灶台物品
  //    都折算成橱柜——玩家不该因为我们换了家具就丢东西。
  // 几何又要重生成，所以家具照旧打包回背包（连同箱内与槽位内容）。
  {
    to: 8,
    migrate: (save) => {
      const style =
        roomStyleDefinitions.find(
          (item) => item.id === save.ownWorld.house?.styleId,
        ) ?? roomStyleDefinitions[0];

      for (const map of Object.values(save.ownWorld.maps ?? {})) {
        for (const roomId of Object.keys(map.rooms ?? {})) {
          map.rooms[roomId] = generateHouse({ roomId, style });
        }
      }

      const counts = new Map<string, number>();
      const collect = (itemId: string, quantity: number) => {
        counts.set(itemId, (counts.get(itemId) ?? 0) + quantity);
      };

      for (const placed of save.ownWorld.placedFurniture ?? []) {
        // 地上的灶台折算成橱柜（旧灶台没有物品映射，不折算就人间蒸发）
        if (placed.furnitureId === "stove") {
          collect("furniture_kitchen_counter", 1);
        } else {
          const item = legacyItem(placed.furnitureId);
          if (item) collect(item.id, 1);
        }

        for (const stack of Object.values(placed.state?.slotContents ?? {})) {
          if (!stack) continue;
          collect(stack.itemId, stack.quantity);
          for (const inner of stack.state?.container?.items ?? []) {
            collect(inner.itemId, inner.quantity);
          }
        }

        const storageId = placed.state?.storageInventoryId;
        if (storageId && save.ownWorld.inventories?.[storageId]) {
          for (const stack of save.ownWorld.inventories[storageId].stacks) {
            collect(stack.itemId, stack.quantity);
          }
          delete save.ownWorld.inventories[storageId];
        }
      }
      save.ownWorld.placedFurniture = [];

      // 背包里的旧灶台物品同样折算
      save.player.character.inventory = save.player.character.inventory.map(
        (stack) =>
          stack.itemId === "furniture_stove"
            ? { ...stack, itemId: "furniture_kitchen_counter" }
            : stack,
      );

      for (const [itemId, total] of counts) {
        const limit = findItemDefinition(itemId)?.stackLimit ?? 1;
        let remaining = total;
        while (remaining > 0) {
          const slot = firstFreeSlot(save.player.character.inventory);
          if (!slot) break;
          const take = Math.min(limit, remaining);
          save.player.character.inventory.push({
            stackId: slot,
            itemId,
            quantity: take,
          });
          remaining -= take;
        }
      }

      // 宠物和角色的旧坐标可能落进新内墙里，归到客厅
      for (const pet of Object.values(save.ownWorld.pets ?? {})) {
        pet.position = { ...pet.position, x: 2, y: -3 };
      }

      return save;
    },
  },

  // v9（2026-07-31 物品与家具统一）：家具并进物品注册表，
  // 同一件东西不再有两个 id。存档里 placedFurniture.furnitureId 记的是
  // **家具**那一侧的 id（floor_lamp），统一后要换成**物品**那一侧
  // （furniture_floor_lamp）。
  //
  // 这条不能漏：restoreWorld 会**丢弃引用了未知家具的记录**，
  // 所以不迁移的话老存档不会报错，而是屋里的家具静默消失。
  {
    to: 9,
    migrate: (save) => {
      for (const placed of save.ownWorld.placedFurniture ?? []) {
        placed.furnitureId =
          LEGACY_FURNITURE_ID[placed.furnitureId] ?? placed.furnitureId;
      }
      return save;
    },
  },
];

/**
 * 旧家具 id → 统一后的物品 id。
 *
 * **写死在这里，不从注册表推导。** 迁移表必须冻结在写它的那一刻——
 * 从当前注册表推导的话，将来谁再改一次 id，这条旧迁移的行为会跟着变，
 * 那是迁移最忌讳的事（同一份老存档，今天和明天迁出来的结果不一样）。
 *
 * 没列出来的（stove / cardboard_box / cardboard_stack / bedroll）是
 * id 本来就没变的，落到 `?? placed.furnitureId` 那条分支。
 */
const LEGACY_FURNITURE_ID: Record<string, string> = {
  kitchen_counter_l: "furniture_kitchen_counter",
  ordinary_workbench: "furniture_workbench",
  wooden_table: "furniture_table",
  wooden_chair: "furniture_chair",
  round_rug: "furniture_rug",
  dumbbell: "furniture_dumbbell",
  bookshelf: "furniture_bookshelf",
  storage_chest: "furniture_storage_chest",
  wooden_bed: "furniture_bed",
  round_stool: "furniture_stool",
  floor_cushion: "furniture_cushion",
  fireplace: "furniture_fireplace",
  floor_lamp: "furniture_floor_lamp",
  potted_plant: "furniture_potted_plant",
  long_rug: "furniture_long_rug",
  tatami_mat: "furniture_tatami_mat",
  door_mat: "furniture_door_mat",
  fabric_sofa: "furniture_fabric_sofa",
  wardrobe: "furniture_wardrobe",
  study_desk: "furniture_study_desk",
  coffee_table: "furniture_coffee_table",
  easel: "furniture_easel",
  picture_frame: "furniture_picture_frame",
  wall_clock: "furniture_wall_clock",
  curtain: "furniture_curtain",
};

export type MigrationResult =
  | { ok: true; save: GameSave; migrated: boolean }
  | { ok: false; message: string };

export function migrateSave(save: GameSave): MigrationResult {
  const from = save.meta?.saveSchemaVersion ?? 0;

  if (from > SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      message: `存档版本 ${from} 比当前客户端（${SAVE_SCHEMA_VERSION}）更新，请更新游戏后再打开。`,
    };
  }

  let current = save;
  let migrated = false;

  for (const migration of migrations) {
    if (migration.to <= from) continue;
    current = migration.migrate(current);
    current.meta.saveSchemaVersion = migration.to;
    migrated = true;
  }

  return { ok: true, save: current, migrated };
}
