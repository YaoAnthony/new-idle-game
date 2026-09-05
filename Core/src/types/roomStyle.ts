import type { LocalizationKey, VisualId } from "./base.js";
import type { ResidentDefinitionId } from "./residents.js";

export type RoomStyleId = string;
export type RegionId = string;

/**
 * 屋子风格配方。三种风格（森林 / 海洋 / 石砖）既是新建世界时按 seed 随机
 * 分配的开局屋子，也是之后解锁装修后可以切换的目标——同一份数据两处复用。
 *
 * 三种风格的门窗数量与位置一致，只有外观不同。因此换风格时房间的可用格子
 * 不变，已放置的家具不会因为换装修而大面积失效。
 */
export type RoomStyleDefinition = {
  id: RoomStyleId;
  localizationKey: LocalizationKey;
  regionId: RegionId;

  visual: {
    floorVisualId: VisualId;
    wallVisualId: VisualId;
    doorVisualId: VisualId;
    windowVisualId: VisualId;

    /** 该风格的色板，键由表现层约定 */
    palette: Record<string, string>;
  };

  /** 这个地区可能出现的初始宠物物种，由 seed 抽取 */
  starterResidentDefinitionIds: ResidentDefinitionId[];
};
