import type { WeatherDefinition } from "core";
import {
  Color,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  Vector2,
  type PerspectiveCamera,
  type Scene,
} from "three";

import { emit, on } from "../../Game/EventBus";
import { getWeather } from "../../Game/State/weather";
import { groundHeightAt } from "../../Game/State/worldRuntime";
import { MAX_BOLT_POINTS, randomWalkBolt } from "../Visual/lightningBolt";
import { LIGHTNING_FRAGMENT, LIGHTNING_VERTEX } from "../Visual/lightningShader";
import { PALETTE } from "../Visual/palette";
import { weatherVisualProfileOf } from "../Visual/weatherProfiles";

/**
 * 暴风雨的闪电（2026-09-18，照 Lightning-VFX 那份攻略搬进我们的 WebGL 管线）。
 *
 * 一次打雷的时间线（秒，从 `strike()` 起）：
 *   0 ～ 0.6   **预兆**：屏幕上一道白色竖带左、右、中各闪一下、暗一拍——镜头上的耀斑
 *   0.6        **落地**：一块对着镜头的画布立在落点，shader 把随机游走的折线描出来（颜色 ×5，
 *              bloom 阈值临时抬到 1，只有它发光）；落点上方 1.5 m 亮一盏点光；全场闪
 *              （`Lighting.flash` / `OutdoorScene.flash`）；镜头震；发 `lightning_struck`（雷声按距离延后）
 *   0.6 ～ 0.8 **放电**：bloom 和点光按 [40, 10, 30, 5] 每 50 ms 跳一档
 *   0.8 ～     **死掉**：不透明度往 0 衰（0.6 s 内衰到 2%）；每段的下端往上端收、描边收细、
 *              抖动放到 3×——不是整体变暗，是碎掉；天光切到 0 再用 1.2 s 回来（眼睛重新适应）
 *
 * 什么天气打雷、多久一道，在 `weatherProfiles.lightning`；这里不认 kind。
 */

export type Flashable = { flash(strength: number): void; cutSky?(): void };
export type LightningFx = {
  /** 落地那一拍起 bloom 的强度（阈值同时抬到 1）；null = 恢复平时 */
  setLightningBloom(intensity: number | null): void;
  /** 预兆的耀斑竖带：中心 x（0..1）、半宽、亮度 */
  setFlare(centerX: number, bandWidth: number, flash: number): void;
};

// ---- 节拍（秒）----
const FLARE_SECONDS = 0.6;
/** 预兆的竖带：[起, 止, 中心 x, 半宽, 亮度] */
const FLARE_STEPS: Array<[number, number, number, number, number]> = [
  [0, 0.12, 0.25, 0.05, 0.55],
  [0.12, 0.24, 0.75, 0.05, 0.55],
  [0.24, 0.36, 0.5, 0.06, 0.6],
  [0.36, 0.5, 0.5, 0, 0],
  [0.5, FLARE_SECONDS, 0.5, 0, 0],
];
/** 落地那一瞬整屏白一下 */
const LAND_FLASH_SECONDS = 0.06;
/** 放电的闪烁：bloom 强度按档跳，每档 50 ms */
/*
 * 攻略里是 [40, 10, 30, 5]，那是它自己那套 bloom（半径小、阈值 1）的数。我们的 bloom
 * 半径 0.72、mipmap 模糊，40 会把一根 0.12 米的折线糊成一米多宽的光柱——按我们的
 * 管线缩到十分之一左右，形状才看得出是锯齿。
 */
const FLICKER = [6, 1.5, 4.5, 1];
const FLICKER_STEP = 0.05;
const HOLD = FLICKER.length * FLICKER_STEP;
/** e^(−λt) = 0.02 ⇒ λ = ln(50) / t：0.6 秒内衰到 2% */
const FADE_LAMBDA = Math.log(50) / 0.6;
const BLOOM_RETURN_LAMBDA = Math.log(50) / 0.5;
/** 落地时抖一下镜头，半秒内平掉 */
const SHAKE_DECAY_PER_S = 2;
const SHAKE_AMP = 0.02;

