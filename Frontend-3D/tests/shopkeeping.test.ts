import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, shopkeepingTuning } from "core";

import { restoreBuildings } from "../src/Game/State/buildings";
import {
  depositGoldTo,
  getGold,
  getGoldCapacity,
  restoreBaseGold,
  takeGoldUpTo,
} from "../src/Game/State/gold";
import {
  addToStorage,
  clearStorage,
  getStorage,
  pruneOrphanStorages,
} from "../src/Game/State/storage";
import { removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import {
  budgetToday,
  canShelve,
  claimRevenue,
  findShop,
  pendingRevenueOf,
  settleDaysFor,
  shelfCapacityOf,
  shelfIdFor,
  shelfOwnerIds,
  shelfSlotsOf,
} from "../src/Game/Systems/shopkeeping";

/**
 * 家具小店的接线（期 5）。**结算算法本身在 Core 的用例里钉**
 * （`Core/tests/shopkeeping.test.ts`：贵的先走、卖完就停、确定性…）。
 * 这里只钉前端这一层：货位数、上架判据、扣货、以及那个差点让整架货
 * 蒸发的孤儿清理。
 */

const SHOP = (levelId: string) => ({
  instanceId: "shop-1",
  buildingId: "furniture_shop",
  x: 4.5,
  z: 12.5,
  elevation: 0,
  facing: Facing.North,
  levelId,
});

/*
 * 结算要往金库里存钱，而**金库塞不下就不成交**（那条是有意的：挂机时
 * 玩家不在场，看不见"金库满了"的提示，溢出等于货和钱一起没）。所以
 * 每个用例都得先有个装得下的金库，否则测的全是"卖不出去"。
 */
const JAR = {
  instanceId: "jar-1",
  buildingId: "gold_jar",
  x: 20.5,
  z: 20.5,
  elevation: 0,
  facing: Facing.North,
  levelId: "l3",
};

const world = (levelId = "l1") => [SHOP(levelId), JAR];

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings(world());
  restoreResidents({});
  restoreBaseGold(0);
  takeGoldUpTo(getGold()); // 金库清空，容量才是真的空位
  // 货架清空：storage 的实例是模块级 Map，用例之间会串
  clearStorage(shelfIdFor("shop-1"));
});

afterEach(() => {
  restoreBuildings([]);
  removeResident("pet-slime");
  removeResident("pet-fox");
});

test("shopkeeping_货位数随等级涨_只认前N格", () => {
  expect(shelfCapacityOf("shop-1")).toBe(shopkeepingTuning.shelfSlotsByLevel.l1);

  restoreBuildings(world("l2"));

  expect(shelfCapacityOf("shop-1")).toBe(shopkeepingTuning.shelfSlotsByLevel.l2);
  expect(shopkeepingTuning.shelfSlotsByLevel.l2).toBeGreaterThan(
    shopkeepingTuning.shelfSlotsByLevel.l1,
  );
});

test("shopkeeping_只收家具_食材上不了架", () => {
  // 判据是"有没有摆放能力"，不是一张清单——加新家具时不会静默漏掉
  expect(canShelve("furniture_chair")).toBe(true);
  expect(canShelve("ingredient_tomato")).toBe(false);
  expect(canShelve("gold")).toBe(false);
  /*
   * 唱片（value 60）**照样让上**。实测它在架上挂了五天没动，一度以为是
   * 数据缺 value；其实是没人买得起（居民一天 15）。那是行情不是错误——
   * 贵重物件归水獭全价收，所以判据不收窄，面板改成把预算摆出来。
   */
  expect(canShelve("record_animal_crossing")).toBe(true);
});

test("shopkeeping_卖出去的从货架上扣掉_钱按单价算", () => {
  // Arrange：一位居民 + 架上两把椅子
  spawnResident("pet-slime", "slime_neighbor");
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 2);

  // Act：结算一天
  const sold = settleDaysFor("shop-1", 1);

  // Assert：卖出去几件，架上就少几件
  expect(sold.length).toBeGreaterThan(0);
  const left = shelfSlotsOf("shop-1").reduce(
    (sum, slot) => sum + (slot?.count ?? 0),
    0,
  );
  expect(left).toBe(2 - sold.length);
});

