import { expect, test } from "vitest";

import { itemDefinitions } from "core";

import { iconUrl } from "../src/Assets/icons";
import {
  blueprintIconUrl,
  buildingDefinitions,
  buildingIcon,
  findBuilding,
} from "../src/Buildings/index";

/**
 * 建筑图标。图按约定放在 `Assets/icons/buildings/<buildingId>/<levelId>.png`，
 * 由 `import.meta.glob` 扫成一张表（2026-09-13 从 `public/icons/` 搬进来，
 * 目录名同日统一成 id）。这一组把三件事钉在这儿：
 *
 * - 借图用的 `icon` 覆盖项指向的图真的存在；
 * - `buildingIcon` 按等级取图，缺图的等级退回前一个有图的；
 * - **商店只卖初始等级**（用户 2026-08-23 定："石傀儡里面能建的都是 LV1
 *   的，lv2 啥的就是升级界面里面能看到的"）。
 *
 * 搬进 import 之后不再读磁盘：图在不在，查 glob 那张表就知道。
 */

test("借图用的 icon 覆盖项都指得到图", () => {
  const missing: string[] = [];
  for (const definition of buildingDefinitions) {
    for (const level of definition.levels) {
      if (level.icon && !iconUrl(level.icon)) {
        missing.push(`${definition.buildingId}/${level.levelId} → ${level.icon}`);
      }
    }
  }
  expect(missing).toEqual([]);
});

test("按等级取图：有自己那张就用自己的", () => {
  const own = iconUrl("buildings/gold_jar/l1");
  expect(own).toBeTruthy();
  expect(buildingIcon("gold_jar", "l1")).toBe(own);
});

test("缺图的等级退回前一个有图的——美术一级一级补，界面不能因此开洞", () => {
  const jar = findBuilding("gold_jar")!;
  const upper = jar.levels.filter(
    (level) => !iconUrl(`buildings/gold_jar/${level.levelId}`),
  );
  // 前提：确实还有等级没配图（l2/l3 的图还没画）。哪天补齐了这条自然失效
  expect(upper.length).toBeGreaterThan(0);

  for (const level of upper) {
    // 退回去的那张必须是初始等级的图，而不是 undefined
    expect(buildingIcon("gold_jar", level.levelId)).toBe(
      iconUrl("buildings/gold_jar/l1"),
    );
  }
});

test("借图：小镇餐厅顶着玩家餐厅那张", () => {
  expect(buildingIcon("restaurant")).toBe(iconUrl("buildings/diner/l1"));
});

test("认不出的等级当成初始等级，和 findBuildingLevel 的容错一致", () => {
  expect(buildingIcon("gold_jar", "l99")).toBe(buildingIcon("gold_jar", "l1"));
});

test("不存在的建筑给 undefined，不抛", () => {
  expect(buildingIcon("no_such_building", "l1")).toBeUndefined();
});

test("能在铺子里盖的建筑，初始等级都得有图", () => {
  /*
   * 判据是"有没有图纸物品指向它"——那正是上架的条件（见 BuildShopPanel）。
   * 上了架却没图的话，卡片上是一行退化的文字，读起来像没做完。
   */
  const naked = buildingDefinitions
    .filter((definition) => !buildingIcon(definition.buildingId))
    .map((definition) => definition.buildingId);
  // 房子、小镇店铺这些不在铺子里卖，没图不算问题；这里只点名上架的
  expect(naked).not.toContain("gold_jar");
  expect(naked).not.toContain("wood_wall");
});

/**
 * 图纸借用成品的图（用户 2026-08-23："木墙图纸和金库的图纸 ICON，你直接拿
 * LV1 的图片就好了，不需要重新画"）。
 *
 * 这不只是省一次画：图纸和成品**本来就该长一样**——玩家在背包里看见的那张
 * 脸，就是他摆下去会立起来的东西。
 */
test("图纸的图标就是那栋楼初始等级的图", () => {
  const jarBlueprint = itemDefinitions.find(
    (item) => item.blueprint?.buildingId === "gold_jar",
  );
  expect(jarBlueprint, "金币罐得有图纸物品，否则它在铺子里上不了架").toBeTruthy();
  expect(blueprintIconUrl(jarBlueprint!.id)).toBe(buildingIcon("gold_jar"));

  const wallBlueprint = itemDefinitions.find(
    (item) => item.blueprint?.buildingId === "wood_wall",
  );
  expect(blueprintIconUrl(wallBlueprint!.id)).toBe(buildingIcon("wood_wall"));
});

test("不是图纸的物品不借图——番茄不该拿到某栋楼的脸", () => {
  expect(blueprintIconUrl("tomato")).toBeUndefined();
  expect(blueprintIconUrl("no_such_item")).toBeUndefined();
});

/**
 * **上架出售**的图纸都得借得到图。
 *
 * 收窄过一次（期 4）：原来查的是"每一件图纸"，三位居民的房子图纸落地后
 * 当场红——那三张是**邻居送的赠品，永远不上货架**，而它们那三栋楼还是
 * 占位壳（没有图，等参考图）。
 *
 * 为什么收窄而不是硬凑一张图：这条守卫的真意是"图纸不该顶着一张**别的**
 * 脸"，不是"每张图纸都必须有脸"。没图时 `slots.tsx` 会退化成画名字
 * （`broken` 分支），那是诚实的降级，不是空洞。而铺子里的卡片得有脸——
 * 玩家在货架上是**看图买东西**的，那一栏不能只有字。
 */
test("上架出售的图纸都借得到图，没有一张是空的", () => {
  // 剧情送的图纸：不上货架，对应的楼还是占位壳（期 4/5，等参考图）
  const GIFTED = new Set([
    "blueprint_slime_house",
    "blueprint_fox_house",
    "blueprint_spirit_house",
    // 三位住齐之后他们塞给你的（期 5）。同样是赠品，铺子里买不到
    "blueprint_furniture_shop",
  ]);
  const naked = itemDefinitions
    .filter((item) => item.blueprint)
    .filter((item) => !GIFTED.has(item.id))
    .filter((item) => !blueprintIconUrl(item.id))
    .map((item) => item.id);
  expect(naked).toEqual([]);
});
