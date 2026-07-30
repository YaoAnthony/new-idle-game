import { WallOpeningKind, type GameSave } from "core";
import { SAVE_SCHEMA_VERSION } from "./types";

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
];

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
