import type { AvatarConfig, PoseId } from "core";
import { Object3D } from "three";
import { addOutline } from "../Engine/Outline.js";
import {
  findActivity,
  findPosture,
  type PosePartName,
} from "../Visual/poses.js";
import { box, group, ownMaterial, sphere } from "../Visual/primitives.js";

/**
 * 角色由零件槽位拼装（捏人架构的硬约束）：
 * 动画操作的是"左腿"这个槽位而不是某个具体模型，
 * 所以换发型换衣服后走路动画自动适配，不用重做。
 *
 * 低多边形的可爱靠比例：头大、身子短、腿短。
 */

export type CharacterRig = {
  root: Object3D;
  /** 朝向节点：移动方向的平滑转身作用在这里 */
  heading: Object3D;
  /**
   * 姿态节点：整个身体的俯仰 / 翻转作用在这里。
   *
   * **它的原点在胯部**（heading 之下抬高 HIP_HEIGHT），所以躺下时身体绕胯部翻，
   * 而不是绕脚底扫一圈。挂在 heading 里面是为了让俯仰跟着朝向走——
   * 挂在外面的话，朝东躺下会往北边倒。
   */
  posture: Object3D;
  /**
   * 手持物挂载点（胸前、双手托着的位置）。
   *
   * **挂在 body 上而不是某只手臂上**：手臂走路时前后摆，锅跟着甩会很滑稽；
   * 而且端锅本来就是双手捧在身前的动作，不是单手拎着。挂在 body 上还能
   * 跟着待机呼吸和步伐颠动一起动，看着是"端着"而不是"贴在身上"。
   */
  heldAnchor: Object3D;
  parts: {
    body: Object3D;
    head: Object3D;
    hair: Object3D;
    armLeft: Object3D;
    armRight: Object3D;
    legLeft: Object3D;
    legRight: Object3D;
  };
};

export const DEFAULT_AVATAR: AvatarConfig = {
  bodyId: "body_default",
  hairId: "hair_bob",
  topId: "top_dress",
  bottomId: "bottom_plain",
  shoesId: "shoes_plain",
  colors: {
    skin: "#f2c9a4",
    hair: "#4a3226",
    top: "#c8564f",
    bottom: "#6b4a30",
    shoes: "#3a2a1c",
  },
};

const LEG_HEIGHT = 0.34;
const BODY_HEIGHT = 0.52;

/**
 * 胯部离地高度。坐下 / 躺下时角色根节点抬到 `承托面高度 - HIP_HEIGHT`，
 * 胯部就正好落在椅面 / 床垫上。承托面高度只有一个来源：家具锚点的 offset.y。
 */
export const HIP_HEIGHT = LEG_HEIGHT;

/**
 * 体型量度，给"要瞄准角色"的系统用（目前是遮挡淡出的射线采样）。
 *
 * **不要各自拍脑袋估一个数**——这里改了体型，那边的采样点要跟着走。
 * 头顶高度是躯干顶再加发包的半径（sphere(0.32) × scale.y 0.82 ≈ 0.26，
 * 加上发包中心离头节点的 0.30），实测约 1.42。
 */
export const SHOULDER_HEIGHT = LEG_HEIGHT + BODY_HEIGHT;
export const HEAD_TOP_HEIGHT = SHOULDER_HEIGHT + 0.56;
/** 手臂展开的半宽。横向采样用 */
export const BODY_HALF_WIDTH = 0.28;

export function buildCharacter(avatar: AvatarConfig = DEFAULT_AVATAR): CharacterRig {
  const skin = ownMaterial(avatar.colors.skin ?? "#f2c9a4");
  const hairColor = avatar.colors.hair ?? "#4a3226";
  const topColor = avatar.colors.top ?? "#c8564f";
  const bottomColor = avatar.colors.bottom ?? "#6b4a30";
  const shoeColor = avatar.colors.shoes ?? "#3a2a1c";

  // 腿和身体都挂在 posture 节点里，所以这里的 y 相对**胯部**而不是地面
  const legLeft = buildLeg(bottomColor, shoeColor);
  legLeft.position.set(-0.11, 0, 0);

  const legRight = buildLeg(bottomColor, shoeColor);
  legRight.position.set(0.11, 0, 0);

  const body = new Object3D();
  body.name = "slot-body";
  body.position.y = 0;

  const torso = box([0.46, BODY_HEIGHT, 0.3], {
    color: topColor,
    position: [0, BODY_HEIGHT / 2, 0],
  });
  body.add(torso);

  const armLeft = buildArm(topColor, skin);
  armLeft.position.set(-0.28, BODY_HEIGHT - 0.06, 0);
  body.add(armLeft);

  const armRight = buildArm(topColor, skin);
  armRight.position.set(0.28, BODY_HEIGHT - 0.06, 0);
  body.add(armRight);

  const head = new Object3D();
  head.name = "slot-head";
  head.position.y = BODY_HEIGHT;

  const face = sphere(0.3, 10, 8, {
    color: avatar.colors.skin ?? "#f2c9a4",
    position: [0, 0.26, 0],
  });
  face.material = skin;
  head.add(face);

  const hair = new Object3D();
  hair.name = "slot-hair";
  const hairCap = sphere(0.32, 10, 8, {
    color: hairColor,
    position: [0, 0.3, -0.04],
  });
  hairCap.scale.y = 0.82;
  hair.add(hairCap);
  head.add(hair);

  const eyeLeft = sphere(0.035, 6, 5, {
    color: "#241d1a",
    position: [-0.11, 0.22, 0.27],
    castShadow: false,
  });
  const eyeRight = sphere(0.035, 6, 5, {
    color: "#241d1a",
    position: [0.11, 0.22, 0.27],
    castShadow: false,
  });
  head.add(eyeLeft);
  head.add(eyeRight);

  body.add(head);

  /**
   * 端在身前的位置。y 相对 body 原点（胯部往上）。
   *
   * 压到腰腹这个高度而不是胸口：本作是俯视视角，抬高一点点在
   * 俯角下就会和脑袋叠在一起——头是个半径 0.3 的大球，比看起来占地方。
   */
  const heldAnchor = new Object3D();
  heldAnchor.name = "slot-held";
  heldAnchor.position.set(0, BODY_HEIGHT - 0.36, 0.34);
  body.add(heldAnchor);

  const posture = group("character-posture", [legLeft, legRight, body]);
  posture.position.y = HIP_HEIGHT;

  const heading = group("character-heading", [posture]);
  const root = group("character", [heading]);

  addOutline(root, { scale: 1.06 });

  return {
    root,
    heading,
    posture,
    heldAnchor,
    parts: { body, head, hair, armLeft, armRight, legLeft, legRight },
  };
}

