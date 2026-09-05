import {
  Facing,
  PlacementSurface,
  WallOpeningKind,
  facingToHeading,
  findItemDefinition,
  findPlaceableItem,
  revalidatePlacements,
  roomStyleDefinitions,
  type GameSave,
  type InteriorWall,
  type InventoryStack,
  type PlacedFurniture,
  type RoomSave,
  type ResidentSave,
} from "core";
// 老存档的 v7/v8 用当年的户型重新生成房间几何。户型跟着地图走了
// （Maps/base/layout，据点改造前叫 Maps/home），迁移就从那儿取——迁移读的是**历史**，
// 但历史里那栋房子就是 home 这张图的房子，不是另一份拷贝
import { generateHouse } from "../../Maps/base/layout";
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

      for (const resident of Object.values(save.ownWorld.pets ?? {})) {
        const next = renamed[resident.definitionId];
        if (next) resident.definitionId = next;
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
      for (const resident of Object.values(save.ownWorld.pets ?? {})) {
        resident.position = { ...resident.position, x: 2 + offset, y: -3 };
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
      for (const resident of Object.values(save.ownWorld.pets ?? {})) {
        resident.position = { ...resident.position, x: 2, y: -3 };
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

  // v14（2026-08-02 舒舒）：ResidentSave 多了 sleeping。数据本身不用动
  //（可选字段，undefined = 醒着），推版本号还是那个老理由：旧客户端读到
  // 新档会把字段丢掉再存回去。丢的只是"这一觉"，但规矩不因小而破。
  {
    to: 14,
    migrate: (save) => save,
  },

  // v15（2026-08-02 宠物档案）：growth / needs 从占位（恒 0 / 恒空表）
  // 变成真数据，新增 mood。老档读出来按默认补（饿 80 / 渴 80 / 心情 70），
  // 不在这里写死默认值——那是 ResidentAgent.fromSave 的事，写两处迟早漂。
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
      for (const resident of Object.values(save.ownWorld.pets ?? {})) {
        toHeading(resident.position as LegacyPositioned | undefined);
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

  /*
   * v22（2026-08-05 唱片机）：WorldSave 多了 gramophones（每台唱片机
   * 装着哪张唱片）。纯新增可选字段，缺省 = 装着出厂默认那张，
   * 数据本身不用动——推版本号的理由同 v20：不推的话旧客户端会把
   * 这个字段整个丢掉再存回去，玩家换上的唱片就静默变回默认了。
   */
  {
    to: 22,
    migrate: (save) => save,
  },

  /*
   * v23（2026-08-05 台面放置）：FurniturePlacement 联合类型多了 Surface
   * 变体（摆在别的家具顶面上，宿主本地半格坐标）。老存档里没有这种条目，
   * 数据不用动；推版本号的理由同 v20/v22——旧客户端读到带台面件的档
   * 会把那些条目当损坏丢弃，玩家摆的东西静默消失。
   */
  {
    to: 23,
    migrate: (save) => save,
  },

  /*
   * v24（2026-08-10 据点改造）：起始图 "home" 退役，继任者 "base"
   * （围墙据点）**继承了 living/yard 两个房间名**，所以家具/宠物/
   * 掉落物/门这些只带 roomId 的实体一个字段都不用动——要改名的只有
   * 两处："哪张图"的键（world.maps）和"人在哪张图"（position.mapId）。
   *
   * 字面量写死不引 DEFAULT_MAP_ID：迁移的行为必须定格在写它的那一刻，
   * 那个常量以后要是再改名，这条旧迁移不能跟着变。
   * maps 里已有 "base" 键的档（未来存档被降级客户端碰过的残档）不动
   * home，宁可留一张多余的旧图也不覆盖新图。
   */
  {
    to: 24,
    migrate: (save) => {
      const maps = save.ownWorld?.maps;
      if (maps?.["home"] && !maps["base"]) {
        maps["base"] = { ...maps["home"], mapId: "base" };
        delete maps["home"];
      }

      const position = save.player?.character?.position as
        | { mapId?: string }
        | undefined;
      if (position?.mapId === "home") position.mapId = "base";

      return save;
    },
  },

  /*
   * v25（2026-08-10 据点③庭院家具）：前庭补两把园林长椅 + 两盏路灯，
   * 和新档 seedInitialFurniture 摆的是同一批（位置字面量两边各自冻结，
   * 这里不 import——迁移的行为必须定格在写它的那一刻）。
   *
   * instanceId 用 "migration" 当发号方：老档里所有本机产的 id 都是
   * "local:" 前缀，联机改档后是玩家 id 前缀，"migration:" 和两者都
   * 不会撞号，也不用去碰运行时的发号计数器（迁移时它还没加载）。
   */
  {
    to: 25,
    migrate: (save) => {
      const placed = save.ownWorld?.placedFurniture;
      if (!Array.isArray(placed)) return save;
      const has = (id: string): boolean =>
        placed.some((item) => item?.furnitureId === id);
      if (has("furniture_garden_bench") || has("furniture_street_lamp")) {
        return save;
      }

      const pieces = [
        { furnitureId: "furniture_garden_bench", n: 1, gridPosition: { x: -3, y: -1 }, facing: "south" },
        { furnitureId: "furniture_garden_bench", n: 2, gridPosition: { x: -3, y: 4 }, facing: "north" },
        { furnitureId: "furniture_street_lamp", n: 1, gridPosition: { x: -7, y: 4 }, facing: "south" },
        { furnitureId: "furniture_street_lamp", n: 2, gridPosition: { x: -7, y: -1 }, facing: "south" },
      ];
      for (const piece of pieces) {
        placed.push({
          instanceId: `migration:furniture:${piece.furnitureId}#${piece.n}`,
          furnitureId: piece.furnitureId,
          placement: {
            kind: "floor",
            roomId: "yard",
            gridPosition: piece.gridPosition,
            facing: piece.facing,
          },
          state: {},
        } as never);
      }
      return save;
    },
  },

  /*
   * v26（2026-08-19 LDK 隔断）：客厅（living）北带里加一道竖内墙——
   * x=10 那一列从北墙砌到 z=12 的横墙，y7..8 留 2 格空门洞。几何写在
   * Maps/base/layout，这里**冻结一份字面量**（迁移的行为定格在写它的那一刻）。
   *
   * 不像 v7/v8 那样整栋重生成：那两次是户型大改，家具全部打包回背包；
   * 这次只多一列墙，只有**压进那列墙里的**家具才退回背包（连同箱内与
   * 槽位内容），别的原位不动。判定交给 Core 的 revalidatePlacements——
   * 占地/朝向/台面件的规则它一处说了算，迁移不另抄一份。
   *
   * 认档条件：房间里已经有 z=12 横墙（2LDK 之后的档）且还没有这道门洞。
   * 老于 2LDK 的档 v7/v8 会先重生成，走到这里时已经带着门洞，自然跳过。
   */
  {
    to: 26,
    migrate: (save) => {
      const PARTITION_DOORWAY = "doorway-ldk-partition";
      const partition: InteriorWall[] = [
        { from: { x: 10, y: 0 }, axis: "y", length: 7 },
        { from: { x: 10, y: 9 }, axis: "y", length: 3 },
      ];

      const collected = new Map<string, number>();
      const collect = (itemId: string, quantity: number): void => {
        collected.set(itemId, (collected.get(itemId) ?? 0) + quantity);
      };

      for (const map of Object.values(save.ownWorld?.maps ?? {})) {
        const room = map.rooms?.["living"] as RoomSave | undefined;
        if (!room?.interiorWalls?.length) continue;
        if (room.interiorDoorways?.some((d) => d.doorwayId === PARTITION_DOORWAY)) continue;
        // 只认 2LDK 的那栋（24×20、z=12 有横墙）；别的户型不硬塞
        const hasRow12 = room.interiorWalls.some((w) => w.axis === "x" && w.from.y === 12);
        if (!hasRow12 || room.floorGrid.width !== 24) continue;

        room.interiorWalls.push(...partition);
        room.interiorDoorways ??= [];
        room.interiorDoorways.push({
          doorwayId: PARTITION_DOORWAY,
          cell: { x: 10, y: 7 },
          axis: "y",
          span: 2,
        });

        const placed = (save.ownWorld.placedFurniture ?? []) as PlacedFurniture[];
        const { kept, displaced } = revalidatePlacements(room, placed, (id) =>
          findPlaceableItem(id),
        );
        if (displaced.length === 0) continue;

        for (const item of displaced) {
          collect(item.furnitureId, 1);
          for (const stack of Object.values(item.state?.slotContents ?? {})) {
            if (!stack) continue;
            collect(stack.itemId, stack.quantity);
            for (const inner of stack.state?.container?.items ?? []) {
              collect(inner.itemId, inner.quantity);
            }
          }
          const storageId = item.state?.storageInventoryId;
          if (storageId && save.ownWorld.inventories?.[storageId]) {
            for (const stack of save.ownWorld.inventories[storageId].stacks) {
              collect(stack.itemId, stack.quantity);
            }
            delete save.ownWorld.inventories[storageId];
          }
        }
        save.ownWorld.placedFurniture = kept;
      }

      // 退回背包（v21 之后的槽位编码 slot:N，共 INVENTORY_SIZE 格）；
      // 背包塞满就丢——一道墙压到的最多一两件，真满了也只是极端情况
      const inventory = save.player.character.inventory;
      const freeSlot = (): string | null => {
        const used = new Set(inventory.map((stack) => String(stack.stackId)));
        for (let i = 0; i < INVENTORY_SIZE; i += 1) {
          if (!used.has(`slot:${i}`)) return `slot:${i}`;
        }
        return null;
      };
      for (const [itemId, total] of collected) {
        const limit = findItemDefinition(itemId)?.stackLimit ?? 1;
        let remaining = total;
        while (remaining > 0) {
          const slot = freeSlot();
          if (!slot) break;
          const take = Math.min(limit, remaining);
          inventory.push({ stackId: slot, itemId, quantity: take });
          remaining -= take;
        }
      }

      /*
       * 人和宠物要是正好站在新墙那一列里（世界 x −2..−1，z −10..2），
       * 挪到门洞东侧的客厅地板上。WorldPosition 的 y 就是世界 z。
       */
      const inWall = (p: { mapId?: string; x?: number; y?: number } | undefined): boolean =>
        !!p &&
        (p.mapId === "base" || p.mapId === undefined) &&
        typeof p.x === "number" &&
        typeof p.y === "number" &&
        p.x >= -2.5 &&
        p.x <= -0.5 &&
        p.y >= -10 &&
        p.y <= 2.5;
      for (const resident of Object.values(save.ownWorld?.pets ?? {})) {
        if (inWall(resident.position)) resident.position = { ...resident.position, x: 1, y: -2 };
      }
      const me = save.player?.character?.position;
      if (inWall(me)) save.player.character.position = { ...me, x: 1, y: -2 };

      return save;
    },
  },

  /*
   * v27（2026-08-19 日式浴缸）：浴室南端补一只房子自带的浴缸
   * （furniture_ofuro，4×3 @ (11,17) 朝北，state.fixed）。和 v26 一个路数：
   * 只认 2LDK 的 living；已经有 fixed 浴缸的档跳过；压在它占地里的家具交给
   * revalidatePlacements 判、退回背包（把浴缸放在数组最前，后来的让路）。
   */
  {
    to: 27,
    migrate: (save) => {
      const collected = new Map<string, number>();
      const collect = (itemId: string, quantity: number): void => {
        collected.set(itemId, (collected.get(itemId) ?? 0) + quantity);
      };

      for (const map of Object.values(save.ownWorld?.maps ?? {})) {
        const room = map.rooms?.["living"] as RoomSave | undefined;
        if (!room?.interiorWalls?.length || room.floorGrid.width !== 24) continue;
        const placed = (save.ownWorld.placedFurniture ?? []) as PlacedFurniture[];
        if (placed.some((p) => p.furnitureId === "furniture_ofuro" && p.state?.fixed)) continue;

        const tub: PlacedFurniture = {
          instanceId: "migration:furniture:furniture_ofuro#1",
          furnitureId: "furniture_ofuro",
          placement: {
            kind: PlacementSurface.Floor,
            roomId: "living",
            gridPosition: { x: 11, y: 17 },
            facing: Facing.North,
          },
          state: { fixed: true },
        };
        const { kept, displaced } = revalidatePlacements(room, [tub, ...placed], (id) =>
          findPlaceableItem(id),
        );
        for (const item of displaced) {
          collect(item.furnitureId, 1);
          for (const stack of Object.values(item.state?.slotContents ?? {})) {
            if (!stack) continue;
            collect(stack.itemId, stack.quantity);
            for (const inner of stack.state?.container?.items ?? []) {
              collect(inner.itemId, inner.quantity);
            }
          }
          const storageId = item.state?.storageInventoryId;
          if (storageId && save.ownWorld.inventories?.[storageId]) {
            for (const stack of save.ownWorld.inventories[storageId].stacks) {
              collect(stack.itemId, stack.quantity);
            }
            delete save.ownWorld.inventories[storageId];
          }
        }
        save.ownWorld.placedFurniture = kept;
      }

      const inventory = save.player.character.inventory;
      const freeSlot = (): string | null => {
        const used = new Set(inventory.map((stack) => String(stack.stackId)));
        for (let i = 0; i < INVENTORY_SIZE; i += 1) {
          if (!used.has(`slot:${i}`)) return `slot:${i}`;
        }
        return null;
      };
      for (const [itemId, total] of collected) {
        const limit = findItemDefinition(itemId)?.stackLimit ?? 1;
        let remaining = total;
        while (remaining > 0) {
          const slot = freeSlot();
          if (!slot) break;
          const take = Math.min(limit, remaining);
          inventory.push({ stackId: slot, itemId, quantity: take });
          remaining -= take;
        }
      }

      // 人/宠物站在浴缸占地里（世界 x −1..3，z 7..10）的挪到浴室门口
      const inTub = (p: { mapId?: string; x?: number; y?: number } | undefined): boolean =>
        !!p &&
        (p.mapId === "base" || p.mapId === undefined) &&
        typeof p.x === "number" &&
        typeof p.y === "number" &&
        p.x >= -1.4 &&
        p.x <= 3.4 &&
        p.y >= 6.6 &&
        p.y <= 10;
      for (const resident of Object.values(save.ownWorld?.pets ?? {})) {
        if (inTub(resident.position)) resident.position = { ...resident.position, x: 1, y: 4 };
      }
      const me = save.player?.character?.position;
      if (inTub(me)) save.player.character.position = { ...me, x: 1, y: 4 };

      return save;
    },
  },

  /*
   * v28（2026-08-20 系列任务）：PlayerSave 加 actionChains（玩家自建的
   * 行动链），同场删掉 missions 死壳——那个 { daily, primary } 三态领奖
   * 的形状从 V0.8 起就没有任何读写方，留着只会诱惑后人往里塞东西。
   * 数据本身：老档没有链就是空数组；missions 直接丢，它从来是空的。
   */
  {
    to: 28,
    migrate: (save) => {
      const player = save.player as unknown as Record<string, unknown>;
      if (player) {
        delete player.missions;
        player.actionChains ??= [];
      }
      return save;
    },
  },

  /*
   * v29（2026-08-23 补账）：**一条迁移追四个字段**，因为这四次形状变更
   * 都没有抬版本号。
   *
   * | 提交     | 日期 | 字段                          |
   * |----------|------|-------------------------------|
   * | df9c2bc  | 8-22 | WorldSave.buildings（期 2 建筑）|
   * | ac4d983  | 8-23 | WorldSave.lamps               |
   * | b10741b  | 8-23 | WorldSave.baseGold（钱匣）     |
   * | 本次     | 8-23 | PlayerSave.pendingGold（在外面赚的钱）|
   *
   * ## 为什么一条而不是四条
   *
   * 迁移链描述的是**发布过的版本之间**的落差。这四次全在测试期，一天之内
   * 落地，没有任何一份存档停在"有 buildings 没有 lamps"那个中间态上
   * （老档已按用户 2026-08-22 的决定全删）。拆成 29/30/31/32 会凭空造出
   * 三个从未存在过的版本，读的人得挨个去问"这一档谁写的"。
   *
   * ## 不补版本号的真实后果
   *
   * 不是"少迁一次"，是**静默丢档**：两个客户端都自称 28、形状却不同。
   * 旧客户端读得进新档（版本闸门 `from > 28` 不触发），把认不出的字段
   * 悄悄忽略，再存回去就永久没了。有云同步和多设备时这是真丢东西。
   *
   * 抬到 29 之后，8-20 那批客户端会当场拒绝并让人更新——这正是闸门
   * 该干的事。
   *
   * ## 数据本身几乎不用动
   *
   * 四个字段都是可选的、缺省即默认（无建筑 / 灯全开 / 匣空 / 没在外面
   * 赚过钱），各家 restore 早就按 undefined 处理了。这条迁移写成显式赋值
   * 是为了**让形状在存档里落实**——`serialize` 之后的键集合从此稳定，
   * 那正是 saveShape 用例比对的东西。
   */
  {
    to: 29,
    migrate: (save) => {
      const world = save.ownWorld as unknown as Record<string, unknown>;
      if (world) {
        world.buildings ??= [];
        world.lamps ??= {};
        world.baseGold ??= 0;
      }
      const player = save.player as unknown as Record<string, unknown>;
      if (player) player.pendingGold ??= 0;
      return save;
    },
  },

  /**
   * v30（2026-08-24，小动物经济圈 · 期 0）：剧情引擎补口带来的两个字段。
   *
   * | 字段 | 是什么 |
   * |------|------|
   * | `WorldSave.dayFacts` | 「昨日事实」——报纸的素材源（期 7 出版面，素材从期 0 攒） |
   * | `WorldSave.progression.poolMisses` | 抽签池连续错过几次——保底靠它爬坡，不进档读一次就归零 |
   *
   * 数据不用动：两个都是可选字段、缺省即默认（没记过事实 / 一次都没
   * 错过）。显式赋值同 v29 的理由——让形状在存档里落实，saveShape
   * 的指纹从此稳定。联机不跟：story 不在做客端跑，刷新切片不带它们
   * （报纸要不要给访客看是期 7 的决定）。
   */
  {
    to: 30,
    migrate: (save) => {
      const world = save.ownWorld as unknown as Record<string, unknown>;
      if (world) {
        world.dayFacts ??= [];
        const progression = world.progression as
          | Record<string, unknown>
          | undefined;
        if (progression) progression.poolMisses ??= {};
      }
      return save;
    },
  },

  /**
   * v31（2026-08-24，小动物经济圈 · 期 6）：旅行商人这一趟的摊子。
   *
   * | 字段 | 是什么 |
   * |------|------|
   * | `WorldSave.travelerStock` | 稀客这一趟**已经卖掉了什么**（限量靠它跨存档） |
   *
   * 数据不用动：可选字段，缺省就是"还没遇到过他"。给个 `day: -1` 而不是
   * 留空——那个哨兵值的意思是"这份记录不属于任何一天"，下次开摊时会
   * 整份作废重来，正是老存档该有的行为。
   *
   * **联机不跟**（同 v30 的 dayFacts）：旅行商人是房主世界的事，
   * 访客看到的摊子归房主，刷新切片不带它。
   */
  {
    to: 31,
    migrate: (save) => {
      const world = save.ownWorld as unknown as Record<string, unknown>;
      if (world) world.travelerStock ??= { day: -1, sold: [] };
      return save;
    },
  },

  /**
   * v32（2026-08-25，小动物经济圈 · 期 7）：报纸。
   *
   * | 字段 | 是什么 |
   * |------|------|
   * | `WorldSave.newspaper` | 报名、出到第几期、**最新那一期的定稿** |
   *
   * 数据不用动：老存档给 `{ issued: 0 }` = 还没送过打印机，一期都没出过。
   * 报名留空，报头会退到据点的名字（不开洞）。
   *
   * **联机不跟。** 报纸是这个家的私事，做客的人翻别人家的家务事很奇怪
   * ——所以 `WorldRefreshSlices` 和 `WORLD_REFRESH_KEYS` **两处都不加**。
   * `net.ts` 那句编译期断言拦的是"加了类型忘了加白名单"，拦不住"本该
   * 两处都不加却加了一处"，这条注释就是那个位置的守卫。
   */
  {
    to: 32,
    migrate: (save) => {
      const world = save.ownWorld as unknown as Record<string, unknown>;
      if (world) world.newspaper ??= { issued: 0 };
      return save;
    },
  },

  /**
   * v33（2026-08-25）：事后补记的每日额度。
   *
   * | 字段 | 是什么 |
   * |------|------|
   * | `PlayerSave.actionLog` | 今天补记了几件、共多少分钟 |
   *
   * **数据一个字都不用动，这条是空的**——而空得有理由，不是忘了写：
   *
   * 老档缺这个字段读出来是 `undefined`，`restoreActionLog` 把它当成
   * "今天还没补记过"，这正是正确答案。反过来，如果这里按惯例
   * `??= { worldDayId: "", count: 0, minutes: 0 }` 塞一份零记录进去，
   * 那个空的 `worldDayId` 和今天对不上，第一次读的时候照样会被惰性重置
   * 覆盖掉——写了等于没写，还多骗一次读的人以为它有用。
   *
   * 那为什么还要占一个版本号：**形状变了就必须有人做决定**，版本号是
   * 那个决定留下的痕迹。两个客户端都自称 32、形状却不同的话，旧客户端
   * 读得进新档、把认不出的字段悄悄忽略，存回去就永久没了
   * （saveShape.test 的注释里记着这个坑是怎么踩出来的）。
   *
   * **联机不跟。** 它挂在 `PlayerSave` 上，跟着人走——做客时用掉的还是
   * 自己那份额度。`WorldRefreshSlices` 管的是世界切片，这个字段不属于
   * 那一层，两处都不加是对的。
   */
  {
    to: 33,
    migrate: (save) => save,
  },

  /**
   * v34（2026-08-28）：进行中的行动记住它是从哪条计划起来的。
   *
   * | 字段 | 是什么 |
   * |------|------|
   * | `ActionProcessSave.entryId` | 日记本左页那条计划的 id |
   *
   * **数据不用动，这条也是空的**，理由和 v33 同一类但不完全一样：
   *
   * 老档里正在跑的那个行动确实**不知道**自己是从哪条计划起的——那个信息
   * 当时根本没存过，编不出来。缺省 `undefined` 就是诚实的答案（"不是从
   * 计划起的"），代价是老档里那一个在飞的行动做完之后，它对应的计划还得
   * 手动删一次。只影响升级那一刻正在跑的**一条**，不值得为它编一份猜出来的
   * 关联——猜错了会把另一条计划删掉，那比留着更糟。
   *
   * 为什么加这个字段：不加的话行动完成后计划留在左页、右页又多一条"做完了"，
   * 同一件事在两页各占一行。而这个关联**必须存**——行动会在离线期间完成，
   * 读档补结算时才划得掉（同 `chainRef` 的理由）。
   *
   * **联机不跟。** 它挂在 `PlayerSave.activeActionProcess` 上跟着人走，
   * 不属于 `WorldRefreshSlices` 那一层。
   */
  {
    to: 34,
    migrate: (save) => save,
  },

  /**
   * v35（2026-08-29）：日记本搬进玩家存档。
   *
   * | 字段 | 是什么 |
   * |------|------|
   * | `PlayerSave.diary` | 完整历史：startedOn + 稀疏的天数组（只存有内容的天） |
   *
   * 之前日记右页借的是 `WorldSave.dayFacts`（报纸素材）：只留两天、
   * 挂在世界上——联机做客翻开的是**房主的**日记。两条都不对，所以
   * 日记有了自己的家，跟着人走、永不修剪。dayFacts 原样保留归报纸。
   *
   * **迁移是空的（不搬 dayFacts 进来）**：那里最多两天、而且分不清
   * 哪些是房主的哪些是做客时记的——搬一份来源可疑的两天，不如从
   * 升级这天起干净地开始记。老玩家的日记 `startedOn` = 升级后第一次
   * 完成行动那天，符合"开启日记的时间跟着玩家"的语义。
   *
   * **联机不跟。** 挂在 PlayerSave 上跟人走，不属于 WorldRefreshSlices。
   */
  {
    to: 35,
    migrate: (save) => save,
  },

  /*
   * v36 · 活物实例 id：`pet-<短名>` → `resident-<definitionId>`（2026-09-05）。
   *
   * 改名那个提交把类型上的 `PetSave.petId` 改成了 `residentId`——那是存档
   * 字段名，老档读出来 `residentId` 是 undefined，`restoreResidents` 会把
   * 所有活物注册到同一个 undefined 键下。所以这条迁移**必须**紧跟改名提交。
   *
   * id 出现在四处，四处一起迁：
   * 1. `ownWorld.pets` 的键和每条的 `petId` 字段（字段改名 + 值换格式）
   * 2. `progression.signalCounts` 的键：信号名 `pet_spawned` / `pet_entered`
   *    改了名，subject 里的实例 id 也要换（`pet_spawned|pet-slime` →
   *    `resident_spawned|resident-slime_neighbor`）；两个老键映射到同一个
   *    新键时计数相加
   * 3. `dayFacts[].headlines[].subject` 里 `物品|买主` 的买主一半
   * 4. `buildings[].construction.workerId`（石傀儡认领工地时写的是它的实例 id）
   *
   * 老短名和 definitionId 对不上（otter → otter_trader），所以映射表**写死**，
   * 不从注册表推（迁移必须冻结在写它的那一刻，见 LEGACY_FURNITURE_ID）。
   * 表里没有的 `pet-xxx` 按 `resident-xxx` 处理（`pet-stone_golem`、
   * `pet-shushu`、`pet-moss_wisp` 本来就是 definitionId）。已经是 `resident-`
   * 开头的原样保留——重跑一次不会套两层。
   */
  {
    to: 36,
    migrate: (save) => {
      const world = save.ownWorld;

      const pets = world.pets ?? {};
      const migratedPets: Record<string, ResidentSave> = {};
      for (const [key, entry] of Object.entries(pets)) {
        const legacy = entry as ResidentSave & { petId?: string };
        const oldId = legacy.residentId ?? legacy.petId ?? key;
        const newId = legacyResidentId(oldId);
        const { petId: _dropped, ...rest } = legacy;
        void _dropped;
        migratedPets[newId] = { ...rest, residentId: newId };
      }
      world.pets = migratedPets;

      const counts = world.progression?.signalCounts;
      if (counts) {
        const next: Record<string, number> = {};
        for (const [key, count] of Object.entries(counts)) {
          const at = key.indexOf("|");
          const kind = at < 0 ? key : key.slice(0, at);
          const subject = at < 0 ? undefined : key.slice(at + 1);
          const newKind = LEGACY_SIGNAL_KIND[kind] ?? kind;
          const newSubject = subject === undefined ? undefined : legacyResidentId(subject);
          const newKey = newSubject === undefined ? newKind : `${newKind}|${newSubject}`;
          next[newKey] = (next[newKey] ?? 0) + count;
        }
        world.progression.signalCounts = next;
      }

      for (const day of world.dayFacts ?? []) {
        for (const headline of day.headlines ?? []) {
          if (!headline.subject) continue;
          const at = headline.subject.indexOf("|");
          if (at < 0) continue;
          const who = headline.subject.slice(at + 1);
          headline.subject = `${headline.subject.slice(0, at)}|${legacyResidentId(who)}`;
        }
      }

      for (const building of world.buildings ?? []) {
        if (building.construction?.workerId) {
          building.construction.workerId = legacyResidentId(building.construction.workerId);
        }
      }

      return save;
    },
  },
];

/**
 * v36 的实例 id 映射。**写死**：老短名和 definitionId 对不上，而且迁移表
 * 必须冻结（理由同 LEGACY_FURNITURE_ID）。表里没有的 `pet-xxx` →
 * `resident-xxx`；不以 `pet-` 开头的（已经迁过、或根本不是活物 id）原样返回。
 */
const LEGACY_RESIDENT_ID: Record<string, string> = {
  "pet-slime": "resident-slime_neighbor",
  "pet-fox": "resident-fox_neighbor",
  "pet-spirit": "resident-spirit_neighbor",
  "pet-otter": "resident-otter_trader",
  "pet-dragon": "resident-coin_dragon",
  "pet-fish-trader": "resident-fish_trader",
};

function legacyResidentId(id: string): string {
  if (!id.startsWith("pet-")) return id;
  return LEGACY_RESIDENT_ID[id] ?? `resident-${id.slice("pet-".length)}`;
}

/** v36：改名提交把这两个剧情信号换了名字，存档里的计数键跟着换 */
const LEGACY_SIGNAL_KIND: Record<string, string> = {
  pet_spawned: "resident_spawned",
  pet_entered: "resident_entered",
};

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
