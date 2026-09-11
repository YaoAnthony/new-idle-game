import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  WebGLRenderer,
  type Camera,
  type Scene,
} from "three";
import { createPostFX, type PostFXHandle } from "./PostFX.js";

/**
 * 渲染器生命周期。画质预算按"桌面优先，手机能跑"来设：
 * devicePixelRatio 上限锁 2，只有一盏方向光投阴影。
 *
 * 后处理（Bloom/Vignette/SMAA）在 PostFX.ts 里，低端设备自动 bypass；
 * 色调映射用 ACESFilmic 暖调收高光，开不开后处理都生效，画面基调一致。
 */

/** ACES 曝光：>1 提亮中间调补偿 ACES 的压暗，1.1~1.25 之间微调 */
const TONE_MAPPING_EXPOSURE = 1.15;

/** 像素比上限。Retina 屏 DPR=2 意味着画布像素是窗口的四倍，这是最贵的一档 */
const DEFAULT_MAX_PIXEL_RATIO = 2;

/**
 * 画质实验开关（只在地址栏上，不进设置、不进存档）：
 *   ?dpr=1.5   像素比上限
 *   ?fx=0      关掉整条后处理（泛光 / 暗角 / SMAA / MSAA 一起走）
 *   ?msaa=0    只关多重采样（0 / 2 / 4）
 * 用来配合 F3 面板做 A/B：改一个数、刷新、看帧率。定了再写死进配置。
 */
export function readQualityOverrides(): {
  maxPixelRatio: number;
  postFX: boolean | null;
  msaa: number | null;
} {
  const q = new URLSearchParams(window.location.search);
  const dpr = Number(q.get("dpr"));
  const msaa = q.has("msaa") ? Number(q.get("msaa")) : null;
  return {
    maxPixelRatio: dpr > 0 ? dpr : DEFAULT_MAX_PIXEL_RATIO,
    postFX: q.has("fx") ? q.get("fx") !== "0" : null,
    msaa: msaa !== null && Number.isFinite(msaa) ? msaa : null,
  };
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
  quality: () => { pixelRatio: number; postFX: boolean };
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

export function createRenderer(
  canvasParent: HTMLElement,
  scene: Scene,
  camera: Camera,
): RendererHandle {
  const quality = readQualityOverrides();
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  // 后处理一帧要 render 好几趟，自动重置的话 info 只剩最后那趟的全屏三角形；改成每帧手动清
  renderer.info.autoReset = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

  canvasParent.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const postFX = createPostFX(renderer, scene, camera, quality.msaa);
  if (quality.postFX !== null) postFX.setEnabled(quality.postFX);

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
    quality: () => ({ pixelRatio: renderer.getPixelRatio(), postFX: postFX.enabled }),

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
      postFX.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
