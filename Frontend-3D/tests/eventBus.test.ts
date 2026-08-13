import { expect, test, vi } from "vitest";

import { emit, on } from "../src/Game/EventBus";

/**
 * 事件总线。整个分层纪律都建在它上面——`Game3D` 渲染层只能通过事件影响
 * 游戏状态，不能直接改存档数据。所以它自己必须是可靠的、且**退订真的有效**：
 * 场景每次换图都要拆旧建新，退订漏一个就是一个攥着已 dispose 场景的闭包。
 */

test("订阅收得到，载荷原样传过去", () => {
  const seen: unknown[] = [];
  const off = on("world_changed", (payload) => seen.push(payload));

  emit("world_changed", { reason: "test" });

  expect(seen).toEqual([{ reason: "test" }]);
  off();
});

test("退订之后不再收到", () => {
  const listener = vi.fn();
  const off = on("world_changed", listener);

  emit("world_changed", { reason: "a" });
  off();
  emit("world_changed", { reason: "b" });

  expect(listener).toHaveBeenCalledTimes(1);
});

test("重复退订不出错", () => {
  const off = on("world_changed", () => {});
  off();
  expect(() => off()).not.toThrow();
});

test("多个订阅者都收得到，各自独立退订", () => {
  const first = vi.fn();
  const second = vi.fn();
  const offFirst = on("inventory_changed", first);
  const offSecond = on("inventory_changed", second);

  emit("inventory_changed", { reason: "add" });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);

  offFirst();
  emit("inventory_changed", { reason: "remove" });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);

  offSecond();
});

test("没人订阅的事件发出去也不出错", () => {
  expect(() => emit("world_changed", { reason: "没人听" })).not.toThrow();
});

test("事件之间互不串台", () => {
  const world = vi.fn();
  const inventory = vi.fn();
  const offWorld = on("world_changed", world);
  const offInventory = on("inventory_changed", inventory);

  emit("world_changed", { reason: "x" });

  expect(world).toHaveBeenCalledTimes(1);
  expect(inventory).not.toHaveBeenCalled();

  offWorld();
  offInventory();
});

test("同一个函数订阅两次只算一份（Set 语义）", () => {
  const listener = vi.fn();
  const offA = on("world_changed", listener);
  const offB = on("world_changed", listener);

  emit("world_changed", { reason: "x" });
  expect(listener).toHaveBeenCalledTimes(1);

  offA();
  offB();
});

test("null 载荷的事件（interact_target_changed）也能正常派发", () => {
  const seen: unknown[] = [];
  const off = on("interact_target_changed", (payload) => seen.push(payload));

  emit("interact_target_changed", null);
  emit("interact_target_changed", { kind: "door", refId: "front" });

  expect(seen).toEqual([null, { kind: "door", refId: "front" }]);
  off();
});
