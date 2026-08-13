import { beforeEach, describe, expect, test } from "vitest";
import { ItemQuality } from "core";

import {
  HOTBAR_SIZE,
  INVENTORY_SIZE,
  addItem,
  getCount,
  getCounts,
  getInventory,
  getSelectedStack,
  getStackAt,
  isLoadedWare,
  moveStack,
  peekConsumeQuality,
  placeInFirstFreeSlot,
  removeFromSlot,
  removeItem,
  restoreInventory,
  selectHotbarSlot,
  setStackAt,
  snapshotInventory,
  sortBackpack,
  spoilExpiredFood,
} from "../src/Game/State/inventory";

/**
 * 背包。**一个数组，前 8 格就是快捷栏**——"手上拿的"就是选中的那一格，
 * 没有第二个存放地。
 *
 * 这里盯的几条都有过真实事故或明确设计意图：
 * - `NaN` 槽位号必须被挡住（来自 DOM 的 data-slot 解析），漏了会静默吞东西；
 * - 装着菜的盘子不参与"我有几个盘子"的计数，否则合成会连菜一起吞掉；
 * - 合堆看的是**整个实例状态**，不是一张手写的字段清单；
 * - 扣除顺序（背包段优先）必须和 `peekConsumeQuality` 一致，
 *   否则"吃的是焦的、算的是上乘的"。
 */

beforeEach(() => {
  restoreInventory([]);
  selectHotbarSlot(0);
});

const slotsWithItems = () => getInventory().filter(Boolean);

// ---- 基本填充 ----

test("空位从 0 号找起，所以先进快捷栏、满了才溢到背包段", () => {
  addItem("wood", 1);
  expect(getStackAt(0)?.itemId).toBe("wood");

  // 占满快捷栏（木头堆叠上限很高，用不同物品占格）
  restoreInventory([]);
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    setStackAt(i, { itemId: "wood", count: 1 });
  }
  addItem("stick", 1);
  expect(getStackAt(HOTBAR_SIZE)?.itemId).toBe("stick");
});

test("先合进已有堆，合不下才占新格", () => {
  addItem("wood", 3);
  addItem("wood", 5);

  expect(slotsWithItems()).toHaveLength(1);
  expect(getCount("wood")).toBe(8);
});

test("超过堆叠上限时自动分格", () => {
  addItem("wood", 250); // wood 上限 99

  const woodSlots = getInventory().filter((slot) => slot?.itemId === "wood");
  expect(woodSlots.length).toBeGreaterThan(1);
  expect(getCount("wood")).toBe(250);
});

test("不存在的物品和非正数量一律不进背包", () => {
  addItem("根本没有这件东西", 5);
  addItem("wood", 0);
  addItem("wood", -3);

  expect(slotsWithItems()).toHaveLength(0);
});

test("背包满了之后多出来的东西进不来，但已有的不受影响", () => {
  for (let i = 0; i < INVENTORY_SIZE; i += 1) {
    setStackAt(i, { itemId: "stick", count: 99 });
  }
  addItem("wood", 1);

  expect(getCount("wood")).toBe(0);
  expect(getCount("stick")).toBe(INVENTORY_SIZE * 99);
});

// ---- 合堆规则 ----

