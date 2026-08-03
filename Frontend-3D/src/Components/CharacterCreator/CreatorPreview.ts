import type { AvatarConfig } from "core";
import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import {
  animateCharacter,
  buildCharacter,
  type CharacterRig,
} from "../../Game3D/World/CharacterView.js";
import { disposeTree } from "../../Game3D/Visual/primitives.js";

/**
 * 捏脸页的 3D 预览台。独立的小场景，不复用 RoomScene——
 * 那边挂着整间屋子、天气、寻路，预览只需要一个角色和两盏灯。
 *
 * 也是全零件的**观察台**：改一个零件 = setAvatar 重建一次骨架，
 * 比进游戏改存档再读档快两个数量级，捏脸系统的视觉验证都在这做。
 */
export class CreatorPreview {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private rig: CharacterRig | null = null;
  private frame = 0;
  private startedAt = performance.now();

  /** 拖拽旋转的当前角度（弧度）。直接作用在角色朝向上，不动相机 */
  private spin = 0;
  private dragging = false;
  private lastX = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // alpha 开着：背景交给页面 CSS（羊皮纸底），场景只画角色
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    /*
     * 取景要给发型留头顶余量：角色本体约 1.4 高，但西兰花头、双丸子
     * 会往上再冒 0.25——按 1.7 框，不然最蓬的发型正好被上边裁掉（实测）。
     */
    this.camera = new PerspectiveCamera(34, 1, 0.1, 10);
    this.camera.position.set(0, 1.0, 3.2);
    this.camera.lookAt(0, 0.78, 0);

    // 灯照抄游戏的配方（半球底光 + 平行主光），预览里挑的颜色进游戏不变味
    this.scene.add(new HemisphereLight("#ffffff", "#d8cbb4", 0.75));
    const sun = new DirectionalLight("#fff4e0", 1.35);
    sun.position.set(1.6, 2.4, 2.2);
    this.scene.add(sun);

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);

    this.resize();
    this.loop();
  }

  /** 换一套外观：整个骨架拆掉重建。零件几何都是轻量图元，重建无感 */
  setAvatar(config: AvatarConfig): void {
    if (this.rig) {
      this.scene.remove(this.rig.root);
      disposeTree(this.rig.root);
    }
    this.rig = buildCharacter(config);
    this.rig.heading.rotation.y = this.spin;
    this.scene.add(this.rig.root);
  }

  resize(): void {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    if (this.rig) disposeTree(this.rig.root);
    this.renderer.dispose();
  }

  private onDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.lastX = event.clientX;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // 捕获失败只影响拖出画布后的跟手，见 Joystick 里同样的处理
    }
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.dragging || !this.rig) return;
    this.spin += (event.clientX - this.lastX) * 0.012;
    this.lastX = event.clientX;
    this.rig.heading.rotation.y = this.spin;
  };

  private onUp = (): void => {
    this.dragging = false;
  };

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.rig) {
      // 待机呼吸借用游戏里的那套动画，站桩也不像蜡像
      animateCharacter(
        this.rig,
        0,
        false,
        (performance.now() - this.startedAt) / 1000,
      );
    }
    this.renderer.render(this.scene, this.camera);
  };
}
