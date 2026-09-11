import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import { emit } from "../../Game/EventBus";

/**
 * 开场：在魔女的屋子里醒来（2026-09-09）。
 *
 * 一片黑 → 眼皮裂开一道缝、眨一下、慢慢睁开 → 第一人称躺在枕头上看天花板，
 * 眼前是糊的 → 镜头慢慢坐起来、视线放平、糊退掉 → 交回第三人称（交接的
 * 那一段插值在 RoomScene 里做，这个类只负责"躺着到坐起"）。
 *
 * 描述的是一个人刚起床的状态：没有任何 UI、任何字，只有视线。
 *
 * 只动相机，不动人：人（角色模型）整段是藏起来的，坐起来那一刻的位置由
 * 场景决定。这里拿到的只有枕头在世界里的位置和"脚朝哪边"。
 *
 * 时间轴（秒）：
 *   0.0–0.6   全黑
 *   0.6–3.4   睁眼：先裂到三成，合回一成（眨），再全开；相机躺着看天花板，模糊拉满
 *   3.4–6.2   坐起：机位从枕头升到坐姿眼高、往脚那头挪一点；俯仰从朝天到放平；模糊退到 0
 *   之后      finished = true，场景接手交接
 */
const BLACK_UNTIL = 0.6;
const EYES_UNTIL = 3.4;
const SIT_UNTIL = 6.2;

/** 躺着时眼睛离枕头面的高度 / 坐起来时眼睛离床垫面的高度 */
const LYING_EYE_LIFT = 0.12;
const SITTING_EYE_LIFT = 0.62;
/** 坐起来时眼睛往脚那头挪多少（人坐直了腰在枕头前面一点） */
const SITTING_FORWARD = 0.38;

function smoothstep(t: number): number {
  const x = MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 睁眼曲线：三段，中间合回去一下是"眨" */
function eyelidOpen(t: number): number {
  if (t < 0.36) return smoothstep(t / 0.36) * 0.32;
  if (t < 0.52) return 0.32 - smoothstep((t - 0.36) / 0.16) * 0.22;
  return 0.1 + smoothstep((t - 0.52) / 0.48) * 0.9;
}

export class OpeningIntro {
  finished = false;

  private elapsed = 0;
  private readonly eye = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly forward: Vector3;

  /**
   * @param pillow 枕头面在世界里的点（眼睛躺在它上面）
   * @param feetDirection 从枕头指向脚那头的世界方向（只用 xz）
   */
  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly pillow: Vector3,
    feetDirection: Vector3,
    private readonly setBlur: (scale: number) => void,
  ) {
    this.forward = new Vector3(feetDirection.x, 0, feetDirection.z).normalize();
    // 第一帧就把相机摆到位：黑幕后面不该露出上一帧的第三人称画面
    this.apply(0);
    emit("opening_eyelids", { open: 0 });
  }

  update(deltaSeconds: number): void {
    if (this.finished) return;
    this.elapsed += deltaSeconds;
    this.apply(this.elapsed);

    if (this.elapsed >= SIT_UNTIL) {
      this.finished = true;
      this.setBlur(0);
      emit("opening_eyelids", { open: -1 });
    }
  }

  private apply(t: number): void {
    // ---- 眼皮 ----
    const eyes = t < BLACK_UNTIL ? 0 : t < EYES_UNTIL ? eyelidOpen((t - BLACK_UNTIL) / (EYES_UNTIL - BLACK_UNTIL)) : 1;
    emit("opening_eyelids", { open: eyes });

    // ---- 坐起的进度（0 躺平 → 1 坐直）----
    const sit = t < EYES_UNTIL ? 0 : smoothstep((t - EYES_UNTIL) / (SIT_UNTIL - EYES_UNTIL));

    // 呼吸：躺着时肉眼可见的一点点起伏，坐起来的过程里收掉
    const breath = Math.sin(t * 1.6) * 0.012 * (1 - sit);

    // 机位：枕头 → 坐姿眼高、往脚那头挪
    this.eye.copy(this.pillow);
    this.eye.addScaledVector(this.forward, SITTING_FORWARD * sit);
    this.eye.y += MathUtils.lerp(LYING_EYE_LIFT, SITTING_EYE_LIFT, sit) + breath;

    // 视线：朝天（俯仰 +90°）→ 放平略微向下（−4°，坐着看屋子的自然角度）
    const pitch = MathUtils.degToRad(MathUtils.lerp(90, -4, sit));
    this.lookAt.copy(this.eye);
    this.lookAt.addScaledVector(this.forward, Math.cos(pitch));
    this.lookAt.y += Math.sin(pitch);

    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.lookAt);

    // ---- 模糊：躺着时拉满，坐起来的前 70% 退完 ----
    this.setBlur(1.6 * (1 - smoothstep(sit / 0.7)));
  }
}
