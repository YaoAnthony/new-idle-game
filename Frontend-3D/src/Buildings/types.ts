import type { GridFootprint, ItemId, RoomSave, RoomStyleDefinition } from "core";
import type { Object3D } from "three";

/**
 * 一个**建筑型号**（"书店"这种，不是"街角那家书店"）。
 *
 * 和箱庭定义同样的取舍：**整份定义住在 Frontend，不进 Core**——一栋楼
 * 必须连模型一起才完整，而模型是 Three.js 代码，进不了那个要给 Backend
 * 复用的包。Core 只留 `BuildingPlacement`（实例），因为实例有一天要
 * 进存档。
 *
 * **一栋楼 = 一个文件**（`Buildings/<id>.ts`），在 `index.ts` 里登记
 * 一行。加一栋新楼 = 新建一个兄弟文件 + 登记；删一栋 = 删文件 + 删那行。
 * 共用的半木结构外壳在 `shell.ts`，各家文件里只剩自己的配色和那处
 * 独门记号——这样"改哪家"永远只用打开哪家的文件。
 */
export type BuildingLevelId = string;

/**
 * 一个**等级**的样子。等级之间可以换模型、换占地、换数值。
 *
 * 占地、模型、内景都挂在**等级**上而不是型号上：升级要能变大变样子
 * （金币罐 L1 一只小罐、L3 一组三罐；房子 3a 摊开、3b 长高）。
 * 放型号上表达不了。
 */
export type BuildingLevel = {
  levelId: BuildingLevelId;
  /** 这一级的名字（"木屋 · 加建"）。型号名不带等级，在 BuildingDefinition 上 */
  localizationKey: string;
  descriptionKey: string;

  /**
   * 占地（未旋转时）。`height` 是**进深**——沿用 GridFootprint 的既有
   * 语义（家具用了两年的那套），不另造一个类型。
   */
  footprint: GridFootprint;

  /** 建出本地坐标的模型：正面朝 +z，地面 y=0，中心在原点 */
  build: () => Object3D;

  /**
   * **同图内景**：这一级走进去是什么样的房间。给一个户型生成器，
   * 建筑实例创建 / 升级时用它生成 `RoomSave`（锚点 = 建筑的位置）。
   *
   * 没有 = 进不去（金币罐、农田）。
   *
   * **不是换图**——房间就在 base 图上，人从门走进去，镜头切屋内盒
   * （期 0 的 0a-2 已经把镜头改成按房子列表判定）。和 `interiorMapId`
   * 那条路并存、各管各的：那是小镇店铺的进法（换图），这是领地建筑的。
   */
  interior?: (style: RoomStyleDefinition) => Omit<RoomSave, "roomId" | "anchor">;

  /**
   * 能升到哪几级。**这是一张有向图不是一条链。**
   *
   * 房子要 `1 → 2 → 3a 或 3b`。数组下标天然是一条链，表达不了分叉；
   * 硬用数组就得在外面另写一张"谁能升到谁"的表，两份数据迟早走散。
   * 改成每级自己声明后继之后，**链是图的特例**（每级只有一个后继），
   * 金币罐 l1→l2→l3 照样写得出来。
   *
   * 空 / 不填 = 已满级。
   */
  nextLevelIds?: BuildingLevelId[];

  /**
   * 升到**每个**下一级各要什么。键是目标 levelId——分叉的两条路代价
   * 可以不同。空数组 = 无条件可升（材料系统落地前恒空）。
   */
  upgradeCost?: Record<BuildingLevelId, Array<{ itemId: ItemId; quantity: number }>>;

  /**
   * 升到某一级的**前置条件**（照 CoC 的"先铺满再升主厅"）。今天恒空。
   * **结构本期就留**，校验函数和报错理由一起写好——加内容时是填数据
   * 不是改代码。
   */
  requires?: Record<
    BuildingLevelId,
    Array<{ buildingId: string; minLevelId: BuildingLevelId }>
  >;

  /**
   * 升到某一级要多久（秒）。**本期恒 0 = 瞬时**。
   *
   * 留着是因为工人系统那一期要接："占一个工人 + 等这么久"。那是 CoC
   * 的核心约束（卡进度靠建筑工小时远超过靠资源），迟早要有；接的时候
   * 不用给 BuildingPlacement 做存档迁移。
   */
  buildDuration?: Record<BuildingLevelId, number>;
};

export type BuildingDefinition = {
  buildingId: string;
  /** 型号名，**不带等级**（"木屋"而不是"木屋 · 加建"） */
  localizationKey: string;
  descriptionKey?: string;

  /**
   * 门心沿正面的偏移，0 = 居中。
   *
   * **正面永远是本地 +z**：这是本系统的核心约定。型号只管把楼盖成
   * "脸朝 +z"，实例的 `facing` 负责把它转到世界里去——和家具的
   * FACING_ROTATION 完全同一套，所以旋转推导可以直接抄现成的。
   */
  doorOffset: number;

  /**
   * 进这栋楼去**哪张图**。不填 = 不换图。
   *
   * 和等级上的 `interior` 是两条并存的路，各管各的：这条是小镇六家店的
   * 进法（走进门 → 换图），那条是领地建筑的（走进门 → 还在同一张图，
   * 镜头切屋内盒）。两个字段并存不是冗余——它们回答的是不同的问题。
   */
  interiorMapId?: string;

  /**
   * 这张图上最多能有几栋。不填 = 不限。
   * 金币罐和农田不限（多建、容量相加），房子 1。
   */
  maxInstances?: number;

  /** 至少一级。**第一个是初始等级**（新建出来就是它） */
  levels: BuildingLevel[];
};
