import { beforeEach, expect, test } from "vitest";

import {
  createActionGroup,
  deleteActionGroup,
  detachEntry,
  getActionGroups,
  groupOfEntry,
  layoutEntries,
  moveEntryToGroup,
  renameActionGroup,
  reorderInGroup,
  restoreActionGroups,
  snapshotActionGroups,
} from "../src/Game/State/actionGroups";
import {
  addActionEntry,
  getActionEntries,
  removeActionEntry,
  restoreActionEntries,
} from "../src/Game/Systems/actions";

/**
 * 任务组（清单上的文件夹，2026-09-08）。
 *
 * 成员只存 id，所以这份用例守的重点是**id 和条目之间的一致性**：
 * 搬家不是复制、删条目要从组里摘掉、悬空 id 不能漏到 UI 上。
 * 剩下的是顺序——文件夹的全部意义就是顺序。
 */

function plan(name: string): string {
  return addActionEntry({
    actionId: "work_study",
    customName: name,
    durationMinutes: 30,
    priority: "normal" as never,
  }).entryId;
}

beforeEach(() => {
  restoreActionEntries([]);
  restoreActionGroups([]);
});

test("建组只要一个名字，空名字给占位而不是空文件夹", () => {
  const named = createActionGroup("  论文  ");
  const blank = createActionGroup("   ");

  expect(named.name).toBe("论文");
  expect(named.entryIds).toEqual([]);
  expect(blank.name.length).toBeGreaterThan(0);
  expect(getActionGroups()).toHaveLength(2);
});

test("拖进去是搬家：同一条不会同时在两个组里", () => {
  const a = createActionGroup("A");
  const b = createActionGroup("B");
  const task = plan("写引言");

  moveEntryToGroup(task, a.groupId);
  moveEntryToGroup(task, b.groupId);

  expect(groupOfEntry(task)?.groupId).toBe(b.groupId);
  expect(getActionGroups().find((g) => g.groupId === a.groupId)?.entryIds).toEqual([]);
});

test("拖出来变回散条目", () => {
  const group = createActionGroup("A");
  const task = plan("x");
  moveEntryToGroup(task, group.groupId);

  moveEntryToGroup(task, null);

  expect(groupOfEntry(task)).toBeUndefined();
  expect(layoutEntries(getActionEntries()).loose.map((e) => e.entryId)).toEqual([task]);
});

test("拖入指定位置 + 组内排序", () => {
  const group = createActionGroup("A");
  const [t1, t2, t3] = [plan("1"), plan("2"), plan("3")];
  moveEntryToGroup(t1, group.groupId);
  moveEntryToGroup(t2, group.groupId);
  // 插到最前面
  moveEntryToGroup(t3, group.groupId, 0);
  expect(getActionGroups()[0].entryIds).toEqual([t3, t1, t2]);

  // 把 t3 挪到末尾
  reorderInGroup(group.groupId, t3, 5);
  expect(getActionGroups()[0].entryIds).toEqual([t1, t2, t3]);

  // 越界的下标夹住，不抛
  reorderInGroup(group.groupId, t1, -3);
  expect(getActionGroups()[0].entryIds).toEqual([t1, t2, t3]);
});

test("删条目（做完或手删）会从组里摘掉，第二条浮上来", () => {
  const group = createActionGroup("A");
  const [t1, t2] = [plan("先做"), plan("后做")];
  moveEntryToGroup(t1, group.groupId);
  moveEntryToGroup(t2, group.groupId);

  removeActionEntry(t1);

  const [laidOut] = layoutEntries(getActionEntries()).groups;
  expect(laidOut.members.map((e) => e.entryId)).toEqual([t2]);
  expect(getActionGroups()[0].entryIds).toEqual([t2]);
});

test("悬空 id（存档里留下的）不会漏到布局里", () => {
  const task = plan("还在");
  restoreActionGroups([
    {
      groupId: "g",
      name: "旧档",
      createdAtUtc: "2026-09-01T00:00:00.000Z",
      entryIds: ["already-gone", task],
    },
  ]);

  const [laidOut] = layoutEntries(getActionEntries()).groups;
  expect(laidOut.members.map((e) => e.entryId)).toEqual([task]);
});

test("删组不删成员：它们回到散条目", () => {
  const group = createActionGroup("A");
  const task = plan("要做的事");
  moveEntryToGroup(task, group.groupId);

  deleteActionGroup(group.groupId);

  expect(getActionGroups()).toHaveLength(0);
  expect(getActionEntries().map((e) => e.entryId)).toEqual([task]);
  expect(layoutEntries(getActionEntries()).loose).toHaveLength(1);
});

test("布局：组在前、散条目在后，空组照样出现", () => {
  const loose = plan("散的");
  const group = createActionGroup("空的");

  const layout = layoutEntries(getActionEntries());

  expect(layout.groups.map((g) => g.group.groupId)).toEqual([group.groupId]);
  expect(layout.groups[0].members).toEqual([]);
  expect(layout.loose.map((e) => e.entryId)).toEqual([loose]);
});

test("改名：空字符串不生效", () => {
  const group = createActionGroup("旧名");
  renameActionGroup(group.groupId, "  ");
  renameActionGroup(group.groupId, "新名");
  expect(getActionGroups()[0].name).toBe("新名");
});

test("detachEntry 对不在任何组里的 id 是 no-op", () => {
  createActionGroup("A");
  const before = snapshotActionGroups();
  detachEntry("nobody");
  expect(snapshotActionGroups()).toBe(before);
});

test("快照 / 恢复往返一致", () => {
  const group = createActionGroup("A");
  const task = plan("x");
  moveEntryToGroup(task, group.groupId);

  const saved = JSON.parse(JSON.stringify(snapshotActionGroups()));
  restoreActionGroups([]);
  expect(getActionGroups()).toHaveLength(0);
  restoreActionGroups(saved);

  expect(getActionGroups()[0].entryIds).toEqual([task]);
});
