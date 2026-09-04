import { findLootTable, type LootEntry } from "core";
import { emit } from "../EventBus";
import { addItem } from "../State/inventory";
import { getWorld, removeFurniture } from "../State/worldRuntime";

/**
 * 「给你一批东西」的领取队列：一次性容器（搬家纸箱、任务奖励箱），
 * 以及**不从箱子里来的赠与**（居民托人送来的房屋图纸，2026-09-04）。
 *
 * 流程刻意分成两步：**先展示、后领取**。按 F 只是打开面板让玩家看清
 * 拿到了什么，点"收下"才真的入包并让箱子消失——直接塞进背包的话，
 * 开箱这一下就没有任何"打开礼物"的分量了。
 *
 * ## 为什么赠与也走这里而不是另开一个面板
 *
 * RewardPanel 的文件头写着"以后任何给你一批东西的场合都复用这一个"。
 * 原来它的数据源绑死在容器实例上（`instanceId` + `lootTableId`），
 * 复用只差把**来源**拆成一个可辨识联合：容器领完要拆箱子、发 unpacked
 * 信号；赠与领完什么都不用收拾。面板一行不改——它本来就只看
 * `localizationKey` 和 `entries`。
 *
 * 后果集中在 claim 里：物品入包、家具移除、发剧情信号。
 * 面板只负责显示和转达玩家的意图。
 */

/** 这批东西从哪来。领取时的收尾动作由它决定 */
export type RewardSource =
  | { kind: "container"; instanceId: string; lootTableId: string }
  /** 凭空给的（剧情 / 指令）。没有实体要拆，也没有信号要发 */
  | { kind: "grant" };

export type PendingUnpack = {
  source: RewardSource;
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
    source: { kind: "container", instanceId, lootTableId: table.id },
    localizationKey: table.localizationKey,
    entries: table.entries,
  };
  emit("unpack_changed", { open: true });
  return true;
}

/**
 * 把一批东西**经由领取面板**交给玩家（不是静默进包）。
 *
 * 已经有一批在等着领时返回 false，不排队、不覆盖：两批叠在一起玩家
 * 只会看到后一批，前一批就像没发生过。调用方自己决定是重试还是报错。
 */
export function presentItems(
  localizationKey: string,
  entries: LootEntry[],
): boolean {
  if (pending) return false;
  if (entries.length === 0) return false;
  pending = { source: { kind: "grant" }, localizationKey, entries };
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

  pending = null;
  emit("unpack_changed", { open: false });

  if (current.source.kind === "container") {
    removeFurniture(current.source.instanceId);
    emit("story_signal", { kind: "unpacked", subject: current.source.lootTableId });
  }
}

/**
 * 关掉面板但不领取。容器：箱子还在，可以再来。
 * 赠与：**东西作废**——它没有实体可以回头再开，调用方（指令）可以再发一次。
 */
export function dismissUnpack(): void {
  if (!pending) return;
  pending = null;
  emit("unpack_changed", { open: false });
}