// ---- 画布 ----
const CLOUD_Y = 42;
const PLANE_W = 24;
const STROKE_M = 0.12;
/** 落点离观者多远（米） */
const STRIKE_MIN_M = 16;
const STRIKE_MAX_M = 48;
const FLASH_NEAR_M = 14;

type Strike = {
  age: number;
  x: number;
  z: number;
  ground: number;
  distance: number;
  landed: boolean;
  skyCut: boolean;
  mesh: Mesh | null;
  material: ShaderMaterial | null;
  light: PointLight | null;
  bloom: number;
};

export class LightningStorm {
  private readonly root = new Group();
  private readonly strikes: Strike[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: Array<() => void>;
  private viewer: { x: number; z: number } = { x: 0, z: 0 };
  private trauma = 0;
  private shakePhase = 0;

  constructor(
    scene: Scene,
    private readonly lighting: Flashable,
    private readonly sky: Flashable,
    private readonly fx: LightningFx,
    private readonly random: () => number = Math.random,
  ) {
    this.root.name = "lightning";
    scene.add(this.root);
    this.offs = [on("weather_changed", () => this.arm(getWeather()))];
    this.arm(getWeather());
  }

  /** 观者的位置（落点相对它挑、画布对着它）。RoomScene 每帧喂镜头位置 */
  setViewer(x: number, z: number): void {
    this.viewer = { x, z };
  }

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
        if (!weatherVisualProfileOf(getWeather()).lightning) return;
        this.strike();
        schedule();
      }, delay);
    };
    schedule();
  }

  /** 排一道：先 0.6 秒预兆，再落地。返回落点（定时器到点调；调试指令可以指定落点） */
  strike(at?: { x: number; z: number }): { x: number; z: number; distance: number } {
    const angle = this.random() * Math.PI * 2;
    const rolled = STRIKE_MIN_M + this.random() * (STRIKE_MAX_M - STRIKE_MIN_M);
    const x = at?.x ?? this.viewer.x + Math.cos(angle) * rolled;
    const z = at?.z ?? this.viewer.z + Math.sin(angle) * rolled;
    const distance = Math.hypot(x - this.viewer.x, z - this.viewer.z);
    this.strikes.push({
      age: 0, x, z, ground: groundHeightAt(x, z), distance,
      landed: false, skyCut: false, mesh: null, material: null, light: null, bloom: 1,
    });
    return { x, z, distance };
  }

  update(dt: number): void {
    let flare: [number, number, number] | null = null;
    let bloom: number | null = null;
    for (let i = this.strikes.length - 1; i >= 0; i -= 1) {
      const s = this.strikes[i];
      s.age += dt;
      if (!s.landed) {
        if (s.age < FLARE_SECONDS) {
          const step = FLARE_STEPS.find(([from, to]) => s.age >= from && s.age < to);
          if (step && step[4] > 0) flare = [step[2], step[3], step[4]];
          continue;
        }
        this.land(s);
      }
      const t = s.age - FLARE_SECONDS;
      const material = s.material!;
      if (t < LAND_FLASH_SECONDS) flare = [0.5, 1, 0.7];
      if (t < HOLD) {
        // 放电：bloom 和点光一起跳档；淡出等着
        s.bloom = FLICKER[Math.min(FLICKER.length - 1, Math.floor(t / FLICKER_STEP))];
        if (s.light) s.light.intensity = s.bloom * 1.5;
      } else {
        if (!s.skyCut) {
          s.skyCut = true;
          this.lighting.cutSky?.();
        }
        const u = material.uniforms;
        u.uOpacity.value = MathUtils.damp(u.uOpacity.value, 0, FADE_LAMBDA, dt);
        u.uErode.value = MathUtils.damp(u.uErode.value, 0.8, FADE_LAMBDA, dt);
        u.uWidth.value = MathUtils.damp(u.uWidth.value, 0, FADE_LAMBDA, dt);
        u.uNoiseBoost.value = MathUtils.damp(u.uNoiseBoost.value, 3, FADE_LAMBDA, dt);
        s.bloom = MathUtils.damp(s.bloom, 1, BLOOM_RETURN_LAMBDA, dt);
        if (s.light) s.light.intensity = MathUtils.damp(s.light.intensity, 0, FADE_LAMBDA, dt);
        if (u.uOpacity.value < 0.02 && s.bloom < 1.05) {
          this.dispose1(s);
          this.strikes.splice(i, 1);
          continue;
        }
      }
      bloom = Math.max(bloom ?? 1, s.bloom);
      // 画布永远对着镜头
      if (s.mesh) s.mesh.rotation.y = Math.atan2(this.viewer.x - s.x, this.viewer.z - s.z);
    }
    this.fx.setFlare(flare ? flare[0] : 0.5, flare ? flare[1] : 0, flare ? flare[2] : 0);
    this.fx.setLightningBloom(bloom);
    this.trauma = Math.max(0, this.trauma - dt * SHAKE_DECAY_PER_S);
    this.shakePhase += dt * 30;
  }

  /** 落地：立画布、亮点光、全场闪、镜头震、发事件 */
  private land(s: Strike): void {
    s.landed = true;
    const height = CLOUD_Y - s.ground;
    const points = randomWalkBolt(height, this.random, { halfWidth: PLANE_W / 2 });
    const uPoints = Array.from({ length: MAX_BOLT_POINTS }, (_, i) =>
      new Vector2(points[i]?.x ?? 0, points[i]?.y ?? 0),
    );
    const material = new ShaderMaterial({
      vertexShader: LIGHTNING_VERTEX,
      fragmentShader: LIGHTNING_FRAGMENT,
      uniforms: {
        uPoints: { value: uPoints },
        uCount: { value: points.length },
        uOpacity: { value: 1 },
        uErode: { value: 0 },
        uWidth: { value: 1 },
        uNoiseBoost: { value: 1 },
        uSeed: { value: this.random() * 100 },
        uPlaneW: { value: PLANE_W },
        uPlaneH: { value: height },
        uStroke: { value: STROKE_M },
        uColor: { value: new Color(PALETTE.lightningCore).multiplyScalar(5) },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(new PlaneGeometry(PLANE_W, height), material);
    mesh.position.set(s.x, s.ground + height / 2, s.z);
    mesh.rotation.y = Math.atan2(this.viewer.x - s.x, this.viewer.z - s.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.noCollide = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);

    const light = new PointLight(PALETTE.lightningGlow, 0, 40, 2);
    light.name = "lightning-light";
    light.position.set(s.x, s.ground + 1.5, s.z);
    this.root.add(light);

    s.mesh = mesh;
    s.material = material;
    s.light = light;

    const strength = Math.max(0.25, 1 - (Math.max(0, s.distance - FLASH_NEAR_M) / (STRIKE_MAX_M - FLASH_NEAR_M)) * 0.75);
    this.lighting.flash(strength);
    this.sky.flash(strength);
    this.trauma = Math.max(this.trauma, strength);
    emit("lightning_struck", { x: s.x, z: s.z, distance: s.distance });
  }

  /** 镜头抖动：在 CameraRig 摆好镜头之后叠上去，下一帧 rig 又会重摆，不会累积 */
  applyShake(camera: PerspectiveCamera): void {
    if (this.trauma <= 0) return;
    const amp = this.trauma * this.trauma * SHAKE_AMP;
    const angle = this.shakePhase;
    camera.rotation.x += Math.sin(angle) * amp;
    camera.rotation.y += Math.sin(angle * 1.618 + 1.7) * amp;
    camera.rotation.z += Math.sin(angle * 0.882 + 3.9) * amp * 0.5;
  }

  /** 场上还有几道（用例看） */
  get active(): number {
    return this.strikes.length;
  }

  private dispose1(s: Strike): void {
    s.mesh?.removeFromParent();
    s.mesh?.geometry.dispose();
    s.material?.dispose();
    s.light?.removeFromParent();
    s.light?.dispose();
  }

  dispose(): void {
    for (const off of this.offs) off();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const s of this.strikes) this.dispose1(s);
    this.strikes.length = 0;
    this.fx.setLightningBloom(null);
    this.fx.setFlare(0.5, 0, 0);
    this.root.removeFromParent();
  }
}
