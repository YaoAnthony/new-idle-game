import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  NoColorSpace,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderer,
} from "three";
import type { NotePaper, Rect } from "./notePaper";

/**
 * 烧信的 three.js 场景（2026-09-16，用户定：信纸本身也进 three.js）。
 *
 * 一个正交相机、一块铺满画布的平面、一个 shader。纸是 `notePaper` 画出来的贴图；烧的全部效果在
 * **同一遍片元着色器**里、来自**同一个噪声场**，所以溶解边、焦边、烤焦、余烬线、火焰天然对齐——
 * 上一版三层 DOM/画布各画各的，接缝就是"不自然"的来源。
 *
 * 做法是游戏里烧纸的标准路数（burn dissolve）+ THREE.Fire 的噪声火焰降到二维：
 *   edge  = 对角进度（左上 0 → 右下 1）+ 低频噪声扰动   ← 火线不是直线
 *   d     = (edge − 进度) × 对角线像素长度               ← 离火线多少像素，正 = 纸还在
 *   纸    : d < 0 就没了（1px 软边）
 *   焦边  : d 在 0..~26px 压成焦黑，宽度也被噪声扰
 *   烤焦  : d 在 ~10..130px 发黄变褐，带噪声斑
 *   余烬  : d ≈ 1.5px 一条亮橙细线，随噪声闪
 *   火焰  : d < 0（已烧掉那一侧）0..火苗高度内，往上流动的 fbm 减出火舌；火苗高度沿着边缘也被噪声调
 * 火苗**竖直往上长**：对每个像素，找它正下方的火源点，火源在信纸上才有火，火苗本身可以越过纸边
 * （第一版按"像素在不在纸里"裁，火窜到纸的上沿被平平切掉，用户："很明显有一个框限制住了"）。
 *
 * 落款的墨迹是另一张贴图，叠在最上面、不受火：纸整张烧光之后只剩那张鬼脸，`setBoom` 把它淡掉
 * （配合外面的缩放和星星就是 boom）。
 *
 * 输出是预乘 alpha：纸按普通覆盖，火的 rgb 大于 alpha，于是叠在房间上是发光的。
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uInk;
uniform vec2 uRes;        // 画布 CSS 像素
uniform vec4 uContent;    // 信纸（含蜡封）CSS 像素：x, y, w, h（y 向下）
uniform float uProgress;  // 0..1
uniform float uFire;      // 火的总强度（烧完淡掉）
uniform float uHeat;      // 开没开烧：0 读信时（纸一点不焦），开烧后 1 并保持
uniform float uBoom;      // 0..1 落款淡出
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.07 + 13.1; a *= 0.5; }
  return v;
}

vec3 fireRamp(float t) {
  vec3 c = mix(vec3(0.38, 0.04, 0.01), vec3(0.93, 0.33, 0.05), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(1.0, 0.66, 0.16), smoothstep(0.30, 0.66, t));
  c = mix(c, vec3(1.0, 0.94, 0.74), smoothstep(0.62, 1.0, t));
  return c;
}

float boxMask(vec2 px, vec4 r, float soft) {
  vec2 a = smoothstep(r.xy - soft, r.xy, px);
  vec2 b = 1.0 - smoothstep(r.xy + r.zw, r.xy + r.zw + soft, px);
  return a.x * a.y * b.x * b.y;
}

void main() {
  // 屏幕像素坐标，y 向下（和 DOM / 贴图一致）
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec4 tex = texture2D(uTex, vUv);

  vec2 n = (px - uContent.xy) / uContent.zw;              // 信纸内 0..1
  float diag = (n.x + n.y) * 0.5;                          // 左上 0 → 右下 1
  float pxPerDiag = (uContent.z + uContent.w) * 0.5;
  // 火线：低频噪声把它扭歪，再叠一点中频让边缘碎
  float wobble = (fbm(px * 0.006) - 0.5) * 0.16 + (fbm(px * 0.03 + 7.0) - 0.5) * 0.035;
  float q = -0.12 + uProgress * 1.26;                      // 0 时一点没烧，1 时烧过右下角
  float d = (diag + wobble - q) * pxPerDiag;

  // ---- 纸 ----
  float paperA = smoothstep(-0.8, 1.2, d);
  vec3 col = tex.rgb;
  float charW = 22.0 + (fbm(px * 0.05 + 3.0) - 0.5) * 18.0;
  float scorch = 1.0 - smoothstep(8.0, 135.0, d);
  float spots = smoothstep(0.55, 0.78, fbm(px * 0.035 + 11.0)) * (1.0 - smoothstep(20.0, 110.0, d));
  scorch *= uHeat;
  spots *= uHeat;
  col = mix(col, vec3(0.80, 0.63, 0.40), scorch * 0.55);
  col = mix(col, vec3(0.45, 0.25, 0.09), max(scorch * scorch * 0.75, spots * 0.45));
  float charK = (1.0 - smoothstep(0.0, charW, d)) * uHeat;
  col = mix(col, vec3(0.05, 0.02, 0.01), charK * 0.96);
  float a = tex.a * paperA;

  vec3 rgb = col * a;
  float outA = a;

  // ---- 余烬线：纸这一侧、贴着火线 ----
  float flick = 0.6 + 0.8 * fbm(vec2(px.x * 0.08, uTime * 3.0));
  float ember = exp(-pow((d - 1.6) / 2.4, 2.0)) * flick * tex.a;
  rgb += vec3(1.0, 0.55, 0.12) * ember * 1.3 * uFire;

  // ---- 火焰：已烧掉那一侧，火苗竖直往上长 ----
  // d 沿对角线计；往下挪 dy 像素，d 变化 dy·(w+h)/(4h)。反过来：离火线 −d 的像素，正下方 v 像素处就是火源
  float burned = -d;
  float v = burned * 4.0 * uContent.w / (uContent.z + uContent.w);
  vec2 src = px + vec2(0.0, v);
  // 火源得在纸上；软边要宽、还要被噪声啃一下——硬边会在火线碰到纸边的地方切出一条竖线
  float srcIn = boxMask(src, uContent, 22.0);
  srcIn = smoothstep(0.0, 1.0, srcIn * 1.5 - fbm(src * 0.05 + uTime) * 0.5);
  float tongue = fbm(vec2(px.x * 0.009 - uTime * 0.45, 4.7));
  float flameH = 64.0 * (0.3 + 1.05 * tongue);
  float u = clamp(v / flameH, 0.0, 1.0);
  float nz = fbm(vec2(px.x * 0.045, (px.y + uTime * 150.0) * 0.04));
  float along = 0.7 + 0.4 * fbm(vec2(px.x * 0.02 + uTime * 0.7, 2.5));
  float inten = (1.0 - u) * 1.15 * along - nz * (0.72 + 0.7 * u);
  if (v < 5.0) inten = max(inten, 0.62 - nz * 0.45);
  // 顶上那截渐隐，火舌尖是散掉的，不是被一条线截断的
  inten *= 1.0 - smoothstep(0.75, 1.0, u);
  inten *= step(-4.0, v) * step(v, flameH) * srcIn * uFire;
  inten = clamp(inten, 0.0, 1.0);
  if (inten > 0.03) {
    vec3 fc = fireRamp(inten);
    rgb += fc * inten * 1.25;
    outA = max(outA, inten * 0.55);
  }

  // ---- 余光：火线附近一层很淡的暖光，只往纸外漫一点 ----
  float near = boxMask(px, uContent + vec4(-40.0, -80.0, 80.0, 120.0), 40.0);
  float glow = exp(-abs(d) / 30.0) * near * uFire * 0.28;
  rgb += vec3(1.0, 0.45, 0.10) * glow;

  // ---- 落款墨迹：最上面，不受火，boom 时淡掉 ----
  vec4 ink = texture2D(uInk, vUv);
  float inkA = ink.a * (1.0 - uBoom);
  rgb = ink.rgb * inkA + rgb * (1.0 - inkA);
  outA = inkA + outA * (1.0 - inkA);

  gl_FragColor = vec4(rgb, clamp(outA, 0.0, 1.0));
}
`;

const toVec4 = (r: Rect): Vector4 => new Vector4(r.x, r.y, r.w, r.h);

export class NoteBurnScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly texture: CanvasTexture;
  private readonly inkTexture: CanvasTexture;
  private readonly material: ShaderMaterial;
  private readonly mesh: Mesh;

  constructor(canvas: HTMLCanvasElement, paper: NotePaper) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(paper.width, paper.height, false);
    this.renderer.setClearColor(0x000000, 0);

    this.texture = new CanvasTexture(paper.canvas);
    // 不做色彩空间转换：贴图和火的颜色都按 sRGB 原值写，原样输出（shader 没接 colorspace 那段）
    this.texture.colorSpace = NoColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.inkTexture = new CanvasTexture(paper.ink);
    this.inkTexture.colorSpace = NoColorSpace;
    this.inkTexture.minFilter = LinearFilter;
    this.inkTexture.magFilter = LinearFilter;
    this.inkTexture.generateMipmaps = false;

    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      premultipliedAlpha: true,
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uTex: { value: this.texture },
        uInk: { value: this.inkTexture },
        uRes: { value: new Vector2(paper.width, paper.height) },
        uContent: { value: toVec4(paper.content) },
        uProgress: { value: 0 },
        uFire: { value: 0 },
        uHeat: { value: 0 },
        uBoom: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.scene.add(this.mesh);
  }

  /** 落款又多画了一笔 */
  refreshInk(): void {
    this.inkTexture.needsUpdate = true;
  }

  setProgress(q: number): void {
    this.material.uniforms.uProgress.value = q;
  }

  setFire(k: number): void {
    this.material.uniforms.uFire.value = k;
  }

  setHeat(k: number): void {
    this.material.uniforms.uHeat.value = k;
  }

  setBoom(k: number): void {
    this.material.uniforms.uBoom.value = k;
  }

  render(nowSeconds: number): void {
    this.material.uniforms.uTime.value = nowSeconds;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.inkTexture.dispose();
    this.renderer.dispose();
  }
}
