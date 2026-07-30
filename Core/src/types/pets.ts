import type {
  LocalizationKey,
  RoomId,
  VisualId,
  WorldPosition,
} from "./base.js";
import type { ItemId } from "./items.js";

export type PetId = string;
export type PetDefinitionId = string;

export enum AffectionStage {
  Stranger = "stranger",
  FamiliarResident = "familiar_resident",
  LifeCompanion = "life_companion",
  Family = "family",
}

export type PetDefinition = {
  id: PetDefinitionId;
  /** 物种名（图鉴上的名字），不是玩家叫它的名字 */
  localizationKey: LocalizationKey;
  /** 初见时给的默认昵称。玩家改过之后存进 PetSave.nickname */
  defaultNicknameKey: LocalizationKey;
  /** 造型由表现层的 VisualRegistry 解析：先程序化，以后换精模只改那一张表 */
  visualId: VisualId;
  species: string;
};

// ---- 喜好与送礼 ----

/**
 * 送礼判定的四档，沿用 `整体架构.md` 的措辞：爱吃 / 能吃 / 不喜欢 / 不能吃。
 *
 * **送错不扣好感**（定案）——本作不做功亏一篑的判定，试错本身是了解它的过程。
 * 四档的差别全部体现在**反应**上，后果由 storyRules 声明，判定只发信号。
 */
export enum GiftTier {
  /** 爱吃：眼睛发亮，留下记忆条目，推进剧情 */
  Loved = "loved",
  /** 能吃：收下、道谢，反应平淡 */
  Liked = "liked",
  /** 不喜欢：闻一闻就放下，东西还在你手上 */
  Disliked = "disliked",
  /** 不能吃：明确摇头，可能顺带解释为什么 */
  Inedible = "inedible",
}

/**
 * 一只宠物的完整喜好表（定案：每只都写全，不做 tag 通用打底）。
 *
 * 代价是每加一样新食物都要回头补所有宠物的表——现在三只还好，
 * 物种多了会累。`fallback` 就是那张安全网：漏填不会崩，只落到默认档。
 * 以后表维护不动了可以换成「按 tag 通用打底 + 个体只写例外」，
 * `resolveGiftTier` 的签名不用变。
 */
export type PetTaste = {
  loved: ItemId[];
  liked: ItemId[];
  disliked: ItemId[];
  inedible: ItemId[];
  /**
   * 表里没列到的**食物**落哪一档。
   * 非食物（木板、锤子、家具）不走这里——那类东西结构上就不能吃，
   * 见 `resolveGiftTier`。
   */
  fallback: GiftTier.Liked | GiftTier.Disliked;
};

export type PetSave = {
  petId: PetId;
  definitionId: PetDefinitionId;
  roomId: RoomId;
  position: WorldPosition;
  affectionStage: AffectionStage;
  growth: number;
  needs: Record<string, number>;
  /** 玩家改过的昵称。没改过就是 undefined，显示 defaultNicknameKey */
  nickname?: string;
  /**
   * 上次收礼是哪个世界日。每天一次的节流靠它，
   * 存**日**而不是时间戳——玩家改设备时区不会凭空多出或少掉一次机会。
   */
  lastGiftWorldDayId?: string;
};
