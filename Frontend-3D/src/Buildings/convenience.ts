import { Object3D } from "three";
import { buildTownhouse } from "./shell.js";
import { addAwning } from "./awning.js";
import type { BuildingDefinition } from "./types.js";

/** 便利店。**独门记号：门头一道素色雨棚**，全街最朴素的一家 */
export const convenience: BuildingDefinition = {
  buildingId: "convenience",
  localizationKey: "map.shop_convenience",
  footprint: { width: 11.5, height: 9.5 },
  doorOffset: 0,
  interiorMapId: "shop-convenience",
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
};
