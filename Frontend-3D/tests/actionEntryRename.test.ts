import { beforeEach, expect, test } from "vitest";

import {
  addActionEntry,
  getActionEntries,
  renameActionEntry,
  restoreActionEntries,
} from "../src/Game/Systems/actions";

/**
 * 日记本里双击改名（2026-09-08）。只改标题：时长、重要级、分类都不动——
 * 分类是当初按名字自动归的，改个错别字不该把一件事从创作挪去运动。
 */

beforeEach(() => restoreActionEntries([]));

test("改名只动标题，前后空格去掉", () => {
  const { entryId } = addActionEntry({
    actionId: "creation",
    customName: "写第一章",
    durationMinutes: 45,
    priority: "high" as never,
  });

  renameActionEntry(entryId, "  写第一章（修订）  ");

  const [entry] = getActionEntries();
  expect(entry.customName).toBe("写第一章（修订）");
  expect(entry.actionId).toBe("creation");
  expect(entry.durationMinutes).toBe(45);
  expect(entry.priority).toBe("high");
});

test("空名字不生效——双击进去又清空退出来，不该留下一条没名字的", () => {
  const { entryId } = addActionEntry({
    actionId: "work_study",
    customName: "原名",
    durationMinutes: 30,
    priority: "normal" as never,
  });

  renameActionEntry(entryId, "   ");

  expect(getActionEntries()[0].customName).toBe("原名");
});

test("不存在的 id 是 no-op，不抛", () => {
  addActionEntry({ actionId: "rest", customName: "午睡", durationMinutes: 20, priority: "normal" as never });
  renameActionEntry("nobody", "x");
  expect(getActionEntries()[0].customName).toBe("午睡");
});
