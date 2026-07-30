import {
  GiftTier,
  canGiftToday,
  findPetTaste,
  giftConsumesItem,
  giftSignalKind,
  resolveGiftTier,
} from "core";
import { emit } from "../EventBus";
import { getClock } from "../State/clock";
import { getStackAt, removeFromSlot, type SlotRef } from "../State/inventory";
import { getPet, markPetGifted } from "../State/petsRuntime";

/**
 * 送礼。判定全在 Core 的 `resolveGiftTier`（联机时服务端跑同一份），
 * 这里只做三件事：取数据、按结果扣不扣物品、发信号。
 *
 * **后果一律不在这里发生**——好感度、剧情推进、记忆条目全部由
 * storyRules 接 `gift_given` / `gift_*` 信号声明。所以以后想改
 * "不喜欢那一档也说句好话"，是加一条规则的事，不用回来动代码。
 */

export type GiftResult =
  | { ok: true; tier: GiftTier; consumed: boolean; itemId: string }
  /** 今天已经送过了。不是失败，是节流——文案要写成"它今天吃饱了" */
  | { ok: false; reason: "already_gifted_today" }
  | { ok: false; reason: "no_such_item" | "unknown_pet" };

/**
 * 递一件东西过去。
 *
 * 传 `SlotRef` 而不是 itemId：菜的品质是**那一格**的属性，
 * 过火降一档要认得出玩家递的到底是哪一盘。
 */
export function offerGift(petId: string, ref: SlotRef): GiftResult {
  const pet = getPet(petId);
  if (!pet) return { ok: false, reason: "unknown_pet" };

  const stack = getStackAt(ref);
  if (!stack) return { ok: false, reason: "no_such_item" };

  const { worldDayId } = getClock();
  if (!canGiftToday(pet.lastGiftWorldDayId, worldDayId)) {
    return { ok: false, reason: "already_gifted_today" };
  }

  /**
   * 喜好表漏了这个物种也不能崩——退回到"什么都能吃、都不特别喜欢"，
   * 玩家至多觉得这只没脾气，不会卡在一个递不出去的框里。
   */
  const taste = findPetTaste(pet.definitionId) ?? {
    loved: [],
    liked: [],
    disliked: [],
    inedible: [],
    fallback: GiftTier.Liked,
  };

  const tier = resolveGiftTier(taste, stack.itemId, stack.quality);
  const consumed = giftConsumesItem(tier);

  // 不喜欢/不能吃不扣东西——「闻一闻就放下」的意思就是它还在你手上
  if (consumed) removeFromSlot(ref, 1);

  /**
   * 节流按"递出去过"算，不按"收下了"算。
   * 否则玩家可以拿一样它不吃的东西无限试，把四档反应当成免费的喜好查询器，
   * 送礼就从"每天回来看看"退化成一次性摸表。
   */
  markPetGifted(petId, worldDayId);

  // 先发不分档的，再发档位——主线挂前者，具体反应挂后者
  emit("story_signal", { kind: "gift_given", subject: stack.itemId });
  emit("story_signal", { kind: giftSignalKind(tier), subject: stack.itemId });

  return { ok: true, tier, consumed, itemId: stack.itemId };
}

/** 今天还能不能送。UI 用来把放入框变成"它今天吃饱了"的样子 */
export function canGiftTo(petId: string): boolean {
  const pet = getPet(petId);
  if (!pet) return false;
  return canGiftToday(pet.lastGiftWorldDayId, getClock().worldDayId);
}