describe("合堆看的是整个实例状态，不是一张手写清单", () => {
  test("品质不同不合堆", () => {
    setStackAt(0, { itemId: "fried_egg", count: 1, quality: ItemQuality.Excellent });
    setStackAt(1, { itemId: "fried_egg", count: 1, quality: ItemQuality.Poor });
    moveStack(1, 0);

    // 换位而不是合并——两盘菜不是同一个东西
    expect(getStackAt(0)?.quality).toBe(ItemQuality.Poor);
    expect(getStackAt(1)?.quality).toBe(ItemQuality.Excellent);
  });

  test("保质期不同不合堆", () => {
    setStackAt(0, { itemId: "fried_egg", count: 1, expiresAtUtc: "2026-08-13T00:00:00.000Z" });
    setStackAt(1, { itemId: "fried_egg", count: 1, expiresAtUtc: "2026-08-14T00:00:00.000Z" });
    moveStack(1, 0);

    expect(getStackAt(0)?.expiresAtUtc).toBe("2026-08-14T00:00:00.000Z");
    expect(getStackAt(1)?.expiresAtUtc).toBe("2026-08-13T00:00:00.000Z");
  });

  test("装着不同内容的两口锅不合堆——锅是个状态机", () => {
    setStackAt(0, {
      itemId: "wok",
      count: 1,
      container: { items: [{ itemId: "egg", quantity: 1 }], heatSeconds: 3 },
    });
    setStackAt(1, {
      itemId: "wok",
      count: 1,
      container: { items: [{ itemId: "tomato", quantity: 1 }], heatSeconds: 3 },
    });
    moveStack(1, 0);

    expect(getStackAt(0)?.container?.items[0].itemId).toBe("tomato");
    expect(getStackAt(1)?.container?.items[0].itemId).toBe("egg");
  });

  test("内容相同但字段书写顺序不同的两份要能合堆", () => {
    /*
     * 直接 JSON.stringify 会按插入顺序输出，两份本该相同的嵌套状态会被
     * 判成不同，于是静默地占两格。
     *
     * 用 wood 而不是 wok 来验：**锅的 stackLimit 是 1**，无论同不同类都
     * 合不起来，拿它当样本这条用例永远是绿的——测不出任何东西。
     * 挂在 wood 上的 container 语义上确实古怪，但这里问的只是
     * "嵌套状态的比较认不认字段顺序"。
     */
    const nested = { items: [{ itemId: "egg", quantity: 1 }], heatSeconds: 3 };

    setStackAt(0, {
      itemId: "wood",
      count: 1,
      container: { heatSeconds: 3, items: [{ quantity: 1, itemId: "egg" }] },
    });
    setStackAt(1, { itemId: "wood", count: 1, container: nested });
    moveStack(1, 0);

    expect(getStackAt(0)?.count).toBe(2);
    expect(getStackAt(1)).toBeNull();
  });

  test("嵌套状态真的不同的两份仍然不合堆", () => {
    setStackAt(0, {
      itemId: "wood",
      count: 1,
      container: { items: [{ itemId: "egg", quantity: 1 }], heatSeconds: 3 },
    });
    setStackAt(1, {
      itemId: "wood",
      count: 1,
      container: { items: [{ itemId: "egg", quantity: 2 }], heatSeconds: 3 },
    });
    moveStack(1, 0);

    // 异物互换，不是合并
    expect(getStackAt(0)?.container?.items[0].quantity).toBe(2);
    expect(getStackAt(1)?.container?.items[0].quantity).toBe(1);
  });
});

// ---- 装着东西的容器 ----

test("装着菜的盘子不参与按 itemId 的计数——否则合成会连菜一起吞掉", () => {
  setStackAt(0, { itemId: "plate", count: 1 });
  setStackAt(1, {
    itemId: "plate",
    count: 1,
    container: { items: [{ itemId: "fried_egg", quantity: 1 }], heatSeconds: 0 },
  });

  expect(getCount("plate")).toBe(1);
  expect(isLoadedWare(getStackAt(1))).toBe(true);
  expect(isLoadedWare(getStackAt(0))).toBe(false);
});

test("扣盘子时跳过装着菜的那个", () => {
  setStackAt(0, {
    itemId: "plate",
    count: 1,
    container: { items: [{ itemId: "fried_egg", quantity: 1 }], heatSeconds: 0 },
  });
  setStackAt(9, { itemId: "plate", count: 1 });

  expect(removeItem("plate", 1)).toBe(true);
  // 被端走的是那个空盘，装着菜的还在
  expect(getStackAt(0)?.container?.items).toHaveLength(1);
  expect(getStackAt(9)).toBeNull();
});

// ---- 扣除 ----

test("数量不够时整笔拒绝，不扣半截", () => {
  addItem("wood", 2);

  expect(removeItem("wood", 5)).toBe(false);
  expect(getCount("wood")).toBe(2);
});

test("扣除按背包段优先，和 peekConsumeQuality 报的是同一堆", () => {
  // 快捷栏放上乘的，背包段放焦的
  setStackAt(0, { itemId: "fried_egg", count: 1, quality: ItemQuality.Excellent });
  setStackAt(HOTBAR_SIZE, { itemId: "fried_egg", count: 1, quality: ItemQuality.Poor });

  const nextQuality = peekConsumeQuality("fried_egg");
  expect(nextQuality).toBe(ItemQuality.Poor);

  removeItem("fried_egg", 1);
  // 吃掉的确实是背包段那盘焦的
  expect(getStackAt(HOTBAR_SIZE)).toBeNull();
  expect(getStackAt(0)?.quality).toBe(ItemQuality.Excellent);
});