test("shopkeeping_没有居民时一件都卖不掉_不崩", () => {
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 3);

  const sold = settleDaysFor("shop-1", 5);

  expect(sold).toEqual([]);
  expect(shelfSlotsOf("shop-1").filter(Boolean).length).toBe(1);
});

test("shopkeeping_离线十天只够卖三天的货_就只结三天", () => {
  // Arrange：一位客人一天 15，一把椅子 value < 15，架上就 2 把
  spawnResident("pet-slime", "slime_neighbor");
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 2);

  // Act：假装离线十天
  const sold = settleDaysFor("shop-1", 10);

  /*
   * Assert：卖光即止，**不会凭空多出十天的钱**。封顶靠货架存量而不是
   * "最多补 N 天"的上限——后者是在惩罚离线，而离线封顶那条规矩管的是
   * 消耗（饿、累），不是产出。
   */
  expect(sold.length).toBe(2);
  expect(shelfSlotsOf("shop-1").filter(Boolean).length).toBe(0);
});

test("shopkeeping_一天一天算_不是把预算攒成一笔", () => {
  /*
   * 一位客人一天 15。攒成一笔的话十天就是 150，能一口气买走贵家具；
   * 一天一天算则每天都受 15 的限制。这条差别正是"离线和在线结果一致"
   * 的全部内容。
   */
  spawnResident("pet-slime", "slime_neighbor");
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 10);

  const oneDay = settleDaysFor("shop-1", 1);
  const perDay = oneDay.length;

  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 10);
  const threeDays = settleDaysFor("shop-1", 3);

  expect(perDay).toBeGreaterThan(0);
  expect(threeDays.length).toBe(perDay * 3);
});

test("shopkeeping_客源是居民_商人不算客人", () => {
  spawnResident("pet-slime", "slime_neighbor");
  spawnResident("pet-otter", "otter_trader");
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 20);

  const onlyResident = settleDaysFor("shop-1", 1).length;

  removeResident("pet-otter");
  clearStorage(shelfIdFor("shop-1")); // 清架重来
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 20);
  const withoutOtter = settleDaysFor("shop-1", 1).length;

  expect(onlyResident).toBe(withoutOtter);
});

/**
 * 回归：**货架不能被孤儿清理当成幽灵箱子删掉**。
 *
 * 货架直接复用储物库存（省下存档、迁移、联机通道、面板四份重复），
 * 代价是 `pruneOrphanStorages` 的活名单本来只喂**家具**实例 id。
 * 漏掉店铺的话，每次 world_changed（摆一件家具就会发）整架货当场蒸发，
 * 而且下一次自动存盘就永久落盘——箱庭审计的第一红灯。
 */
test("shopkeeping_孤儿清理不碰货架_只要店还在", () => {
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 3);

  // Act：按真实调用点的形状喂活名单（家具 + 拥有货架的建筑）
  pruneOrphanStorages([...[], ...shelfOwnerIds()]);

  expect(shelfSlotsOf("shop-1").filter(Boolean).length).toBe(1);
});

test("shopkeeping_店拆了货架才该没_否则存档带着打不开的库存", () => {
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 3);
  restoreBuildings([]);

  expect(shelfOwnerIds()).toEqual([]);
  pruneOrphanStorages([]);

  expect(getStorage(shelfIdFor("shop-1")).filter(Boolean).length).toBe(0);
});

test("shopkeeping_没盖店时findShop为空_指令和结算都静默跳过", () => {
  restoreBuildings([]);

  expect(findShop()).toBeNull();
  expect(settleDaysFor("shop-1", 3)).toEqual([]);
});

