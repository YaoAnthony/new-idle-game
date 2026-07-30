import type { PetDefinition } from "../../types/pets.js";

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
