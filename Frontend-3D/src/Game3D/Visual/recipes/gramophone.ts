import type { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group, sphere } from "../primitives.js";

/**
 * 唱片机（V0.12）：老式号角留声机，照实物照片建的。
 *
 * 它是音乐系统在世界里的实体，也是目前全屋**多边形预算最高**的一件
 * （核心件档位再上浮一档，圆的部分一律 28~32 段）：
 *
 *   - **红橡木柜体**：上下双层线脚 + 四角凹槽壁柱 + 前脸嵌板加黄铜铭牌。
 *     方柜是底座，圆的全在上面——方下圆上的对比就是留声机的剪影。
 *   - **转盘 + 黑胶**：绿呢台面上一张带沟纹的黑胶、红标白圈。
 *     唱片是独立命名节点 `gramophone-record`——播放时旋转，将来换唱片
 *     （抽走旧的、放上新的）也动这一个节点，造型改了动画不用改。
 *   - **鹅颈唱臂**：镍银立柱从柜角起，三段弯管把圆头唱头送到唱片边缘，
 *     唱针真的落在胶面上。
 *   - **大喇叭**：喉部黑漆、口部黄铜的八段喇叭花，内衬单独一层深铜色
 *     （openEnded + doubleSide，从正面能看进喇叭里去）。两道箍环压住
 *     分段感——实物的喇叭就是一瓣瓣拼的。
 *   - **侧面摇把**：`gramophone-crank`，播放时慢转（发条在走）。
 *
 * 尺寸：1×1 格，柜面高 0.43，喇叭口顶到 ~1.25m。前脸朝 +Z。
 */

/** 喇叭的分段半径。指数展开：喉部密、口部张，直线锥看着像纸筒 */
const HORN_SEGMENTS = [
  { r0: 0.024, r1: 0.036, h: 0.07, color: PALETTE.gramHornBlack },
  { r0: 0.036, r1: 0.052, h: 0.07, color: PALETTE.gramHornBlack },
  { r0: 0.052, r1: 0.078, h: 0.075, color: PALETTE.gramHornBlack },
  { r0: 0.078, r1: 0.115, h: 0.075, color: PALETTE.gramBrassDeep },
  { r0: 0.115, r1: 0.165, h: 0.075, color: PALETTE.brass },
  { r0: 0.165, r1: 0.225, h: 0.07, color: PALETTE.brass },
  { r0: 0.225, r1: 0.29, h: 0.065, color: PALETTE.gramBrassBright },
  { r0: 0.29, r1: 0.345, h: 0.055, color: PALETTE.gramBrassBright },
] as const;

