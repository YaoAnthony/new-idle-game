import type { MainlineChapter } from "../../types/mainline.js";
import { DAILY_LIFE_FEATURE, OPENING_BOXES_FEATURE } from "../features/index.js";

/** 魔女的条子读完烧掉那一拍记的旗子（规则 opening_letter_burned 写；教程章第一拍看它） */
export const WITCH_LETTER_BURNED_FLAG = "witch_letter_burned";

/**
 * 主线注册表。章按顺序；加章在后面追加。
 *
 * 教程章（第一章）的四拍今天散在 `Data/story` 的普通规则里（条子 → 拆箱 → 摆齐四件 → 小鱼人敲门），
 * 这里**不复制**它们的触发逻辑，只登记"做到哪一拍算完"的判据，和做完解锁什么。
 */
export const mainlineChapters: readonly MainlineChapter[] = [
  {
    id: "tutorial",
    titleKey: "mainline.tutorial",
    beats: [
      // 门上的条子读完烧掉了（信封跟着没了，所以不能看背包，看旗子）
      { id: "letter", titleKey: "mainline.tutorial.letter", done: { kind: "flag_is", key: WITCH_LETTER_BURNED_FLAG, value: "1" } },
      // 两个搬家箱都拆了
      { id: "boxes", titleKey: "mainline.tutorial.boxes", done: { kind: "feature_unlocked", featureId: OPENING_BOXES_FEATURE } },
      // 箱里四件摆齐、小鱼人来敲过门、说完走了
      { id: "traveler", titleKey: "mainline.tutorial.traveler", done: { kind: "event_stage", eventId: "traveler_intro", stageId: "met" } },
    ],
    doneWhen: { kind: "event_stage", eventId: "traveler_intro", stageId: "met" },
    unlocks: [DAILY_LIFE_FEATURE],
  },
];

export function findMainlineChapter(id: string): MainlineChapter | undefined {
  return mainlineChapters.find((chapter) => chapter.id === id);
}
