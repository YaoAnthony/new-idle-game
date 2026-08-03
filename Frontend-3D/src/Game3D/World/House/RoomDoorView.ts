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
 * 内墙门洞上的双开门板。
 *
 * **视图只画不判断**：每帧读 Door 实体的 open 平滑开合——谁开的门、
 * 锁没锁、什么时候该自动关，全在逻辑层（doorAgent / doorsRuntime），
 * 这里连一个 if 都不该多。开合速度也来自注册表（behavior.swingSpeed），
 * 换一种"慢悠悠的老木门"只改数据。
 *
 * 双扇对开而不是单扇：门洞 2 格宽（2 米），单扇门板 2 米宽转起来
 * 扫过的弧比玩家还大，视觉上像一堵墙在转；对开每扇 1 米，正常。
 */
export class RoomDoorView {
  readonly root: Object3D;

  private readonly leftPivot: Object3D;
  private readonly rightPivot: Object3D;
  private angle = 0;

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

    const leafWidth = gap / 2 - 0.08;
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

    this.leftPivot = buildLeaf(1);
    this.rightPivot = buildLeaf(-1);
    this.root.add(this.leftPivot);
    this.root.add(this.rightPivot);
  }

  update(deltaSeconds: number): void {
    const target = this.agent.open ? OPEN_ANGLE : 0;
    const speed = this.agent.definition.behavior?.swingSpeed ?? 6;
    const smoothing = 1 - Math.exp(-speed * deltaSeconds);
    this.angle += (target - this.angle) * smoothing;

    // 两扇往同一侧（局部 +z）对开，角度镜像
    this.leftPivot.rotation.y = -this.angle;
    this.rightPivot.rotation.y = this.angle;
  }
}
