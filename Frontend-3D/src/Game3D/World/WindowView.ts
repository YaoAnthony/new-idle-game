import { DayPhaseId, WeatherKind } from "core";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
} from "three";
import { PALETTE } from "../Visual/palette.js";
import { box } from "../Visual/primitives.js";
import type { WindowAnchor } from "./RoomBuilder.js";

/**
 * 窗户本体（2026-07-30 大瘦身）。
 *
 * 这里曾经是一个压扁在 0.22 米里的"景深盒"贴画——天空、日月、远山、
 * 树剪影、雨，全塞在窗洞背后。那是屋顶落地之前的产物：当时墙外的东西
 * 会从墙顶上方穿帮，只能贴着墙藏。镜头锁进屋内之后，外面的世界
 * 由 OutdoorScene 真实搭建，贴画整个退役。
 *
 * 现在窗户只负责真正属于窗户的三样东西：
 * 1. **玻璃**：一片极淡的蓝白 + 一道斜高光。存在感要低——玻璃的职责
 *    是"让人知道有玻璃"，不是挡住外面的景。
 * 2. 雨天玻璃内侧的水光淅沥感。
 * 3. 晴天窗边斜射进屋的尘埃微粒（阶段 4 的丁达尔光柱会和它联动）。
 */

/** 尘埃只在"阳光照得进来"的时段可见 */
const DUST_OPACITY: Record<DayPhaseId, number> = {
  [DayPhaseId.Dawn]: 0.26,
  [DayPhaseId.Day]: 0.3,
  [DayPhaseId.Dusk]: 0.26,
  [DayPhaseId.Night]: 0,
};

const DUST_COUNT = 60;
/** 尘埃向屋内延伸的深度（局部 +Z 是屋内方向） */
const DUST_DEPTH = 3.2;

export class WindowView {
  readonly root: Object3D;

  private readonly glassGlow: Mesh;
  private readonly glassGlowMaterial: MeshBasicMaterial;

  private readonly dust: Points;
  private readonly dustVelocities: Float32Array;
  private dustBaseOpacity = 0;
  private readonly dustBox: { x: number; yMin: number; yMax: number };

  private stormWind = false;
  private elapsed = 0;

  private readonly boxWidth: number;

