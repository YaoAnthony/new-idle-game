import { beforeEach, expect, test } from "vitest";
import { Facing } from "core";

import {
  capturePristineSave,
  resetToPristineSave,
} from "../src/Data/Save/serialize";
import {
  listBuildings,
  placeBuilding,
} from "../src/Game/State/buildings";
import { depositGoldTo, getGold } from "../src/Game/State/gold";
import { addItem, getCount } from "../src/Game/State/inventory";
import { ownedPlotIds, unlockPlotById } from "../src/Game/State/territory";

/**
 * **开新档必须回到空世界**（2026-08-23 修的架构 bug 的回归测试）。
 *
 * 原来的病：`Game/State` 下五十来处模块级状态，唯一的复位路径是
 * `hydrateGameSave`，而开新档那条路不走它——回标题只卸掉 React 那棵树，
 * 模块活得比组件久。实测下来"回标题 → 开新档"进去的是**上一个世界**：
 * 5 栋建筑、70 金币、三块已解锁的地原样都在，接着第一次落盘还会把这份
 * 脏世界写进存档，于是老档没了、新档也是脏的。
 *
 * 这一组用例是那条修复的看门人。**它防的不是同一个 bug 再犯，是同一类**：
 * 将来加第二十七个系统时，只要那个系统进了 serialize/hydrate，
 * 这里就自动罩得住；进不了的话，下面"新加的系统也要能复位"那条会红。
 */

beforeEach(() => {
  /*
   * 在动任何东西**之前**先抓一次空世界。
   *
   * 抓取本身是幂等的（只有第一次生效），所以放 beforeEach 是安全的；
   * 放在这里而不是靠第一条用例顺手触发，是为了让"抓到的那一份是干净的"
   * 不依赖用例的执行顺序——这份用例自己要是被顺序坑了，就没资格
   * 给别人看门。
   */
  capturePristineSave();
});

test("开新档之后：上一局的建筑一栋都不剩", () => {
  // Arrange：造一个"玩过一局"的世界
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  expect(listBuildings().length).toBeGreaterThan(0);

  // Act
  resetToPristineSave();

  // Assert
  expect(listBuildings()).toEqual([]);
});

test("开新档之后：钱不跟过来", () => {
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(50);
  expect(getGold()).toBeGreaterThan(0);

  resetToPristineSave();

  expect(getGold()).toBe(0);
});

test("开新档之后：领地缩回开局那一块", () => {
  const before = ownedPlotIds();
  expect(unlockPlotById("west_meadow").ok).toBe(true);
  expect(ownedPlotIds().length).toBeGreaterThan(before.length);

  resetToPristineSave();

  // 进度记在 unlockedFeatureIds 里，复位要连它一起倒回去
  expect(ownedPlotIds()).toEqual(["home"]);
});

test("开新档之后：背包也是空的——世界干净了但兜里还揣着上一局的东西同样是串档", () => {
  addItem("plank", 7);
  expect(getCount("plank")).toBe(7);

  resetToPristineSave();

  expect(getCount("plank")).toBe(0);
});

test("连开两次新档都是干净的——复位源是开机那一份，不是上一次复位后那一份", () => {
  placeBuilding("gold_jar", 3.5, 16.5, Facing.North);
  resetToPristineSave();
  expect(listBuildings()).toEqual([]);

  // 再玩一局
  placeBuilding("gold_jar", 3.5, 16.5, Facing.North);
  depositGoldTo(30);
  resetToPristineSave();

  expect(listBuildings()).toEqual([]);
  expect(getGold()).toBe(0);
});

test("快照是幂等的：中途再抓一次也不会把脏世界记成'空世界'", () => {
  placeBuilding("gold_jar", 3.5, 16.5, Facing.North);
  depositGoldTo(30);

  // 这一下必须什么都不做——否则"空档"会被污染成当前这份
  capturePristineSave();

  resetToPristineSave();
  expect(listBuildings()).toEqual([]);
  expect(getGold()).toBe(0);
});
