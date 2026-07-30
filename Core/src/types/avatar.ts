import type { VisualId } from "./base.js";

export type AvatarPartId = string;

/**
 * 捏人配置。角色由可替换零件拼装而成，表现层按槽位组装并染色，
 * 因此换发型换衣服不需要重做动画——动画驱动的是槽位而不是具体模型。
 */
export type AvatarConfig = {
  bodyId: AvatarPartId;
  hairId: AvatarPartId;
  topId: AvatarPartId;
  bottomId: AvatarPartId;
  shoesId: AvatarPartId;

  /** 各部位染色，键为部位槽名，值为十六进制颜色 */
  colors: Record<string, string>;
};

export enum AvatarSlot {
  Body = "body",
  Hair = "hair",
  Top = "top",
  Bottom = "bottom",
  Shoes = "shoes",
}

export type AvatarPartDefinition = {
  id: AvatarPartId;
  slot: AvatarSlot;
  visualId: VisualId;

  /** 该零件允许玩家自定义的颜色键 */
  colorKeys: string[];
};
