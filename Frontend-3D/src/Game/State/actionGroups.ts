import type { ActionGroupSave, PlayerActionEntry } from "core";
import { emit } from "../EventBus";
import { nowUtc } from "./clock";

/**
 * 任务组（清单上的文件夹）的状态：建 / 删 / 拖入 / 拖出 / 组内排序。
 *
 * 跟着玩家走（存 `PlayerSave.actionGroups`）。**只管成员关系和顺序**，
 * 条目本身仍然住在 `Systems/actions` 的清单里——组是给清单加的一层
 * 索引，不是另一份清单。所以这里没有"开始一条"之类的动作：开始就是
 * 开始清单里那条 entry，和它在不在组里无关。
 *
 * ---- 悬空 id ----
 *
 * 成员只存 id（理由见 Core 的 ActionGroupSave）。条目被删（做完、手删）
 * 时 `Systems/actions` 会调 `detachEntry` 同步剔除；`layout` 读取时再按
 * 现存条目过滤一遍——两道闸，后一道兜住任何漏网的路径（联机重放、
 * 旧存档、以后新加的删除入口）。
 */

let groups: ActionGroupSave[] = [];

let counter = 0;
function nextId(): string {
  counter += 1;
  return `group-${Date.now().toString(36)}-${counter}`;
}

function changed(): void {
  emit("action_groups_changed", {});
}

// ---- 读 ----

export function getActionGroups(): readonly ActionGroupSave[] {
  return groups;
}

export function getActionGroup(groupId: string): ActionGroupSave | undefined {
  return groups.find((group) => group.groupId === groupId);
}

/** 这条在哪个组里（不在任何组里 = undefined） */
export function groupOfEntry(entryId: string): ActionGroupSave | undefined {
  return groups.find((group) => group.entryIds.includes(entryId));
}

export type GroupLayout = {
  /** 每个组和它现存的成员，按成员顺序；第一条就是露在外面的那条 */
  groups: Array<{ group: ActionGroupSave; members: PlayerActionEntry[] }>;
  /** 不在任何组里的散条目，保持清单原有顺序 */
  loose: PlayerActionEntry[];
};

/**
 * 把一份清单按组摊开。**纯函数**，两处 UI（行动面板、日记本左页）共用，
 * 各自套皮——分组规则只能有一份。
 *
 * 组排在散条目前面（文件管理器的惯例：文件夹在上）。组里的悬空 id 在这里
 * 被过滤掉，空组照样返回——空文件夹是玩家刚建好、还没往里拖东西的状态，
 * 得显示出来让他拖。
 */
export function layoutEntries(entries: readonly PlayerActionEntry[]): GroupLayout {
  const byId = new Map(entries.map((entry) => [entry.entryId, entry]));
  const grouped = new Set<string>();

  const laidOut = groups.map((group) => {
    const members: PlayerActionEntry[] = [];
    for (const id of group.entryIds) {
      const entry = byId.get(id);
      if (!entry) continue;
      members.push(entry);
      grouped.add(id);
    }
    return { group, members };
  });

  return {
    groups: laidOut,
    loose: entries.filter((entry) => !grouped.has(entry.entryId)),
  };
}

// ---- 写 ----

/** 建一个空组。玩家只填名字；空名字给个占位，别让一个没名字的文件夹出现 */
export function createActionGroup(name: string): ActionGroupSave {
  const group: ActionGroupSave = {
    groupId: nextId(),
    name: name.trim() || "系列任务",
    createdAtUtc: nowUtc(),
    entryIds: [],
  };
  groups = [...groups, group];
  changed();
  return group;
}

export function renameActionGroup(groupId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  groups = groups.map((group) =>
    group.groupId === groupId ? { ...group, name: trimmed } : group,
  );
  changed();
}

/**
 * 删组。**成员不删**——它们回到散条目里。删文件夹删掉里面的文件是
 * 桌面系统的语义，这里不是：那些是玩家写下的要做的事，文件夹只是
 * 给它们排了个顺序，取消排序不该连事情一起取消。
 */
export function deleteActionGroup(groupId: string): void {
  const before = groups.length;
  groups = groups.filter((group) => group.groupId !== groupId);
  if (groups.length !== before) changed();
}

/**
 * 把一条搬进某个组的某个位置（搬家，不是复制：先从所有组里摘掉）。
 * `groupId` 为 null = 拖出来变回散条目。`index` 缺省 = 排到末尾。
 */
export function moveEntryToGroup(
  entryId: string,
  groupId: string | null,
  index?: number,
): void {
  groups = groups.map((group) => ({
    ...group,
    entryIds: group.entryIds.filter((id) => id !== entryId),
  }));

  if (groupId !== null) {
    const target = groups.find((group) => group.groupId === groupId);
    if (!target) return;
    const at = index === undefined ? target.entryIds.length : Math.max(0, Math.min(index, target.entryIds.length));
    target.entryIds = [
      ...target.entryIds.slice(0, at),
      entryId,
      ...target.entryIds.slice(at),
    ];
  }
  changed();
}

/** 组内挪位置：把 entryId 放到第 toIndex 位（以摘掉它之后的数组计） */
export function reorderInGroup(groupId: string, entryId: string, toIndex: number): void {
  const group = groups.find((item) => item.groupId === groupId);
  if (!group || !group.entryIds.includes(entryId)) return;
  const rest = group.entryIds.filter((id) => id !== entryId);
  const at = Math.max(0, Math.min(toIndex, rest.length));
  group.entryIds = [...rest.slice(0, at), entryId, ...rest.slice(at)];
  changed();
}

/**
 * 条目没了（做完 / 手删）→ 从所有组里摘掉。由 `Systems/actions` 在删
 * entry 的那一处调用；这里不发 action_groups_changed 之外的事件。
 */
export function detachEntry(entryId: string): void {
  // 不在任何组里就什么都不动——连数组引用都不换，别让无关的删除触发一轮重画
  if (!groups.some((group) => group.entryIds.includes(entryId))) return;
  groups = groups.map((group) =>
    group.entryIds.includes(entryId)
      ? { ...group, entryIds: group.entryIds.filter((id) => id !== entryId) }
      : group,
  );
  changed();
}

// ---- 存档 ----

export function snapshotActionGroups(): ActionGroupSave[] {
  return groups;
}

export function restoreActionGroups(saved: ActionGroupSave[] | undefined): void {
  groups = saved ?? [];
  changed();
}
