import { Color, MeshStandardMaterial, Object3D } from "three";
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
  doorOffset: 0,
  interiorMapId: "shop-restaurant",
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
      localizationKey: "map.shop_restaurant",
      descriptionKey: "map.shop_restaurant.desc",
      footprint: { width: 11.5, height: 9.5 },
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
      /*
       * 炊烟：**必须是半透明的**。
       *
       * 上一版是四个不透明白球，从街上看还行（背景是天），一升空俯瞰
       * 就露馅——变成一坨压在餐厅屋脊上的白疙瘩，看着像模型穿帮。
       * /overview 拍的第一张小镇全景就是这么被抓到的。
       *
       * 越往上越淡（0.5 → 0.17）也越大：烟本来就是往上散的，这一条
       * 同时解决了另一个毛病——最上面那团离屋顶最远、最容易被当成
       * 独立物件，恰好也是最淡的那个。
       *
       * 每团各一份材质（Color 对象走 ownMaterial 那条）：共享材质是按
       * 颜色缓存的，直接改上面的 opacity 会把全场同色的东西一起改透。
       */
      for (let i = 0; i < 4; i += 1) {
        const puff = blob(0.34 + i * 0.2, 0, {
          color: new Color("#e8e6e0"),
          position: [cx + i * 0.34, eaveY + 2.5 + i * 0.95, -1.5 - i * 0.2],
          castShadow: false,
          receiveShadow: false,
        });
        const material = puff.material as MeshStandardMaterial;
        material.transparent = true;
        material.opacity = 0.5 - i * 0.11;
        // 不写深度：四团互相重叠，写了会切出硬边，烟就成了积木
        material.depthWrite = false;
        node.add(puff);
      }
      return node as Object3D;
    },
    },
  ],
};
