import {
  Facing,
  PlacementSurface,
  WallOpeningKind,
  facingToHeading,
  findItemDefinition,
  findPlaceableItem,
  generateHouse,
  roomStyleDefinitions,
  type GameSave,
  type InventoryStack,
} from "core";
import { INVENTORY_SIZE } from "../../Game/State/inventory";
import { FURNITURE_ID_KIND } from "../../Game/State/worldRuntime";
import { LOCAL_PLAYER_ID } from "../../Game/State/participants";
import { SAVE_SCHEMA_VERSION } from "./types";

/**
 * v19 给老 id 补的发号方前缀。老档里的东西全产自本机，所以是 local。
 * 和 State/ids 的 issuer 默认值同源——那边换成真实 playerId 是**握手之后**
 * 的事，只影响此后新发的号，不回头改老档。
 */
const LOCAL_ID_PREFIX = LOCAL_PLAYER_ID;

/**
 * v21 之前的两容器格数。**写死在这里而不是 import**——
 * 迁移一旦发布就冻结了：它加工的是那个年代的存档，此后改格数
 * （比如快捷栏 8 变 10）不该回头改变老迁移算出来的槽位。
 */
const LEGACY_HOTBAR_SIZE = 8;
const LEGACY_BACKPACK_SIZE = 24;

/**
 * 在槽位式背包的序列化数组里找一个空格，返回 "backpack:N" / "hotbar:N"。
 * 背包优先（快捷栏留给玩家的常用摆放），全满返回 null——
 * 32 格全满的概率极低，真发生也宁可少还一件，不能写坏格式带崩整份存档。
 *
 * **只给 v21 之前的迁移用**，产出的是那时的编码；v21 会把它们一起换算成
 * `slot:N`。老迁移就该说老话，不然中间那几步自相矛盾。
 */
