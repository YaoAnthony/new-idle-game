import type { WeatherDefinition } from "core";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type Scene,
} from "three";

import { emit, on } from "../../Game/EventBus";
import { getWeather } from "../../Game/State/weather";
import { groundHeightAt } from "../../Game/State/worldRuntime";
import { buildBolt } from "../Visual/lightningBolt";
import { PALETTE } from "../Visual/palette";
import { weatherVisualProfileOf } from "../Visual/weatherProfiles";

/**
 * 暴风雨的闪电（2026-09-18，用户看了 three-vfx 的雷电 demo 想要的）。
 *
 * 一次打雷 = 三件事一起：**一道折线从天上劈到院子外的某处**（`lightningBolt` 算形状，
 * 这里挤成发光的方棍，走 bloom 就是电光）、**全场闪一下**（`Lighting.flash` 抬环境光、
 * `OutdoorScene.flash` 把天穹雾色往白抬）、**隔几秒才到的雷声**（发 `lightning_struck`
 * 带距离，Soundscape 按 340 m/s 延后放）。以前雷声是 Soundscape 自己掐的表，现在
 * 节拍在这里：闪电先到、雷后到，才像真的。
 *
 * 什么天气打雷、多久一次，在 `weatherProfiles` 的 `lightning` 一栏；这里不认 kind。
 * 不用 three-vfx / WebGPU：我们是 WebGL 管线，一根折线 + bloom 足够这个画风。
 */

export type Flashable = { flash(strength: number): void };

/** 一道闪电活多久（秒）与它的明暗节拍：亮 → 灭一瞬 → 再亮 → 淡出 */
const BOLT_LIFE = 0.45;
const FLICKER: Array<[number, number]> = [
  [0, 1],
  [0.08, 1],
  [0.11, 0.15],
  [0.16, 0.9],
  [0.26, 0.5],
  [BOLT_LIFE, 0],
];
/** 云底的高度：折线从这儿往下劈 */
const CLOUD_Y = 42;
/** 落点离观者多远（米） */
const STRIKE_MIN_M = 16;
const STRIKE_MAX_M = 48;
/** 多近的雷才震一下屋子（全场闪的强度按距离衰减） */
const FLASH_NEAR_M = 14;

type Bolt = { root: Group; materials: MeshBasicMaterial[]; age: number };

export class LightningStorm {
  private readonly root = new Group();
  private readonly bolts: Bolt[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: Array<() => void>;
  private viewer: { x: number; z: number } = { x: 0, z: 0 };

  constructor(
    scene: Scene,
    private readonly lighting: Flashable,
    private readonly sky: Flashable,
    private readonly random: () => number = Math.random,
  ) {
    this.root.name = "lightning";
    scene.add(this.root);
    this.offs = [on("weather_changed", () => this.arm(getWeather()))];
    this.arm(getWeather());
  }

  /** 观者的位置（落点相对它挑）。RoomScene 每帧喂镜头位置 */
  setViewer(x: number, z: number): void {
    this.viewer = { x, z };
  }

  /** 这种天气打不打雷、多久一次 —— 从表现档读 */
  private arm(weather: WeatherDefinition): void {
    const lightning = weatherVisualProfileOf(weather).lightning;
    if (!lightning) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      return;
    }
    if (this.timer) return;
    const schedule = (): void => {
      const delay = lightning.minMs + this.random() * (lightning.maxMs - lightning.minMs);
      this.timer = setTimeout(() => {
        this.timer = null;
        // 期间天气可能已经变了
        if (!weatherVisualProfileOf(getWeather()).lightning) return;
        this.strike();
        schedule();
      }, delay);
    };
    schedule();
  }

  /** 现在就劈一道（定时器到点调；调试指令可以指定落点） */
  strike(at?: { x: number; z: number }): { x: number; z: number; distance: number } {
    const angle = this.random() * Math.PI * 2;
    const rolled = STRIKE_MIN_M + this.random() * (STRIKE_MAX_M - STRIKE_MIN_M);
    const x = at?.x ?? this.viewer.x + Math.cos(angle) * rolled;
    const z = at?.z ?? this.viewer.z + Math.sin(angle) * rolled;
    const distance = Math.hypot(x - this.viewer.x, z - this.viewer.z);
    const ground = groundHeightAt(x, z);
    const branches = buildBolt(
      { x: x + (this.random() - 0.5) * 6, y: CLOUD_Y, z: z + (this.random() - 0.5) * 6 },
      { x, y: ground, z },
      this.random,
    );
    const materials: MeshBasicMaterial[] = [];
    const root = new Group();
    for (const branch of branches) {
      const core = new MeshBasicMaterial({ color: PALETTE.lightningCore, transparent: true });
      const glow = new MeshBasicMaterial({ color: PALETTE.lightningGlow, transparent: true, opacity: 0.35, depthWrite: false });
      materials.push(core, glow);
      for (let i = 0; i < branch.points.length - 1; i += 1) {
        root.add(segment(branch.points[i], branch.points[i + 1], branch.width, core));
        root.add(segment(branch.points[i], branch.points[i + 1], branch.width * 2.6, glow));
      }
    }
    root.traverse((node) => {
      node.userData.noCollide = true;
    });
    this.root.add(root);
    this.bolts.push({ root, materials, age: 0 });

    // 全场闪：近的亮、远的只是天边一闪
    const strength = Math.max(0.25, 1 - Math.max(0, distance - FLASH_NEAR_M) / (STRIKE_MAX_M - FLASH_NEAR_M) * 0.75);
    this.lighting.flash(strength);
    this.sky.flash(strength);
    emit("lightning_struck", { x, z, distance });
    return { x, z, distance };
  }

  update(dt: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = this.bolts[i];
      bolt.age += dt;
      const level = flickerAt(bolt.age);
      if (bolt.age >= BOLT_LIFE) {
        this.dispose1(bolt);
        this.bolts.splice(i, 1);
        continue;
      }
      for (let m = 0; m < bolt.materials.length; m += 1) {
        // 偶数是芯、奇数是晕
        bolt.materials[m].opacity = m % 2 === 0 ? level : level * 0.35;
      }
    }
  }

  private dispose1(bolt: Bolt): void {
    bolt.root.removeFromParent();
    bolt.root.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose();
    });
    for (const material of bolt.materials) material.dispose();
  }

  dispose(): void {
    for (const off of this.offs) off();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const bolt of this.bolts) this.dispose1(bolt);
    this.bolts.length = 0;
    this.root.removeFromParent();
  }
}

function flickerAt(age: number): number {
  for (let i = 0; i < FLICKER.length - 1; i += 1) {
    const [t0, v0] = FLICKER[i];
    const [t1, v1] = FLICKER[i + 1];
    if (age >= t0 && age < t1) return v0 + ((v1 - v0) * (age - t0)) / (t1 - t0);
  }
  return 0;
}

const UP = new Vector3(0, 1, 0);

/** 两点之间一根方棍（对着方向旋转），做闪电的一段 */
function segment(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, width: number, material: MeshBasicMaterial): Object3D {
  const from = new Vector3(a.x, a.y, a.z);
  const to = new Vector3(b.x, b.y, b.z);
  const length = from.distanceTo(to);
  const mesh = new Mesh(new BoxGeometry(width, length + width * 0.6, width), material);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
