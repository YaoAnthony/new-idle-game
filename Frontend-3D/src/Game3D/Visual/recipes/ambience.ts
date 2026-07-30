import { Color, Mesh, MeshLambertMaterial, Object3D, PointLight } from "three";
import { PALETTE, color } from "../palette.js";
import { blob, box, cylinder, group, sphere } from "../primitives.js";

/**
 * 氛围类家具：壁炉、鱼缸、落地灯。
 * 自发光的暖色面（emissive）让它们本体在夜里亮着；
 * 真室内光时代（镜头锁屋内 + 屋顶挡光）再各嵌一盏名为 lamp-light 的点光，
 * 初始强度 0，由 Lighting 按昼夜阶段点亮（黄昏半亮、入夜全亮）——
 * "点灯能改善夜里的屋子"从此是真的。
 */

/** 灯具内嵌点光。名字是 Lighting 扫描用的约定，别改 */
function lampLight(colorValue: string, x: number, y: number, z: number): PointLight {
  const light = new PointLight(colorValue, 0, 7, 2);
  light.name = "lamp-light";
  light.castShadow = false;
  light.position.set(x, y, z);
  return light;
}

/** 给 mesh 补上自发光。图元工厂造出来的材质是共享缓存，这里必须先克隆 */
function makeGlow(mesh: Mesh, emissive: string, intensity: number): Mesh {
  const material = mesh.material;
  if (!Array.isArray(material)) {
    const owned = material.clone() as typeof material & {
      emissive: Color;
      emissiveIntensity: number;
    };
    owned.emissive = new Color(emissive);
    owned.emissiveIntensity = intensity;
    mesh.material = owned;
  }
  return mesh;
}

/** 壁炉（2×1）：暖灰石身 + 黑洞膛 + 柴火与发光的火苗，顶上一块壁炉架 */
export function buildFireplace(): Object3D {
  const bodyHeight = 1.5;

  const body = box([2, bodyHeight, 0.85], {
    color: PALETTE.stoneWarm,
    position: [0, bodyHeight / 2, -0.05],
  });

  // 壁炉架略微出檐，但控制在 2 格占地内，免得压到隔壁家具
  const mantel = box([2, 0.14, 1], {
    color: PALETTE.woodDark,
    position: [0, bodyHeight + 0.07, 0],
  });

  const chimney = box([1.3, 0.7, 0.7], {
    color: PALETTE.stoneWarmDark,
    position: [0, bodyHeight + 0.49, -0.08],
  });

  // 炉膛：黑色内腔 + 最里面一块暖橙发光背板
  const hearth = box([1.1, 0.85, 0.55], {
    color: PALETTE.hearthDark,
    position: [0, 0.48, 0.12],
  });

  const glowBack = makeGlow(
    box([0.98, 0.72, 0.06], {
      color: PALETTE.emberOrange,
      position: [0, 0.46, 0.1],
      castShadow: false,
    }),
    PALETTE.emberOrange,
    0.9,
  );

  // 两根交叉的柴
  const logs = [-0.16, 0.16].map((offset, index) =>
    cylinder(0.07, 0.07, 0.6, 8, {
      color: PALETTE.woodDark,
      position: [offset, 0.16, 0.28],
      rotation: [0, index === 0 ? 0.5 : -0.5, Math.PI / 2],
    }),
  );

  // 火苗：两团发光的团子，一大一小
  const flameBig = makeGlow(
    blob(0.17, 0, {
      color: PALETTE.emberOrange,
      position: [-0.05, 0.35, 0.26],
      castShadow: false,
    }),
    PALETTE.emberOrange,
    1,
  );
  flameBig.scale.y = 1.5;

  const flameSmall = makeGlow(
    blob(0.1, 0, {
      color: PALETTE.emberYellow,
      position: [0.14, 0.28, 0.3],
      castShadow: false,
    }),
    PALETTE.emberYellow,
    1,
  );
  flameSmall.scale.y = 1.4;

  // 石缝装饰：几块颜色略深的砖
  const bricks = [
    [-0.75, 1.2],
    [0.6, 1.32],
    [-0.5, 0.25],
    [0.78, 0.4],
  ].map(([x, y]) =>
    box([0.3, 0.16, 0.04], {
      color: PALETTE.stoneWarmDark,
      position: [x, y, 0.36],
      castShadow: false,
    }),
  );

  return group("fireplace", [
    body,
    mantel,
    chimney,
    hearth,
    glowBack,
    ...logs,
    flameBig,
    flameSmall,
    ...bricks,
    lampLight(PALETTE.emberOrange, 0, 0.6, 0.5),
  ]);
}