/**
 * 回归：**金库满着的时候不能把货卖成空气**。
 *
 * 实机抓到的：三位居民各买走一张桌子，`/gold` 从 40/40 到 40/40 一分没涨
 * ——钱全溢出了，而家具是真没了。玩家在场时 `depositGoldTo` 会弹"金库满了"，
 * 但挂机结算发生在他不在的时候，没有任何提示。
 */
test("shopkeeping_贵过全天预算的货不会卖_也不会消失", () => {
  // Arrange：三位居民一天共 45，架上一张 60 的唱片
  spawnResident("pet-slime", "slime_neighbor");
  spawnResident("pet-fox", "fox_neighbor");
  addToStorage(shelfIdFor("shop-1"), "record_animal_crossing", 1);

  // Act：连开十天
  const sold = settleDaysFor("shop-1", 10);

  // Assert：一次都没成交，货原样在架上（等水獭，或者等更有钱的客人）
  expect(sold).toEqual([]);
  expect(shelfSlotsOf("shop-1").filter(Boolean).length).toBe(1);
  expect(budgetToday()).toBeLessThan(60);
});

test("shopkeeping_金库满着照样成交_钱囤在抽屉里等着领", () => {
  /*
   * **这条的断言被 2026-08-30 的收银台改版翻过来了。**
   *
   * 旧版：金库满 → 不成交（防"卖成空气"——钱溢出而货真没了）。
   * 新版：结算进的是收银台抽屉，抽屉没有上限，金库满不满是**领取
   * 那一刻**的事——所以照样成交，钱一分不丢地躺在抽屉里，领取被
   * 金库空位卡住（见下一条用例）。"不把货卖成空气"这个保护目标
   * 没有变，只是钱的安身处从"金库空位"换成了"抽屉"。
   */
  spawnResident("pet-slime", "slime_neighbor");
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 5);
  depositGoldTo(getGoldCapacity());
  expect(getGoldCapacity() - getGold()).toBe(0);

  const sold = settleDaysFor("shop-1", 5);

  expect(sold.length).toBeGreaterThan(0);
  const revenue = sold.reduce((sum, entry) => sum + entry.price, 0);
  expect(pendingRevenueOf("shop-1")).toBe(revenue); // 钱都在抽屉里
  expect(claimRevenue("shop-1")).toBe(0); // 金库满，领不动
  expect(pendingRevenueOf("shop-1")).toBe(revenue); // 也一分没蒸发
});


test("shopkeeping_卖货的钱进收银台抽屉_领取才入金库", () => {
  /*
   * 2026-08-30 的交互改版：结算不再直接入金库——开店的人要走到收银台
   * 点一下，看着金币飞进金币条。这条钉住"钱在抽屉里不在金库里"。
   */
  spawnResident("pet-slime", "slime_neighbor");
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 2);

  const sold = settleDaysFor("shop-1", 1);
  const revenue = sold.reduce((sum, entry) => sum + entry.price, 0);

  expect(revenue).toBeGreaterThan(0);
  expect(pendingRevenueOf("shop-1")).toBe(revenue);
  expect(getGold()).toBe(0); // 还没领，金库一分没动

  const claimed = claimRevenue("shop-1");
  expect(claimed).toBe(revenue);
  expect(getGold()).toBe(revenue);
  expect(pendingRevenueOf("shop-1")).toBe(0);
  // 领第二次不该再出钱
  expect(claimRevenue("shop-1")).toBe(0);
});

test("shopkeeping_金库装不下的留在抽屉里_不蒸发", () => {
  spawnResident("pet-slime", "slime_neighbor");
  addToStorage(shelfIdFor("shop-1"), "furniture_chair", 2);
  settleDaysFor("shop-1", 1);
  const pending = pendingRevenueOf("shop-1");
  expect(pending).toBeGreaterThan(1);

  // 把金库塞到只剩 1 个空位
  depositGoldTo(getGoldCapacity() - 1);

  expect(claimRevenue("shop-1")).toBe(1); // 只领得进 1
  expect(pendingRevenueOf("shop-1")).toBe(pending - 1); // 其余还躺在抽屉里
});