  constructor(anchor: WindowAnchor) {
    this.root = new Object3D();
    this.root.name = `window-view-${anchor.openingId}`;

    const [nx, , nz] = anchor.inward;
    this.root.position.set(anchor.center[0], anchor.center[1], anchor.center[2]);

    // 朝向房间内部，子物体用局部 +Z 表示"屋内方向"
    this.root.lookAt(
      anchor.center[0] + nx,
      anchor.center[1],
      anchor.center[2] + nz,
    );

    this.boxWidth = anchor.width + 0.8;

    this.buildFrame(anchor);

    // ---- 玻璃：极淡的蓝白片 + 一道斜高光 ----
    const glass = new Mesh(
      new PlaneGeometry(anchor.width * 0.98, anchor.height * 0.98),
      new MeshBasicMaterial({
        color: "#dceaf2",
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
    );
    glass.name = "glass";
    glass.rotation.y = Math.PI;
    glass.position.z = 0.015;
    this.root.add(glass);

    const streak = new Mesh(
      new PlaneGeometry(anchor.width * 1.1, anchor.height * 0.1),
      new MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.07,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    streak.name = "glass-streak";
    streak.rotation.y = Math.PI;
    streak.rotation.z = -0.5;
    streak.position.set(-anchor.width * 0.12, anchor.height * 0.14, 0.02);
    this.root.add(streak);

    // ---- 雨天玻璃内侧微光 ----
    this.glassGlowMaterial = new MeshBasicMaterial({
      color: "#aecde8",
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.glassGlow = new Mesh(
      new PlaneGeometry(anchor.width * 0.96, anchor.height * 0.96),
      this.glassGlowMaterial,
    );
    this.glassGlow.position.z = 0.03;
    this.glassGlow.rotation.y = Math.PI;
    this.glassGlow.visible = false;
    this.root.add(this.glassGlow);

    // ---- 室内尘埃（阳光微粒） ----
    this.dustBox = {
      x: this.boxWidth / 2 + 0.9,
      yMin: -anchor.center[1] + 0.15,
      yMax: 1.1,
    };
    const dustBuilt = this.buildDust();
    this.dust = dustBuilt.points;
    this.dustVelocities = dustBuilt.velocities;
    this.root.add(this.dust);
  }

  /**
   * 日式木窗框。参考：京都町屋的落地窗——粗外框把玻璃裁成一幅画，
   * 竖梃分成等宽的几扇，底下一条**深窗台**（缘侧的木沿）。
   * 局部坐标：原点在窗洞中心，+Z 朝屋内。
   *
   * 落地窗（高 ≥2.5 且贴地）和小窗共用外框，差别在里面：
   * 落地窗是两根竖梃 + 深窗台，小窗是十字格。
   */
  private buildFrame(anchor: WindowAnchor): void {
    const w = anchor.width;
    const h = anchor.height;
    const WOOD = PALETTE.woodMid;
    const WOOD_DARK = PALETTE.wallTrim;
    const isFloorWindow = h >= 2.5 && anchor.center[1] - h / 2 < 0.3;

    const frame = new Object3D();
    frame.name = "frame";

    // 外框：上下横梁 + 左右立梃，截面 0.12，骑在墙面上（±Z 各凸一点）
    frame.add(box([w + 0.26, 0.13, 0.16], {
      color: WOOD_DARK,
      position: [0, h / 2 + 0.05, 0],
    }));
    frame.add(box([w + 0.26, 0.13, 0.16], {
      color: WOOD_DARK,
      position: [0, -h / 2 - 0.05, 0],
    }));
    for (const side of [-1, 1]) {
      frame.add(box([0.13, h + 0.26, 0.16], {
        color: WOOD_DARK,
        position: [side * (w / 2 + 0.05), 0, 0],
      }));
    }

    if (isFloorWindow) {
      // 竖梃：分三扇。截面细，玻璃的"画"不能被切碎
      for (const third of [-1, 1]) {
        frame.add(box([0.07, h - 0.05, 0.08], {
          color: WOOD,
          position: [third * (w / 6), 0, 0.02],
        }));
      }
      // 中横档：日式窗常见的低位横木，也是"坐在窗边"的视觉暗示
      frame.add(box([w - 0.06, 0.06, 0.07], {
        color: WOOD,
        position: [0, -h / 2 + 0.85, 0.02],
      }));
      // 深窗台：往屋内探出的木沿，缘侧的那一条
      frame.add(box([w + 0.4, 0.09, 0.5], {
        color: WOOD,
        position: [0, -h / 2 + 0.02, 0.24],
      }));
    } else {
      // 小窗：十字格
      frame.add(box([0.06, h, 0.07], { color: WOOD, position: [0, 0, 0.02] }));
      frame.add(box([w, 0.06, 0.07], { color: WOOD, position: [0, 0, 0.02] }));
      // 小窗台
      frame.add(box([w + 0.3, 0.08, 0.3], {
        color: WOOD,
        position: [0, -h / 2 - 0.1, 0.12],
      }));
    }

    this.root.add(frame);
  }

  private buildDust(): { points: Points; velocities: Float32Array } {
    const positions = new Float32Array(DUST_COUNT * 3);
    const velocities = new Float32Array(DUST_COUNT * 3);
    const { x: xExtent, yMin, yMax } = this.dustBox;

    for (let i = 0; i < DUST_COUNT; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 2 * xExtent;
      positions[i * 3 + 1] = yMin + Math.random() * (yMax - yMin);
      positions[i * 3 + 2] = 0.35 + Math.random() * DUST_DEPTH;

      velocities[i * 3] = (Math.random() - 0.5) * 0.06;
      velocities[i * 3 + 1] = -0.008 - Math.random() * 0.02;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));

    // 无贴图的 Points 是方点，尺寸必须压到"看不出形状"的程度——
    // 远看是光尘，近看不能变成漂浮的白方块
    const material = new PointsMaterial({
      color: "#fff3d0",
      size: 0.032,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });

    const points = new Points(geometry, material);
    points.name = "dust";
    points.visible = false;
    return { points, velocities };
  }

  apply(phase: DayPhaseId, weather: WeatherKind): void {
    const raining = weather === WeatherKind.Rain || weather === WeatherKind.Storm;

    this.glassGlow.visible = raining;
    this.stormWind = weather === WeatherKind.Storm;

    this.dustBaseOpacity =
      weather === WeatherKind.Sunny || weather === WeatherKind.Wind
        ? DUST_OPACITY[phase]
        : 0;
    this.dust.visible = this.dustBaseOpacity > 0;
    (this.dust.material as PointsMaterial).opacity = this.dustBaseOpacity;
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;

    if (this.glassGlow.visible) {
      const flicker =
        Math.sin(this.elapsed * 2.3) * 0.012 +
        Math.sin(this.elapsed * 5.1 + 1.7) * 0.008;
      this.glassGlowMaterial.opacity =
        (this.stormWind ? 0.075 : 0.05) + flicker;
    }

    if (!this.dust.visible) return;

    const attribute = this.dust.geometry.getAttribute("position") as BufferAttribute;
    const array = attribute.array as Float32Array;
    const { x: xExtent, yMin, yMax } = this.dustBox;

    for (let i = 0; i < DUST_COUNT; i += 1) {
      const offset = i * 3;
      array[offset] +=
        this.dustVelocities[offset] * deltaSeconds +
        Math.sin(this.elapsed * 0.6 + i * 1.3) * 0.012 * deltaSeconds;
      array[offset + 1] += this.dustVelocities[offset + 1] * deltaSeconds;
      array[offset + 2] += this.dustVelocities[offset + 2] * deltaSeconds;

      if (array[offset] > xExtent) array[offset] = -xExtent;
      if (array[offset] < -xExtent) array[offset] = xExtent;
      if (array[offset + 1] < yMin) array[offset + 1] = yMax;
      if (array[offset + 2] > 0.35 + DUST_DEPTH) array[offset + 2] = 0.35;
      if (array[offset + 2] < 0.35) array[offset + 2] = 0.35 + DUST_DEPTH;
    }

    attribute.needsUpdate = true;
  }
}
