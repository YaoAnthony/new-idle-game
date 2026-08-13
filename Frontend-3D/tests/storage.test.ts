import { beforeEach, expect, test, vi } from "vitest";
import { ItemQuality } from "core";

import {
  STORAGE_SIZE,
  addToStorage,
  clearStorage,
  getAllStorageCounts,
  getStorage,
  isStorageEmpty,
  pruneOrphanStorages,
  removeFromStorage,
  replayStorageBox,
  restoreStorages,
  setStorageSlot,
  snapshotStorages,
  storageIdFor,
} from "../src/Game/State/storage";
import { on } from "../src/Game/EventBus";

/**
 * 储物家具。内容**属于世界不属于玩家**（联机进朋友家看到的是他的箱子），
 * 所以每次本地改动都要往 op 通道发一条整箱替换。
 *
 * 箱级替换而不是逐格 diff 是刻意的：两个人同时翻一个箱子时，箱级是
 * "后写的赢一整箱"，逐格会拼出一个谁都没见过的混合箱。
 */

const BOX = storageIdFor("local:furniture:furniture_storage_chest#1");

beforeEach(() => {
  restoreStorages({});
});

test("新箱子是 STORAGE_SIZE 个空格", () => {
  const slots = getStorage(BOX);

  expect(slots).toHaveLength(STORAGE_SIZE);
  expect(slots.every((slot) => slot === null)).toBe(true);
  expect(isStorageEmpty(BOX)).toBe(true);
});

test("getStorage 返回副本，改它不影响真箱子", () => {
  addToStorage(BOX, "wood", 3);
  const slots = getStorage(BOX);
  slots[0] = { itemId: "被篡改", count: 999 };

  expect(getStorage(BOX)[0]?.itemId).toBe("wood");
});

test("塞东西走先合堆再找空位", () => {
  expect(addToStorage(BOX, "wood", 3)).toBe(0);
  expect(addToStorage(BOX, "wood", 5)).toBe(0);

  const filled = getStorage(BOX).filter(Boolean);
  expect(filled).toHaveLength(1);
  expect(filled[0]?.count).toBe(8);
});

test("超过堆叠上限自动分格", () => {
  addToStorage(BOX, "wood", 250); // 上限 99

  const filled = getStorage(BOX).filter(Boolean);
  expect(filled).toHaveLength(3);
  expect(filled.reduce((sum, slot) => sum + (slot?.count ?? 0), 0)).toBe(250);
});

test("塞不下的部分原样退回（返回值就是没塞进去的数量）", () => {
  const capacity = STORAGE_SIZE * 99;
  const leftover = addToStorage(BOX, "wood", capacity + 7);

  expect(leftover).toBe(7);
  expect(getAllStorageCounts().wood).toBe(capacity);
});

test("不存在的物品、非正数量一律不进箱子", () => {
  expect(addToStorage(BOX, "根本没有这件东西", 5)).toBe(5);
  expect(addToStorage(BOX, "wood", 0)).toBe(0);
  expect(isStorageEmpty(BOX)).toBe(true);
});

test("品质/保质期不同的两份分格放，不混堆", () => {
  addToStorage(BOX, "fried_egg", 1, ItemQuality.Excellent);
  addToStorage(BOX, "fried_egg", 1, ItemQuality.Poor);

  const filled = getStorage(BOX).filter(Boolean);
  expect(filled).toHaveLength(2);
});

test("跨箱子汇总数量（工作台要读家里所有箱子）", () => {
  const other = storageIdFor("local:furniture:furniture_bookshelf#1");
  addToStorage(BOX, "wood", 3);
  addToStorage(other, "wood", 4);
  addToStorage(other, "stick", 2);

  expect(getAllStorageCounts()).toEqual({ wood: 7, stick: 2 });
});

test("跨箱子扣除，不够时不扣成负数", () => {
  const other = storageIdFor("local:furniture:furniture_bookshelf#1");
  addToStorage(BOX, "wood", 3);
  addToStorage(other, "wood", 4);

  expect(removeFromStorage("wood", 5)).toBe(5);
  expect(getAllStorageCounts().wood).toBe(2);

  // 只剩 2 个时要 10 个，只能给 2
  expect(removeFromStorage("wood", 10)).toBe(2);
  expect(getAllStorageCounts().wood ?? 0).toBe(0);
});

test("扣光的格子变回 null，而不是留一个 0", () => {
  addToStorage(BOX, "wood", 3);
  removeFromStorage("wood", 3);

  expect(isStorageEmpty(BOX)).toBe(true);
});

