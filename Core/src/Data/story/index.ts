import { AffectionStage } from "../../types/pets.js";
import type { StoryRule, TutorialDefinition } from "../../types/story.js";

/**
 * 第一天的剧情编排（对照 版本期望/整体架构.md 的"第一天流程"）。
 * 这里是唯一的剧情真相来源——代码里不允许再出现剧情分支。
 */
export const storyRules: StoryRule[] = [
  // 搬进新家的开场提示
  {
    id: "moving_in_intro",
    triggers: [{ signal: "game_started" }],
    effects: [
      { kind: "set_event_stage", eventId: "moving_in", stageId: "arrived" },
      { kind: "show_toast", localizationKey: "story.moving_in", durationMs: 7000 },
    ],
  },

  // 第一次制作完成 → 小动物登场（镜头接管由渲染层监听 pet_spawned 处理）
  {
    id: "pet_arrival_on_first_craft",
    triggers: [
      { signal: "craft_completed", requiresEventUntriggered: "pet_arrival" },
    ],
    effects: [
      { kind: "set_event_stage", eventId: "pet_arrival", stageId: "met" },
      // 等工作台面板关掉，再过 3~7 秒才登场——第一天流程里这是个
      // "突发事件"，制作那一刻就蹦出来的话玩家还盯着制作 UI，全被挡住了
      {
        kind: "spawn_pet",
        petId: "pet-1",
        definitionId: "moss_wisp",
        delayMs: 3000,
        jitterMs: 4000,
      },
    ],
  },

  // 苔苔收下礼物 → 好感度晋级 + 承诺出门带东西回来
  {
    id: "pet_gift_accepted",
    triggers: [{ signal: "gift_accepted" }],
    effects: [
      {
        kind: "set_event_stage",
        eventId: "pet_arrival",
        stageId: "gifted",
        complete: true,
      },
      {
        kind: "set_affection",
        petId: "pet-1",
        stage: AffectionStage.FamiliarResident,
      },
      { kind: "unlock_feature", featureId: "pet_dispatch" },
      { kind: "show_toast", localizationKey: "story.pet_promise", durationMs: 7000 },
    ],
  },

  // 睡醒 → 妈妈的第一通电话
  {
    id: "mom_first_call_after_sleep",
    triggers: [
      { signal: "sleep_ended", requiresEventUntriggered: "mom_first_call" },
    ],
    effects: [
      {
        kind: "set_event_stage",
        eventId: "mom_first_call",
        stageId: "done",
        complete: true,
      },
      { kind: "start_dialogue", dialogueId: "mom_first_call", delayMs: 900 },
    ],
  },

  // 睡醒后苔苔不见了的钩子（第二天主线的引子）
  {
    id: "pet_missing_hook",
    triggers: [
      {
        signal: "sleep_ended",
        requiresEventStage: { eventId: "pet_arrival", stageId: "gifted" },
      },
    ],
    effects: [
      { kind: "set_event_stage", eventId: "pet_missing", stageId: "noticed" },
      { kind: "show_toast", localizationKey: "story.pet_missing", durationMs: 8000 },
    ],
  },

  // 妈妈电话结束 → 进入日常循环的收尾
  {
    id: "day_one_wrap",
    triggers: [{ signal: "dialogue_ended", subject: "mom_first_call" }],
    effects: [
      { kind: "set_event_stage", eventId: "mom_gift", stageId: "promised" },
      { kind: "show_toast", localizationKey: "story.day_one_wrap", durationMs: 9000 },
    ],
  },
];

export const tutorialDefinition: TutorialDefinition = {
  id: "day_one",
  completedLocalizationKey: "tutorial.completed",
  steps: [
    {
      stepId: "backpack",
      localizationKey: "tutorial.backpack",
      completedBy: { signal: "backpack_opened" },
    },
    {
      stepId: "workbench",
      localizationKey: "tutorial.workbench",
      completedBy: { signal: "furniture_placed", subject: "ordinary_workbench" },
    },
    {
      stepId: "craft",
      localizationKey: "tutorial.craft",
      completedBy: { signal: "craft_completed" },
    },
    {
      stepId: "gift",
      localizationKey: "tutorial.gift",
      completedBy: { signal: "gift_accepted" },
    },
    {
      stepId: "action",
      localizationKey: "tutorial.action",
      completedBy: { signal: "action_started" },
    },
    {
      stepId: "sleep",
      localizationKey: "tutorial.sleep",
      completedBy: { signal: "sleep_ended" },
    },
  ],
};
