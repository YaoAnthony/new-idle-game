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
    };

export type EventDefinition = {
  id: EventId;
  localizationKey: LocalizationKey;
  stages: Array<{
    stageId: EventStageId;
    localizationKey: LocalizationKey;
  }>;
};
