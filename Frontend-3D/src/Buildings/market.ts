import { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, box } from "../Game3D/Visual/primitives.js";
import { buildTownhouse } from "./shell.js";
import { addAwning } from "./awning.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 超市。**独门记号：红白条纹雨棚 + 门口三只果蔬箱**——概念图里
 * 最跳的一家，那道条纹隔多远都认得出。
 */
export const market: BuildingDefinition = {
  buildingId: "market",
  localizationKey: "map.shop_market",
  footprint: { width: 11.5, height: 9.5 },
  doorOffset: 0,
  interiorMapId: "shop-market",
  build: () => {
    const house = buildTownhouse({
      sign: "超市",
      footprint: { width: 11.5, height: 9.5 },
      jetty: 0.25,
      palette: {
        roof: "#3f7a5c",
        roofDark: "#31614a",
        wall: "#f2ead6",
        timber: "#6b4a30",
        accent: "#e8e0cc",
        board: "#cfe0cf",
      },
    });
    const { node, front, halfW } = house;
    addAwning(node, 11.5 - 1.6, front, house.palette.accent, true, house.palette.timber);

    // 门口的果蔬箱：木箱码着，里面各一堆彩色球
    const produce = ["#c0392b", "#e8b23c", "#7d9c5b"];
    for (let i = 0; i < 3; i += 1) {
      const bx = halfW - 1.4 - i * 1.5;
      node.add(box([1.25, 0.6, 1.0], { color: PALETTE.woodMid, position: [bx, 0.3, front + 1.5] }));
      for (let k = 0; k < 4; k += 1) {
        node.add(
          blob(0.19, 0, {
            color: produce[i],
            position: [bx - 0.35 + (k % 2) * 0.65, 0.72, front + 1.3 + Math.floor(k / 2) * 0.42],
            castShadow: false,
          }),
        );
      }
    }
    return node as Object3D;
  },
};
