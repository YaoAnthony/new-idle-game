import type { RoomStyleDefinition } from "../../types/roomStyle.js";

/**
 * 三种屋子风格，对应新建世界时随机分配的三个地区。
 * 门窗数量与位置由 logic/roomGeometry 统一决定，风格只提供外观与色板。
 */
export const roomStyleDefinitions = [
  {
    id: "forest_cottage",
    localizationKey: "room_style.forest_cottage",
    regionId: "forest",
    visual: {
      floorVisualId: "floor_wood_plank",
      wallVisualId: "wall_timber",
      doorVisualId: "door_arched_wood",
      windowVisualId: "window_round_wood",
      // 2026-07-30 明度大改：墙提到奶白、地板提到蜂蜜色，
      // 和渲染层 palette.ts 保持一致（RoomBuilder 接上这份数据之前，
      // 两处都要改，否则装修换风格落地那天会拿到旧色）
      palette: {
        floor: "#c09a6a",
        floorAlt: "#b48f5f",
        wall: "#ece1cb",
        wallTrim: "#6b4a30",
        accent: "#6f8f4a",
      },
    },
    starterPetDefinitionIds: ["moss_wisp"],
  },
  {
    id: "ocean_cottage",
    localizationKey: "room_style.ocean_cottage",
    regionId: "ocean",
    visual: {
      floorVisualId: "floor_pale_plank",
      wallVisualId: "wall_plaster",
      doorVisualId: "door_arched_pale",
      windowVisualId: "window_porthole",
      palette: {
        floor: "#c2a684",
        floorAlt: "#b2977a",
        wall: "#e2ded0",
        wallTrim: "#5f8ea0",
        accent: "#4f8fa6",
      },
    },
    starterPetDefinitionIds: ["foam_wisp"],
  },
  {
    id: "stone_cottage",
    localizationKey: "room_style.stone_cottage",
    regionId: "stone",
    visual: {
      floorVisualId: "floor_stone_tile",
      wallVisualId: "wall_stone_brick",
      doorVisualId: "door_arched_iron",
      windowVisualId: "window_lattice",
      palette: {
        floor: "#8d8071",
        floorAlt: "#7d7164",
        wall: "#a39a8c",
        wallTrim: "#5c5348",
        accent: "#a8763f",
      },
    },
    starterPetDefinitionIds: ["ember_wisp"],
  },
] satisfies RoomStyleDefinition[];
