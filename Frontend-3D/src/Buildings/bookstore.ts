import { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, cylinder } from "../Game3D/Visual/primitives.js";
import { buildTownhouse, panel } from "./shell.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 书店。**独门记号：左侧一座青瓦圆锥顶的角楼**——概念图里最抢眼的
 * 一笔，远远看见那个尖顶就知道是书店。
 */
export const bookstore: BuildingDefinition = {
  buildingId: "bookstore",
  localizationKey: "map.shop_bookstore",
  doorOffset: 0,
  interiorMapId: "shop-bookstore",
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
      localizationKey: "map.shop_bookstore",
      descriptionKey: "map.shop_bookstore.desc",
      footprint: { width: 11.5, height: 9.5 },
    build: () => {
      const house = buildTownhouse({
        sign: "书店",
        footprint: { width: 11.5, height: 9.5 },
        jetty: 0.45,
        palette: {
          roof: "#4a7fa8",
          roofDark: "#39627f",
          wall: "#efe4cc",
          timber: "#6b4a30",
          accent: "#6fb3c9",
          board: "#d8c39a",
        },
      });
      const { node, eaveY, front, halfW } = house;

      // 角楼：塔身 + 圆锥顶 + 尖顶饰 + 两扇窄窗
      const tx = -halfW - 0.3;
      const tz = front - 3.2;
      node.add(cylinder(1.5, 1.6, eaveY + 1.6, 8, { color: house.palette.wall, position: [tx, (eaveY + 1.6) / 2, tz] }));
      node.add(cylinder(0.05, 1.95, 2.6, 8, { color: house.palette.accent, position: [tx, eaveY + 2.9, tz] }));
      node.add(cylinder(0.09, 0.09, 0.7, 6, { color: PALETTE.ironDark, position: [tx, eaveY + 4.4, tz] }));
      node.add(blob(0.24, 0, { color: PALETTE.brass, position: [tx, eaveY + 4.85, tz], castShadow: false }));
      for (const a of [-0.5, 0.25]) {
        node.add(panel(0.5, 1.1, PALETTE.doorGlass, [tx + Math.sin(a) * 1.55, eaveY * 0.6, tz + Math.cos(a) * 1.55]));
      }
      return node as Object3D;
    },
    },
  ],
};
