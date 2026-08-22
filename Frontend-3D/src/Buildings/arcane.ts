import { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, cylinder } from "../Game3D/Visual/primitives.js";
import { makeGlow } from "../Game3D/Visual/recipes/ambience.js";
import { buildTownhouse } from "./shell.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 神秘商店。**独门记号：山墙上一枚发光水晶球 + 一圈悬浮小星**。
 * 全街唯一的紫，夜里那颗球是自发光的，隔一条街也认得出。
 */
export const arcane: BuildingDefinition = {
  buildingId: "arcane",
  localizationKey: "map.shop_arcane",
  doorOffset: 0,
  interiorMapId: "shop-arcane",
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
      localizationKey: "map.shop_arcane",
      descriptionKey: "map.shop_arcane.desc",
      footprint: { width: 11.5, height: 9.5 },
    build: () => {
      const house = buildTownhouse({
        sign: "神秘商店",
        footprint: { width: 11.5, height: 9.5 },
        jetty: 0.5,
        palette: {
          roof: "#7a5fa8",
          roofDark: "#5f4a85",
          wall: "#e8dfee",
          timber: "#5a4670",
          accent: "#b98fe0",
          board: "#cbbde0",
        },
      });
      const { node, eaveY, front, palette } = house;

      node.add(makeGlow(
        blob(0.95, 1, { color: palette.accent, position: [0, eaveY + 1.5, front - 0.1], castShadow: false }),
        palette.accent,
        0.7,
      ));
      node.add(cylinder(1.25, 1.25, 0.16, 10, { color: palette.timber, position: [0, eaveY + 1.5, front - 0.35] }));
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        node.add(
          blob(0.16, 0, {
            color: PALETTE.lampGlow,
            position: [Math.cos(a) * 1.9, eaveY + 1.5 + Math.sin(a) * 1.9, front - 0.1],
            castShadow: false,
          }),
        );
      }
      return node as Object3D;
    },
    },
  ],
};
