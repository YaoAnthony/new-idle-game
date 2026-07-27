import type { ActionId, LocalizationKey, ProcessId } from "./base.js";
import type { FurnitureCapability, PlacedFurnitureInstanceId } from "./furniture.js";
import type { RewardDefinition } from "./events.js";
import type { UtcTimestamp } from "./time.js";

export enum ActionCategory {
  Exercise = "exercise",
  WorkStudy = "work_study",
  Creation = "creation",
  Rest = "rest",
}

export type ActionDefinition = {
  id: ActionId;
  localizationKey: LocalizationKey;
  category: ActionCategory;
  requiredFurnitureCapabilities: FurnitureCapability[];
  durationMinutes: {
    min: number;
    max: number;
  };
  rewards: RewardDefinition[];
};

export type ActionProcessSave = {
  processId: ProcessId;
  actionId: ActionId;
  customName?: string;
  startedAtUtc: UtcTimestamp;
  durationMinutes: number;
  status: "active" | "completed" | "cancelled";
  furnitureInstanceId?: PlacedFurnitureInstanceId;
};
