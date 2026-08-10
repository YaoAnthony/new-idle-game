import { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, box } from "../Game3D/Visual/primitives.js";
import { buildTownhouse } from "./shell.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 餐厅。**独门记号：山墙一侧的砖烟囱 + 一缕炊烟**——
 * 全街唯一在冒烟的屋顶，"这里在做饭"一眼就读得出来。
 */
export const restaurant: BuildingDefinition = {
  buildingId: "restaurant",
  localizationKey: "map.shop_restaurant",
  footprint: { width: 11.5, height: 9.5 },
  doorOffset: 0,
  interiorMapId: "shop-restaurant",
  build: () => {
    const house = buildTownhouse({
      sign: "餐厅",
      footprint: { width: 11.5, height: 9.5 },
      jetty: 0.5,
      palette: {
        roof: "#8d3b34",
        roofDark: "#712f2a",
        wall: "#efe2c8",
        timber: "#5f4127",
        accent: "#c9a24f",
        board: "#d3b380",
      },
    });
    const { node, eaveY, halfW, palette } = house;

    const cx = halfW - 1.6;
    node.add(box([1.0, 4.2, 1.0], { color: PALETTE.foundation, position: [cx, eaveY - 0.4, -1.5] }));
    node.add(box([1.25, 0.24, 1.25], { color: palette.roofDark, position: [cx, eaveY + 1.75, -1.5] }));
    for (let i = 0; i < 4; i += 1) {
      node.add(
        blob(0.3 + i * 0.16, 0, {
          color: "#e8e6e0",
          position: [cx + i * 0.4, eaveY + 2.4 + i * 0.85, -1.5 - i * 0.25],
          castShadow: false,
        }),
      );
    }
    return node as Object3D;
  },
};
