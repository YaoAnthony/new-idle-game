import { Locomotion } from "core";
import { Color, DoubleSide, PlaneGeometry, Vector4, type Scene, type ShaderMaterial } from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

import { GLSL_SNOISE_2D } from "../Visual/glslNoise";
import { onPuddleTuning, puddleTuning, type PuddleTuning } from "../Visual/rainTuning";

/**
 * 雨天积水（2026-09-18，照用户给的那条 2D dev log，搬进 3D）：
 *
 * 1. **形状**：地面一张噪波（fBm，按世界 xz 取样），`smoothstep` 在阈值上切出水坑；
 *    阈值随"湿度"从 1（没水）降到 `thresholdWet`（满地水）——下雨慢慢积、雨停慢慢干。
 *    再往里切一层（inner）当深水；边缘叠一层随时间移动的噪波，水坑边会晃。
 * 2. **波纹**：不开 subviewport——一个环形缓冲（最多 48 个）存"哪里、何时、多大"，
 *    shader 里对每个像素算到最近波纹的距离画一圈扩开的亮边，顺便把倒影的采样点往外推一点。
 *    雨随机往水坑里打；人跑动时脚下也发。
 * 3. **倒影**：three 的 Reflector（镜像相机把整个 3D 场景渲到一张 512 的贴图，天穹也在里面，
 *    所以"天空的倒影"是白送的），采样时用噪波轻微扰动；倒影的不透明度按水坑的噪波值给
 *    （坑心最亮、边上淡）。整片地还蒙一层深色，读得出"地湿了"。
 *
 * 数字都在 `puddleTuning`，`/rainpanel` 的第二组滑杆。
 */

const MAX_RIPPLES = 48;
/** 倒影贴图的边长：512 够，这个画风里倒影本来就该有点糊 */
const REFLECTION_SIZE = 512;
/** 脚步波纹的间隔（秒）和大小；雨点波纹更小 */
const FOOT_RIPPLE_EVERY = 0.22;
const FOOT_RIPPLE_RADIUS = 0.9;
const RAIN_RIPPLE_RADIUS = 0.45;
/** 雨点波纹撒在镜头周围多大范围里 */
const RAIN_RIPPLE_SPAN = 14;