test("removeFromSlot 只动指定那一格（送礼要的就是这个）", () => {
  setStackAt(0, { itemId: "fried_egg", count: 1, quality: ItemQuality.Excellent });
  setStackAt(1, { itemId: "fried_egg", count: 2, quality: ItemQuality.Poor });

  expect(removeFromSlot(1, 1)).toBe(true);
  expect(getStackAt(1)?.count).toBe(1);
  expect(getStackAt(0)?.count).toBe(1);

  // 数量不够 / 空格 / 坏下标都拒绝
  expect(removeFromSlot(1, 5)).toBe(false);
  expect(removeFromSlot(30, 1)).toBe(false);
  expect(removeFromSlot(Number.NaN, 1)).toBe(false);
});

// ---- 槽位号的 NaN 防线 ----

test("NaN 槽位号一律挡住——光比大小挡不住它", () => {
  addItem("wood", 5);

  // NaN 会在数组上挂一个叫 "NaN" 的属性，看着像成功了，实际东西没了
  moveStack(0, Number.NaN);
  expect(getCount("wood")).toBe(5);
  expect(getStackAt(0)?.count).toBe(5);

  moveStack(Number.NaN, 1);
  expect(getCount("wood")).toBe(5);

  setStackAt(Number.NaN, { itemId: "stick", count: 1 });
  expect(getCount("stick")).toBe(0);
});

test("越界和小数槽位号同样挡住", () => {
  addItem("wood", 5);

  for (const bad of [-1, INVENTORY_SIZE, 1.5, Number.POSITIVE_INFINITY]) {
    moveStack(0, bad);
    setStackAt(bad, { itemId: "stick", count: 1 });
  }
  expect(getCount("wood")).toBe(5);
  expect(getCount("stick")).toBe(0);
});

// ---- 拖拽 ----

describe("moveStack：空位移入 / 同物合堆 / 异物互换", () => {
  test("移进空位", () => {
    addItem("wood", 3);
    moveStack(0, 20);

    expect(getStackAt(0)).toBeNull();
    expect(getStackAt(20)?.count).toBe(3);
  });

  test("同物合堆，溢出的留在原格", () => {
    setStackAt(0, { itemId: "wood", count: 60 });
    setStackAt(1, { itemId: "wood", count: 60 });
    moveStack(0, 1);

    expect(getStackAt(1)?.count).toBe(99);
    expect(getStackAt(0)?.count).toBe(21);
    expect(getCount("wood")).toBe(120);
  });

  test("异物互换", () => {
    setStackAt(0, { itemId: "wood", count: 1 });
    setStackAt(1, { itemId: "stick", count: 2 });
    moveStack(0, 1);

    expect(getStackAt(0)?.itemId).toBe("stick");
    expect(getStackAt(1)?.itemId).toBe("wood");
  });

  test("拖到自己身上、拖空格都不产生任何变化", () => {
    addItem("wood", 3);
    moveStack(0, 0);
    moveStack(5, 6);

    expect(getCount("wood")).toBe(3);
    expect(getStackAt(0)?.count).toBe(3);
  });
});

// ---- 选中格 = 手上 ----

test("切换快捷栏只改下标，东西一步都不动", () => {
  setStackAt(0, { itemId: "wok", count: 1 });
  setStackAt(3, { itemId: "plate", count: 1 });

  selectHotbarSlot(0);
  expect(getSelectedStack()?.itemId).toBe("wok");

  selectHotbarSlot(3);
  expect(getSelectedStack()?.itemId).toBe("plate");
  // 两格里的东西都还在原位
  expect(getStackAt(0)?.itemId).toBe("wok");
  expect(getStackAt(3)?.itemId).toBe("plate");
});

test("getSelectedStack 返回副本，改它不该影响背包", () => {
  addItem("wood", 3);
  const copy = getSelectedStack();
  if (copy) copy.count = 999;

  expect(getStackAt(0)?.count).toBe(3);
});

test("placeInFirstFreeSlot 连容器一起塞回去，塞不下返回 false", () => {
  const pot = {
    itemId: "wok",
    count: 1,
    container: { items: [{ itemId: "egg", quantity: 1 }], heatSeconds: 5 },
  };

  expect(placeInFirstFreeSlot(pot)).toBe(true);
  expect(getStackAt(0)?.container?.heatSeconds).toBe(5);

  for (let i = 0; i < INVENTORY_SIZE; i += 1) setStackAt(i, { itemId: "stick", count: 1 });
  expect(placeInFirstFreeSlot(pot)).toBe(false);
});

// ---- 保质期 ----

