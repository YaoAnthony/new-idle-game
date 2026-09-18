import { PALETTE } from "../Visual/palette.js";
import {
  HAND_HOLD_PITCH,
  HeldTool,
  lerp,
  smoothStep,
  type ToolGrip,
  type ToolIntent,
  type ToolUseSpec,
  type Vec3,
} from "./HeldTool";

/**
 * 水壶：田上倾壶（pour）、井边装水（fill）。普通壶和广口壶同一个类——
 * 差别在 `tool.power` / `capacity`（数据）和造型（配方），动作一样。
 *
 * 倾壶：胳膊前伸、壶绕手心往前倒，壶嘴对着格，水滴从壶嘴一路落到格上；
 * 到点扶正。装水：胳膊往下探、壶口朝上一沉，几滴水从壶口跳出来。
 */
const POUR_TILT_IN = 0.22;
const POUR_HOLD_UNTIL = 1.0;
const POUR_DURATION = 1.25;
/** 倾壶时状态改在水开始落到格上那一拍，不是按键那一拍 */
const POUR_IMPACT_AT = 0.3;
const POUR_ARM_PITCH = -1.05;
/** 壶绕手心往前倒多少（弧度） */
const POUR_TILT = 1.1;
/** 壶嘴尖在壶自己坐标系里的位置（配方里那根斜管的末端，未缩放） */
const SPOUT_LOCAL: Vec3 = { x: 0.2, y: 0.22, z: 0 };
/** 每秒多少滴 */
const DROPS_PER_SECOND = 60;
const DROP_SPEED = 0.35;
const DROP_GRAVITY = 6;
const DROP_LIFE = 1.2;
const DROP_SIZE = 0.04;

const FILL_DURATION = 0.8;
const FILL_IMPACT_AT = 0.45;
const FILL_ARM_PITCH = -0.95;
/** 装水时壶口朝上微微后仰 */
const FILL_TILT = -0.3;
const FILL_SPLASH = 6;

export class WateringCanTool extends HeldTool {
  /** 提梁在手心（壶吊在手下），壶嘴朝前 */
  readonly grip: ToolGrip = { position: [0, -0.21, 0], rotation: [0, -Math.PI / 2, 0], scale: 1 };

  protected readonly uses = {
    pour: () => this.pour(),
    fill: () => this.fill(),
  };

  useFor(intent: ToolIntent): string | null {
    if (intent.kind === "farm") return intent.action === "water" ? "pour" : null;
    return intent.capability === "water_source" ? "fill" : null;
  }

  private pour(): ToolUseSpec {
    // 出水按时间累积，掉帧时一帧补几滴，不按"每帧一滴"
    let pending = 0;
    return {
      name: "pour",
      duration: POUR_DURATION,
      impactAt: POUR_IMPACT_AT,
      frame(t) {
        if (t < POUR_TILT_IN) {
          const a = smoothStep(t / POUR_TILT_IN);
          return { armPitch: lerp(HAND_HOLD_PITCH, POUR_ARM_PITCH, a), toolPitch: POUR_TILT * a };
        }
        if (t < POUR_HOLD_UNTIL) {
          // 端着倒：手微微抖一下，水流才像活的
          const wobble = Math.sin(t * 14) * 0.03;
          return { armPitch: POUR_ARM_PITCH + wobble, toolPitch: POUR_TILT + wobble };
        }
        const a = smoothStep((t - POUR_HOLD_UNTIL) / (POUR_DURATION - POUR_HOLD_UNTIL));
        return { armPitch: lerp(POUR_ARM_PITCH, HAND_HOLD_PITCH, a), toolPitch: POUR_TILT * (1 - a) };
      },
      onImpact(ctx) {
        ctx.sound("sfx_water_pour", 0.7);
      },
      onTick(ctx, t, dt) {
        if (t < POUR_IMPACT_AT - 0.05 || t >= POUR_HOLD_UNTIL) return;
        pending += DROPS_PER_SECOND * dt;
        const count = Math.floor(pending);
        if (count === 0) return;
        pending -= count;
        const spout = ctx.toolWorld(SPOUT_LOCAL);
        // 朝着格心去：水平速度指向目标，剩下交给重力
        const target = ctx.target;
        const dx = target ? target.x - spout.x : 0;
        const dz = target ? target.z - spout.z : 0;
        const dist = Math.hypot(dx, dz) || 1;
        ctx.water.burst({
          at: spout,
          count,
          velocity: { x: (dx / dist) * DROP_SPEED, y: 0, z: (dz / dist) * DROP_SPEED },
          speed: 0.12,
          spread: 1,
          up: 0.05,
          gravity: DROP_GRAVITY,
          life: DROP_LIFE,
          size: DROP_SIZE,
          floorY: target ? target.y : undefined,
        });
      },
    };
  }

  private fill(): ToolUseSpec {
    return {
      name: "fill",
      duration: FILL_DURATION,
      impactAt: FILL_IMPACT_AT,
      frame(t) {
        // 探下去（到 impact）再提上来
        const a = t < FILL_IMPACT_AT
          ? smoothStep(t / FILL_IMPACT_AT)
          : 1 - smoothStep((t - FILL_IMPACT_AT) / (FILL_DURATION - FILL_IMPACT_AT));
        return { armPitch: lerp(HAND_HOLD_PITCH, FILL_ARM_PITCH, a), toolPitch: FILL_TILT * a, bodyPitch: 0.1 * a };
      },
      onImpact(ctx) {
        const mouth = ctx.toolWorld({ x: 0, y: 0.18, z: 0 });
        ctx.water.burst({
          at: mouth,
          count: FILL_SPLASH,
          speed: 0.5,
          spread: 1,
          up: 0.9,
          gravity: DROP_GRAVITY,
          life: 0.6,
          size: DROP_SIZE,
        });
        ctx.sound("sfx_water_fill", 0.7);
      },
    };
  }
}

/** 水滴的颜色。粒子池按颜色建，场景建池时用它 */
export const WATER_COLOR = PALETTE.waterBlue;
