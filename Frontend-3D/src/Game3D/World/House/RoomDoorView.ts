import type { GridFootprint, InteriorDoorway } from "core";
import { Object3D } from "three";
import type { Door } from "../../../Game/State/doorAgent.js";
import { PALETTE } from "../../Visual/palette.js";
import { box, cylinder } from "../../Visual/primitives.js";

/** 门洞净高，和 HouseBuilder 的门楣起点保持一致 */
const DOOR_HEIGHT = 2;

/** 全开时的摆角。不到 90° 会显得没开利索，转太多会怼进卧室的墙 */
const OPEN_ANGLE = Math.PI * 0.56;

/**
 * 推锁着的门时门板晃动的幅度和时长。
 *
 * 5° 是"被锁舌顶住"的量——再大就不像锁住了，像门没锁好。
 * 出去快（NUDGE_SPEED 远高于常规开合速度）、回来按常规速度，
 * 这个不对称就是"撞上阻力"的手感；两边一样快会像门在自己扇风。
 */
const NUDGE_ANGLE = Math.PI * 0.028;
const NUDGE_SPEED = 24;
const NUDGE_SECONDS = 0.14;

/**
 * 内墙门洞上的双开门板。
 *
 * **视图只画不判断**：每帧读 Door 实体的 open 平滑开合——谁开的门、
 * 锁没锁、什么时候该自动关，全在逻辑层（doorAgent / doorsRuntime），
 * 这里连一个 if 都不该多。开合速度也来自注册表（behavior.swingSpeed），
 * 换一种"慢悠悠的老木门"只改数据。
 *
 * 扇数来自注册表（definition.leaves）：双扇对开是内门默认——门洞 2 格宽
 * （2 米），单扇门板转起来扫过的弧比玩家还大，视觉上像一堵墙在转，
 * 对开每扇 1 米才正常。要单开的门在注册表里写 leaves: 1，这里照做。
 */
export class RoomDoorView {
  readonly root: Object3D;

  /** 门板枢轴。单扇门只有一个，双扇是左右各一 */
  private readonly pivots: Object3D[] = [];
  private angle = 0;
  /** 推门反馈的剩余时长（秒）。>0 时门板顶向 NUDGE_ANGLE */
  private nudgeRemaining = 0;

  constructor(
    doorway: InteriorDoorway,
    private readonly agent: Door,
    roomSize: GridFootprint,
  ) {
    const halfW = roomSize.width / 2;
    const halfD = roomSize.height / 2;
    const gap = doorway.span;

    this.root = new Object3D();
    this.root.name = `room-door-${doorway.doorwayId}`;

    if (doorway.axis === "x") {
      this.root.position.set(
        doorway.cell.x + gap / 2 - halfW,
        0,
        doorway.cell.y + 0.5 - halfD,
      );
    } else {
      this.root.position.set(
        doorway.cell.x + 0.5 - halfW,
        0,
        doorway.cell.y + gap / 2 - halfD,
      );
      // 竖门洞：把局部 x 轴转到世界 z 上，下面的排布逻辑就不用分轴写两份
      this.root.rotation.y = Math.PI / 2;
    }

    const leaves = agent.definition.leaves ?? 2;
    // 单扇要覆盖整个洞口，双扇各占一半
    const leafWidth = (leaves === 1 ? gap : gap / 2) - 0.08;
    const leafHeight = DOOR_HEIGHT - 0.12;

    const buildLeaf = (mirror: 1 | -1): Object3D => {
      const pivot = new Object3D();
      pivot.position.set(mirror * (-gap / 2 + 0.05), 0, 0);

      const plank = box([leafWidth, leafHeight, 0.07], {
        color: PALETTE.woodMid,
        position: [(mirror * leafWidth) / 2, leafHeight / 2 + 0.02, 0],
      });
      // 横档沿用外门 DoorView 的木构语言，两扇门是一家的
      for (const railY of [leafHeight * 0.72, leafHeight * 0.3]) {
        pivot.add(
          box([leafWidth * 0.82, 0.1, 0.09], {
            color: PALETTE.woodDark,
            position: [(mirror * leafWidth) / 2, railY, 0],
          }),
        );
      }
      const knob = cylinder(0.04, 0.04, 0.09, 8, {
        color: PALETTE.brass ?? "#c9a35c",
        position: [mirror * (leafWidth - 0.12), leafHeight * 0.45, 0.06],
        rotation: [Math.PI / 2, 0, 0],
      });
      pivot.add(plank);
      pivot.add(knob);
      return pivot;
    };

    // 单扇统一挂在左侧合页（和大门 DoorView 一致），双扇左右对开
    const mirrors: (1 | -1)[] = leaves === 1 ? [1] : [1, -1];
    for (const mirror of mirrors) {
      const pivot = buildLeaf(mirror);
      this.pivots.push(pivot);
      this.root.add(pivot);
    }
  }

  /**
   * 推了一下但没推开（门锁着）。
   *
   * 由 RoomScene 在 interact 返回 "locked" 时调用——视图仍然不判断
   * 锁没锁，只是被告知"演一下推不开"。
   */
  nudge(): void {
    this.nudgeRemaining = NUDGE_SECONDS;
  }

  update(deltaSeconds: number): void {
    let target = this.agent.open ? OPEN_ANGLE : 0;
    let speed = this.agent.definition.behavior?.swingSpeed ?? 6;

    if (this.nudgeRemaining > 0) {
      this.nudgeRemaining = Math.max(0, this.nudgeRemaining - deltaSeconds);
      target = NUDGE_ANGLE;
      speed = NUDGE_SPEED;
    }

    const smoothing = 1 - Math.exp(-speed * deltaSeconds);
    this.angle += (target - this.angle) * smoothing;

    /*
     * 门板往同一侧（局部 +z）开。双扇时两边角度镜像才是"对开"；
     * 单扇只有一片，直接用左侧那一路的符号。
     */
    this.pivots[0].rotation.y = -this.angle;
    if (this.pivots[1]) this.pivots[1].rotation.y = this.angle;
  }
}
