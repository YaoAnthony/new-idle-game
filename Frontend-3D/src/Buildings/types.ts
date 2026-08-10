import type { GridFootprint } from "core";
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
export type BuildingDefinition = {
  buildingId: string;
  localizationKey: string;

  /**
   * 占地（未旋转时）。`height` 是**进深**——沿用 GridFootprint 的既有
   * 语义（家具用了两年的那套），不另造一个类型。
   */
  footprint: GridFootprint;

  /**
   * 门心沿正面的偏移，0 = 居中。
   *
   * **正面永远是本地 +z**：这是本系统的核心约定。型号只管把楼盖成
   * "脸朝 +z"，实例的 `facing` 负责把它转到世界里去——和家具的
   * FACING_ROTATION 完全同一套，所以旋转推导可以直接抄现成的。
   */
  doorOffset: number;

  /** 进这栋楼去哪张图。不填 = 纯布景，进不去 */
  interiorMapId?: string;

  /** 建出本地坐标的模型：正面朝 +z，地面 y=0，中心在原点 */
  build: () => Object3D;
};
