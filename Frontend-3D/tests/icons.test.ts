import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import { achievementDefinitions, findItemDefinition, listCodexEntries } from "core";

import { iconKeys, iconUrl, itemIconUrl } from "../src/Assets/icons";
import { materialIconUrl } from "../src/Game/Systems/materials";
import { baseTerritory } from "../src/Maps/base/territory";

/**
 * 界面图标（`src/Assets/icons/`，2026-09-13 从 `public/icons/` 搬进来）。
 *
 * 数据里写的是图标键（`items/stove`），不是 URL。键写错不会报错——
 * 查不到图的地方会退化成画名字或 emoji，界面上看着像"还没画"，
 * 只靠玩是发现不了的。这一组把"数据里点名的图都在"钉住。
 */

/** 长得像图标键：`目录/名字`，全小写。emoji 和普通文字都不会是这个形状 */
const KEY_SHAPE = /^[a-z_]+\/[a-z0-9_/]+$/;

test("目录不是空的，glob 真的扫到了图", () => {
  expect(iconKeys().length).toBeGreaterThan(50);
  expect(itemIconUrl("tomato")).toBeTruthy();
});

test("金币有图（它不是物品，走 currency/ 那条）", () => {
  expect(materialIconUrl("gold")).toBe(iconUrl("currency/gold"));
  expect(materialIconUrl("gold")).toBeTruthy();
});

test("成就里写成图标键的，都指得到图", () => {
  const missing = achievementDefinitions
    .filter((definition) => definition.icon && KEY_SHAPE.test(definition.icon))
    .filter((definition) => !iconUrl(definition.icon))
    .map((definition) => `${definition.id} → ${definition.icon}`);
  expect(missing).toEqual([]);
});

/**
 * 图鉴每条条目的图：要么有 PNG，要么钉在名单里（画好一张就红一条，逼着删名单）。
 * 没图的卡片退到兜底 emoji，不会空框——但图鉴是"看"的地方，缺图比背包里缺图显眼得多。
 */
test("图鉴条目的图：缺的都在名单里，名单里的都还缺", () => {
  const PENDING_ICONS = [
    "items/furniture_news_printer",
    "items/furniture_nightstand",
    "items/furniture_daily_board",
    "items/furniture_moon_lamp",
    "items/furniture_mushroom_lamp",
    "items/furniture_lucky_bamboo",
    "items/furniture_ofuro",
    "items/furniture_garden_bench",
    "items/furniture_street_lamp",
    "items/well",
    "items/cardboard_box",
    "items/cardboard_stack",
    "residents/moss_wisp",
    "residents/foam_wisp",
    "residents/ember_wisp",
    "residents/otter_trader",
    "residents/coin_dragon",
    "residents/spirit_neighbor",
    "residents/shushu",
    "residents/stone_golem",
  ];
  const missing = listCodexEntries()
    .map((entry) => entry.icon.iconKey)
    .filter((key) => !iconUrl(key));
  expect(missing.filter((key) => !PENDING_ICONS.includes(key))).toEqual([]);
  const drawn = PENDING_ICONS.filter((key) => iconUrl(key));
  expect(drawn, "这张图已经画好了，把它从 PENDING_ICONS 里拿掉").toEqual([]);
});

test("地块表里的地貌图都在", () => {
  const missing = baseTerritory.plots
    .filter((plot) => plot.icon && !iconUrl(plot.icon))
    .map((plot) => `${plot.plotId} → ${plot.icon}`);
  expect(missing).toEqual([]);
});

/**
 * `items/` 下的每张图都得对得上一件物品——取图是按 id 拼键的，
 * 文件名差一个字母，这张图就永远没人用，而背包里那件东西在画名字。
 */
test("items/ 下没有对不上物品 id 的图", () => {
  // 图先到、物品还没做的。做完就从这里删掉，这条会逼着你删
  const PENDING = new Set(["furniture_kitchen_counter_small"]);

  // tools/ 是农具那一格（同样按物品 id 取图），一起查
  const orphans = iconKeys()
    .filter((key) => key.startsWith("items/") || key.startsWith("tools/"))
    .map((key) => key.slice(key.indexOf("/") + 1))
    .filter((id) => !findItemDefinition(id) && !PENDING.has(id));
  expect(orphans).toEqual([]);

  const stale = [...PENDING].filter((id) => findItemDefinition(id));
  expect(stale, "这件物品已经做好了，把它从 PENDING 里拿掉").toEqual([]);
});

/**
 * 旧约定是 `"/icons/<id>.png"` 这种 public 路径。图已经不在 public 了，
 * 谁照着老代码抄一行，界面上就是一个静默的空框。
 */
test("src 里不再有指向 public/icons 的路径", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|css)$/.test(name) && /["'`(]\/icons\//.test(readFileSync(path, "utf8"))) {
        offenders.push(path);
      }
    }
  };
  walk(join(process.cwd(), "src"));
  expect(offenders).toEqual([]);
});
