import { MAX_BOLT_POINTS } from "./lightningBolt";

/**
 * 闪电画布的 shader（照 Lightning-VFX 攻略）：一块对着镜头的平面，每个像素量到最近
 * 一段折线的距离（SDF），在描边宽度内上色。fBm（10 层 simplex 噪声）把每个像素
 * 横向推一下——大的弯 + 细的颤同时有；`uErode` 把每段的下端往上端收（断裂）、
 * `uWidth` 收细、`uNoiseBoost` 把抖动放大到 3×（抖散），三个一起就是"劈完碎掉"。
 * 颜色 ×5 走 bloom（阈值 1，只有它发光）。
 */

export const LIGHTNING_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const LIGHTNING_FRAGMENT = /* glsl */ `
#define MAX_POINTS ${MAX_BOLT_POINTS}
precision highp float;
uniform vec2 uPoints[MAX_POINTS];
uniform int uCount;
uniform float uOpacity;
uniform float uErode;
uniform float uWidth;
uniform float uNoiseBoost;
uniform float uSeed;
uniform float uPlaneW;
uniform float uPlaneH;
uniform float uStroke;
uniform vec3 uColor;
varying vec2 vUv;

// Ashima 的 2D simplex 噪声（MIT）
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// 10 层叠加：频率 ×3、振幅 ×0.5——大弯和细颤一起有
float fbm(float y, float seed) {
  float sum = 0.0, amp = 1.0, freq = 0.5, norm = 0.0;
  for (int i = 0; i < 10; i++) {
    sum += snoise(vec2(y * freq, seed + float(i) * 17.0)) * amp;
    norm += amp;
    freq *= 3.0;
    amp *= 0.5;
  }
  return sum / norm;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 p = vec2((vUv.x - 0.5) * uPlaneW, vUv.y * uPlaneH);
  p.x += fbm(p.y, uSeed) * 0.45 * uNoiseBoost;
  float dist = 1e9;
  for (int i = 0; i < MAX_POINTS - 1; i++) {
    if (i >= uCount - 1) break;
    vec2 a = uPoints[i];
    vec2 b = uPoints[i + 1];
    dist = min(dist, sdSegment(p, a + (b - a) * uErode, b));
  }
  float width = uStroke * uWidth;
  float stroke = 1.0 - smoothstep(width * 0.5, width, dist);
  float alpha = stroke * uOpacity;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;
