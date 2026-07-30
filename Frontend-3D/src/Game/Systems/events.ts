import type { EventProgressSave, FeatureId } from "core";
import { emit } from "../EventBus";

/**
 * 事件进度与功能解锁的存储层。
 *
 * 注意这里**没有任何剧情分支**——"什么时候推进到哪个阶段"由 Core 的
 * storyRules 注册表声明，story.ts 的解释器执行。本文件只提供读写能力。
 */

let progress: EventProgressSave = {};
let unlockedFeatures = new Set<FeatureId>();

function nowUtc(): string {
  return new Date().toISOString();
}

function worldDayId(): string {
  return nowUtc().slice(0, 10);
}

export function getEventProgress(): EventProgressSave {
  return { ...progress };
}

export function getEventStage(eventId: string): string | null {
  return progress[eventId]?.currentStageId ?? null;
}

export function isEventCompleted(eventId: string): boolean {
  return progress[eventId]?.status === "completed";
}

export function setEventStage(
  eventId: string,
  stageId: string,
  status: "active" | "completed" = "active",
): void {
  const existing = progress[eventId];

  progress[eventId] = existing
    ? { ...existing, currentStageId: stageId, status }
    : {
        currentStageId: stageId,
        status,
        firstTriggeredAtUtc: nowUtc(),
        firstTriggeredWorldDayId: worldDayId(),
      };

  if (status === "completed") {
    progress[eventId].completedAtUtc = nowUtc();
  }

  emit("event_progress_changed", { eventId, stageId });
}

export function unlockFeature(featureId: FeatureId): void {
  if (unlockedFeatures.has(featureId)) return;
  unlockedFeatures.add(featureId);
  emit("event_progress_changed", { eventId: `feature:${featureId}`, stageId: "unlocked" });
}

export function isFeatureUnlocked(featureId: FeatureId): boolean {
  return unlockedFeatures.has(featureId);
}

// ---- 存档 ----

export function getUnlockedFeatures(): FeatureId[] {
  return [...unlockedFeatures];
}

export function restoreProgression(saved: {
  events: EventProgressSave;
  unlockedFeatureIds: FeatureId[];
}): void {
  progress = { ...saved.events };
  unlockedFeatures = new Set(saved.unlockedFeatureIds);

  for (const [eventId, entry] of Object.entries(progress)) {
    emit("event_progress_changed", {
      eventId,
      stageId: entry.currentStageId,
    });
  }
}
