import { expect, test } from "vitest";

import { SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";
import { serializeGameSave } from "../src/Data/Save/serialize";
import { migrations } from "../src/Data/Save/migrations";

/**
 * **存档形状的指纹**：GameSave 的键集合变了就红。
 *
 * ## 为什么需要它，以及为什么已有的那条不够
 *
 * migrations.test 里那条「SAVE_SCHEMA_VERSION 必须等于迁移链里最大的 to」
 * 守的是**版本机器自己的自洽**，不是"版本号有没有反映形状"。2026-08-23
 * 的审计就撞在这个缝上：`buildings`(8-22)、`lamps`(8-23)、`baseGold`(8-23)
 * 三次往 WorldSave 里加字段，一次都没抬版本——而那条用例全程是绿的，
 * 因为两边一起停在 28，不变量成立而契约破了。
 *
 * 不补版本号的后果不是"少迁一次"，是**静默丢档**：两个客户端都自称 28、
 * 形状却不同，旧客户端读得进新档、把认不出的字段悄悄忽略，再存回去就
 * 永久没了。有云同步和多设备时这是真丢东西。
 *
 * 这份用例守的就是那件事：**形状一动就必须有人做决定**。
 *
 * ## 它看到哪一层
 *
 * 只到"字段会长出来的那一层"：顶层三家 + player / ownWorld 的直接字段，
 * 再往下一层。房间几何（maps / pets / doors）整块当叶子——那部分改一个
 * 数就红的话，这条用例会被当成噪音绕过去，而**被绕过的守卫等于没有**。
 *
 * 代价说清楚：RoomSave 内部加字段（比如当年的 anchor）它抓不到。
 * 那一层要靠 map 那边自己的用例。
 */

/**
 * 当前形状。**改这份清单之前先回答三个问题**：
 * 1. `SAVE_SCHEMA_VERSION` 抬了吗？
 * 2. 迁移链里补了对应的一条吗（老档缺这个字段时读出来是什么）？
 * 3. 联机要不要跟着走（`WorldRefreshSlices` + `NET_PROTOCOL_VERSION`）？
 *
 * 三个都答完了再改这里。顺序反了的话，这份清单就从守卫变成了橡皮图章。
 */
const SHAPE: string[] = [
  "meta.createdAtUtc",
  "meta.saveSchemaVersion",
  "meta.updatedAtUtc",
  "ownWorld.baseGold",
  "ownWorld.buildings[]",
  "ownWorld.chatLog[]",
  "ownWorld.clock.lastObservedSource",
  "ownWorld.clock.lastObservedUtc",
  "ownWorld.clock.lastObservedWorldDayId",
  "ownWorld.clock.timePolicyId",
  "ownWorld.clock.timeZoneId",
  "ownWorld.dailyBoard",
  // v30：昨日事实（报纸素材）。版本已抬、迁移已补、联机不跟（story 不在做客端跑）
  "ownWorld.dayFacts[]",
  // v37：出门在外的居民（居民系统 02）。版本已抬、空迁移、联机不跟——房客靠 pets 切片看人消失 / 出现
  "ownWorld.residentTrips",
  // v40：委托状态表（居民系统 05）。进切片
  "ownWorld.favors",
  // v41：门口展示位与门牌（居民系统 07）。进切片
  "ownWorld.porch",
  // v42：居民房室内槽位（居民系统 08）。进切片
  "ownWorld.interiors",
  // v43：多日出门的计划（居民系统 09）。房主侧，不进切片
  "ownWorld.tripPlans",
  // 期 6：旅行商人这一趟卖掉了什么。联机不跟——摊子是房主世界的事
  "ownWorld.travelerStock.day",
  "ownWorld.travelerStock.sold[]",
  /*
   * 期 7 报纸。**联机不跟**——报纸是这个家的私事，做客的人翻别人家的
   * 家务事很奇怪，所以 WorldRefreshSlices 和 WORLD_REFRESH_KEYS 两处都
   * 没加。net.ts 那句编译期断言拦的是"加了类型忘了加白名单"，
   * 拦不住"本该两处都不加"，这几行清单就是那个位置的守卫。
   *
   * **`latest` 里面那一层不在这个守卫的射程内**：全新存档还没出过报，
   * 指纹走不进去。这个缺口是可接受的——一期报纸每天重新编一份，
   * 字段变了最多影响当天那一版，第二天自愈；而背包、建筑那种长期
   * 累积的形状变了就是永久损坏，那些才是这个守卫真正要挡的东西。
   */
  "ownWorld.newspaper.issued",
  "ownWorld.newspaper.name",
  "ownWorld.newspaper.latest",
  "ownWorld.doors",
  "ownWorld.droppedItems[]",
  "ownWorld.gramophones{}",
  "ownWorld.house.houseId",
  "ownWorld.house.regionId",
  "ownWorld.house.styleId",
  "ownWorld.inventories{}",
  "ownWorld.lamps{}",
  "ownWorld.maps",
  "ownWorld.pets",
  "ownWorld.placedFurniture[]",
  "ownWorld.progression.events",
  "ownWorld.progression.firedStoryRuleIds[]",
  // v30：抽签池的保底计数。不进档的话读一次档等待就归零
  "ownWorld.progression.poolMisses",
  "ownWorld.progression.signalCounts",
  "ownWorld.progression.unlockedFeatureIds[]",
  "ownWorld.seed",
  "ownWorld.weather.lastResolvedWorldDayId",
  "ownWorld.weather.overrides[]",
  "ownWorld.weather.schedule[]",
  "ownWorld.weather.seed",
  "ownWorld.worldId",
  "player.actionChains[]",
  "player.actionEntries[]",
  /*
   * v33：事后补记的每日额度。版本已抬、迁移已补（那条是空的，理由写在
   * migrations 里）。**联机不跟**——它挂在 PlayerSave 上跟着人走，
   * 做客时用掉的还是自己那份，不属于 WorldRefreshSlices 那一层。
   */
  "player.actionLog",
  "player.activeActionProcess",
  /*
   * v35：日记本（完整历史，稀疏天数组）。版本已抬、迁移已补（空的，
   * 理由在 migrations：dayFacts 那两天来源可疑，不搬）。联机不跟——
   * 跟着人走，做客翻开的也是自己的。
   */
  "player.diary",
  "player.avatar.bodyId",
  "player.avatar.bottomId",
  "player.avatar.colors",
  "player.avatar.eyesId",
  "player.avatar.faceId",
  "player.avatar.hairId",
  "player.avatar.mouthId",
  "player.avatar.noseId",
  "player.avatar.shoesId",
  "player.avatar.topId",
  "player.character.heldItem",
  "player.character.inventory[]",
  "player.character.needs",
  "player.character.position",
  "player.character.restingOn",
  "player.dailyTasks.pool[]",
  "player.dailyTasks.today",
  "player.discoveredRecipeIds[]",
  "player.name",
  "player.pendingGold",
];

/** 序列化出来的键集合。空对象记成 `{}`，数组记成 `[]` —— 它们同样是形状 */
function fingerprint(value: unknown, path = "", depth = 3): string[] {
  const OPAQUE = new Set(["ownWorld.maps", "ownWorld.pets", "ownWorld.doors"]);
  if (path && OPAQUE.has(path)) return [path];
  if (value === null || typeof value !== "object" || Array.isArray(value) || depth === 0) {
    return [path + (Array.isArray(value) ? "[]" : "")];
  }
  const entries = Object.entries(value as Record<string, unknown>);
  // 空 Record 不能悄悄消失：lamps / gramophones / inventories 平时都是空的，
  // 漏掉它们的话"加一个常年为空的字段"就绕过了这道关
  if (entries.length === 0) return [path + "{}"];
  return entries.flatMap(([k, v]) =>
    fingerprint(v, path ? `${path}.${k}` : k, depth - 1),
  );
}

test("存档形状没变——变了就得抬版本、补迁移、想清楚联机", () => {
  const actual = fingerprint(serializeGameSave()).sort();
  const expected = [...SHAPE].sort();

  const added = actual.filter((p) => !expected.includes(p));
  const removed = expected.filter((p) => !actual.includes(p));

  expect(
    { added, removed },
    "存档形状变了。抬 SAVE_SCHEMA_VERSION + 补一条迁移 + 检查 WorldRefreshSlices，然后更新这份清单",
  ).toEqual({ added: [], removed: [] });
});

test("形状清单和版本号是同一批人维护的——版本必须等于迁移链最大的 to", () => {
  const highest = Math.max(...migrations.map((m) => m.to));
  expect(SAVE_SCHEMA_VERSION).toBe(highest);
});
