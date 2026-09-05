import { findItemDefinition } from "../Data/items/index.js";
import { ItemQuality } from "../types/inventory.js";
import { ItemCategory, type ItemId } from "../types/items.js";
import { GiftTier, type ResidentTaste } from "../types/residents.js";
import type { StorySignalKind } from "../types/story.js";
import type { WorldDayId } from "../types/time.js";

/**
 * 送礼判定（纯函数）。
 *
 * **判定只算出档位，不产生任何后果**——后果由 storyRules 声明，
 * 和「对话只发事件、不写效果」是同一条路子。所以"没那么喜欢的怎么办"
 * 是加一条 StoryRule 的事，不用回来改这里。
 *
 * 放 Core 是硬性要求：联机时服务端要跑同一份判定，
 * 否则房主和访客会看到同一份礼物得到不同的反应。
 */

/**
 * 一件东西对这只宠物是哪一档。
 *
 * 判定顺序是**表里写死的优先**，然后才轮到结构性规则：
 * 1. 喜好表里列了 → 直接用（个体可以推翻通则，比如某只就是爱啃生米）
 * 2. 不是食物（木板、锤子、家具）→ 不能吃。这条不进表是因为
 *    家具有几十件，每只宠物都抄一遍纯属自找麻烦
 * 3. 剩下的食物 → 落 fallback 安全网（漏填不会崩）
 *
 * `quality` 是起锅那一刻定下的菜品质。过火（Poor）降一档，
 * 但**最低只到"不喜欢"**——焦的菜还是菜，不会变成不能吃的东西。
 */
export function resolveGiftTier(
  taste: ResidentTaste,
  itemId: ItemId,
  quality?: ItemQuality,
): GiftTier {
  const base = baseTier(taste, itemId);
  return quality === ItemQuality.Poor ? downgrade(base) : base;
}

function baseTier(taste: ResidentTaste, itemId: ItemId): GiftTier {
  if (taste.loved.includes(itemId)) return GiftTier.Loved;
  if (taste.liked.includes(itemId)) return GiftTier.Liked;
  if (taste.disliked.includes(itemId)) return GiftTier.Disliked;
  if (taste.inedible.includes(itemId)) return GiftTier.Inedible;

  const definition = findItemDefinition(itemId);
  if (definition?.category !== ItemCategory.Food) return GiftTier.Inedible;

  return taste.fallback;
}

/** 过火降一档。不喜欢/不能吃保持原样——已经在底了，再降没有意义 */
function downgrade(tier: GiftTier): GiftTier {
  if (tier === GiftTier.Loved) return GiftTier.Liked;
  if (tier === GiftTier.Liked) return GiftTier.Disliked;
  return tier;
}

/**
 * 收下还是退回。不喜欢/不能吃**不消耗物品**——
 * 「闻一闻就放下」的意思就是东西还在你手上，试错不该有代价。
 */
export function giftConsumesItem(tier: GiftTier): boolean {
  return tier === GiftTier.Loved || tier === GiftTier.Liked;
}

/** 档位 → 剧情信号。剧情规则按信号接后果，判定本身不认识剧情 */
export function giftSignalKind(tier: GiftTier): StorySignalKind {
  switch (tier) {
    case GiftTier.Loved:
      return "gift_loved";
    case GiftTier.Liked:
      return "gift_liked";
    case GiftTier.Disliked:
      return "gift_disliked";
    case GiftTier.Inedible:
      return "gift_inedible";
    default: {
      // 以后加第五档时在这里编译报错，而不是静默返回 undefined
      const exhaustive: never = tier;
      return exhaustive;
    }
  }
}

/**
 * 每天一次的节流（动森式，定案）。防止一次性塞一背包刷满，
 * 也符合"每天回来看看"的节奏。
 *
 * 比的是 `WorldDayId` 而不是时间戳——和时钟系统一样**不存结果只存推导依据**，
 * 玩家改设备时区也不会凭空多出或少掉一次机会。
 * 没送过（`undefined`）当然可以送。
 */
export function canGiftToday(
  lastGiftWorldDayId: WorldDayId | undefined,
  todayWorldDayId: WorldDayId,
): boolean {
  return lastGiftWorldDayId !== todayWorldDayId;
}
