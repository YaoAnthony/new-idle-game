import type { GameSave, WorldSave } from "core";
import { migrateSave } from "./migrations";
import { hydrateGameSave } from "./serialize";

/**
 * Data/Save **对外的灌入口**。`hydrateGameSave` 本身不出这个目录
 * （`tests/saveBoundary.test.ts` 守着）——因为直接调它的人会忘记迁移：
 * 云冲突框选"用云端"那条路就是这么把一份没迁移的老档灌进运行时、
 * 再被当成基线写死的（审计 2026-09-13）。三条入口各管一种换世界，
 * 迁移、模式、事务都在里面，调用方不用记。
 */

export type LoadIntoRuntimeOutcome = { ok: true; save: GameSave } | { ok: false; message: string };

/** 读自己的档：先迁移再灌。仓库读出来的档已经迁过，再过一遍是幂等的 */
export function loadSaveIntoRuntime(raw: GameSave): LoadIntoRuntimeOutcome {
  const migrated = migrateSave(raw);
  if (!migrated.ok) return migrated;
  hydrateGameSave(migrated.save, "load");
  return { ok: true, save: migrated.save };
}

/**
 * 做客：把房主的世界灌进运行时。
 *
 * 玩家侧数据用**自己的快照**（背包、需求、形象都是自己的），只有 ownWorld
 * 换成房主的；三个字段例外：
 * - position 置空 → 回退到出生点。自己家的坐标在别人家毫无意义；
 * - restingOn 置空 → 那是自己家某件家具的引用，在这边是悬空指针；
 * - activeActionProcess 置空 → /join 入口已经挡了"行动中不能出门"，
 *   这里是双保险（它绑着自己家的家具）。
 */
export function enterWorldSnapshot(ownSnapshot: GameSave, hostWorld: WorldSave): void {
  const synthetic: GameSave = {
    meta: ownSnapshot.meta,
    player: {
      ...ownSnapshot.player,
      character: {
        ...ownSnapshot.player.character,
        position: undefined,
        restingOn: null,
      },
      activeActionProcess: undefined,
    },
    ownWorld: hostWorld,
  };
  hydrateGameSave(synthetic, "enter_remote_world");
}

/** 回家：合成好的"自家世界 + 现在的背包"灌回运行时（合成规则在 Multiplayer/session） */
export function exitWorldSnapshot(final: GameSave): void {
  hydrateGameSave(final, "exit_remote_world");
}
