import { MathUtils, Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";

/**
 * 桌上的日记本按 F 之后的 3D 段（开场二，2026-09-12）：
 *
 *   lift（0.45 s）：从桌面缓缓飘起一截，顺手晃一下；
 *   fly （0.70 s）：飞到镜头正前方、封面转向镜头，到画面正中央；
 *   hold（0.25 s）：停一拍，微微上下浮——让人看清"它要走了"。
 *
 * 之后 `finished` 置真，RoomScene 把它的屏幕位置和像素高度投影出来交给 DOM
 * （DiaryPanel 那边一张同图的 <img> 接着飞进右上角）。**3D 段不做"嗖"**：
 * 嗖的终点是 HUD 的按钮，那是 DOM 层的东西，3D 物件飞不进去。
 *
 * 目标点每帧从**当前**镜头算：玩家站着不动但镜头有惯性，锁死开头那一帧的
 * 目标会飞到镜头旁边。
 */

const LIFT = 0.45;
const FLY = 0.7;
const HOLD = 0.25;
/** 到镜头前时书占画面高度的比例。DOM 段的起始尺寸也从它算，两边对得上 */
export const JOURNAL_SCREEN_FRACTION = 0.3;

const smooth = (t: number): number => {
  const x = MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export class JournalFlight {
  finished = false;

  private elapsed = 0;
  private readonly startPos = new Vector3();
  private readonly startQuat = new Quaternion();
  private readonly liftPos = new Vector3();
  private readonly target = new Vector3();
  private readonly targetQuat = new Quaternion();
  private readonly faceCamera = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  private readonly forward = new Vector3();

  /**
   * @param ghost 桌上那本的克隆（已加进 scene、姿态和原件一致）
   * @param bookHeight 书的长边（米），算"占画面多少"用
   */
  constructor(
    private readonly ghost: Object3D,
    private readonly camera: PerspectiveCamera,
    private readonly bookHeight: number,
  ) {
    this.startPos.copy(ghost.position);
    this.startQuat.copy(ghost.quaternion);
    this.liftPos.copy(this.startPos).setY(this.startPos.y + 0.35);
  }

  /** 镜头前多远能让书占画面 JOURNAL_SCREEN_FRACTION 的高度 */
  private distanceForFraction(): number {
    const halfFov = MathUtils.degToRad(this.camera.fov) / 2;
    return this.bookHeight / (2 * JOURNAL_SCREEN_FRACTION * Math.tan(halfFov));
  }

  /** 镜头正前方那一点 + 封面朝镜头的姿态（每帧重算，见文件头） */
  private refreshTarget(): void {
    this.camera.getWorldDirection(this.forward);
    this.target.copy(this.camera.position).addScaledVector(this.forward, this.distanceForFraction());
    // 书本地 +Y（封面法线）→ 镜头的 +Z（朝镜头）；书脊仍在左手边
    this.targetQuat.copy(this.camera.quaternion).multiply(this.faceCamera);
  }

  update(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    const t = this.elapsed;
    const g = this.ghost;

    if (t < LIFT) {
      const a = smooth(t / LIFT);
      g.position.lerpVectors(this.startPos, this.liftPos, a);
      // 飘起来时晃一下：绕 Y 小幅来回，像被气流托起
      g.quaternion.copy(this.startQuat);
      g.rotateY(Math.sin(a * Math.PI) * 0.25);
      g.rotateX(Math.sin(a * Math.PI) * -0.18);
      return;
    }

    this.refreshTarget();
    if (t < LIFT + FLY) {
      const a = smooth((t - LIFT) / FLY);
      // 走一条微微上拱的弧，别直线怼过来
      g.position.lerpVectors(this.liftPos, this.target, a);
      g.position.y += Math.sin(a * Math.PI) * 0.18;
      g.quaternion.slerpQuaternions(this.startQuat, this.targetQuat, a);
      return;
    }

    if (t < LIFT + FLY + HOLD) {
      const a = (t - LIFT - FLY) / HOLD;
      g.position.copy(this.target);
      g.position.y += Math.sin(a * Math.PI * 2) * 0.01;
      g.quaternion.copy(this.targetQuat);
      return;
    }

    g.position.copy(this.target);
    g.quaternion.copy(this.targetQuat);
    this.finished = true;
  }

  /**
   * 交接给 DOM 用的屏幕几何：书的中心投影到 canvas 里的 CSS 像素坐标，
   * 以及书的长边此刻占多少像素高。
   */
  screenRect(canvasRect: DOMRect): { x: number; y: number; size: number } {
    const p = this.ghost.position.clone().project(this.camera);
    const x = canvasRect.left + ((p.x + 1) / 2) * canvasRect.width;
    const y = canvasRect.top + ((1 - p.y) / 2) * canvasRect.height;
    const dist = this.ghost.position.distanceTo(this.camera.position);
    const halfFov = MathUtils.degToRad(this.camera.fov) / 2;
    const size = (this.bookHeight / (2 * dist * Math.tan(halfFov))) * canvasRect.height;
    return { x, y, size };
  }
}
