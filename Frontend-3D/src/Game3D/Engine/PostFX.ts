import {
  BlendFunction,
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  GaussianBlurPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  VignetteEffect,
} from "postprocessing";
import { HalfFloatType, Uniform, type Camera, type Scene, type WebGLRenderer } from "three";

/**
 * 闪电的预兆（照 Lightning-VFX 攻略）：屏幕上一道白色竖带，左、右、中各闪一下、
 * 暗一拍，落地那一瞬整屏白。LightningStorm 每帧喂 `setFlare`。
 */
class LightningFlareEffect extends Effect {
  constructor() {
    super(
      "LightningFlare",
      /* glsl */ `
uniform float uCenterX;
uniform float uBandWidth;
uniform float uFlash;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // 半宽 0 时 smoothstep(0, 0, x) 在 GLSL 里是未定义的（有的卡返回 0 → 整屏都算带内），垫一个极小值
  float halfWidth = max(uBandWidth, 0.0005);
  float band = 1.0 - smoothstep(halfWidth, halfWidth * 3.5, abs(uv.x - uCenterX));
  vec3 flashed = mix(inputColor.rgb, vec3(1.0), uFlash * band);
  outputColor = vec4(flashed, inputColor.a);
}`,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, Uniform>([
          ["uCenterX", new Uniform(0.5)],
          ["uBandWidth", new Uniform(0)],
          ["uFlash", new Uniform(0)],
        ]),
      },
    );
  }

  set(centerX: number, bandWidth: number, flash: number): void {
    this.uniforms.get("uCenterX")!.value = centerX;
    this.uniforms.get("uBandWidth")!.value = bandWidth;
    this.uniforms.get("uFlash")!.value = flash;
  }
}

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
  /**
   * 全屏高斯模糊的强度（0 = 关掉，不多花一趟）。开场"刚睁眼"那段用：
   * 1 左右是眼前一片糊，坐起来的过程里退回 0。低端机 bypass 时没有它。
   */
  setBlur: (scale: number) => void;
  /**
   * 闪电落地时的 bloom：阈值抬到 1（平时 0.72 会把天穹一起晕开）、强度按闪电给的档跳；
   * null = 恢复平时那套（LightningStorm 每帧喂）
   */
  setLightningBloom: (intensity: number | null) => void;
  /** 闪电的预兆竖带（见 LightningFlareEffect） */
  setFlare: (centerX: number, bandWidth: number, flash: number) => void;
  /** 多重采样档位（画质设置里换档时改）。0 = 关；上限跟着设备的 maxSamples */
  setMultisampling: (samples: number) => void;
  /** 泛光开关（链里最贵的一段，低档位关掉） */
  setBloom: (enabled: boolean) => void;
  /** F3 面板对照用：此刻链上生效的数 */
  stats: () => { msaa: number; bloom: boolean };
  setSize: (width: number, height: number) => void;
  dispose: () => void;
};

/**
 * 硬性绕过判定：WebGL1 一票否决（整条链要浮点 render target 和多重采样）；
 * 触屏 + 核心数少的机器同理。这两种机器**画质设置也救不回来**，选了高档也走朴素渲染。
 */
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
  /** 开场生效的那一档（画质设置解出来的；之后换档走 setMultisampling / setBloom） */
  initial: { postFX: boolean; msaa: number; bloom: boolean },
): PostFXHandle {
  /*
   * WebGL1 一票否决：整条链靠浮点 render target 和多重采样，退化路径不值得维护。
   * 这一票**压得过画质设置**——玩家在这种机器上选了"极致"也还是走朴素渲染。
   */
  const forceBypass = detectLowEnd(renderer);
  const maxSamples = renderer.capabilities.maxSamples ?? 0;
  const multisampling = Math.min(initial.msaa, maxSamples);

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
    multisampling,
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

  // 泛光是链里最贵的一段：关掉不重建 pass，把混合函数换成 SKIP（着色器重编一次，
  // 换档才发生，不在每帧的路上）。这样 setLightningBloom 那套参数也原样留着
  if (!initial.bloom) bloom.blendMode.blendFunction = BlendFunction.SKIP;

  const smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM });
  const flare = new LightningFlareEffect();

  composer.addPass(new EffectPass(camera, smaa, bloom, flare, vignette));

  /*
   * 模糊排在最后，**不用时从链上卸掉**而不是 enabled=false：composer 只让链尾
   * 那个 pass 画到屏幕，链尾要是关着的，前面的效果全画进缓冲区、屏幕上定格
   * 在上一帧（开场坐起来后画面卡在糊图上就是这个）。addPass / removePass
   * 会自己把 renderToScreen 交给新的链尾。半分辨率跑两遍够糊了。
   */
  /*
   * postprocessing 6.39 的类型声明是手写的，GaussianBlurPass 那条只写了构造函数、
   * 一个成员都没有——而强度要写在它的模糊材质上。开一个窄口子把这一个字段补出来，
   * 比就地 as any 安全（写错别的字段照样报错）。
   */
  const blur = new GaussianBlurPass({
    kernelSize: 35,
    iterations: 2,
    resolutionScale: 0.5,
  }) as GaussianBlurPass & { blurMaterial: { scale: number } };
  let blurAttached = false;

  let enabled = initial.postFX && !forceBypass;

  return {
    get enabled() {
      return enabled;
    },

    setEnabled(value: boolean) {
      enabled = value && !forceBypass;
    },

    render(deltaSeconds: number) {
      composer.render(deltaSeconds);
    },

    setLightningBloom(intensity: number | null) {
      if (intensity === null) {
        bloom.intensity = BLOOM_INTENSITY;
        bloom.luminanceMaterial.threshold = BLOOM_THRESHOLD;
        return;
      }
      bloom.intensity = intensity;
      bloom.luminanceMaterial.threshold = 1;
    },

    setFlare(centerX: number, bandWidth: number, flash: number) {
      flare.set(centerX, bandWidth, flash);
    },

    setMultisampling(samples: number) {
      // composer 的 setter 自己会换掉 render target（同尺寸、同类型，只改 samples）
      composer.multisampling = Math.min(Math.max(samples, 0), maxSamples);
    },

    setBloom(value: boolean) {
      bloom.blendMode.blendFunction = value ? BlendFunction.SCREEN : BlendFunction.SKIP;
    },

    stats() {
      return {
        msaa: composer.multisampling,
        bloom: bloom.blendMode.blendFunction !== BlendFunction.SKIP,
      };
    },

    setBlur(scale: number) {
      /*
       * 强度写在**材质**的 kernel scale 上。原来写的是 `blur.scale`——
       * GaussianBlurPass 上没有这个属性（类型报错，运行时也只是挂了个没人读的字段），
       * 所以开场那段"刚睁眼"其实一直是固定强度、到 0.01 那一下直接消失，没有渐清。
       * 超过 1 会出采样瑕疵（官方注释写了），调用方给到 1.6，这里封顶。
       */
      blur.blurMaterial.scale = Math.min(Math.max(scale, 0), 1);
      const wanted = scale > 0.01;
      if (wanted && !blurAttached) composer.addPass(blur);
      if (!wanted && blurAttached) composer.removePass(blur);
      blurAttached = wanted;
    },

    setSize(width: number, height: number) {
      composer.setSize(width, height, false);
    },

    dispose() {
      composer.dispose();
    },
  };
}
