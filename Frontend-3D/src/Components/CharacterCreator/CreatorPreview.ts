import type { AvatarConfig } from "core";
import {
  DirectionalLight,
  HemisphereLight,
  MathUtils,
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
 *
 * 镜头是一台**轨道相机**（绕着角色转，不是转角色）。第一版是拖动直接
 * 改角色的 heading，只能左右转——那等于让玩家转模特而不是自己走动，
 * 想看头顶的发型或者鞋子只能干瞪眼。现在拖动同时改方位和俯仰、滚轮
 * 和双指改距离，手感常量照抄游戏的 CameraRig，两处调镜头是同一套肌肉记忆。
 */

/**
 * 俯仰角上下限（度）。**不做全自由**：往下过头会从脚底板往上看、
 * 往上过头会变成头顶俯视图，两种角度都只能看到穿帮，不能用来捏脸。
 * -28 大约是"蹲下来平视"，+52 能看清整个头顶的发型走向，够用。
 */
const MIN_PITCH = -28;
const MAX_PITCH = 52;

/** 拖拽灵敏度（每像素多少度）。和 CameraRig 同值，两处手感一致 */
const DRAG_YAW_PER_PIXEL = 0.32;
const DRAG_PITCH_PER_PIXEL = 0.22;

/**
 * 距离上下限。近端 1.15 刚好怼到脸能数清睫毛高光，
 * 再近相机会穿进头里；远端 4.6 全身带一圈余量，再远角色就成一粒了。
 */
const MIN_DISTANCE = 1.15;
const MAX_DISTANCE = 4.6;
const DEFAULT_DISTANCE = 3.2;

/** 滚轮一格的距离增量。乘 0.0016 是把 deltaY（约 ±100）压到舒服的步长 */
const WHEEL_TO_DISTANCE = 0.0016;

/**
 * 视线焦点的高度：随距离在**腰**和**脸**之间插值。
 *
 * 拉近了自动聚焦到脸，是捏脸界面该有的行为——固定看腰的话，
 * 推近到 1.15 时脸整个跑出画面上边，玩家还得手动往下拖找回来。
 * 动森的捏脸镜头就是推近即怼脸。
 */
const TARGET_Y_NEAR = 1.24;
const TARGET_Y_FAR = 0.78;

export class CreatorPreview {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private rig: CharacterRig | null = null;
  private frame = 0;
  private startedAt = performance.now();

  /* 轨道相机的状态。desired* 是目标值，无后缀的是平滑后的当前值 */
  private yaw = 0;
  private desiredYaw = 0;
  private pitch = 8;
  private desiredPitch = 8;
  private distance = DEFAULT_DISTANCE;
  private desiredDistance = DEFAULT_DISTANCE;
  private lastFrameAt = performance.now();

  /** 正在拖的指针。多指时只认第一根，另一根交给捏合 */
  private dragPointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  /** 捏合缩放：同时按下的指针位置，两根时算距离变化 */
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // alpha 开着：背景交给页面 CSS（羊皮纸底），场景只画角色
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new PerspectiveCamera(34, 1, 0.1, 20);

    // 灯照抄游戏的配方（半球底光 + 平行主光），预览里挑的颜色进游戏不变味
    this.scene.add(new HemisphereLight("#ffffff", "#d8cbb4", 0.75));
    const sun = new DirectionalLight("#fff4e0", 1.35);
    sun.position.set(1.6, 2.4, 2.2);
    this.scene.add(sun);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    // passive: false —— 要 preventDefault 掉页面滚动，滚轮在这儿是缩放
    canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.applyCamera();
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
    this.scene.add(this.rig.root);
  }

  /** 回到初始机位。换零件换到迷路了，一键找回来 */
  resetView(): void {
    this.desiredYaw = 0;
    this.desiredPitch = 8;
    this.desiredDistance = DEFAULT_DISTANCE;
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
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    if (this.rig) disposeTree(this.rig.root);
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- 输入

  private onPointerDown = (event: PointerEvent): void => {
    this.activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (this.activePointers.size === 2) {
      this.pinchDistance = this.pointerGap();
      // 双指开始捏合，就不该再有一根手指同时在转镜头
      this.dragPointerId = null;
      return;
    }
    if (this.activePointers.size > 2) return;

    this.dragPointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // 捕获失败只影响拖出画布后的跟手，见 Joystick 里同样的处理
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    const tracked = this.activePointers.get(event.pointerId);
    if (tracked) {
      tracked.x = event.clientX;
      tracked.y = event.clientY;
    }

    // 双指：捏合改距离，不转镜头
    if (this.activePointers.size >= 2) {
      const next = this.pointerGap();
      if (this.pinchDistance > 0 && next > 0) {
        // 张开（next 变大）= 拉近，所以是 前 - 后
        this.zoomBy((this.pinchDistance - next) * 0.01);
      }
      this.pinchDistance = next;
      return;
    }

    if (this.dragPointerId !== event.pointerId) return;

    this.orbit(event.clientX - this.lastX, event.clientY - this.lastY);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size < 2) this.pinchDistance = 0;
    if (this.dragPointerId === event.pointerId) this.dragPointerId = null;
  };

  private onWheel = (event: WheelEvent): void => {
    // 捏脸页是全屏的，滚轮不该去滚右边那栏零件
    event.preventDefault();
    this.zoomBy(event.deltaY * WHEEL_TO_DISTANCE);
  };

  private pointerGap(): number {
    const points = [...this.activePointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  /**
   * 拖拽转镜头。yaw 不夹——绕着人转圈是自然的；
   * pitch 夹在上下限之间，见 MIN_PITCH 那段。
   */
  private orbit(deltaXPixels: number, deltaYPixels: number): void {
    this.desiredYaw -= deltaXPixels * DRAG_YAW_PER_PIXEL;
    this.desiredPitch = MathUtils.clamp(
      this.desiredPitch + deltaYPixels * DRAG_PITCH_PER_PIXEL,
      MIN_PITCH,
      MAX_PITCH,
    );
  }

  private zoomBy(delta: number): void {
    this.desiredDistance = MathUtils.clamp(
      this.desiredDistance + delta,
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
  }

  // ---------------------------------------------------------------- 渲染

  private applyCamera(): void {
    const azimuth = MathUtils.degToRad(this.yaw);
    const pitch = MathUtils.degToRad(this.pitch);

    /*
     * 焦点高度随距离插值：推到最近看脸，拉到最远看全身。
     * 用平滑后的 distance 而不是 desiredDistance，焦点才跟着镜头一起走，
     * 不会在缩放途中先跳到脸再等镜头追上来。
     */
    const closeness =
      1 -
      MathUtils.clamp(
        (this.distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE),
        0,
        1,
      );
    const targetY = MathUtils.lerp(TARGET_Y_FAR, TARGET_Y_NEAR, closeness);

    const horizontal = Math.cos(pitch) * this.distance;
    this.camera.position.set(
      Math.sin(azimuth) * horizontal,
      targetY + Math.sin(pitch) * this.distance,
      Math.cos(azimuth) * horizontal,
    );
    this.camera.lookAt(0, targetY, 0);
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);

    const now = performance.now();
    const deltaSeconds = Math.min((now - this.lastFrameAt) / 1000, 0.1);
    this.lastFrameAt = now;

    // 指数逼近，系数 8 和 CameraRig 一致
    const smoothing = 1 - Math.exp(-8 * deltaSeconds);
    this.yaw += (this.desiredYaw - this.yaw) * smoothing;
    this.pitch += (this.desiredPitch - this.pitch) * smoothing;
    this.distance += (this.desiredDistance - this.distance) * smoothing;
    this.applyCamera();

    if (this.rig) {
      // 待机呼吸借用游戏里的那套动画，站桩也不像蜡像
      animateCharacter(this.rig, 0, false, (now - this.startedAt) / 1000);
    }
    this.renderer.render(this.scene, this.camera);
  };
}
