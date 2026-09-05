import assert from "node:assert/strict";
import { test } from "node:test";

import { ItemQuality } from "../src/types/inventory.js";
import { GiftTier, type ResidentTaste } from "../src/types/residents.js";
import {
  canGiftToday,
  giftConsumesItem,
  giftSignalKind,
  resolveGiftTier,
} from "../src/logic/giftRules.js";

/**
 * 送礼判定。**只算档位，不产生任何后果**——后果由 storyRules 声明。
 * 所以这里唯一要盯的是"哪件东西算哪一档"，以及两条产品判断：
 * 不喜欢的东西**不消耗**（试错不该有代价），过火降一档但**降不到不能吃**。
 */

const taste: ResidentTaste = {
  loved: ["fried_tomato_egg"],
  liked: ["cooked_rice"],
  disliked: ["mystery_stew"],
  inedible: ["tomato"],
  fallback: GiftTier.Liked,
};

test("喜好表里写死的优先，个体可以推翻通则", () => {
  assert.equal(resolveGiftTier(taste, "fried_tomato_egg"), GiftTier.Loved);
  assert.equal(resolveGiftTier(taste, "cooked_rice"), GiftTier.Liked);
  assert.equal(resolveGiftTier(taste, "mystery_stew"), GiftTier.Disliked);
  // 生番茄本来是食物，但这只点名不吃
  assert.equal(resolveGiftTier(taste, "tomato"), GiftTier.Inedible);
});

test("不是食物的东西一律不能吃——几十件家具不用每只宠物抄一遍", () => {
  assert.equal(resolveGiftTier(taste, "wood"), GiftTier.Inedible);
  assert.equal(resolveGiftTier(taste, "furniture_bed"), GiftTier.Inedible);
  // 查不到的物品也走这条，不会崩
  assert.equal(resolveGiftTier(taste, "根本没有这件东西"), GiftTier.Inedible);
});

test("表里没写的食物落 fallback 安全网", () => {
  assert.equal(resolveGiftTier(taste, "fried_egg"), GiftTier.Liked);
  assert.equal(
    resolveGiftTier({ ...taste, fallback: GiftTier.Disliked }, "fried_egg"),
    GiftTier.Disliked,
  );
});

test("过火降一档", () => {
  assert.equal(resolveGiftTier(taste, "fried_tomato_egg", ItemQuality.Poor), GiftTier.Liked);
  assert.equal(resolveGiftTier(taste, "cooked_rice", ItemQuality.Poor), GiftTier.Disliked);
});

test("焦的菜还是菜：降不到不能吃那一档", () => {
  assert.equal(resolveGiftTier(taste, "mystery_stew", ItemQuality.Poor), GiftTier.Disliked);
  assert.equal(resolveGiftTier(taste, "tomato", ItemQuality.Poor), GiftTier.Inedible);
});

test("上乘和普通不改变档位（只有过火有惩罚）", () => {
  for (const quality of [undefined, ItemQuality.Normal, ItemQuality.Good, ItemQuality.Excellent]) {
    assert.equal(
      resolveGiftTier(taste, "fried_tomato_egg", quality),
      GiftTier.Loved,
      `${quality} 不该改变档位`,
    );
  }
});

test("只有收下的才消耗——闻一闻放下意味着东西还在你手上", () => {
  assert.equal(giftConsumesItem(GiftTier.Loved), true);
  assert.equal(giftConsumesItem(GiftTier.Liked), true);
  assert.equal(giftConsumesItem(GiftTier.Disliked), false);
  assert.equal(giftConsumesItem(GiftTier.Inedible), false);
});

test("每一档都映射到一个剧情信号，一个都不能漏", () => {
  const kinds = new Set(
    [GiftTier.Loved, GiftTier.Liked, GiftTier.Disliked, GiftTier.Inedible].map(giftSignalKind),
  );

  assert.deepEqual(
    [...kinds].sort(),
    ["gift_disliked", "gift_inedible", "gift_liked", "gift_loved"],
  );
});

test("每天一次：比世界日不比时间戳，改时区不该凭空多送一次", () => {
  assert.equal(canGiftToday(undefined, "2026-08-12"), true, "从没送过当然能送");
  assert.equal(canGiftToday("2026-08-11", "2026-08-12"), true);
  assert.equal(canGiftToday("2026-08-12", "2026-08-12"), false);
});