/** 鱼缸（1×1）：矮木柜座 + 半透明水体 + 沙底、水草和两条小橙鱼 */
export function buildFishTank(): Object3D {
  const standHeight = 0.5;

  const stand = box([0.72, standHeight, 0.62], {
    color: PALETTE.woodMid,
    position: [0, standHeight / 2, 0],
  });

  const standTrim = box([0.8, 0.07, 0.7], {
    color: PALETTE.woodDark,
    position: [0, standHeight + 0.035, 0],
  });

  // 水体直接用半透明蓝色块表现，省掉玻璃层。
  // 传 Color 而不是字符串，拿到的是独立材质，改 opacity 不会污染共享缓存。
  const water = box([0.7, 0.5, 0.52], {
    color: color(PALETTE.waterBlue),
    position: [0, standHeight + 0.32, 0],
    castShadow: false,
  });
  const waterMaterial = water.material as MeshLambertMaterial;
  waterMaterial.transparent = true;
  waterMaterial.opacity = 0.45;

  const rim = box([0.76, 0.05, 0.58], {
    color: PALETTE.stoveTop,
    position: [0, standHeight + 0.59, 0],
  });

  const sand = box([0.66, 0.07, 0.48], {
    color: PALETTE.sandPale,
    position: [0, standHeight + 0.11, 0],
    castShadow: false,
  });

  // 水草：两株高矮不一的绿柱
  const weeds = [
    [-0.22, 0.26, 0.1],
    [-0.12, 0.18, -0.09],
  ].map(([x, h, z]) =>
    cylinder(0.025, 0.045, h, 8, {
      color: PALETTE.leafGreen,
      position: [x, standHeight + 0.15 + h / 2, z],
      castShadow: false,
    }),
  );

  // 两条小鱼：椭圆身体 + 三角尾巴
  const fish = [0.06, 0.2].flatMap((x, index) => {
    const y = standHeight + 0.32 + index * 0.11;
    const z = index === 0 ? 0.07 : -0.07;

    const bodyMesh = sphere(0.055, 8, 6, {
      color: PALETTE.fishOrange,
      position: [x, y, z],
      castShadow: false,
    });
    bodyMesh.scale.x = 1.6;

    const tail = box([0.05, 0.07, 0.02], {
      color: PALETTE.fishOrange,
      position: [x + 0.1, y, z],
      rotation: [0, 0, 0.5],
      castShadow: false,
    });
    return [bodyMesh, tail];
  });

  return group("fish-tank", [stand, standTrim, water, rim, sand, ...weeds, ...fish]);
}

/** 落地灯（1×1）：木底座 + 细杆 + 梯形布罩，罩里一颗常亮的暖光球 */
export function buildFloorLamp(): Object3D {
  const base = cylinder(0.2, 0.26, 0.08, 12, {
    color: PALETTE.woodDark,
    position: [0, 0.04, 0],
  });

  const pole = cylinder(0.035, 0.035, 1.45, 8, {
    color: PALETTE.woodMid,
    position: [0, 0.8, 0],
  });

  const bulb = makeGlow(
    sphere(0.11, 10, 8, {
      color: PALETTE.lampGlow,
      position: [0, 1.52, 0],
      castShadow: false,
    }),
    PALETTE.lampGlow,
    0.9,
  );

  const shade = cylinder(0.19, 0.3, 0.36, 12, {
    color: PALETTE.fabricCream,
    position: [0, 1.62, 0],
    castShadow: false,
  });

  const shadeTrim = cylinder(0.31, 0.31, 0.04, 12, {
    color: PALETTE.fabricRose,
    position: [0, 1.44, 0],
    castShadow: false,
  });

  return group("floor-lamp", [
    base,
    pole,
    bulb,
    shade,
    shadeTrim,
    lampLight(PALETTE.lampGlow, 0, 1.5, 0),
  ]);
}
