import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  WebGLRenderer,
  type Camera,
  type Scene,
} from "three";
import { createPostFX, type PostFXHandle } from "./PostFX.js";
import {
  effectiveQuality,
  getGraphicsSettings,
  onGraphicsSettings,
  setGraphicsOverrides,
  type GraphicsConfig,
  type GraphicsQualityId,
} from "./graphicsSettings.js";

/**
 * 渲染器生命周期。画质预算按"桌面优先，手机能跑"来设：
 * devicePixelRatio 上限锁 2，只有一盏方向光投阴影。
 *
 * 后处理（Bloom/Vignette/SMAA）在 PostFX.ts 里，低端设备自动 bypass；
 * 色调映射用 ACESFilmic 暖调收高光，开不开后处理都生效，画面基调一致。
 */

/** ACES 曝光：>1 提亮中间调补偿 ACES 的压暗，1.1~1.25 之间微调 */
const TONE_MAPPING_EXPOSURE = 1.15;

/**
 * 画质实验开关（只在地址栏上，不进设置、不进存档）：
 *   ?dpr=1.5   像素比上限
 *   ?fx=0      关掉整条后处理（泛光 / 暗角 / SMAA / MSAA 一起走）
 *   ?msaa=0    只关多重采样（0 / 2 / 4）
 * 用来配合 F3 面板做 A/B：改一个数、刷新、看帧率。
 *
 * 它们现在是**画质配置上的逐项覆盖**（见 graphicsSettings）：档位照选照存，
 * 只是这一次会话里被地址栏压着。这样 F3 面板读到的就是真正生效的那组数。
 */
export function applyQualityOverridesFromUrl(): void {
  const q = new URLSearchParams(window.location.search);
  const patch: Partial<GraphicsConfig> = {};
  const dpr = Number(q.get("dpr"));
  if (dpr > 0) patch.pixelRatio = dpr;
  if (q.has("fx")) patch.postFX = q.get("fx") !== "0";
  const msaa = Number(q.get("msaa"));
  if (q.has("msaa") && Number.isFinite(msaa)) patch.msaa = msaa;
  if (Object.keys(patch).length > 0) setGraphicsOverrides(patch);
}

export type RendererHandle = {
  renderer: WebGLRenderer;
  /** 后处理开关入口：postFX.setEnabled(false) 可整体 bypass */
  postFX: PostFXHandle;
  start: (onFrame: (deltaSeconds: number) => void) => void;
  stop: () => void;
  /**
   * 最近半秒的平均帧率（F3 调试面板读）。
   * 不按单帧算——单帧 delta 抖得厉害，读数会在 58/61 之间乱跳没法看；
   * 半秒一个窗口既跟得上掉帧，数字又站得住。循环没跑时是 0。
   */
  fps: () => number;
  /** 上一帧的 draw call 数和三角形数（three 的 renderer.info，F3 面板读） */
  drawStats: () => { calls: number; triangles: number };
  /** 当前生效的画质（F3 面板显示，方便对照实验） */
  quality: () => {
    id: GraphicsQualityId;
    pixelRatio: number;
    postFX: boolean;
    msaa: number;
    shadows: boolean;
  };
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

export function createRenderer(
  canvasParent: HTMLElement,
  scene: Scene,
  camera: Camera,
): RendererHandle {
  applyQualityOverridesFromUrl();
  let config = getGraphicsSettings();

  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  // 后处理一帧要 render 好几趟，自动重置的话 info 只剩最后那趟的全屏三角形；改成每帧手动清
  renderer.info.autoReset = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.pixelRatio));
  renderer.shadowMap.enabled = config.shadows;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

  canvasParent.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const postFX = createPostFX(renderer, scene, camera, config);

  /**
   * 换档：把一整套参数重新贴到渲染器上。**不重建场景、不重建 composer**——
   * 像素比走 setSize（composer 跟着换 render target 尺寸）、多重采样走 composer
   * 自己的 setter、泛光换混合函数、阴影翻开关。
   *
   * 翻阴影开关必须跟着重编材质：`shadowMap.enabled` 决定的是着色器里有没有
   * 那段采样代码，光改布尔的话已经编好的材质还在按老样子跑（关了不省、开了不亮）。
   */
  const applyConfig = (next: GraphicsConfig) => {
    const shadowsChanged = next.shadows !== renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = next.shadows;
    if (shadowsChanged) {
      renderer.shadowMap.needsUpdate = true;
      scene.traverse((object) => {
        const material = (object as { material?: unknown }).material;
        if (!material) return;
        for (const one of Array.isArray(material) ? material : [material]) {
          (one as { needsUpdate?: boolean }).needsUpdate = true;
        }
      });
    }

    postFX.setEnabled(next.postFX);
    postFX.setMultisampling(next.msaa);
    postFX.setBloom(next.bloom);

    if (next.pixelRatio !== config.pixelRatio) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.pixelRatio));
      const canvas = renderer.domElement;
      const width = canvas.clientWidth || canvas.width;
      const height = canvas.clientHeight || canvas.height;
      renderer.setSize(width, height, false);
      postFX.setSize(width, height);
    }

    config = next;
  };

  const offGraphics = onGraphicsSettings(applyConfig);

  let frameHandle = 0;
  let lastTime = 0;

  const FPS_WINDOW_MS = 500;
  let fps = 0;
  let fpsFrames = 0;
  let fpsWindowStart = 0;

  return {
    renderer,
    postFX,
    fps: () => fps,
    drawStats: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    }),
    quality: () => ({
      id: effectiveQuality(),
      pixelRatio: renderer.getPixelRatio(),
      postFX: postFX.enabled,
      msaa: postFX.stats().msaa,
      shadows: renderer.shadowMap.enabled,
    }),

    start(onFrame) {
      lastTime = performance.now();
      fpsWindowStart = lastTime;
      fpsFrames = 0;

      const loop = (time: number) => {
        frameHandle = requestAnimationFrame(loop);

        const deltaSeconds = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;

        renderer.info.reset();
        fpsFrames += 1;
        const windowMs = time - fpsWindowStart;
        if (windowMs >= FPS_WINDOW_MS) {
          fps = (fpsFrames * 1000) / windowMs;
          fpsFrames = 0;
          fpsWindowStart = time;
        }

        onFrame(deltaSeconds);

        if (postFX.enabled) postFX.render(deltaSeconds);
        else renderer.render(scene, camera);
      };

      frameHandle = requestAnimationFrame(loop);
    },

    stop() {
      if (frameHandle) cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      fps = 0;
    },

    resize(width, height) {
      renderer.setSize(width, height, false);
      postFX.setSize(width, height);
    },

    dispose() {
      if (frameHandle) cancelAnimationFrame(frameHandle);
      offGraphics();
      postFX.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
