import {
  AvatarSlot,
  type AvatarConfig,
  type AvatarPaletteDefinition,
  type AvatarPartDefinition,
  type AvatarPartId,
} from "../../types/avatar.js";

/**
 * 捏人零件注册表。
 *
 * 造型全部走 visualId → Frontend 按零件 id 拼几何（和宠物同一个路子）。
 * 加一款发型 = 这里加一行 + 表现层加一个几何生成器 + 一条文案，
 * 捏脸界面自动多出一格，不用改界面代码。
 *
 * 身体（body）不开放捏：V1 的范围是玩家点名的六类
 * （头发/脸型/眼/嘴/鼻/衣服），体型牵动所有动画锚点和家具交互高度，
 * 另算一档工程量。槽位留着，注册表里只有一个默认体型。
 */
export const avatarPartDefinitions: AvatarPartDefinition[] = [
  // ---- 身体 ----
  {
    id: "body_default",
    slot: AvatarSlot.Body,
    visualId: "body_default",
    localizationKey: "avatar.part.body_default",
    colorKeys: ["skin"],
  },

  // ---- 脸型：头部轮廓的形变，肤色跟身体共用一个色键 ----
  {
    id: "face_round",
    slot: AvatarSlot.Face,
    visualId: "face_round",
    localizationKey: "avatar.part.face_round",
    colorKeys: ["skin"],
  },
  {
    id: "face_oval",
    slot: AvatarSlot.Face,
    visualId: "face_oval",
    localizationKey: "avatar.part.face_oval",
    colorKeys: ["skin"],
  },
  {
    id: "face_chubby",
    slot: AvatarSlot.Face,
    visualId: "face_chubby",
    localizationKey: "avatar.part.face_chubby",
    colorKeys: ["skin"],
  },

  // ---- 发型 ----
  {
    id: "hair_bob",
    slot: AvatarSlot.Hair,
    visualId: "hair_bob",
    localizationKey: "avatar.part.hair_bob",
    colorKeys: ["hair"],
  },
  {
    id: "hair_short",
    slot: AvatarSlot.Hair,
    visualId: "hair_short",
    localizationKey: "avatar.part.hair_short",
    colorKeys: ["hair"],
  },
  {
    id: "hair_spiky",
    slot: AvatarSlot.Hair,
    visualId: "hair_spiky",
    localizationKey: "avatar.part.hair_spiky",
    colorKeys: ["hair"],
  },
  {
    id: "hair_ponytail",
    slot: AvatarSlot.Hair,
    visualId: "hair_ponytail",
    localizationKey: "avatar.part.hair_ponytail",
    colorKeys: ["hair"],
  },
  {
    id: "hair_buns",
    slot: AvatarSlot.Hair,
    visualId: "hair_buns",
    localizationKey: "avatar.part.hair_buns",
    colorKeys: ["hair"],
  },
  {
    id: "hair_curly",
    slot: AvatarSlot.Hair,
    visualId: "hair_curly",
    localizationKey: "avatar.part.hair_curly",
    colorKeys: ["hair"],
  },

  // ---- 眼睛 ----
  {
    id: "eyes_round",
    slot: AvatarSlot.Eyes,
    visualId: "eyes_round",
    localizationKey: "avatar.part.eyes_round",
    colorKeys: ["eyes"],
  },
  {
    id: "eyes_oval",
    slot: AvatarSlot.Eyes,
    visualId: "eyes_oval",
    localizationKey: "avatar.part.eyes_oval",
    colorKeys: ["eyes"],
  },
  {
    id: "eyes_happy",
    slot: AvatarSlot.Eyes,
    visualId: "eyes_happy",
    localizationKey: "avatar.part.eyes_happy",
    /* 眯眯眼是两道弧线，画的是"闭着"，没有可染色的虹膜 */
    colorKeys: [],
  },
  {
    id: "eyes_sleepy",
    slot: AvatarSlot.Eyes,
    visualId: "eyes_sleepy",
    localizationKey: "avatar.part.eyes_sleepy",
    colorKeys: ["eyes"],
  },

  // ---- 嘴 ----
  {
    id: "mouth_smile",
    slot: AvatarSlot.Mouth,
    visualId: "mouth_smile",
    localizationKey: "avatar.part.mouth_smile",
    colorKeys: [],
  },
  {
    id: "mouth_open",
    slot: AvatarSlot.Mouth,
    visualId: "mouth_open",
    localizationKey: "avatar.part.mouth_open",
    colorKeys: [],
  },
  {
    id: "mouth_neutral",
    slot: AvatarSlot.Mouth,
    visualId: "mouth_neutral",
    localizationKey: "avatar.part.mouth_neutral",
    colorKeys: [],
  },
  {
    id: "mouth_cat",
    slot: AvatarSlot.Mouth,
    visualId: "mouth_cat",
    localizationKey: "avatar.part.mouth_cat",
    colorKeys: [],
  },

  // ---- 鼻子 ----
  {
    id: "nose_triangle",
    slot: AvatarSlot.Nose,
    visualId: "nose_triangle",
    localizationKey: "avatar.part.nose_triangle",
    colorKeys: [],
  },
  {
    id: "nose_round",
    slot: AvatarSlot.Nose,
    visualId: "nose_round",
    localizationKey: "avatar.part.nose_round",
    colorKeys: [],
  },
  {
    id: "nose_dot",
    slot: AvatarSlot.Nose,
    visualId: "nose_dot",
    localizationKey: "avatar.part.nose_dot",
    colorKeys: [],
  },

  // ---- 上衣 ----
  {
    id: "top_dress",
    slot: AvatarSlot.Top,
    visualId: "top_dress",
    localizationKey: "avatar.part.top_dress",
    colorKeys: ["top"],
  },
  {
    id: "top_shirt",
    slot: AvatarSlot.Top,
    visualId: "top_shirt",
    localizationKey: "avatar.part.top_shirt",
    colorKeys: ["top"],
  },
  {
    id: "top_hoodie",
    slot: AvatarSlot.Top,
    visualId: "top_hoodie",
    localizationKey: "avatar.part.top_hoodie",
    colorKeys: ["top"],
  },

  // ---- 下装 ----
  {
    id: "bottom_plain",
    slot: AvatarSlot.Bottom,
    visualId: "bottom_plain",
    localizationKey: "avatar.part.bottom_plain",
    colorKeys: ["bottom"],
  },
  {
    id: "bottom_shorts",
    slot: AvatarSlot.Bottom,
    visualId: "bottom_shorts",
    localizationKey: "avatar.part.bottom_shorts",
    colorKeys: ["bottom"],
  },
  {
    id: "bottom_skirt",
    slot: AvatarSlot.Bottom,
    visualId: "bottom_skirt",
    localizationKey: "avatar.part.bottom_skirt",
    colorKeys: ["bottom"],
  },

  // ---- 鞋 ----
  {
    id: "shoes_plain",
    slot: AvatarSlot.Shoes,
    visualId: "shoes_plain",
    localizationKey: "avatar.part.shoes_plain",
    colorKeys: ["shoes"],
  },
  {
    id: "shoes_boots",
    slot: AvatarSlot.Shoes,
    visualId: "shoes_boots",
    localizationKey: "avatar.part.shoes_boots",
    colorKeys: ["shoes"],
  },
];

