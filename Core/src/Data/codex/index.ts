import { CreatureRole, type ResidentDefinition } from "../../types/residents.js";
import { ItemCategory, type PlaceableItem } from "../../types/items.js";
import type { CodexSource } from "../../types/codex.js";
import { placeableItems } from "../items/index.js";
import { residentDefinitions } from "../residents/index.js";
import { cropDefinitions } from "../crops/index.js";
import type { CropDefinition } from "../../types/farming.js";

/**
 * 图鉴来源表：哪几张注册表进图鉴、每条怎么读、哪些信号点亮。
 * 这里**没有内容**——名字、介绍、图全走各注册表已有的约定。加分区在这里加一项。
 */

/** 家具：能摆、而且种类是家具的（唱片也能摆，但它归唱片机那一页，以后另开分区） */
const furnitureSource: CodexSource<PlaceableItem> = {
  section: "furniture",
  titleKey: "codex.section.furniture",
  emoji: "🛋️",
  order: 0,
  list: () => placeableItems().filter((item) => item.category === ItemCategory.Furniture),
  idOf: (item) => item.id,
  nameKey: (item) => item.localizationKey,
  descKey: (item) => `${item.localizationKey}.desc`,
  groupKey: (item) => `codex.group.surface.${item.placement.surface}`,
  icon: (item) => ({ iconKey: `items/${item.id}`, fallback: "🪑" }),
  rules: [
    // 进背包就算（用户拍板）：买 / 做 / 拆箱 / 剧情送，都从 addItem 这一个口发
    { signal: "furniture_obtained", toEntryId: (subject) => `furniture:${subject}` },
    // 摆出来也算：老档里摆着但背包早空了的，靠开局对账；这条管运行中
    { signal: "furniture_placed", toEntryId: (subject) => `furniture:${subject}` },
  ],
};

/** 居民：**和他对视过**（21 注视 + 对视判定）。光在场 / 来过桥头不算——没照面的人不该出现在图鉴里（用户 2026-09-16 定） */
const residentSource: CodexSource<ResidentDefinition> = {
  section: "resident",
  titleKey: "codex.section.resident",
  emoji: "🐾",
  order: 1,
  list: () => residentDefinitions,
  idOf: (resident) => resident.id,
  // 物种名，不是昵称：图鉴上写的是"岩绒巨猫"，不是你给它起的"舒舒"
  nameKey: (resident) => resident.localizationKey,
  descKey: (resident) => `${resident.localizationKey}.desc`,
  groupKey: (resident) => `codex.group.role.${resident.role ?? CreatureRole.Pet}`,
  icon: (resident) => ({ iconKey: `residents/${resident.id}`, fallback: "🐾" }),
  rules: [{ signal: "resident_eye_contact", toEntryId: (subject) => `resident:${subject}` }],
};

/** 作物（种植系统）：**收过一次**才算见过。种下去、长着都不算——图鉴记的是"拿到过的果实" */
const cropSource: CodexSource<CropDefinition> = {
  section: "crop",
  titleKey: "codex.section.crop",
  emoji: "🌱",
  order: 2,
  list: () => cropDefinitions,
  idOf: (crop) => crop.cropId,
  nameKey: (crop) => crop.localizationKey,
  descKey: (crop) => `${crop.localizationKey}.desc`,
  // 今天只有一组；分类（蔬菜 / 果树 / 花）等作物多了再从作物表上加字段
  groupKey: () => "codex.group.crop.all",
  // 卡片上画收获物（果实）那张图，不另画作物图
  icon: (crop) => ({ iconKey: `items/${crop.harvest.itemId}`, fallback: "🌱" }),
  rules: [{ signal: "crop_harvested", toEntryId: (subject) => `crop:${subject}` }],
};

export const codexSources: readonly CodexSource<any>[] = [furnitureSource, residentSource, cropSource];
