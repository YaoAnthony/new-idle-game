import { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { box, cylinder } from "../Game3D/Visual/primitives.js";
import { buildTownhouse } from "./shell.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 咖啡厅。**独门记号：门前露台**——两套圆桌椅配遮阳伞。
 * 全街唯一"人会在门外坐下"的一家，气质就靠它。
 */
export const cafe: BuildingDefinition = {
  buildingId: "cafe",
  localizationKey: "map.shop_cafe",
  footprint: { width: 11.5, height: 9.5 },
  doorOffset: 0,
  interiorMapId: "shop-cafe",
  build: () => {
    const house = buildTownhouse({
      sign: "咖啡厅",
      footprint: { width: 11.5, height: 9.5 },
      jetty: 0.4,
      palette: {
        roof: "#a8483c",
        roofDark: "#873a30",
        wall: "#f2e8d4",
        timber: "#6b4a30",
        accent: "#c9a24f",
        board: "#d8c39a",
      },
    });
    const { node, front } = house;

    for (const side of [-1, 1] as const) {
      const tx = side * 3.6;
      const tz = front + 2.4;
      node.add(cylinder(0.1, 0.14, 0.72, 6, { color: PALETTE.ironDark, position: [tx, 0.36, tz] }));
      node.add(cylinder(0.85, 0.85, 0.1, 12, { color: PALETTE.woodLight, position: [tx, 0.76, tz] }));
      for (let k = 0; k < 2; k += 1) {
        const cx = tx + (k ? 1.3 : -1.3);
        node.add(box([0.55, 0.08, 0.55], { color: PALETTE.woodMid, position: [cx, 0.45, tz] }));
        node.add(box([0.55, 0.6, 0.08], { color: PALETTE.woodMid, position: [cx, 0.75, tz + (k ? 0.24 : -0.24)] }));
        for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as const) {
          node.add(box([0.07, 0.45, 0.07], { color: PALETTE.woodDark, position: [cx + lx, 0.22, tz + lz] }));
        }
      }
      // 遮阳伞：杆 + 八边锥 + 一圈深边（不镶边的白锥子像个幽灵）
      node.add(cylinder(0.06, 0.06, 2.5, 6, { color: PALETTE.woodDark, position: [tx, 1.25, tz] }));
      node.add(
        cylinder(0.06, 1.35, 0.55, 8, {
          color: side < 0 ? "#c0392b" : "#c9a24f",
          position: [tx, 2.42, tz],
          castShadow: false,
        }),
      );
      node.add(cylinder(1.38, 1.38, 0.08, 8, { color: PALETTE.woodDark, position: [tx, 2.16, tz], castShadow: false }));
    }
    return node as Object3D;
  },
};
