export type MapId = string;
export type RoomId = string;
export type WallId = string;
export type OpeningId = string;
export type PlayerId = string;
export type WorldId = string;
export type FeatureId = string;
export type MissionId = string;
export type ActionId = string;
export type ProcessId = string;
export type InventoryId = string;
export type CustomDataId = string;
export type LocalizationKey = string;
export type VisualId = string;
export type AudioProfileId = string;
export type SlotId = string;
/** 家具上一个能安放身体的位置（椅面、床铺）。见 FurnitureAnchor */
export type AnchorId = string;

/**
 * 角色姿势的注册表键。和 VisualId 同一个路子：
 * Core 只存这个字符串，"具体哪个部件转多少度"是表现层的事。
 *
 * 分两层，因为姿势会组合而不是穷举：
 * - 姿态（站 / 坐 / 躺）管腿和身体高度
 * - 活动（伏案写字 / 端着东西）管手臂和上身倾斜
 * 「坐着学习」= 坐 + 伏案，两层各碰不同部件，叠加天然不冲突。
 * 否则 3 姿态 × 4 活动 = 12 个 id，加一个活动就要补一排。
 */
export type PoseId = string;

export enum Facing {
  North = "north",
  East = "east",
  South = "south",
  West = "west",
}

export enum Rarity {
  Common = "common",
  Uncommon = "uncommon",
  Rare = "rare",
  Epic = "epic",
  Legendary = "legendary",
  Mythic = "mythic",
}

export type GridFootprint = {
  width: number;
  height: number;
};

export type GridPosition = {
  x: number;
  y: number;
};

/**
 * 一个身体在世界里的落点。玩家、宠物共用。
 *
 * **朝向存连续弧度，不存四向**（save v19 改）。
 *
 * 原来这里是 `facing: Facing`，理由写在 logic/facing.ts：四向是逻辑量、
 * 弧度是表现细节，传弧度等于把渲染实现塞进联机协议。那个论证对 2D 网格
 * 游戏成立，对这个游戏**已经不成立**，而且代码自己先破了功——
 * `throwItem()` 用连续 heading 决定东西往哪飞（那是规则不是表现），
 * 宠物 agent 全程连续转身，只在存/取那一刹被砍成 4 档。
 *
 * 砍掉的后果是可见的：面朝 40° 存盘、读档变成 0°，角色"啪"地扭一下；
 * 联机时远端玩家绕你走会是四段式跳转。
 *
 * 存 number 而不是量化整数：存档不缺这 4 个字节，留全精度。
 * **协议层要量化是协议层的事**——Minecraft 的 yaw 就是 1 字节 256 档
 * （1.4°/档，视觉上足够，比四向精细 64 倍）。存档和线上格式本来
 * 就不必是同一个，把线上的省字节手段提前烧进存档才是真的越界。
 *
 * 家具的朝向仍然是 `Facing`：那个真的只有四档（吸附网格、占用图按格算），
 * 不是精度不够，是本来就离散。
 */
export type WorldPosition = {
  mapId: MapId;
  x: number;
  y: number;

  /** 朝向弧度。0 = +Z，绕 Y 轴从 +Z 转向 +X 为正（和渲染层同一套） */
  heading: number;
};