/**
 * 调色板。色是挑过的（参照动森的思路：同一栏里任取一色都和其余栏搭），
 * 皮肤和头发深浅两头都有，衣服三栏共用一张布料色板——
 * 三栏各配一张几乎一样的表只是维护三份重复。
 */
const CLOTH_COLORS = [
  "#c8564f",
  "#d9a53f",
  "#8fae5a",
  "#4f8fae",
  "#6b5aae",
  "#ae5a8f",
  "#e8dcc8",
  "#6b4a30",
  "#3a2a1c",
  "#4a4a4a",
];

export const avatarPalettes: AvatarPaletteDefinition[] = [
  {
    key: "skin",
    localizationKey: "avatar.color.skin",
    colors: [
      "#f8d9c0",
      "#f2c9a4",
      "#e8b78d",
      "#d9a06b",
      "#c08652",
      "#a2683c",
      "#7f4e2b",
      "#5d391f",
    ],
  },
  {
    key: "hair",
    localizationKey: "avatar.color.hair",
    colors: [
      "#2a211b",
      "#4a3226",
      "#6b4a30",
      "#8c5f3a",
      "#a04430",
      "#c98a2e",
      "#8f8578",
      "#d9d2c6",
    ],
  },
  {
    key: "eyes",
    localizationKey: "avatar.color.eyes",
    colors: ["#2b2422", "#503c2c", "#3a506b", "#3f6b4a", "#6b4a6b"],
  },
  { key: "top", localizationKey: "avatar.color.top", colors: CLOTH_COLORS },
  {
    key: "bottom",
    localizationKey: "avatar.color.bottom",
    colors: CLOTH_COLORS,
  },
  {
    key: "shoes",
    localizationKey: "avatar.color.shoes",
    colors: CLOTH_COLORS,
  },
];

export function findAvatarPart(
  id: AvatarPartId,
): AvatarPartDefinition | undefined {
  return avatarPartDefinitions.find((part) => part.id === id);
}

export function avatarPartsForSlot(slot: AvatarSlot): AvatarPartDefinition[] {
  return avatarPartDefinitions.filter((part) => part.slot === slot);
}

export function findAvatarPalette(
  key: string,
): AvatarPaletteDefinition | undefined {
  return avatarPalettes.find((palette) => palette.key === key);
}

/**
 * 默认外观（每个槽的第一款 + 各色板里挑定的一色）。
 *
 * 颜色沿用 CharacterView 一直以来的那套（栗发红衣），老玩家读档后
 * 角色不变样。每次调用返回新对象——配置会被捏脸界面原地改，
 * 共享一个单例会让"重置"把模板也改了。
 */
export function defaultAvatarConfig(): AvatarConfig {
  return {
    bodyId: "body_default",
    faceId: "face_round",
    hairId: "hair_bob",
    eyesId: "eyes_round",
    mouthId: "mouth_smile",
    noseId: "nose_triangle",
    topId: "top_dress",
    bottomId: "bottom_plain",
    shoesId: "shoes_plain",
    colors: {
      skin: "#f2c9a4",
      hair: "#4a3226",
      eyes: "#2b2422",
      top: "#c8564f",
      bottom: "#6b4a30",
      shoes: "#3a2a1c",
    },
  };
}