function buildLeg(bottomColor: string, shoeColor: string): Object3D {
  const leg = new Object3D();
  leg.name = "slot-leg";

  const thigh = box([0.14, LEG_HEIGHT, 0.16], {
    color: bottomColor,
    position: [0, -LEG_HEIGHT / 2, 0],
  });

  const shoe = box([0.15, 0.09, 0.24], {
    color: shoeColor,
    position: [0, -LEG_HEIGHT + 0.045, 0.03],
  });

  leg.add(thigh);
  leg.add(shoe);
  return leg;
}

function buildArm(
  topColor: string,
  skin: ReturnType<typeof ownMaterial>,
): Object3D {
  const arm = new Object3D();
  arm.name = "slot-arm";

  const sleeve = box([0.11, 0.3, 0.13], {
    color: topColor,
    position: [0, -0.15, 0],
  });

  const hand = sphere(0.06, 6, 5, {
    color: "#f2c9a4",
    position: [0, -0.34, 0],
  });
  hand.material = skin;

  arm.add(sleeve);
  arm.add(hand);
  return arm;
}

/** 端着东西时手臂前伸多少（弧度）。手掌大致落在 heldAnchor 两侧 */
const CARRY_ARM_PITCH = -1.15;

/**
 * 程序化动画：持续动作用代码直接驱动零件。
 * walkCycle 0→1 表示步态相位；speed 0 时回到待机呼吸。
 *
 * `carrying` 为真时手臂不摆，改成端在身前——手上明明捧着一口锅，
 * 胳膊却照常前后甩会很滑稽。腿照走，身体照颠。
 */
export function animateCharacter(
  rig: CharacterRig,
  walkPhase: number,
  moving: boolean,
  timeSeconds: number,
  carrying = false,
): void {
  if (moving) {
    const swing = Math.sin(walkPhase * Math.PI * 2) * 0.55;

    rig.parts.legLeft.rotation.x = swing;
    rig.parts.legRight.rotation.x = -swing;

    if (carrying) {
      // 端着走时手臂只留一点点随步伐的起伏，不做前后摆
      const bob = Math.sin(walkPhase * Math.PI * 2) * 0.06;
      rig.parts.armLeft.rotation.x = CARRY_ARM_PITCH + bob;
      rig.parts.armRight.rotation.x = CARRY_ARM_PITCH - bob;
    } else {
      rig.parts.armLeft.rotation.x = -swing * 0.7;
      rig.parts.armRight.rotation.x = swing * 0.7;
    }

    // 身体随步伐上下颠一点，低多边形的"活"主要靠这个。
    // y 相对胯部（posture 节点），所以基准是 0 而不是 LEG_HEIGHT
    rig.parts.body.position.y =
      Math.abs(Math.sin(walkPhase * Math.PI * 2)) * 0.045;
  } else {
    const settle = 1 - Math.exp(-0.2);
    rig.parts.legLeft.rotation.x *= 1 - settle;
    rig.parts.legRight.rotation.x *= 1 - settle;

    if (carrying) {
      // 站着端东西：手臂平滑收到端持角度，不要一放手就弹回去
      rig.parts.armLeft.rotation.x +=
        (CARRY_ARM_PITCH - rig.parts.armLeft.rotation.x) * settle;
      rig.parts.armRight.rotation.x +=
        (CARRY_ARM_PITCH - rig.parts.armRight.rotation.x) * settle;
    } else {
      rig.parts.armLeft.rotation.x *= 1 - settle;
      rig.parts.armRight.rotation.x *= 1 - settle;
    }

    // 待机呼吸
    rig.parts.body.position.y = Math.sin(timeSeconds * 2.2) * 0.012;
  }
}

/**
 * 把姿势摆到骨架上。姿态层先写、活动层后写（活动层赢）——
 * 「坐着学习」就是 sit 的腿 + desk 的手臂。
 *
 * 每帧调用，写的是绝对值而不是增量，所以不会累积漂移。
 */
export function applyPose(
  rig: CharacterRig,
  postureId: PoseId,
  activityId: PoseId | null,
): void {
  const posture = findPosture(postureId);
  const activity = findActivity(activityId);

  rig.posture.rotation.set(...(posture.postureRotation ?? [0, 0, 0]));

  // 坐着躺着不该有走路的上下颠动残留
  if (posture.suppressIdle) rig.parts.body.position.y = 0;

  for (const layer of [posture, activity]) {
    if (!layer?.parts) continue;

    for (const name of Object.keys(layer.parts) as PosePartName[]) {
      const rotation = layer.parts[name]?.rotation;
      if (rotation) rig.parts[name].rotation.set(...rotation);
    }
  }
}
