import type { FarmAction, ItemDefinition } from "core";
import type { StationCapability } from "../../Game/EventBus";
import type { ParticleField, Vec3 } from "../Effects/ParticleField";

/**
 * 工具类族（种植系统 期 6）。
 *
 * 一件工具 = `HeldTool` 的一个子类：自己说**怎么握**（`grip`）、**对什么意图有动作**
 * （`useFor`）、**每个动作怎么演**（`uses` 表里各写各的：多长、哪一拍落下、每一拍
 * 胳膊和工具的角度、落下时飞什么）。场景只拿着 `HeldTool` 说话——它不知道锄头和
 * 水壶的区别，加一件新工具是加一个子类 + 注册表（`Tools/index.ts`）一行。
 *
 * 动作说明（`ToolUseSpec`）是**纯数据 + 纯函数**：`frame(t)` 给绝对角度不给增量，
 * 播放器（`ToolPlayer`）每帧照抄，所以本地和联机远端播出来一模一样，
 * 也能在无头用例里逐帧验。
 */

export type { Vec3 } from "../Effects/ParticleField";

/** 按 F 时的意图：田上 Systems 已算出会发生什么；对着家具就是它的能力 */
export type ToolIntent =
  | { kind: "farm"; action: FarmAction["kind"] }
  | { kind: "station"; capability: StationCapability };

/** 工具相对右手挂点（`CharacterRig.handAnchor`）怎么放。工具造型的原点都在柄底、柄竖直 */
export type ToolGrip = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

/** 某一拍人和工具的姿态。绝对值。没写的轴播放器不碰 */
export type ToolUseFrame = {
  /** 右臂绕肩的俯仰（弧度，负 = 往前 / 往上抡） */
  armPitch: number;
  /** 右臂的侧摆（绕 z） */
  armRoll?: number;
  /** 工具在握持角之上再绕手的 x 轴转多少（倾壶就是这个） */
  toolPitch?: number;
  toolRoll?: number;
  /** 上身前倾 */
  bodyPitch?: number;
};

/** 效果上下文：播放器给的，动作的 `onImpact` / `onTick` 用它撒粒子、定位、出声 */
export type ToolEffectContext = {
  /** 这次动作对着的世界点（格心 / 井），没有就是 null */
  target: Vec3 | null;
  /** 手上某一点（工具自己的坐标系，含握持角和倾斜）此刻在世界里哪 */
  toolWorld(local: Vec3): Vec3;
  dirt: ParticleField;
  water: ParticleField;
  /** 一次性音效。没登记的 id 是空操作——素材归用户，接线先留着 */
  sound(profileId: string, volume?: number): void;
};

export type ToolUseSpec = {
  /** 动作名。联机手势里带的就是它，远端按名字找回同一个动作 */
  name: string;
  /** 总长（秒） */
  duration: number;
  /** 落下那一拍（秒）：状态在这一拍改，`onImpact` 也在这一拍 */
  impactAt: number;
  frame(t: number): ToolUseFrame;
  onImpact?(ctx: ToolEffectContext): void;
  onTick?(ctx: ToolEffectContext, t: number, dt: number): void;
};

/** 两个粒子池：土和水。场景建一次，本地和远端的播放器共用 */
export type ToolEffects = { dirt: ParticleField; water: ParticleField };

export abstract class HeldTool {
  constructor(readonly definition: ItemDefinition) {}

  abstract readonly grip: ToolGrip;

  /** 动作表：名字 → 造一份新的说明（每次新造，动作里可以带自己的临时状态） */
  protected abstract readonly uses: Record<string, () => ToolUseSpec>;

  /** 这个意图有没有动作；有就给动作名。哪件工具管哪个动作只写在子类里 */
  abstract useFor(intent: ToolIntent): string | null;

  use(name: string): ToolUseSpec | null {
    const make = this.uses[name];
    return make ? make() : null;
  }

  useSpecFor(intent: ToolIntent): ToolUseSpec | null {
    const name = this.useFor(intent);
    return name ? this.use(name) : null;
  }
}

/** 平滑插值（0→1 两头缓） */
export function smoothStep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** 缓入（起步慢、落下快）：抡东西落下那一段用它 */
export function easeIn(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 拿着不用时右臂微微前抬的角度。三件工具共用，别各拍一个数 */
export const HAND_HOLD_PITCH = -0.35;
