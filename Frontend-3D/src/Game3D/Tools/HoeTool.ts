import { PALETTE } from "../Visual/palette.js";
import {
  HAND_HOLD_PITCH,
  HeldTool,
  easeIn,
  lerp,
  smoothStep,
  type ToolGrip,
  type ToolIntent,
  type ToolUseSpec,
} from "./HeldTool";

/**
 * 锄头：翻地 / 填平各挥一下。
 *
 * 一挥三段：抡到头顶后方（慢）→ 落下（快，缓入）→ 收回持握角（慢）。
 * 落下那一拍土块从格心飞起来。数字都在这里，改手感不用碰播放器。
 */
const RAISE_SECONDS = 0.22;
const CHOP_SECONDS = 0.12;
const RECOVER_SECONDS = 0.26;
/** 抡到最高：胳膊过头往后 */
const RAISE_PITCH = -2.35;
/** 落下：刃到脚前 */
const CHOP_PITCH = -0.55;
/** 抡起时身子微微后仰，落下时前俯 */
const LEAN_BACK = -0.06;
const BOW = 0.18;
/** 抡起时锄头往后翻一点，刃不刮到头 */
const TOOL_BACK_TILT = -0.45;

const DIRT_CLODS = 9;
const DIRT_SPEED = 1.4;
const DIRT_UP = 1.6;
const DIRT_GRAVITY = 9;
const DIRT_LIFE = 0.7;
const DIRT_SIZE = 0.05;

export class HoeTool extends HeldTool {
  /** 柄从手心往前下方伸出去，刃在远端 */
  readonly grip: ToolGrip = { position: [0, 0, 0.02], rotation: [2.35, 0, 0], scale: 1 };

  protected readonly uses = { swing: () => this.swing() };

  useFor(intent: ToolIntent): string | null {
    if (intent.kind === "ground") return "swing";
    if (intent.kind !== "farm") return null;
    return intent.action === "till" ? "swing" : null;
  }

  private swing(): ToolUseSpec {
    const impactAt = RAISE_SECONDS + CHOP_SECONDS;
    return {
      name: "swing",
      duration: impactAt + RECOVER_SECONDS,
      impactAt,
      frame(t) {
        if (t < RAISE_SECONDS) {
          const a = smoothStep(t / RAISE_SECONDS);
          return {
            armPitch: lerp(HAND_HOLD_PITCH, RAISE_PITCH, a),
            toolPitch: TOOL_BACK_TILT * a,
            bodyPitch: LEAN_BACK * a,
          };
        }
        if (t < impactAt) {
          const a = easeIn((t - RAISE_SECONDS) / CHOP_SECONDS);
          return {
            armPitch: lerp(RAISE_PITCH, CHOP_PITCH, a),
            toolPitch: TOOL_BACK_TILT * (1 - a),
            bodyPitch: lerp(LEAN_BACK, BOW, a),
          };
        }
        const a = smoothStep((t - impactAt) / RECOVER_SECONDS);
        return {
          armPitch: lerp(CHOP_PITCH, HAND_HOLD_PITCH, a),
          toolPitch: 0,
          bodyPitch: BOW * (1 - a),
        };
      },
      onImpact(ctx) {
        if (ctx.target) {
          ctx.dirt.burst({
            at: { x: ctx.target.x, y: ctx.target.y + 0.03, z: ctx.target.z },
            count: DIRT_CLODS,
            speed: DIRT_SPEED,
            spread: 1,
            up: DIRT_UP,
            gravity: DIRT_GRAVITY,
            life: DIRT_LIFE,
            size: DIRT_SIZE,
            floorY: ctx.target.y,
          });
        }
        ctx.sound("sfx_hoe_hit", 0.8);
      },
    };
  }
}

/** 土块的颜色：耕地的垄。粒子池按颜色建，场景建池时用它 */
export const DIRT_COLOR = PALETTE.farmDirtTilled;
