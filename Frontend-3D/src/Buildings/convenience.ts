import { Object3D } from "three";
import { buildTownhouse } from "./shell.js";
import { addAwning } from "./awning.js";
import type { BuildingDefinition } from "./types.js";

/** 便利店。**独门记号：门头一道素色雨棚**，全街最朴素的一家 */
export const convenience: BuildingDefinition = {
  buildingId: "convenience",
  localizationKey: "map.shop_convenience",
  doorOffset: 0,
  interiorMapId: "shop-convenience",
  /*
   * 小镇的店只有一级、不能升。包成 levels 是**一次机械改动**：型号从此
   * 统一有等级维度，领地上的建筑才能升级，而这六家的行为一个字没变
   * （没有 nextLevelIds = 已满级）。
   *
   * interiorMapId 留在型号上不动——那是换图进店，和领地建筑的同图内景
   * 是两回事，两个字段并存各管各的。
   */
  levels: [
    {
      levelId: "l1",
      localizationKey: "map.shop_convenience",
      descriptionKey: "map.shop_convenience.desc",
      footprint: { width: 11.5, height: 9.5 },
    build: () => {
      const house = buildTownhouse({
        sign: "便利店",
        footprint: { width: 11.5, height: 9.5 },
        jetty: 0.3,
        palette: {
          roof: "#b0524a",
          roofDark: "#8d423b",
          wall: "#f0e6d2",
          timber: "#7a5433",
          accent: "#d98d5a",
          board: "#e0c9a2",
        },
      });
      addAwning(house.node, 11.5 - 1.6, house.front, house.palette.accent, false, house.palette.timber);
      return house.node as Object3D;
    },
    },
  ],
};
