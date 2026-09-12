import { Object3D } from "three";
import { box, cylinder, group, sphere } from "../primitives.js";

/**
 * 魔女留在桌上的日记本（开场二，2026-09-12）。**照右上角按钮的图 /icons/journal.png 做的**：
 * 绿封面、深绿书脊、奶白书页、封面正中一枚奶白圆牌、牌上一片绿叶。颜色从图上采，
 * 不借色板里最接近的。
 *
 * 平放：封面朝 +Y，书脊在 −X 那一侧，原点在底面中心（台面小物的姿态把原点放到桌面上）。
 * 按 F 飞起来时用的就是这个节点的克隆（JournalFlight），所以比例按"举到镜头前也好看"定：
 * 0.30 × 0.40，厚 0.06。
 */

const COVER = "#81d082";
const COVER_EDGE = "#57a261";
const SPINE = "#48864f";
const PAGE = "#f2e5c8";
const PLATE = "#fef7e2";
const LEAF = "#60b85e";

export const JOURNAL_SIZE = { w: 0.3, t: 0.06, d: 0.4 } as const;

export function buildJournal(): Object3D {
  const { w, t, d } = JOURNAL_SIZE;
  const coverT = 0.008;
  const parts: Object3D[] = [];

  // 书页：比封面各边缩进一点，前口和上下两侧露出奶白
  parts.push(
    box([w - 0.03, t - coverT * 2, d - 0.02], {
      color: PAGE,
      position: [0.012, t / 2, 0],
      castShadow: false,
    }),
  );
  // 上下两片封面
  parts.push(box([w, coverT, d], { color: COVER, position: [0, t - coverT / 2, 0] }));
  parts.push(box([w, coverT, d], { color: COVER_EDGE, position: [0, coverT / 2, 0] }));
  // 书脊：包住 −X 那一侧，稍微鼓出来一点
  parts.push(box([0.03, t, d], { color: SPINE, position: [-w / 2 + 0.008, t / 2, 0] }));
  // 封面上的圆牌（奶白），压在封面上方一丁点
  const plateR = 0.075;
  parts.push(
    cylinder(plateR, plateR, 0.004, 24, {
      color: PLATE,
      position: [0.02, t + 0.002, 0],
      castShadow: false,
    }),
  );
  // 叶子：压扁的椭球斜放 + 一小截叶柄
  parts.push(
    sphere(0.036, 16, 10, {
      color: LEAF,
      position: [0.02, t + 0.006, -0.004],
      scale: [1, 0.12, 0.62],
      rotation: [0, Math.PI / 5, 0],
      castShadow: false,
    }),
  );
  parts.push(
    box([0.006, 0.003, 0.03], {
      color: LEAF,
      position: [0.006, t + 0.006, 0.03],
      rotation: [0, Math.PI / 5, 0],
      castShadow: false,
    }),
  );

  return group("journal", parts);
}
