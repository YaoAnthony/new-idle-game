import type { PoseId } from "core";
import { BodyPosture } from "core";

/**
 * 姿势注册表。PoseId → 各部件的 transform。
 *
 * 和 VisualRegistry 同一个路子：Core 只存 PoseId 字符串，
 * "具体哪个部件转多少度"是表现层的事。加一个姿势只是这里多一条。
 *
 * **分两层，因为姿势会组合而不是穷举：**
 * - 姿态层（posture）：站 / 坐 / 盘腿 / 躺——管腿、身体俯仰、离地高度
 * - 活动层（activity）：伏案写字 / 端着东西——管手臂和上身倾斜
 *
 * 「坐着学习」= sit + desk 两层叠加。两层各碰不同部件（腿 vs 手臂），
 * 叠加天然不冲突。否则 3 姿态 × 4 活动 = 12 个 id，加一个活动就要补一排。
 */

/** 可以被姿势摆动的部件，对应 CharacterRig.parts 的键 */
export type PosePartName =
  | "body"
  | "head"
  | "armLeft"
  | "armRight"
  | "legLeft"
  | "legRight";

export type PosePartTransform = {
  rotation?: [number, number, number];
};

export type PoseDefinition = {
  id: PoseId;

  /**
   * 整个身体的俯仰 / 翻转，作用在 posture 节点上（**绕胯部转**，不是绕脚底）。
   * 躺下就靠这个。
   */
  postureRotation?: [number, number, number];

  /**
   * 身体中线要抬到承托面**以上**多少。
   * 坐是 0（胯部正好在椅面）；躺是半个身子的厚度，否则人会陷进床垫里。
   */
  supportLift?: number;

  parts?: Partial<Record<PosePartName, PosePartTransform>>;

  /** 盖掉待机呼吸与走路摆动（坐着和躺着不该有走路的残留） */
  suppressIdle?: boolean;
};

const HALF_PI = Math.PI / 2;

// ---- 姿态层 ----

const POSTURES: Record<PoseId, PoseDefinition> = {
  /** 站着：什么都不改，交给走路 / 待机呼吸 */
  stand: { id: "stand" },

  /**
   * 正坐。腿**不是**平伸 90°，而是斜着垂下去。
   *
   * 因为角色是 chibi 比例（腿长 0.34）而椅面高 0.49——腿比椅子矮，
   * 脚必然悬空。平伸出去像在划船，斜垂下去才是"小孩坐大椅子晃腿"的样子，
   * 这个画风里反而更可爱。
   */
  sit: {
    id: "sit",
    supportLift: 0,
    suppressIdle: true,
    parts: {
      legLeft: { rotation: [-0.95, 0, 0.05] },
      legRight: { rotation: [-0.95, 0, -0.05] },
      // 手搭在腿上
      armLeft: { rotation: [-0.3, 0, 0.14] },
      armRight: { rotation: [-0.3, 0, -0.14] },
    },
  },

  /** 盘腿：膝盖向外撇，坐垫和草席用 */
  sit_crosslegged: {
    id: "sit_crosslegged",
    supportLift: 0.06,
    suppressIdle: true,
    parts: {
      legLeft: { rotation: [-1.35, 0.55, 0.3] },
      legRight: { rotation: [-1.35, -0.55, -0.3] },
      armLeft: { rotation: [-0.2, 0, 0.3] },
      armRight: { rotation: [-0.2, 0, -0.3] },
    },
  },

  /**
   * 仰卧。postureRotation 两个分量都必要：
   * 先绕 Y 转 180°、再绕 X 抬 90°，才能同时满足"头朝朝向"和"脸朝上"。
   * 只转 X 会变成趴着（脸朝下）。
   */
  lie: {
    id: "lie",
    postureRotation: [HALF_PI, Math.PI, 0],
    // 半个身子的厚度，不然人会陷进床垫
    supportLift: 0.16,
    suppressIdle: true,
    parts: {
      // 躺平：腿伸直，手臂贴在身侧
      legLeft: { rotation: [0, 0, 0.04] },
      legRight: { rotation: [0, 0, -0.04] },
      armLeft: { rotation: [0, 0, 0.22] },
      armRight: { rotation: [0, 0, -0.22] },
    },
  },
};

// ---- 活动层 ----

const ACTIVITIES: Record<PoseId, PoseDefinition> = {
  /**
   * 伏案：手臂前伸、上身前倾。这就是原来那个 focusPose 布尔。
   * 站着写和坐着写共用这一层——差别在姿态层，不在这里。
   */
  desk: {
    id: "desk",
    parts: {
      armLeft: { rotation: [-1.05, 0, 0] },
      armRight: { rotation: [-1.05, 0, 0] },
      body: { rotation: [0.14, 0, 0] },
    },
  },
};

export const DEFAULT_POSTURE: PoseId = "stand";

/** 某个姿态默认用哪个姿势。数据里没写 poseId 时的兜底 */
export function defaultPoseFor(posture: BodyPosture): PoseId {
  return posture === BodyPosture.Lie ? "lie" : "sit";
}

export function findPosture(poseId: PoseId | null | undefined): PoseDefinition {
  if (!poseId) return POSTURES[DEFAULT_POSTURE];
  return POSTURES[poseId] ?? POSTURES[DEFAULT_POSTURE];
}

export function findActivity(
  poseId: PoseId | null | undefined,
): PoseDefinition | null {
  if (!poseId) return null;
  return ACTIVITIES[poseId] ?? null;
}

/** 姿态是不是"离地"的（坐着 / 躺着）。决定要不要锁住移动 */
export function isSupportedPosture(poseId: PoseId): boolean {
  return poseId !== DEFAULT_POSTURE;
}
