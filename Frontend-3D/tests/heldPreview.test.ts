import { expect, test } from "vitest";
import { findItemDefinition, itemDefinitions } from "core";

import { heldPreviewOf } from "../src/Game/Systems/heldPreview";

/**
 * 选中即预瞄：手上拿什么，就自动进哪种预瞄。
 *
 * 钉的是**推导本身**，不是"储金罐图纸要能进选址"。所以下面的用例一律
 * 从注册表里现找一件带这块能力的物品，不写死物品 id——写死的话，这份
 * 测试就变成了"内容还在不在"的哨兵，而它该守的是"能力块 → 模式"这条
 * 映射。真有一天图纸全删了，该红的是内容测试，不是这里。
 */

/** 注册表里第一件带某块能力的物品。找不到就让用例自己 skip */
function firstWith(predicate: (item: (typeof itemDefinitions)[number]) => boolean) {
  return itemDefinitions.find(predicate);
}

test("图纸 → 建筑选址，建筑 id 从能力块里读", () => {
  const blueprint = firstWith((item) => item.blueprint !== undefined);
  expect(blueprint, "注册表里一件图纸都没有").toBeDefined();

  expect(heldPreviewOf(blueprint!.id)).toEqual({
    kind: "building",
    buildingId: blueprint!.blueprint!.buildingId,
  });
});

test("家具 → 布置虚影", () => {
  const furniture = firstWith(
    (item) => item.placement !== undefined && item.blueprint === undefined,
  );
  expect(furniture, "注册表里一件家具都没有").toBeDefined();

  expect(heldPreviewOf(furniture!.id)).toEqual({
    kind: "furniture",
    itemId: furniture!.id,
  });
});

test("既不能摆也不是图纸的东西 → 不进任何预瞄", () => {
  const plain = firstWith(
    (item) => item.placement === undefined && item.blueprint === undefined,
  );
  expect(plain, "注册表里全是能摆的东西？").toBeDefined();

  expect(heldPreviewOf(plain!.id)).toBeNull();
});

test("空手和未知 id 都是 null，不抛", () => {
  expect(heldPreviewOf(null)).toBeNull();
  expect(heldPreviewOf(undefined)).toBeNull();
  expect(heldPreviewOf("")).toBeNull();
  expect(heldPreviewOf("no_such_item")).toBeNull();
});

/**
 * **一件物品最多进一种预瞄。**
 *
 * 能力块本来就不排他（Core 的注释：一块蛋糕可以既能吃又能摆），所以
 * 迟早会有一件东西同时挂着两块。真到那天，这条会先红——比"场上同时
 * 浮着两个虚影"好查得多。
 */
test("每件物品的推导结果唯一且自洽", () => {
  for (const item of itemDefinitions) {
    const preview = heldPreviewOf(item.id);
    if (preview === null) {
      expect(item.blueprint, `${item.id} 是图纸却没进选址`).toBeUndefined();
      expect(item.placement, `${item.id} 能摆却没出虚影`).toBeUndefined();
      continue;
    }
    if (preview.kind === "building") {
      // 建筑 id 必须是能力块里那个，不许从物品 id 裁字符串猜
      expect(preview.buildingId).toBe(item.blueprint?.buildingId);
    } else {
      expect(preview.itemId).toBe(item.id);
      expect(findItemDefinition(preview.itemId)?.placement).toBeDefined();
    }
  }
});
