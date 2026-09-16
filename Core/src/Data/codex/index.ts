import { CreatureRole, type ResidentDefinition } from "../../types/residents.js";
import { ItemCategory, type PlaceableItem } from "../../types/items.js";
import type { CodexSource } from "../../types/codex.js";
import { placeableItems } from "../items/index.js";
import { residentDefinitions, residentDefinitionOf } from "../residents/index.js";

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

/** 居民：在我的世界里出现过 / 桥头来过 / 搬进来过 */
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
  rules: [
    // subject 是实例 id（resident-<definitionId>），砍前缀回到定义
    {
      signal: "resident_spawned",
      toEntryId: (subject) => {
        const definition = residentDefinitionOf(subject);
        return definition ? `resident:${definition.id}` : null;
      },
    },
    { signal: "visitor_arrived", toEntryId: (subject) => `resident:${subject}` },
    { signal: "resident_moved_in", toEntryId: (subject) => `resident:${subject}` },
  ],
};

export const codexSources: readonly CodexSource<any>[] = [furnitureSource, residentSource];
