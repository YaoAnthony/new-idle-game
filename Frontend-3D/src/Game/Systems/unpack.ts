import { findLootTable, type LootEntry } from "core";
import { emit } from "../EventBus";
import { addItem } from "../State/inventory";
import { getWorld, removeFurniture } from "../State/worldRuntime";

/**
 * 一次性容器（搬家纸箱、任务奖励箱）。
 *
 * 流程刻意分成两步：**先展示、后领取**。按 F 只是打开面板让玩家看清
 * 拿到了什么，点"收下"才真的入包并让箱子消失——直接塞进背包的话，
 * 开箱这一下就没有任何"打开礼物"的分量了。
 *
 * 后果集中在 claim 里：物品入包、家具移除、发剧情信号。
 * 面板只负责显示和转达玩家的意图。
 */

export type PendingUnpack = {
  instanceId: string;
  lootTableId: string;
  localizationKey: string;
  entries: LootEntry[];
};

let pending: PendingUnpack | null = null;

export function getPendingUnpack(): PendingUnpack | null {
  return pending;
}

/**
 * 打开某个容器。找不到战利品表就当空箱子——直接移除，
 * 不要弹一个空面板让玩家对着发呆。
 */
export function openUnpack(instanceId: string): boolean {
  const placed = getWorld().placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  if (!placed) return false;

  const tableId = placed.state?.lootTableId;
  const table = tableId ? findLootTable(tableId) : undefined;
  if (!table || table.entries.length === 0) {
    removeFurniture(instanceId);
    return false;
  }

  pending = {
    instanceId,
    lootTableId: table.id,
    localizationKey: table.localizationKey,
    entries: table.entries,
  };
  emit("unpack_changed", { open: true });
  return true;
}

/** 收下：物品入包、箱子消失。这是整条链里唯一改状态的地方 */
export function claimUnpack(): void {
  const current = pending;
  if (!current) return;

  for (const entry of current.entries) {
    addItem(entry.itemId, entry.quantity);
  }
  removeFurniture(current.instanceId);

  pending = null;
  emit("unpack_changed", { open: false });
  emit("story_signal", { kind: "unpacked", subject: current.lootTableId });
}

/** 关掉面板但不领取（箱子还在，可以再来） */
export function dismissUnpack(): void {
  if (!pending) return;
  pending = null;
  emit("unpack_changed", { open: false });
}
