import { GLSL_SNOISE_2D } from "./glslNoise";
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

${GLSL_SNOISE_2D}

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
