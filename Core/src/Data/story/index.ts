import type { StoryRule, TutorialDefinition } from "../../types/story.js";

/**
 * 剧情编排。**这里是唯一的剧情真相来源——代码里不允许出现剧情分支。**
 *
 * 2026-08-13 清空：旧的"租到出租屋"那条线（搬家独白、苔苔登场、妈妈来电、
 * 苔苔失踪、舒舒初见）整套推倒，换成「魔女在深山收学徒」。文案由作者重写，
 * 这里先留空壳——解释器、信号、效果全部照旧，加剧情就是往下面这个数组里
 * 写数据。
 *
 * 写之前先看 `types/story.ts`：18 种信号、10 种效果、触发条件之间是「与」，
 * `triggers` 数组之间是「或」。
 */
export const storyRules: StoryRule[] = [];

/**
 * 教程。同样清空——旧的六步（拆箱→摆工作台→制作→送礼→行动→睡觉）
 * 是按出租屋那套叙事写的。
 *
 * 注意它**现在没有任何 UI 消费方**：常驻左上角的 TutorialGuide 早就删了
 * （它挡视线，而教的那几步看一次就会）。留着这份定义是因为 `story_signal`
 * 那套还给别的系统用，重写教程时直接往 steps 里填。
 */
export const tutorialDefinition: TutorialDefinition = {
  id: "day_one",
  completedLocalizationKey: "tutorial.completed",
  steps: [],
};