export function buildGramophone(): Object3D {
  // ---- 柜体：双层线脚夹一段主柜，照家具做法上宽下宽中间收 ----
  const plinthLow = box([0.62, 0.05, 0.62], {
    color: PALETTE.woodDark,
    position: [0, 0.025, 0],
  });
  const plinthStep = box([0.575, 0.035, 0.575], {
    color: PALETTE.woodMid,
    position: [0, 0.0675, 0],
  });
  const cabinet = box([0.52, 0.255, 0.52], {
    color: PALETTE.gramOak,
    position: [0, 0.2125, 0],
  });
  const topStep = box([0.575, 0.035, 0.575], {
    color: PALETTE.gramOakLight,
    position: [0, 0.3575, 0],
  });
  const topPlate = box([0.62, 0.05, 0.62], {
    color: PALETTE.gramOak,
    position: [0, 0.4, 0],
  });

  // 四角壁柱：柱身 + 一条竖凹槽（浅色细条画在深柱上，就是"凹"的读法）
  const pillars: Object3D[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pillars.push(
        box([0.07, 0.255, 0.07], {
          color: PALETTE.woodDark,
          position: [sx * 0.245, 0.2125, sz * 0.245],
        }),
        box([0.014, 0.21, 0.014], {
          color: PALETTE.gramOakLight,
          position: [sx * 0.278, 0.2125, sz * 0.245],
        }),
      );
    }
  }

  // 前脸：凹进去的装饰嵌板 + 四条框线 + 黄铜铭牌
  const frontPanel = box([0.32, 0.17, 0.02], {
    color: PALETTE.gramOakPanel,
    position: [0, 0.21, 0.255],
  });
  const panelFrame: Object3D[] = [
    box([0.36, 0.018, 0.024], { color: PALETTE.gramOakLight, position: [0, 0.305, 0.255] }),
    box([0.36, 0.018, 0.024], { color: PALETTE.gramOakLight, position: [0, 0.115, 0.255] }),
    box([0.018, 0.2, 0.024], { color: PALETTE.gramOakLight, position: [-0.17, 0.21, 0.255] }),
    box([0.018, 0.2, 0.024], { color: PALETTE.gramOakLight, position: [0.17, 0.21, 0.255] }),
  ];
  const namePlate = box([0.13, 0.045, 0.012], {
    color: PALETTE.brass,
    position: [0, 0.21, 0.268],
  });

  // ---- 摇把（右侧 +X）。播放时慢转：发条在走 ----
  const crankShaft = cylinder(0.014, 0.014, 0.1, 14, {
    color: PALETTE.gramNickel,
    position: [0, 0, 0],
  });
  crankShaft.rotation.z = Math.PI / 2;
  const crankElbow = sphere(0.022, 12, 10, {
    color: PALETTE.gramNickelDark,
    position: [0.05, 0, 0],
  });
  const crankArm = cylinder(0.012, 0.012, 0.09, 12, {
    color: PALETTE.gramNickel,
    position: [0.05, -0.045, 0],
  });
  const crankKnob = cylinder(0.02, 0.02, 0.05, 14, {
    color: PALETTE.woodDark,
    position: [0.05, -0.09, 0],
  });
  crankKnob.rotation.z = Math.PI / 2;
  const crank = group("gramophone-crank", [
    crankShaft,
    crankElbow,
    crankArm,
    crankKnob,
  ]);
  crank.position.set(0.26, 0.2, 0);

  // ---- 转盘：绿呢面 + 镍边，唱片浮在上面 ----
  const platterRim = cylinder(0.225, 0.225, 0.014, 32, {
    color: PALETTE.gramNickel,
    position: [0, 0.432, 0],
  });
  const platterFelt = cylinder(0.212, 0.212, 0.016, 32, {
    color: PALETTE.gramFelt,
    position: [0, 0.442, 0],
  });

  /**
   * 唱片：独立命名节点。**将来换唱片就是换这个组的配色/贴标**，
   * 吐出来的旧唱片、塞进去的新唱片都以它为锚。
   */
  const vinyl = cylinder(0.19, 0.19, 0.01, 32, {
    color: PALETTE.gramVinyl,
    position: [0, 0, 0],
  });
  // 沟纹：三圈比胶面略亮的细环，凸出 1mm——低多边形里"沟"只能靠明度画
  const grooves = [0.168, 0.138, 0.108].map((radius) =>
    cylinder(radius, radius, 0.011, 32, {
      color: PALETTE.gramVinylSheen,
      position: [0, 0.0006, 0],
    }),
  );
  const label = cylinder(0.056, 0.056, 0.012, 24, {
    color: PALETTE.gramLabelRed,
    position: [0, 0.001, 0],
  });
  // 换唱片时标贴换成对应专辑的封面（GramophoneAnimator 按名字找它贴图）
  label.name = "gramophone-record-label";
  const labelRing = cylinder(0.032, 0.032, 0.013, 20, {
    color: PALETTE.gramLabelCream,
    position: [0, 0.0015, 0],
  });
  const spindleHole = cylinder(0.007, 0.007, 0.014, 10, {
    color: PALETTE.gramVinyl,
    position: [0, 0.002, 0],
  });
  const record = group("gramophone-record", [
    vinyl,
    ...grooves,
    label,
    labelRing,
    spindleHole,
  ]);
  record.position.set(0, 0.455, 0);

  const spindle = cylinder(0.007, 0.007, 0.035, 12, {
    color: PALETTE.brass,
    position: [0, 0.47, 0],
  });

  // ---- 唱臂：立柱在左后角，鹅颈弯到唱片边缘，针尖落在胶面上 ----
  const armPost = cylinder(0.02, 0.024, 0.15, 16, {
    color: PALETTE.gramNickel,
    position: [-0.21, 0.5, -0.21],
  });
  const armJoint = sphere(0.03, 14, 12, {
    color: PALETTE.gramNickelDark,
    position: [-0.21, 0.585, -0.21],
  });
  // 两段斜管把唱头从柱顶送到唱片边缘（-0.21,-0.21 → -0.1,-0.1）
  const armUpper = cylinder(0.016, 0.016, 0.13, 12, {
    color: PALETTE.gramNickel,
    position: [-0.165, 0.57, -0.165],
  });
  armUpper.rotation.x = 0.5;
  armUpper.rotation.z = -0.5;
  const armElbow = sphere(0.022, 12, 10, {
    color: PALETTE.gramNickelDark,
    position: [-0.12, 0.545, -0.12],
  });
  const armLower = cylinder(0.014, 0.014, 0.09, 12, {
    color: PALETTE.gramNickel,
    position: [-0.095, 0.52, -0.095],
  });
  armLower.rotation.x = 0.6;
  armLower.rotation.z = -0.6;
  // 唱头：圆盒平躺，针从盒沿斜下去戳在胶面
  const soundBox = cylinder(0.048, 0.048, 0.03, 20, {
    color: PALETTE.gramNickel,
    position: [-0.07, 0.5, -0.07],
  });
  const needle = cylinder(0.004, 0.002, 0.045, 8, {
    color: PALETTE.gramNickelDark,
    position: [-0.055, 0.475, -0.055],
  });
  needle.rotation.x = 0.35;
  needle.rotation.z = -0.35;
  const arm = group("gramophone-arm", [
    armPost,
    armJoint,
    armUpper,
    armElbow,
    armLower,
    soundBox,
    needle,
  ]);

  // ---- 大喇叭：沿本地 +Y 叠八段锥筒，整组向前倾，喇叭口罩在柜子上方 ----
  const hornParts: Object3D[] = [];
  let reach = 0;
  for (const segment of HORN_SEGMENTS) {
    hornParts.push(
      cylinder(segment.r1, segment.r0, segment.h, 32, {
        color: segment.color,
        position: [0, reach + segment.h / 2, 0],
        openEnded: true,
        doubleSide: true,
      }),
    );
    reach += segment.h;
  }
  // 内衬：最后三段再套一层略小的深铜锥，从正面看进去是暗铜色的喉咙
  let liningReach = 0;
  for (const segment of HORN_SEGMENTS.slice(0, 5)) liningReach += segment.h;
  for (const segment of HORN_SEGMENTS.slice(5)) {
    hornParts.push(
      cylinder(segment.r1 - 0.008, segment.r0 - 0.008, segment.h, 32, {
        color: PALETTE.gramBrassDeep,
        position: [0, liningReach + segment.h / 2, 0],
        openEnded: true,
        doubleSide: true,
      }),
    );
    liningReach += segment.h;
  }
  // 口沿翻边 + 两道箍环：实物的喇叭是一瓣瓣拼的，箍环压出那个分段感
  hornParts.push(
    cylinder(0.352, 0.345, 0.02, 32, {
      color: PALETTE.gramBrassDeep,
      position: [0, reach + 0.008, 0],
      openEnded: true,
      doubleSide: true,
    }),
    cylinder(0.117, 0.117, 0.012, 32, {
      color: PALETTE.gramBrassDeep,
      position: [0, 0.295, 0],
      openEnded: true,
      doubleSide: true,
    }),
    cylinder(0.227, 0.227, 0.012, 32, {
      color: PALETTE.gramBrassDeep,
      position: [0, 0.435, 0],
      openEnded: true,
      doubleSide: true,
    }),
  );
  const horn = group("gramophone-horn", hornParts);
  // 起点接在唱臂立柱上方，向 +Z 前倾 32°——喇叭口朝着屋子正面张开
  horn.position.set(-0.21, 0.64, -0.19);
  horn.rotation.x = 0.56;

  // 喉部与唱头之间的过桥弯管（视觉连通：声音从针走到喇叭）
  const throatBridge = cylinder(0.018, 0.022, 0.09, 12, {
    color: PALETTE.gramHornBlack,
    position: [-0.21, 0.615, -0.2],
  });
  throatBridge.rotation.x = 0.3;

  return group("gramophone", [
    plinthLow,
    plinthStep,
    cabinet,
    topStep,
    topPlate,
    ...pillars,
    frontPanel,
    ...panelFrame,
    namePlate,
    crank,
    platterRim,
    platterFelt,
    record,
    spindle,
    arm,
    horn,
    throatBridge,
  ]);
}
