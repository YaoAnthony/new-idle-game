import { AffectionStage } from "../../types/pets.js";
import type { StoryRule, TutorialDefinition } from "../../types/story.js";

/**
 * 第一天的剧情编排（对照 版本期望/整体架构.md 的"第一天流程"）。
 * 这里是唯一的剧情真相来源——代码里不允许再出现剧情分支。
 */
export const storyRules: StoryRule[] = [
  // 搬进新家：开场独白。延迟一点让镜头先落定，玩家看清屋子再开口
  {
    id: "moving_in_intro",
    triggers: [{ signal: "game_started" }],
    effects: [
      { kind: "set_event_stage", eventId: "moving_in", stageId: "arrived" },
      { kind: "start_dialogue", dialogueId: "moving_in_monologue", delayMs: 900 },
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

  // 苔苔见过了你递来的东西 → 好感度晋级 + 承诺出门带东西回来
  //
  // 挂 gift_given 而不是 gift_loved：推进主线的是"你递上了它没见过的东西"
  // 这件事本身，不是它爱不爱吃。挂档位的话，玩家第一次递错就永久卡在这里。
  {
    id: "pet_gift_accepted",
    triggers: [{ signal: "gift_given" }],
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

  /**
   * 舒舒的初见三件事。**都挂 `dialogue_event`，不挂 `gift_given`**——
   * 这是和苔苔那段（`pet_gift_accepted`）刻意不同的地方：`gift_given`
   * 只带 itemId，不带"递给了哪只宠物"，苔苔还是唯一一只能收礼的宠物时
   * 这条信号够用；舒舒一上线，屋里同时有两只能收礼的宠物，
   * 挂 `gift_given` 会变成"喂苔苔也会把舒舒的好感加上"——两条毫不相干的
   * 剧情被同一个信号绑在一起。`dialogue_event` 的 subject 是对话节点自己
   * 声明的字符串，天然只在"这段对话走到了这一步"时触发，不会被
   * 另一只宠物的送礼动作误触发。
   */
  // 戳醒这件事分成两条规则，**故意不合并**：
  //
  // - pet_wake 要 once:false——玩家上次没成功送礼，舒舒会重新睡着，
  //   下次戳醒它要能再叫它醒过来一次。
  // - set_event_stage 要 once:true（默认）——`setEventStage` 是无条件
  //   覆盖，没有"不能倒退"这回事。合成一条规则的话，已经送过礼、
  //   阶段在 "gifted" 的舒舒，被玩家再戳醒一次（比如日常寒暄那天它又
  //   睡着了），这条规则会把 "gifted" 冲回 "met"——下次 F 交互查
  //   bondEventId 就会判成"没认识过"，把已经跑完的初见剧情重新播一遍。
  //   实测撞见过一次：写成一条 once:false 的时候我以为"重复写同一个
  //   阶段是幂等的"，忽略了"这一刻的阶段可能比这条规则想写的更靠后"。
  {
    id: "shushu_wake_on_poke",
    triggers: [{ signal: "dialogue_event", subject: "shushu_wake_moment" }],
    effects: [{ kind: "pet_wake", petId: "pet-shushu" }],
    once: false,
  },
  {
    id: "shushu_met_on_poke",
    triggers: [{ signal: "dialogue_event", subject: "shushu_wake_moment" }],
    effects: [{ kind: "set_event_stage", eventId: "shushu_bond", stageId: "met" }],
  },
  {
    id: "shushu_gift_bond",
    triggers: [{ signal: "dialogue_event", subject: "shushu_gift_received" }],
    effects: [
      {
        kind: "set_event_stage",
        eventId: "shushu_bond",
        stageId: "gifted",
        complete: true,
      },
      {
        kind: "set_affection",
        petId: "pet-shushu",
        stage: AffectionStage.FamiliarResident,
      },
      { kind: "pet_sleep", petId: "pet-shushu" },
      { kind: "show_toast", localizationKey: "story.shushu_bond", durationMs: 7000 },
    ],
  },
  // 送了它不爱吃的、或者干脆没给：不完成初见，睡意照样上来。
  // 不设 requiresEventUntriggered——每次都可能触发，玩家可以隔天再叫醒它重试
  {
    id: "shushu_gift_declined",
    triggers: [{ signal: "dialogue_event", subject: "shushu_gift_declined" }],
    effects: [{ kind: "pet_sleep", petId: "pet-shushu" }],
    once: false,
  },
];

export const tutorialDefinition: TutorialDefinition = {
  id: "day_one",
  completedLocalizationKey: "tutorial.completed",
  steps: [
    {
      stepId: "unpack",
      localizationKey: "tutorial.unpack",
      completedBy: { signal: "unpacked" },
    },
    {
      stepId: "workbench",
      localizationKey: "tutorial.workbench",
      // furniture_workbench，不是 V0.4 之前的 ordinary_workbench。
      // 写错时这一步会静默地永远等不到信号，教程卡在这里——
      // 现在开机的 auditStoryContent 会点名，见 logic/storyAudit
      completedBy: { signal: "furniture_placed", subject: "furniture_workbench" },
    },
    {
      stepId: "craft",
      localizationKey: "tutorial.craft",
      completedBy: { signal: "craft_completed" },
    },
    {
      stepId: "gift",
      localizationKey: "tutorial.gift",
      completedBy: { signal: "gift_given" },
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