const VERTEX = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vRefUv;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vRefUv = textureMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
#define MAX_RIPPLES ${MAX_RIPPLES}
uniform sampler2D tDiffuse;
uniform vec3 color;
uniform float uTime;
uniform float uWet;
uniform float uScale;
uniform float uThreshold;
uniform float uEdgeNoise;
uniform float uReflect;
uniform float uDistort;
uniform float uTint;
uniform float uRippleLife;
uniform vec4 uRipples[MAX_RIPPLES];
uniform int uRippleCount;
varying vec4 vRefUv;
varying vec3 vWorld;
${GLSL_SNOISE_2D}
void main() {
  vec2 p = vWorld.xz * uScale;
  float n = fbm2(p);
  // 边缘：再采一层会动的噪波，加在阈值判断上，水坑边就在晃
  // 边缘那层噪波慢慢漂（0.06/秒）：只是水坑边缘微微呼吸，不是整片在动
  float edge = snoise(p * 4.0 + vec2(uTime * 0.06, -uTime * 0.05)) * uEdgeNoise;
  float mask = smoothstep(uThreshold, uThreshold + 0.05, n + edge);
  float inner = smoothstep(uThreshold + 0.1, uThreshold + 0.22, n);
  float wetFloor = uWet * uTint;
  if (mask < 0.005 && wetFloor < 0.005) discard;

  // 波纹：扩开的一圈亮边 + 把倒影采样往外推
  float ring = 0.0;
  vec2 push = vec2(0.0);
  for (int i = 0; i < MAX_RIPPLES; i++) {
    if (i >= uRippleCount) break;
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > uRippleLife) continue;
    float life = age / uRippleLife;
    float radius = life * r.w;
    vec2 d = vWorld.xz - r.xy;
    float dist = length(d);
    float band = 1.0 - smoothstep(0.0, 0.06 + 0.06 * life, abs(dist - radius));
    float fade = (1.0 - life) * (1.0 - life);
    ring += band * fade;
    push += d / max(dist, 0.001) * band * fade * 0.03;
  }

  // 倒影：投影采样，**固定**的噪波纹理做扰动（不随时间走——会动的扰动看着像一块果冻在地上蠕动，
  // 用户 2026-09-18 点名）；会动的只有波纹
  vec2 wobble = vec2(snoise(p * 3.0), snoise(p * 3.0 + 41.0)) * uDistort;
  vec4 uv = vRefUv;
  uv.xy += (wobble + push) * uv.w;
  vec3 reflection = texture2DProj(tDiffuse, uv).rgb;

  // 水面 = 深色水底 → 倒影（按水坑的噪波值定倒影占多少：坑心满、边上淡）
  float depth = mask * (0.55 + 0.45 * inner);
  vec3 water = mix(color, reflection, uReflect * depth);
  water += ring * mask * 0.35;
  float alpha = max(depth * 0.92, wetFloor);
  vec3 col = mix(color, water, mask);
  gl_FragColor = vec4(col, alpha * uWet);
}
`;

export type PuddleViewer = {
  x: number;
  z: number;
  player?: { x: number; z: number; locomotion: Locomotion };
};

export class PuddleField {
  private readonly reflector: Reflector;
  private readonly material: ShaderMaterial;
  private readonly ripples: Vector4[];
  private rippleHead = 0;
  private time = 0;
  private wet = 0;
  private density = 0;
  private rainAccumulator = 0;
  private footTimer = 0;
  private readonly off: () => void;

  constructor(
    scene: Scene,
    private readonly area: { minX: number; maxX: number; minZ: number; maxZ: number; y: number },
  ) {
    this.ripples = Array.from({ length: MAX_RIPPLES }, () => new Vector4(0, 0, -1e9, 0));
    const geometry = new PlaneGeometry(area.maxX - area.minX, area.maxZ - area.minZ);
    this.reflector = new Reflector(geometry, {
      textureWidth: REFLECTION_SIZE,
      textureHeight: REFLECTION_SIZE,
      clipBias: 0.003,
      color: 0x1f2a33,
      shader: {
        name: "PuddleShader",
        uniforms: {
          color: { value: null },
          tDiffuse: { value: null },
          textureMatrix: { value: null },
          uTime: { value: 0 },
          uWet: { value: 0 },
          uScale: { value: puddleTuning.scale },
          uThreshold: { value: 1 },
          uEdgeNoise: { value: puddleTuning.edgeNoise },
          uReflect: { value: puddleTuning.reflect },
          uDistort: { value: puddleTuning.distort },
          uTint: { value: puddleTuning.tint },
          uRippleLife: { value: puddleTuning.rippleLife },
          uRipples: { value: this.ripples },
          uRippleCount: { value: MAX_RIPPLES },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
      },
    });
    this.reflector.name = "puddles";
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.set((area.minX + area.maxX) / 2, area.y + 0.015, (area.minZ + area.maxZ) / 2);
    this.reflector.visible = false;
    this.reflector.userData.noCollide = true;
    this.reflector.renderOrder = 1;
    this.material = this.reflector.material as ShaderMaterial;
    this.material.transparent = true;
    this.material.depthWrite = false;
    this.material.side = DoubleSide;
    (this.material.uniforms.color.value as Color) = new Color(0x1f2a33);
    scene.add(this.reflector);
    this.off = onPuddleTuning((tuning) => this.applyTuning(tuning));
  }

  private applyTuning(tuning: PuddleTuning): void {
    const u = this.material.uniforms;
    u.uScale.value = tuning.scale;
    u.uEdgeNoise.value = tuning.edgeNoise;
    u.uReflect.value = tuning.reflect;
    u.uDistort.value = tuning.distort;
    u.uTint.value = tuning.tint;
    u.uRippleLife.value = tuning.rippleLife;
  }

  /** 天气档说下多大（0 = 没下）：积水按它慢慢积、慢慢干 */
  setRain(density: number): void {
    this.density = Math.max(0, Math.min(1, density));
  }

  /** 湿度 0..1（用例看） */
  get wetness(): number {
    return this.wet;
  }

  /** 往水面丢一圈波纹（脚步、雨点、以后的落物都走这里） */
  ripple(x: number, z: number, radius: number): void {
    this.ripples[this.rippleHead].set(x, z, this.time, radius);
    this.rippleHead = (this.rippleHead + 1) % MAX_RIPPLES;
  }

  update(dt: number, viewer: PuddleViewer): void {
    this.time += dt;
    const tuning = puddleTuning;
    if (this.density > 0) this.wet = Math.min(1, this.wet + (dt * this.density) / tuning.fillSeconds);
    else this.wet = Math.max(0, this.wet - dt / tuning.drySeconds);

    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uWet.value = this.wet;
    u.uThreshold.value = tuning.thresholdDry + (tuning.thresholdWet - tuning.thresholdDry) * this.wet;
    // 没湿就不画也不渲倒影（Reflector 每帧多渲一遍场景，干天白花）
    this.reflector.visible = this.wet > 0.02;
    if (!this.reflector.visible) return;

    // 雨点波纹：镜头周围随机撒，shader 里只在水坑里显形
    this.rainAccumulator += tuning.rippleRate * this.density * dt;
    while (this.rainAccumulator >= 1) {
      this.rainAccumulator -= 1;
      const x = viewer.x + (Math.random() - 0.5) * RAIN_RIPPLE_SPAN;
      const z = viewer.z + (Math.random() - 0.5) * RAIN_RIPPLE_SPAN;
      if (this.inside(x, z)) this.ripple(x, z, RAIN_RIPPLE_RADIUS * (0.7 + Math.random() * 0.6));
    }
    // 脚步波纹：人在动就隔一小会儿发一圈
    const player = viewer.player;
    if (player && player.locomotion !== Locomotion.Idle && this.inside(player.x, player.z)) {
      this.footTimer += dt;
      if (this.footTimer >= FOOT_RIPPLE_EVERY) {
        this.footTimer = 0;
        this.ripple(player.x, player.z, FOOT_RIPPLE_RADIUS);
      }
    } else {
      this.footTimer = FOOT_RIPPLE_EVERY;
    }
  }

  private inside(x: number, z: number): boolean {
    return x >= this.area.minX && x <= this.area.maxX && z >= this.area.minZ && z <= this.area.maxZ;
  }

  dispose(): void {
    this.off();
    this.reflector.removeFromParent();
    this.reflector.dispose();
    this.reflector.geometry.dispose();
    this.material.dispose();
  }
}