test("setStorageSlot 的越界下标被忽略", () => {
  setStorageSlot(BOX, -1, { itemId: "wood", count: 1 });
  setStorageSlot(BOX, STORAGE_SIZE, { itemId: "wood", count: 1 });

  expect(isStorageEmpty(BOX)).toBe(true);

  setStorageSlot(BOX, 5, { itemId: "wood", count: 1 });
  expect(getStorage(BOX)[5]?.itemId).toBe("wood");
});

// ---- op 通道 ----

test("本地每次改动都往 op 通道发一条整箱替换", () => {
  const ops: unknown[] = [];
  const off = on("world_op", ({ op }) => ops.push(op));

  addToStorage(BOX, "wood", 3);

  expect(ops).toHaveLength(1);
  const op = ops[0] as { kind: string; box: { inventoryId: string; stacks: unknown[] } };
  expect(op.kind).toBe("storage_box_set");
  expect(op.box.inventoryId).toBe(BOX);
  expect(op.box.stacks).toHaveLength(1);
  off();
});

test("家具被收走时空箱也要广播——否则重摆会继承别人视角里的幽灵内容", () => {
  addToStorage(BOX, "wood", 3);

  const ops: Array<{ kind: string; box: { stacks: unknown[] } }> = [];
  const off = on("world_op", ({ op }) => ops.push(op as never));

  clearStorage(BOX);

  expect(ops).toHaveLength(1);
  expect(ops[0].box.stacks).toEqual([]);
  off();
});

test("重放别人的改动不再发 op——收一条发一条会成回环", () => {
  const listener = vi.fn();
  const off = on("world_op", listener);

  replayStorageBox({
    inventoryId: BOX,
    stacks: [{ stackId: `${BOX}@2`, itemId: "wood", quantity: 5 }],
  });

  expect(listener).not.toHaveBeenCalled();
  expect(getStorage(BOX)[2]?.count).toBe(5);
  off();
});

test("重放是整箱替换：原来的内容被完全顶掉", () => {
  addToStorage(BOX, "stick", 9);

  replayStorageBox({
    inventoryId: BOX,
    stacks: [{ stackId: `${BOX}@0`, itemId: "wood", quantity: 1 }],
  });

  expect(getAllStorageCounts()).toEqual({ wood: 1 });
});

test("重放时坏记录被跳过，好的照常进", () => {
  replayStorageBox({
    inventoryId: BOX,
    stacks: [
      { stackId: `${BOX}@0`, itemId: "wood", quantity: 1 },
      { stackId: `${BOX}@999`, itemId: "wood", quantity: 1 }, // 越界
      { stackId: `${BOX}@abc`, itemId: "wood", quantity: 1 }, // 残缺
      { stackId: `${BOX}@3`, itemId: "早就删掉的物品", quantity: 1 },
    ],
  });

  expect(getStorage(BOX).filter(Boolean)).toHaveLength(1);
});

// ---- 存档 ----

test("存档往返保留槽位位置和状态", () => {
  setStorageSlot(BOX, 7, {
    itemId: "fried_egg",
    count: 2,
    quality: ItemQuality.Excellent,
    expiresAtUtc: "2026-08-14T00:00:00.000Z",
  });

  const snapshot = snapshotStorages();
  restoreStorages({});
  expect(isStorageEmpty(BOX)).toBe(true);

  restoreStorages(snapshot);
  const slot = getStorage(BOX)[7];
  expect(slot?.itemId).toBe("fried_egg");
  expect(slot?.count).toBe(2);
  expect(slot?.quality).toBe(ItemQuality.Excellent);
  expect(slot?.expiresAtUtc).toBe("2026-08-14T00:00:00.000Z");
});

test("空箱子不进存档，省得存档里堆一堆空壳", () => {
  getStorage(BOX); // 只是打开看了一眼
  expect(snapshotStorages()).toEqual({});
});

test("restoreStorages(undefined) 清空而不是崩", () => {
  addToStorage(BOX, "wood", 1);
  restoreStorages(undefined);

  expect(getAllStorageCounts()).toEqual({});
});

test("幽灵箱子被清掉——家具没了，里面的东西不该永远占着存档", () => {
  const alive = "local:furniture:furniture_storage_chest#1";
  const gone = "local:furniture:furniture_bookshelf#9";
  addToStorage(storageIdFor(alive), "wood", 1);
  addToStorage(storageIdFor(gone), "stick", 1);

  pruneOrphanStorages([alive]);

  expect(getAllStorageCounts()).toEqual({ wood: 1 });
});

test("清空所有家具时所有箱子一起没", () => {
  addToStorage(BOX, "wood", 1);
  pruneOrphanStorages([]);

  expect(snapshotStorages()).toEqual({});
});