test("过期食物只降品质不删除——让攒的东西凭空消失会制造焦虑", () => {
  setStackAt(0, {
    itemId: "fried_egg",
    count: 3,
    quality: ItemQuality.Excellent,
    expiresAtUtc: "2026-08-12T00:00:00.000Z",
  });

  const spoiled = spoilExpiredFood("2026-08-12");
  expect(spoiled).toBe(3);
  expect(getStackAt(0)?.count).toBe(3);
  expect(getStackAt(0)?.quality).toBe(ItemQuality.Poor);
  // 期限清掉，免得每天重复触发
  expect(getStackAt(0)?.expiresAtUtc).toBeUndefined();
  expect(spoilExpiredFood("2026-08-20")).toBe(0);
});

test("没到期的不动", () => {
  setStackAt(0, {
    itemId: "fried_egg",
    count: 1,
    quality: ItemQuality.Excellent,
    expiresAtUtc: "2026-08-20T00:00:00.000Z",
  });

  expect(spoilExpiredFood("2026-08-12")).toBe(0);
  expect(getStackAt(0)?.quality).toBe(ItemQuality.Excellent);
});

// ---- 存档往返 ----

test("槽位位置进存档并原样读回——玩家摆好的快捷栏读档后不能乱", () => {
  setStackAt(0, { itemId: "wok", count: 1 });
  setStackAt(5, { itemId: "wood", count: 42, quality: ItemQuality.Good });
  setStackAt(31, { itemId: "stick", count: 7 });

  const snapshot = snapshotInventory();
  restoreInventory([]);
  expect(slotsWithItems()).toHaveLength(0);

  restoreInventory(snapshot);
  expect(getStackAt(0)?.itemId).toBe("wok");
  expect(getStackAt(5)?.count).toBe(42);
  expect(getStackAt(5)?.quality).toBe(ItemQuality.Good);
  expect(getStackAt(31)?.itemId).toBe("stick");
});

test("锅里的东西跟着进存档", () => {
  setStackAt(2, {
    itemId: "wok",
    count: 1,
    container: { items: [{ itemId: "egg", quantity: 2 }], heatSeconds: 4.5 },
  });

  restoreInventory(snapshotInventory());
  expect(getStackAt(2)?.container?.items[0].quantity).toBe(2);
  expect(getStackAt(2)?.container?.heatSeconds).toBe(4.5);
});

test("坏记录被丢弃，不带崩整份存档", () => {
  restoreInventory([
    { stackId: "slot:0", itemId: "wood", quantity: 1 },
    { stackId: "hotbar:1", itemId: "wood", quantity: 1 }, // 老编码，该由迁移换算
    { stackId: "slot:999", itemId: "wood", quantity: 1 }, // 越界
    { stackId: "slot:abc", itemId: "wood", quantity: 1 }, // 残缺
    { stackId: "slot:3", itemId: "早就删掉的物品", quantity: 1 },
  ]);

  expect(slotsWithItems()).toHaveLength(1);
  expect(getStackAt(0)?.itemId).toBe("wood");
});

// ---- 整理 ----

test("整理只动背包段，快捷栏是玩家的肌肉记忆", () => {
  setStackAt(0, { itemId: "wok", count: 1 });
  setStackAt(3, { itemId: "plate", count: 1 });
  setStackAt(20, { itemId: "wood", count: 3 });
  setStackAt(25, { itemId: "wood", count: 4 });

  sortBackpack();

  expect(getStackAt(0)?.itemId).toBe("wok");
  expect(getStackAt(3)?.itemId).toBe("plate");
  // 背包段合成一堆并顶到最前
  expect(getStackAt(HOTBAR_SIZE)?.itemId).toBe("wood");
  expect(getStackAt(HOTBAR_SIZE)?.count).toBe(7);
  expect(getStackAt(20)).toBeNull();
});

test("整理不把品质不同的两堆搅在一起——那是数据损坏不是整理", () => {
  setStackAt(20, { itemId: "fried_egg", count: 1, quality: ItemQuality.Excellent });
  setStackAt(25, { itemId: "fried_egg", count: 1, quality: ItemQuality.Poor });

  sortBackpack();

  const eggs = getInventory().filter((slot) => slot?.itemId === "fried_egg");
  expect(eggs).toHaveLength(2);
});

test("getCounts 汇总所有格子", () => {
  setStackAt(0, { itemId: "wood", count: 3 });
  setStackAt(10, { itemId: "wood", count: 4 });
  setStackAt(11, { itemId: "stick", count: 2 });

  expect(getCounts()).toEqual({ wood: 7, stick: 2 });
});
