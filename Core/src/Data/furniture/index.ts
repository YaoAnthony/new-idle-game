import { FurnitureCategory, type FurnitureDefinition } from "../../types/furniture.js";
import { ItemCategory } from "../../types/items.js";
import { findPlaceableItem, placeableItems, type PlaceableItem } from "../items/index.js";

/**
 * 家具注册表**已经并进物品注册表**了——家具就是带 `placement` 那块能力的物品。
 * 见 `Frontend-3D/V0.4 - 物品与家具统一.md`。
 *
 * 这个文件现在只剩一层**向后兼容的投影**：把物品摊平成旧的
 * `FurnitureDefinition` 形状，给还没改完的调用方用。阶段 3 会连它一起删。
 *
 * **不要往这里加东西**——加家具请去 `Data/items`。
 */

/** 旧的 FurnitureCategory 和新的 ItemCategory 不是一回事，投影时给个占位 */
function legacyCategory(item: PlaceableItem): FurnitureCategory {
  return item.category === ItemCategory.Furniture
    ? FurnitureCategory.Decoration
    : FurnitureCategory.Station;
}

function project(item: PlaceableItem): FurnitureDefinition {
  const { placement } = item;
  return {
    id: item.id,
    localizationKey: item.localizationKey,
    category: legacyCategory(item),
    visualId: item.visual.id,
    // 旧字段只有一个音频位；常响优先，其次工作时响
    audioProfileId: item.audio?.ambient ?? item.audio?.active ?? null,
    placementSurface: placement.surface,
    footprint: placement.footprint,
    footprintMask: placement.footprintMask,
    capabilities: placement.capabilities,
    floorLayer: placement.floorLayer,
    blocksMovement: placement.blocksMovement,
    interactHint: placement.interactHint,
    coversOpenings: placement.coversOpenings,
    slots: placement.slots,
    anchors: placement.anchors,
  };
}

/** @deprecated 用 `placeableItems()` */
export const furnitureDefinitions: FurnitureDefinition[] =
  placeableItems().map(project);

/** @deprecated 用 `findPlaceableItem()` */
export function findFurnitureDefinition(
  furnitureId: string,
): FurnitureDefinition | undefined {
  const item = findPlaceableItem(furnitureId);
  return item ? project(item) : undefined;
}
