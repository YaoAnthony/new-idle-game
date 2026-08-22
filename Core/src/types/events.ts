import type {
  FeatureId,
  LocalizationKey,
} from "./base.js";
import type { ItemId } from "./items.js";
import type { UtcTimestamp, WorldDayId } from "./time.js";

export type EventId = string;
export type EventStageId = string;

export type EventProgressSave = Record<
  EventId,
  {
    currentStageId: EventStageId;
    status: "active" | "completed";
    firstTriggeredAtUtc: UtcTimestamp;
    firstTriggeredWorldDayId: WorldDayId;
    completedAtUtc?: UtcTimestamp;
  }
>;

export type RewardDefinition =
  | {
      type: "item";
      itemId: ItemId;
      quantity: number;
    }
  | {
      type: "unlock";
      featureId: FeatureId;
    }
  | {
      /**
       * 金币。**不吐成地上的东西**——金币直接进罐（罐就是钱包），
       * 而罐满了多的部分会溢出丢失。吐成实物的话玩家能捡起来揣着，
       * 那"容量就是持有上限"这条规则当场作废。
       */
      type: "gold";
      amount: number;
    };

export type EventDefinition = {
  id: EventId;
  localizationKey: LocalizationKey;
  stages: Array<{
    stageId: EventStageId;
    localizationKey: LocalizationKey;
  }>;
};
