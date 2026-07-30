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

export type RendererHandle = {
  renderer: WebGLRenderer;
  /** 后处理开关入口：postFX.setEnabled(false) 可整体 bypass */
  postFX: PostFXHandle;
  start: (onFrame: (deltaSeconds: number) => void) => void;
  stop: () => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

export function createRenderer(
  canvasParent: HTMLElement,
  scene: Scene,
  camera: Camera,
): RendererHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

  canvasParent.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const postFX = createPostFX(renderer, scene, camera);

  let frameHandle = 0;
  let lastTime = 0;

  return {
    renderer,
    postFX,

    start(onFrame) {
      lastTime = performance.now();

      const loop = (time: number) => {
        frameHandle = requestAnimationFrame(loop);

        const deltaSeconds = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;

        onFrame(deltaSeconds);

        if (postFX.enabled) postFX.render(deltaSeconds);
        else renderer.render(scene, camera);
      };

      frameHandle = requestAnimationFrame(loop);
    },

    stop() {
      if (frameHandle) cancelAnimationFrame(frameHandle);
      frameHandle = 0;
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
