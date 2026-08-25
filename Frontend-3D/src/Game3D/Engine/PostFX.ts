import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  VignetteEffect,
} from "postprocessing";
import { HalfFloatType, type Camera, type Scene, type WebGLRenderer } from "three";

/**
 * 后处理管线（pmndrs postprocessing）。
 *
 * 目标是动森式的"柔软"画面：高光处轻微泛光（灯具、窗口天光）、
 * 边缘暗角把视线收进屋子中间、SMAA 抹平低多边形斜边的锯齿。
 * 色调映射用 three 自带的 ACESFilmic（在 Renderer.ts 里设置），
 * 这样关掉后处理时画面色调不突变——bypass 路径只是少了泛光和暗角。
 *
 * 手机降级路径：
 * - DPR 仍锁 ≤2（Renderer.ts）
 * - 低端设备（WebGL1 / 少核心触屏机）默认整体 bypass，直接 renderer.render
 * - 运行时可用 handle.setEnabled(false) 一键关闭，无需重建场景
 */

// ---- 调参入口 --------------------------------------------------------------
/** 泛光强度：越大灯光/窗口越"晕"。动森感在 0.4~0.7 之间 */
const BLOOM_INTENSITY = 0.55;
/** 亮度阈值：高于此亮度的像素才泛光。调低会让整个画面发朦 */
const BLOOM_THRESHOLD = 0.72;
/** 阈值过渡的柔和度，避免泛光边缘出现硬切 */
const BLOOM_SMOOTHING = 0.35;
/** 泛光半径（mipmap 模糊的扩散范围） */
const BLOOM_RADIUS = 0.72;
/** 暗角起始偏移（越大暗角越贴边） */
const VIGNETTE_OFFSET = 0.32;
/** 暗角深度（0~1，越大四角越暗） */
const VIGNETTE_DARKNESS = 0.52;
// ---------------------------------------------------------------------------

export type PostFXHandle = {
  /** 为 false 时 Renderer 走直渲染路径 */
  readonly enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  render: (deltaSeconds: number) => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
};

/** 低端设备判定：WebGL1 一票否决；触屏 + 核心数少的机器默认省电 */
function detectLowEnd(renderer: WebGLRenderer): boolean {
  if (!renderer.capabilities.isWebGL2) return true;

  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const fewCores =
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency <= 4;

  return coarsePointer && fewCores;
}

export function createPostFX(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
): PostFXHandle {
  const lowEnd = detectLowEnd(renderer);

  /*
   * **MSAA 必须在 composer 上开**（2026-08-25 用户报"到处是锯齿"）。
   *
   * 这里原来写死 `multisampling: 0`，而 `WebGLRenderer({ antialias: true })`
   * 只管**默认帧缓冲**——一旦走后处理，画面是渲进 composer 自己的
   * render target 的，那个 true 一点作用都没有。也就是说整个游戏其实
   * 一直在**无硬件抗锯齿**下跑，全靠 SMAA 这种形态学 AA 事后描边。
   *
   * SMAA 补不上的正是这个项目最多的东西：低多边形的长斜边、
   * 地形逐格的颜色硬边、远处密林的高频枝干。它按亮度找边，
   * 低对比的接缝直接漏掉，而且完全不管时间上的闪烁。
   *
   * 4× 够用（低多边形没有复杂着色，瓶颈在带宽不在采样），
   * 上限跟着设备走。低端机整条后处理链本来就 bypass，不受影响。
   */
  const composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    multisampling: lowEnd ? 0 : Math.min(4, renderer.capabilities.maxSamples ?? 0),
  });

  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    blendFunction: BlendFunction.SCREEN,
    mipmapBlur: true,
    intensity: BLOOM_INTENSITY,
    luminanceThreshold: BLOOM_THRESHOLD,
    luminanceSmoothing: BLOOM_SMOOTHING,
    radius: BLOOM_RADIUS,
  });

  const vignette = new VignetteEffect({
    offset: VIGNETTE_OFFSET,
    darkness: VIGNETTE_DARKNESS,
  });

  const smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM });

  composer.addPass(new EffectPass(camera, smaa, bloom, vignette));

  let enabled = !lowEnd;

  return {
    get enabled() {
      return enabled;
    },

    setEnabled(value: boolean) {
      enabled = value;
    },

    render(deltaSeconds: number) {
      composer.render(deltaSeconds);
    },

    setSize(width: number, height: number) {
      composer.setSize(width, height, false);
    },

    dispose() {
      composer.dispose();
    },
  };
}
