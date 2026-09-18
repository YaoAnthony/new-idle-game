import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from "three";

import { onRainTuning, rainTuning, type RainTuning } from "../Visual/rainTuning";

/**
 * 雨（2026-09-18，照《Cheap, Beautiful Rain in Three.js》）。
 *
 * - **Points + 模糊竖线贴图**：一个点精灵画一条上下渐隐的线，就是雨丝带运动模糊的样子；
 *   贴图是 canvas 画的，不用 shader 里做模糊。
 * - **圆柱雨区跟着镜头**：每颗雨滴只存相对镜头的偏移，中心是 uniform；走到哪儿雨在哪儿，
 *   粒子数不随地图涨。
 * - **回收在 shader 里**：y = mod(y0 − 速度 × 时间, 高度)，CPU 一帧都不碰顶点。
 * - **抬头压 UV**：点精灵不会随视角缩短，镜头越朝上越把贴图横向压扁，看着像雨丝在缩。
 * - 风：整片横漂 + 贴图旋转一个倾角（天气档的 windSlant 乘调参表）。
 *
 * 数字全在 `rainTuning`，`/rainpanel` 现场拖。
 */

const VERTEX = /* glsl */ `
attribute vec3 aOffset;
attribute float aSpeed;
attribute float aScale;
uniform vec3 uCenter;
uniform float uTime;
uniform float uHeight;
uniform float uSize;
uniform float uPixelScale;
uniform float uWindDrift;
uniform float uRadius;
uniform float uNearFade;
uniform float uFarFade;
varying float vFade;
void main() {
  // 竖直回收：落到底就回到顶，永远在落
  float y = mod(aOffset.y - uTime * aSpeed, uHeight);
  // 风：整片横漂，出了圆柱从对面进来
  float x = aOffset.x - uTime * uWindDrift;
  x = mod(x + uRadius, uRadius * 2.0) - uRadius;
  vec3 world = vec3(uCenter.x + x, uCenter.y + y, uCenter.z + aOffset.z);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float dist = -mv.z;
  gl_PointSize = uSize * aScale * uPixelScale / max(dist, 0.1);
  // 太近的一片糊、太远的是噪点，两头淡掉
  vFade = smoothstep(0.0, uNearFade, dist) * (1.0 - smoothstep(uFarFade * 0.6, uFarFade, dist));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uUvSquash;
uniform float uSlant;
varying float vFade;
void main() {
  vec2 uv = gl_PointCoord;
  // 风：把贴图绕中心转一个倾角
  vec2 c = uv - 0.5;
  float s = sin(uSlant), k = cos(uSlant);
  c = vec2(c.x * k - c.y * s, c.x * s + c.y * k);
  uv = c + 0.5;
  // 抬头：横向压扁
  uv.x = 0.5 + (uv.x - 0.5) / max(uUvSquash, 0.05);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  float a = texture2D(uMap, uv).a * uOpacity * vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

/** 一条上下渐隐、左右模糊的竖线（贴图不用带文件） */
function buildStreakTexture(width: number, softness: number): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const half = Math.max(1, (width * size) / 2);
  const blur = half * (0.5 + softness * 3);
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.35, "rgba(255,255,255,1)");
  gradient.addColorStop(0.75, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.filter = `blur(${blur.toFixed(1)}px)`;
  ctx.fillRect(size / 2 - half, 0, half * 2, size);
  ctx.filter = "none";
  // 模糊把峰值摊薄了（中心只剩三成），把 alpha 拉回满：不然雨滴像没画一样
  const image = ctx.getImageData(0, 0, size, size);
  let peak = 1;
  for (let i = 3; i < image.data.length; i += 4) peak = Math.max(peak, image.data[i]);
  const gain = 255 / peak;
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = Math.min(255, image.data[i] * gain);
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class RainField {
  readonly points: Points;
  private geometry: BufferGeometry;
  private readonly material: ShaderMaterial;
  private texture: CanvasTexture;
  private time = 0;
  private windSlant = 0;
  private lookCount = 0;
  private lookOpacity = 1;
  private readonly off: () => void;
  private readonly scratch = new Vector3();

  constructor() {
    this.texture = buildStreakTexture(rainTuning.streakWidth, rainTuning.streakSoftness);
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uMap: { value: this.texture },
        uColor: { value: new Color(rainTuning.color) },
        uOpacity: { value: rainTuning.opacity },
        uCenter: { value: new Vector3() },
        uTime: { value: 0 },
        uHeight: { value: rainTuning.height },
        uSize: { value: rainTuning.size },
        uPixelScale: { value: 300 },
        uUvSquash: { value: 1 },
        uSlant: { value: 0 },
        uWindDrift: { value: 0 },
        uRadius: { value: rainTuning.radius },
        uNearFade: { value: rainTuning.nearFade },
        uFarFade: { value: rainTuning.farFade },
      },
      transparent: true,
      depthWrite: false,
    });
    this.geometry = this.buildGeometry(rainTuning);
    this.points = new Points(this.geometry, this.material);
    this.points.name = "outdoor-rain";
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.applyTuning(rainTuning, false);
    this.off = onRainTuning((tuning, rebuild) => this.applyTuning(tuning, rebuild));
  }

  private buildGeometry(tuning: RainTuning): BufferGeometry {
    const count = tuning.count;
    const offsets = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const scales = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      // 圆盘均匀：半径开根号，不然中间挤成一团
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * tuning.radius;
      offsets[i * 3] = Math.cos(angle) * r;
      offsets[i * 3 + 1] = Math.random() * tuning.height;
      offsets[i * 3 + 2] = Math.sin(angle) * r;
      speeds[i] = tuning.speedMin + Math.random() * (tuning.speedMax - tuning.speedMin);
      scales[i] = 1 + (Math.random() - 0.5) * 2 * tuning.sizeJitter;
    }
    const geometry = new BufferGeometry();
    // Points 也得有 position（three 拿它算包围盒）；真正的位置在 aOffset
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("aOffset", new BufferAttribute(offsets, 3));
    geometry.setAttribute("aSpeed", new BufferAttribute(speeds, 1));
    geometry.setAttribute("aScale", new BufferAttribute(scales, 1));
    return geometry;
  }

  private applyTuning(tuning: RainTuning, rebuild: boolean): void {
    const u = this.material.uniforms;
    u.uColor.value.set(tuning.color);
    u.uHeight.value = tuning.height;
    u.uSize.value = tuning.size;
    u.uRadius.value = tuning.radius;
    u.uNearFade.value = tuning.nearFade;
    u.uFarFade.value = tuning.farFade;
    this.material.blending = tuning.blending === "additive" ? AdditiveBlending : NormalBlending;
    this.material.needsUpdate = true;
    this.texture.dispose();
    this.texture = buildStreakTexture(tuning.streakWidth, tuning.streakSoftness);
    u.uMap.value = this.texture;
    if (rebuild) {
      this.geometry.dispose();
      this.geometry = this.buildGeometry(tuning);
      this.points.geometry = this.geometry;
    }
    this.applyLook(this.lookCount, this.lookOpacity, this.windSlant);
  }

  /** 天气档说下多大：粒子池用几成（0..1）、透明度倍数、风 */
  applyLook(density: number, opacity: number, windSlant: number): void {
    this.lookCount = density;
    this.lookOpacity = opacity;
    this.windSlant = windSlant;
    this.geometry.setDrawRange(0, Math.round(rainTuning.count * Math.min(1, Math.max(0, density))));
    const u = this.material.uniforms;
    u.uOpacity.value = rainTuning.opacity * opacity;
    u.uWindDrift.value = rainTuning.windDrift * windSlant;
    u.uSlant.value = (rainTuning.slantDeg * Math.PI / 180) * windSlant;
  }

  /** 每帧：雨区中心、时间、抬头压扁、像素尺度 */
  update(dt: number, camera: PerspectiveCamera | null, center: { x: number; y: number; z: number }, viewportHeight: number): void {
    this.time += dt;
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uCenter.value.set(center.x, center.y, center.z);
    // 点精灵的像素高 = 世界高 × 像素尺度 / 距离；尺度从视野角推，窗口高了雨滴也跟着大
    if (camera) {
      const fovRad = (camera.fov * Math.PI) / 180;
      u.uPixelScale.value = viewportHeight / (2 * Math.tan(fovRad / 2));
      camera.getWorldDirection(this.scratch);
      const vertical = Math.abs(this.scratch.y);
      u.uUvSquash.value = 1 + (rainTuning.uvSquashMin - 1) * vertical;
    }
  }

  dispose(): void {
    this.off();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.points.removeFromParent();
  }
}
