import { Facing, type BuildingPlacement } from "core";

/**
 * 莉奥拉小镇立着哪些楼。**这张表就是"街道布局"的全部**——
 * 挪一栋、转个朝向、换个型号，都是改这里的一行；碰撞、店门、门口的
 * 出入口、门前铺装全部从它推导（Buildings/placement），不用同步任何
 * 别的地方。
 *
 * 两排三列照概念图：后排书店/神秘商店/便利店坐在高一级的台地上，
 * 前排咖啡厅/餐厅/超市在低一级，中间一条街。**全部朝南**——正面
 * 对着广场那一侧，人从镇口进来先看见的是六张脸不是六个屁股。
 */

/** 商业街两级台地的标高。地不是平的，房子各坐各的那层 */
export const TERRACE_FRONT = 0.9;
export const TERRACE_BACK = 1.8;

export const TOWN_BUILDINGS: BuildingPlacement[] = [
  // ---- 后排（高台地）----
  {
    instanceId: "town-bookstore",
    buildingId: "bookstore",
    x: -18,
    z: -34,
    elevation: TERRACE_BACK,
    facing: Facing.South,
  },
  {
    instanceId: "town-arcane",
    buildingId: "arcane",
    x: 0,
    z: -34,
    elevation: TERRACE_BACK,
    facing: Facing.South,
  },
  {
    instanceId: "town-convenience",
    buildingId: "convenience",
    x: 18,
    z: -34,
    elevation: TERRACE_BACK,
    facing: Facing.South,
  },
  // ---- 前排（低台地）----
  {
    instanceId: "town-cafe",
    buildingId: "cafe",
    x: -18,
    z: -16,
    elevation: TERRACE_FRONT,
    facing: Facing.South,
  },
  {
    instanceId: "town-restaurant",
    buildingId: "restaurant",
    x: 0,
    z: -16,
    elevation: TERRACE_FRONT,
    facing: Facing.South,
  },
  {
    instanceId: "town-market",
    buildingId: "market",
    x: 18,
    z: -16,
    elevation: TERRACE_FRONT,
    facing: Facing.South,
  },
];
