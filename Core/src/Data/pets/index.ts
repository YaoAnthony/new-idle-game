import { GiftTier, type PetDefinition, type PetTaste } from "../../types/pets.js";

/**
 * 宠物物种注册表。
 *
 * 设定：**元素凝聚体**——它们不是动物，是环境自己长出来的东西。
 * 苔灵是林间湿气和苔藓凝成的，沫灵是浪沫收不回去的那一口气，
 * 烬灵是石缝里没冷透的余温。所以三种屋子风格各配一只，
 * 不是"这个地区住着这种动物"，而是"这种地方会长出这种东西"。
 *
 * 造型全部走 visualId → Frontend 的 VisualRegistry 解析。
 * 名字分两层：localizationKey 是物种名（图鉴用），
 * defaultNicknameKey 是初见时给的昵称（玩家之后能改，存 PetSave.nickname）。
 */
export const petDefinitions = [
  {
    id: "moss_wisp",
    localizationKey: "pet.moss_wisp",
    defaultNicknameKey: "pet.moss_wisp.nickname",
    visualId: "moss_wisp",
    species: "wisp",
  },
  {
    id: "foam_wisp",
    localizationKey: "pet.foam_wisp",
    defaultNicknameKey: "pet.foam_wisp.nickname",
    visualId: "foam_wisp",
    species: "wisp",
  },
  {
    id: "ember_wisp",
    localizationKey: "pet.ember_wisp",
    defaultNicknameKey: "pet.ember_wisp.nickname",
    visualId: "ember_wisp",
    species: "wisp",
  },
] satisfies PetDefinition[];

export function findPetDefinition(id: string): PetDefinition | undefined {
  return petDefinitions.find((pet) => pet.id === id);
}

/**
 * 喜好表。判定见 `logic/giftRules.ts`，四档的**反应**由对话与 storyRules 声明——
 * 这张表只回答"它对这样东西是什么态度"，不决定后果。
 *
 * 喜好是从**设定**推出来的，不是随手分的：苔灵是林间湿气凝的，
 * 所以偏清淡潮湿的东西；沫灵是浪沫的那口气，白的软的最合它；
 * 烬灵是石缝里没冷透的余温，重口、热的才对味，汤会浇灭它。
 * 这样玩家试错时能试出**规律**，而不是背一张随机表。
 *
 * 生食材（生蛋、生米、生肉）一律列 inedible：不是口味问题，是真的没法吃。
 * 生番茄这种本来就能生吃的例外，照常参与口味分档。
 */
export const petTastes: Record<string, PetTaste> = {
  moss_wisp: {
    /**
     * `cheese` 在这里换了一条轴：不是"清淡潮湿"推出来的，是**好奇心**——
     * 它把玩家当成"外面世界"的信息源（见 `Data/dialogues/index.ts` 的定调）。
     *
     * ⚠️ 这一项不要"纠正"回不喜欢：奶酪是 `ItemOrigin.Real`，全作的题眼就是
     * 玩家递上现实里换来的、它连见都没见过的东西。记忆条目只在**爱吃**档写，
     * 所以这个演出能不能成立，取决于 cheese 对它是不是 loved。
     */
    loved: ["baby_cabbage_soup", "cheese"],
    liked: [
      "fried_tomato_egg",
      "cooked_rice",
      "fried_egg",
      "tomato",
      "baby_cabbage",
      "green_pepper",
    ],
    disliked: ["pepper_pork", "century_egg"],
    inedible: ["egg", "rice", "pork"],
    fallback: GiftTier.Liked,
  },

  foam_wisp: {
    loved: ["cooked_rice", "fried_egg"],
    liked: ["fried_tomato_egg", "baby_cabbage_soup", "tomato", "baby_cabbage", "cheese"],
    disliked: ["pepper_pork", "green_pepper", "century_egg"],
    inedible: ["egg", "rice", "pork"],
    fallback: GiftTier.Liked,
  },

  ember_wisp: {
    loved: ["pepper_pork", "century_egg"],
    liked: ["fried_tomato_egg", "fried_egg", "cooked_rice", "green_pepper"],
    // 汤会浇灭它。挑食，所以 fallback 也落在不喜欢那一档
    disliked: ["baby_cabbage_soup", "baby_cabbage", "tomato", "cheese"],
    inedible: ["egg", "rice", "pork"],
    fallback: GiftTier.Disliked,
  },
};

export function findPetTaste(definitionId: string): PetTaste | undefined {
  return petTastes[definitionId];
}
