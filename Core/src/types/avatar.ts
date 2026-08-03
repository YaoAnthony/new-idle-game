import type { VisualId } from "./base.js";

export type AvatarPartId = string;

/**
 * 捏人配置。角色由可替换零件拼装而成，表现层按槽位组装并染色，
 * 因此换发型换衣服不需要重做动画——动画驱动的是槽位而不是具体模型。
 *
 * 脸部四个槽（脸型/眼/嘴/鼻）和穿戴槽是同一套机制：都是
 * "partId 查注册表 → 表现层拼几何"。不给脸部另开一套"参数化捏脸"
 * （拉杆调眼距那种）——零件制下任何组合都在美术给定的范围内，
 * 不会捏出鬼脸；拉杆制要为每个参数做适配和边界测试，成本完全不同。
 * 动森同样是零件制，这也是玩家给的设计参照。
 */
export type AvatarConfig = {
  bodyId: AvatarPartId;
  /** 脸型（头部轮廓）。捏脸系统 v1 新增，老存档由迁移补默认值 */
  faceId: AvatarPartId;
  hairId: AvatarPartId;
  eyesId: AvatarPartId;
  mouthId: AvatarPartId;
  noseId: AvatarPartId;
  topId: AvatarPartId;
  bottomId: AvatarPartId;
  shoesId: AvatarPartId;

  /** 各部位染色，键为调色板键（AvatarColorKey），值为十六进制颜色 */
  colors: Record<string, string>;
};

export enum AvatarSlot {
  Body = "body",
  Face = "face",
  Hair = "hair",
  Eyes = "eyes",
  Mouth = "mouth",
  Nose = "nose",
  Top = "top",
  Bottom = "bottom",
  Shoes = "shoes",
}

export type AvatarPartDefinition = {
  id: AvatarPartId;
  slot: AvatarSlot;
  visualId: VisualId;
  /** 捏脸界面里显示的零件名 */
  localizationKey: string;

  /** 该零件允许玩家自定义的颜色键 */
  colorKeys: string[];
};

/**
 * 调色板。**固定色板而不是无级取色器**：色是美术挑过的，任何组合
 * 都不会难看；取色器给的自由度，代价是玩家能配出脏色、荧光色，
 * 以及界面上多一整套 HSV 控件。动森全系用的就是固定色板。
 */
export type AvatarColorKey = string;

export type AvatarPaletteDefinition = {
  /** 对应 AvatarConfig.colors 的键 */
  key: AvatarColorKey;
  /** 捏脸界面里这一栏的标题 */
  localizationKey: string;
  /** 十六进制色列表，界面按序展示 */
  colors: string[];
};