function firstFreeSlot(inventory: InventoryStack[]): string | null {
  const used = new Set(inventory.map((stack) => stack.stackId));
  for (let i = 0; i < LEGACY_BACKPACK_SIZE; i += 1) {
    if (!used.has(`backpack:${i}`)) return `backpack:${i}`;
  }
  for (let i = 0; i < LEGACY_HOTBAR_SIZE; i += 1) {
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

  // v10（2026-08-01 掉落物）：WorldSave 多了 droppedItems。
  //
  // 加可选字段本来不需要迁移条目——读出来是 undefined，restoreDroppedItems
  // 当空数组处理就完了。补这一条是为了**存档版本号别停在 9**：
  // 版本号不动的话，v10 的客户端存出来的档在旧客户端眼里也是 9，
  // 旧客户端会照读不误、把 droppedItems 整个丢掉，然后自动存盘写回去——
  // 玩家扔在地上的东西就这么没了，而且全程不报错。
  {
    to: 10,
    migrate: (save) => {
      save.ownWorld.droppedItems ??= [];
      return save;
    },
  },

  // v11（2026-08-01 消息系统）：WorldSave 多了 chatLog。
  // 和 v10 同理——补这一条是为了版本号跟着动，否则旧客户端会认得这份档、
  // 把 chatLog 整个丢掉再存回去。
  {
    to: 11,
    migrate: (save) => {
      save.ownWorld.chatLog ??= [];
      return save;
    },
  },

  // v12（2026-08-01 participants）：正在进行的行动从 WorldSave 搬到 PlayerSave。
  //
  // 这条**必须迁移**，和 v10/v11 那种"补个空数组顺便推版本号"不是一回事：
  // 字段换了家，不搬的话老存档里正做着的行动读档后直接消失——
  // 一条按绝对 UTC 推进、离线也会完成的行动就这么无声没了。
  //
  // 搬家的理由见 PlayerSave.activeActionProcess 的注释：世界级单数字段
  // 在联机时会让多个玩家共用一个"正在进行"的槽。
  //
  // 位置（PlayerSave.character.position）是纯新增可选字段，不在这里补——
  // 读出来 undefined 就回出生点，和老存档的行为一模一样。
  {
    to: 12,
    migrate: (save) => {
      const world = save.ownWorld as typeof save.ownWorld & {
        activeActionProcess?: NonNullable<typeof save.player.activeActionProcess>;
      };

      // ??= 而不是 =：万一两边都有（客户端版本来回横跳过），以玩家侧为准，
      // 那边是新家，不该被老字段覆盖回去
      if (world.activeActionProcess) {
        save.player.activeActionProcess ??= world.activeActionProcess;
        delete world.activeActionProcess;
      }
      return save;
    },
  },

  // v13（2026-08-02 事件系统）：progression 多了 signalCounts。
  // 和 v10/v11 同理——补这一条是为了**版本号跟着动**：不动的话旧客户端
  // 会认得这份档、把 signalCounts 整个丢掉再存回去，玩家攒的进度
  // （"已经做完两个任务"）就这么归零，而且全程不报错。
  {
    to: 13,
    migrate: (save) => {
      save.ownWorld.progression.signalCounts ??= {};
      return save;
    },
  },

  // v14（2026-08-02 舒舒）：PetSave 多了 sleeping。数据本身不用动
  //（可选字段，undefined = 醒着），推版本号还是那个老理由：旧客户端读到
  // 新档会把字段丢掉再存回去。丢的只是"这一觉"，但规矩不因小而破。
  {
    to: 14,
    migrate: (save) => save,
  },

  // v15（2026-08-02 宠物档案）：growth / needs 从占位（恒 0 / 恒空表）
  // 变成真数据，新增 mood。老档读出来按默认补（饿 80 / 渴 80 / 心情 70），
  // 不在这里写死默认值——那是 PetAgent.fromSave 的事，写两处迟早漂。
  // 推版本号防旧客户端把攒下的成长值抹回 0 再存回去。
  {
    to: 15,
    migrate: (save) => save,
  },

  // v16（2026-08-03 捏脸）：AvatarConfig 长出脸部四槽（face/eyes/mouth/nose）
  // 和整套颜色键。老档一律补成"经典脸"——和 CharacterView 一直画的那张
  // 一样，玩家读档不会觉得自己被换了头。
  //
  // 值**冻结在这里，不从注册表推导**（同 LEGACY_FURNITURE_ID 那条铁律）。
  // 旧档里的零件 id 是 serialize 老版本写死的 *_default 系列，注册表里
  // 没有这些 id，按下表映射到真零件；colors 只补缺的键，玩家真捏过的
  // 颜色（虽然老版本捏不了，但规矩要立对）不覆盖。
  {
    to: 16,
    migrate: (save) => {
      const legacyPartId: Record<string, string> = {
        hair_default: "hair_bob",
        top_default: "top_dress",
        bottom_default: "bottom_plain",
        shoes_default: "shoes_plain",
      };
      const avatar = save.player.avatar as Record<string, unknown>;
      for (const slotKey of ["hairId", "topId", "bottomId", "shoesId"]) {
        const value = avatar[slotKey];
        if (typeof value === "string" && legacyPartId[value]) {
          avatar[slotKey] = legacyPartId[value];
        }
      }
      avatar.faceId ??= "face_round";
      avatar.eyesId ??= "eyes_round";
      avatar.mouthId ??= "mouth_smile";
      avatar.noseId ??= "nose_triangle";
      const colors = (avatar.colors ?? {}) as Record<string, string>;
      colors.skin ??= "#f2c9a4";
      colors.hair ??= "#4a3226";
      colors.eyes ??= "#2b2422";
      colors.top ??= "#c8564f";
      colors.bottom ??= "#6b4a30";
      colors.shoes ??= "#3a2a1c";
      avatar.colors = colors;
      return save;
    },
  },

  // v17（2026-08-03 门）：内墙门洞显式入档（RoomSave.interiorDoorways），
  // WorldSave.doors 存锁定状态。门洞值**冻结在这里**（同 LEGACY_FURNITURE_ID
  // 铁律）：老档的 2LDK 户型只有这一种，三个门洞位置写死；
  // 没有内墙的更老单间档不补——没有内墙就没有装门的地方。
  // doors 本身不补：可选字段，运行时按定义的 defaultLocked 初始化。
  {
    to: 17,
    migrate: (save) => {
      for (const map of Object.values(save.ownWorld.maps ?? {})) {
        for (const room of Object.values(map.rooms ?? {})) {
          if (!room.interiorWalls?.length) continue;
          room.interiorDoorways ??= [
            {
              doorwayId: "doorway-bedroom-a",
              cell: { x: 4, y: 12 },
              axis: "x",
              span: 2,
              doorId: "room_door",
            },
            {
              doorwayId: "doorway-bath",
              cell: { x: 12, y: 12 },
              axis: "x",
              span: 2,
              doorId: "room_door",
            },
            {
              doorwayId: "doorway-bedroom-b",
              cell: { x: 19, y: 12 },
              axis: "x",
              span: 2,
              doorId: "room_door",
            },
          ];
        }
      }
      return save;
    },
  },

  // v18（2026-08-03 次卧上锁）：次卧改单开门且初始锁着。
  // **老档也要跟着变**——户型设定改了，已经在玩的档不该还是双开且不锁；
  // doors[] 里那条存的 locked:false 是"上个版本的默认"，不是玩家开过锁，
  // 所以这里一并改掉。真被玩家解锁过的门在这条迁移之后才有意义。
  {
    to: 18,
    migrate: (save) => {
      for (const map of Object.values(save.ownWorld.maps ?? {})) {
        for (const room of Object.values(map.rooms ?? {})) {
          for (const doorway of room.interiorDoorways ?? []) {
            if (doorway.doorwayId !== "doorway-bedroom-b") continue;
            doorway.doorId = "room_door_single";
            doorway.initiallyLocked = true;
          }
        }
      }
      for (const door of save.ownWorld.doors ?? []) {
        if (door.refId !== "doorway-bedroom-b") continue;
        door.definitionId = "room_door_single";
        door.locked = true;
      }
      return save;
    },
  },

  /*
   * v19（2026-08-03 朝向改弧度 + id 全局唯一）：为联机做的两处形状修正。
   *
   * **一条迁移做两件事**，因为它们都只碰"已经存下来的字段该长什么样"，
   * 而且都必须在同一次读档里完成——分成 v19/v20 两条的话，中间那个
   * 版本号对应的存档形状从来不会真实存在，纯粹是给迁移链凑数。
   *
   * ① `position.facing`（四向枚举）→ `position.heading`（弧度）。
   *    玩家和宠物都有。量化是有损的，但**反方向无损**：四向本来就是
   *    弧度的子集，north→0、east→π/2，还原回去正好是老档当初被砍之前
   *    最接近的那个值。玩家不会觉得读档后转了个身。
   *
   * ② 掉落物 / 家具实例 id 补 `local:` 前缀。
   *    老 id 形如 `drop:rice#8`、`chair#3`，由**本地计数器**发号。单机没事
   *    （读档会续号），联机会撞：房主和房客各自从自己的 counter 发，
   *    两人同时扔米饭都得到 `drop:rice#8`，服务端分不出是一份还是两份。
   *
   *    前缀式而不是换 UUID：扔东西必须**立刻可见**，等服务端发号要多一个
   *    RTT（MC、Valheim 都是本地生成 + 服务端校验）。而 UUID 会把
   *    `chair#3` 变成一串乱码，命令行和调试里全废。
   *
   *    家具 id 要连着改三处引用（restingOn、storage 的 inventoryId、
   *    行动绑定的 furnitureInstanceId），漏一处就是"坐在不存在的椅子上"。
   */
  {
    to: 19,
    migrate: (save) => {
      // ---- ① 朝向 ----
      const toHeading = (position: LegacyPositioned | undefined): void => {
        if (!position) return;
        if (typeof position.heading === "number") return; // 已经是新的
        position.heading = facingToHeading(position.facing ?? Facing.South);
        delete position.facing;
      };

      toHeading(save.player?.character?.position as LegacyPositioned | undefined);
      for (const pet of Object.values(save.ownWorld.pets ?? {})) {
        toHeading(pet.position as LegacyPositioned | undefined);
      }

      /*
       * ---- ② id 前缀 ----
       *
       * 目标形状是 `<issuer>:<kind>:<name>#<n>`（见 State/ids）。老档里的
       * 东西全是这台机器上产生的，所以 issuer 一律是 local。
       *
       * 两类老 id 的**段数不一样**，不能共用一个"加前缀"：
       *   掉落物 `drop:rice#8`      已经有 kind 段 → 只补 issuer
       *   家具   `furniture_chair#3` 只有名字      → issuer 和 kind 都要补
       * 家具那条光加前缀会得到 `local:furniture_chair#3`，只有一个冒号，
       * parseObjectId 认不出来——读档后续号会从 1 重来，直接撞上老家具。
       *
       * 已经是新形状的跳过：迁移必须可重入，否则手动重放一次就成了
       * `local:local:drop:rice#8`。
       */
      const withIssuer = (id: string): string =>
        isNewObjectId(id) ? id : `${LOCAL_ID_PREFIX}:${id}`;

      for (const item of save.ownWorld.droppedItems ?? []) {
        item.id = withIssuer(item.id);
      }

      /** 家具改名表：旧 instanceId → 新 instanceId，给下面三处引用查 */
      const renamed = new Map<string, string>();
      for (const placed of save.ownWorld.placedFurniture ?? []) {
        const next = isNewObjectId(placed.instanceId)
          ? placed.instanceId
          : `${LOCAL_ID_PREFIX}:${FURNITURE_ID_KIND}:${placed.instanceId}`;
        renamed.set(placed.instanceId, next);
        placed.instanceId = next;
      }

      // 储物箱的 inventoryId 就是家具的 instanceId（见 State/storage）。
      // 不跟着改的话，箱子还在屋里但里面的东西打不开了
      const inventories = save.ownWorld.inventories ?? {};
      for (const [key, value] of Object.entries(inventories)) {
        const next = renamed.get(key);
        if (!next || next === key) continue;
        inventories[next] = value;
        delete inventories[key];
      }

      // 坐在哪件家具上
      const resting = save.player?.character?.restingOn;
      if (resting) {
        resting.instanceId = renamed.get(resting.instanceId) ?? resting.instanceId;
      }

      // 正在进行的行动绑着的那件家具
      const bound = save.player?.activeActionProcess;
      if (bound?.furnitureInstanceId) {
        bound.furnitureInstanceId =
          renamed.get(bound.furnitureInstanceId) ?? bound.furnitureInstanceId;
      }

      return save;
    },
  },

  /*
   * v20（2026-08-04 每日任务机器）：PlayerSave 多了 dailyTasks、
   * WorldSave 多了 dailyBoard。两个都是纯新增可选字段，读出来是
   * undefined 就当"空池子 / 今天还没开始"，**数据本身不用动**。
   *
   * 补这一条和 v10/v11 同理：只为了把版本号推上去。不推的话旧客户端
   * 会认得这份档、把新字段整个丢掉再存回去——玩家写了一周的任务清单
   * 就这么没了，而且没有任何报错。
   */
  {
    to: 20,
    migrate: (save) => save,
  },

  /*
   * v21（2026-08-05 快捷栏并入背包）：背包从两个容器变成一个数组，
   * 前 8 格就是快捷栏。stackId 的编码跟着从 `hotbar:N` / `backpack:N`
   * 变成 `slot:N`。
   *
   * **换算必须在这里做完，运行时不能兼容老编码。** 如果让
   * restoreInventory 去"取冒号后面的数字"，`hotbar:3` 和 `backpack:3`
   * 会双双落到 3 号格，后读到的把先读到的顶掉——一次静默的物品丢失，
   * 而且只在两边同号都有东西时才发生，测不出来。
   *
   * 认不出前缀的记录直接丢弃而不是塞进空位：v21 之前的存档里
   * 这两种前缀是全集，出现别的只可能是被改坏的档，猜位置不如少一件。
   */
  {
    to: 21,
    migrate: (save) => {
      const stacks = save.player?.character?.inventory;
      if (!Array.isArray(stacks)) return save;

      const taken = new Set<number>();
      save.player.character.inventory = stacks.flatMap((stack) => {
        const [prefix, rawIndex] = String(stack.stackId).split(":");
        const index = Number(rawIndex);
        if (!Number.isInteger(index) || index < 0) return [];

        let slot: number;
        if (prefix === "hotbar" && index < LEGACY_HOTBAR_SIZE) {
          slot = index;
        } else if (prefix === "backpack" && index < LEGACY_BACKPACK_SIZE) {
          slot = LEGACY_HOTBAR_SIZE + index;
        } else {
          return [];
        }

        // 同一格出现两条（改坏的档）只留先来的，别让后来的把它顶掉
        if (slot >= INVENTORY_SIZE || taken.has(slot)) return [];
        taken.add(slot);

        return [{ ...stack, stackId: `slot:${slot}` }];
      });

      return save;
    },
  },
];

/**
 * 迁移期间的"半新半旧"位置。存档里读出来时 facing 还在、heading 还没有，
 * 而 Core 的 `WorldPosition` 只认新形状——这个类型就是那一刻的形状，
 * 只给 v19 用。
 */
type LegacyPositioned = {
  facing?: Facing;
  heading?: number;
};

/**
 * 这个 id 已经是新格式（`<发号方>:<kind>:<name>#<n>`）了吗。
 *
 * **判结构，不判前缀。** 第一版写的是 `id.startsWith("local:")`，
 * 在单机下看着没问题，联机之后会**真的损坏数据**：房主开房后发号方
 * 换成服务端给的 playerId，id 变成 `p-e2013f28:drop:pork#1`——
 * 它不以 `local:` 开头，于是重跑迁移时又被套一层，成了
 * `local:p-e2013f28:drop:pork#1`，解析出来 kind 是 `p-e2013f28`，彻底废掉。
 *
 * 正则冻结在这里、不调 State/ids 的 parseObjectId：迁移的行为必须
 * 定格在写它的那一刻，而那个解析器是会跟着 id 格式演进的。
 */
function isNewObjectId(id: string): boolean {
  return /^[^:]+:[^:]+:.+#\d+$/.test(id);
}

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
