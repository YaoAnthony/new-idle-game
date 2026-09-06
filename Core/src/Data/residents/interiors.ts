import type { ItemId } from "../../types/items.js";

/**
 * 居民房的室内（居民系统 08）：**固定陈设 + 你送的东西摆哪 + 他在家待哪**。
 *
 * 几何不在这里——三栋房子的壳子和内景房间在 Frontend `Buildings/<house>.ts`
 * （`interior` 生成 3×3 的房间，读档时重生成，不进存档）。这张表只写"屋里有什么、
 * 摆在哪"，坐标是**型号本地**（中心原点、正面 +z、一格一米），和门口展示位同一套。
 *
 * 固定陈设借现成的家具当占位（凹坑 = 软垫、杂物 = 储物箱、风铃 = 挂画）：三件专属陈设
 * 要建模，参考图没到之前不凭描述开工（见 08 收工记录）。换成真模型时只改 `itemId`。
 *
 * 槽位分**地面 / 墙面**：送的东西按它的放置面进对应的槽，灯挂墙、垫子铺地，不会颠倒。
 * 3×3 的小屋放三件已经满了（半宽 1.5，墙厚 0.13）；满了最早的一件挪到门口，门口也满了进箱。
 */
export type InteriorFixture = {
  itemId: ItemId;
  x: number;
  z: number;
  /** 绕 y 的朝向（弧度）。不填朝正面 */
  rotation?: number;
  /** 挂墙的离地高度。不填落地 */
  y?: number;
};

export type InteriorGiftSlot = {
  x: number;
  z: number;
  surface: "floor" | "wall";
  rotation?: number;
  /** 墙面槽的离地高度 */
  y?: number;
};

export type ResidentInteriorDefinition = {
  buildingId: string;
  /** 地板的色（每家一种，"风格"这一期就靠地板色 + 固定陈设区分） */
  floor: string;
  fixed: readonly InteriorFixture[];
  giftSlots: readonly InteriorGiftSlot[];
  /** 他在家待的地方（睡、坐都在这儿），和面朝哪 */
  homeSpot: { x: number; z: number; faceX: number; faceZ: number };
};

/** 三栋共用的骨架：左后角是窝、右侧两个地面槽、后墙一个墙面槽。差别在固定陈设和地板色 */
const NEST = { x: -0.85, z: -0.85 };
const GIFT_SLOTS: readonly InteriorGiftSlot[] = [
  { x: 0.85, z: -0.85, surface: "floor", rotation: -Math.PI / 2 },
  { x: 0.85, z: 0.45, surface: "floor", rotation: -Math.PI / 2 },
  { x: -0.35, z: -1.36, surface: "wall", y: 1.25 },
];

export const residentInteriorDefinitions = [
  {
    buildingId: "slime_house",
    floor: "#cfe4d3",
    fixed: [
      // 睡觉的凹坑（占位：软垫）
      { itemId: "furniture_cushion", ...NEST },
      { itemId: "furniture_door_mat", x: 0, z: 0.95 },
    ],
    giftSlots: GIFT_SLOTS,
    homeSpot: { ...NEST, faceX: 0, faceZ: 1.5 },
  },
  {
    buildingId: "fox_house",
    floor: "#d8b98c",
    fixed: [
      { itemId: "furniture_cushion", ...NEST },
      // 从小镇带回来的杂物（占位：储物箱）
      { itemId: "furniture_storage_chest", x: -0.85, z: 0.55, rotation: Math.PI / 2 },
    ],
    giftSlots: GIFT_SLOTS,
    homeSpot: { ...NEST, faceX: 0, faceZ: 1.5 },
  },
  {
    buildingId: "spirit_house",
    floor: "#bccbb0",
    fixed: [
      { itemId: "furniture_cushion", ...NEST },
      { itemId: "furniture_potted_plant", x: -0.85, z: 0.6 },
      // 风铃（占位：挂画）挂在后墙右侧，墙面槽在左侧
      { itemId: "furniture_picture_frame", x: 0.45, z: -1.36, y: 1.3 },
    ],
    giftSlots: GIFT_SLOTS,
    homeSpot: { ...NEST, faceX: 0, faceZ: 1.5 },
  },
] as const satisfies readonly ResidentInteriorDefinition[];

export function findResidentInterior(buildingId: string): ResidentInteriorDefinition | undefined {
  return (residentInteriorDefinitions as readonly ResidentInteriorDefinition[]).find((entry) => entry.buildingId === buildingId);
}

/** 这件东西该进哪种槽：挂墙的进墙面槽，落地和台面小物进地面槽 */
export function giftSurfaceOf(surface: "floor" | "wall" | "surface"): "floor" | "wall" {
  return surface === "wall" ? "wall" : "floor";
}
