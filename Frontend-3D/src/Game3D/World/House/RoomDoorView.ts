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
 * 内墙门洞上的门板。
 *
 * **视图只画不判断**：每帧读 Door 实体的 open 平滑开合——谁开的门、
 * 锁没锁、什么时候该自动关，全在逻辑层（doorAgent / doorsRuntime），
 * 这里连一个 if 都不该多。开合速度也来自注册表（behavior.swingSpeed），
 * 换一种"慢悠悠的老木门"只改数据。
 *
 * 扇数来自注册表（definition.leaves）：2 格宽的洞口用双扇对开，单扇
 * 门板转起来扫过的弧比玩家还大，视觉上像一堵墙在转；1 格宽的洞口
 * （洗手间这种）写 leaves: 1。
 *
 * ## 门板是框架镶板（2026-08-22 重做）
 *
 * 上一版是一块平板加两条深色横档——那是**仓房 / 茅房门**的做法
 * （ledged door：几块竖板用横档钉在一起，没有框）。装在洗手间那种
 * 小房间上，加上当时 2 格宽的双开，用户第一眼的原话是"这是茅坑吗"。
 *
 * 现在是框架镶板门（frame and panel）：两根竖梃 + 上/中/下三根横档
 * 围出两块**凹进去**的镶板，上板带一个三级台阶的拱头。这套结构是
 * "室内门"这个词在现实里的全部含义——门框把板夹住，板才不会随季节
 * 涨缩顶裂门。加上把手（带背板）和两片合页，读起来才是一扇装修过的
 * 房门，不是一块钉起来的木板。
 *
 * 拱头是给女巫小屋配的：那栋的屋顶、门洞都是弧线语言，方板门放进去
 * 显得太规矩。低多边形里拱线本来就是几级台阶，三级足够，再多只是
 * 多几个面。
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
    /*
     * 门板填满洞口。留缝会**透光**：洗手间比主空间亮，门顶那道 6 厘米的
     * 缝在屏幕上是一条发光的横线，比没有门还显眼。真门的缝是暗的，
     * 这里没有真门的上下框来挡光，那就不留缝
     */
    const leafHeight = DOOR_HEIGHT - 0.02;

    /**
     * 一扇框架镶板门。`mirror` = 合页在哪边（+1 左、−1 右），门板从
     * 合页往 mirror 方向长出去，所有横向坐标都乘它，两扇因此天然镜像。
     *
     * **先有整块门芯，再往上贴框**：第一版只建了竖梃、横档和镶板，
     * 拱头那几级台阶一收窄，肩角就是**真的洞**——从主空间能透过门看见
     * 洗手间的墙。门是实心的，凹凸只是表面文章，所以门芯必须整块。
     */
    const buildLeaf = (mirror: 1 | -1): Object3D => {
      const pivot = new Object3D();
      pivot.position.set(mirror * (-gap / 2 + 0.05), 0, 0);

      /** 门板局部横坐标：0 = 合页边，1 = 门把边 */
      const at = (t: number): number => mirror * leafWidth * t;
      const T = 0.06; // 框料厚
      const CORE = 0.028; // 门芯厚。框比它厚，凹进去的那点就是这个差
      const STILE = 0.13; // 竖梃宽
      const RAIL_BOTTOM = 0.26; // 下档比上档宽，是框架门的通例（重心压低）
      const RAIL_LOCK = 0.17; // 中档（锁档），把手装在它上面
      const RAIL_TOP = 0.12;

      const parts: Object3D[] = [];

      /*
       * 门芯：整块。框贴在它两面，露出来的部分就读成"镶板"。
       *
       * 色阶是**门要比墙裙深两档**：墙裙 woodLight、门芯 woodMid、
       * 门框 wallTrim。三者同色的话门就糊进护墙板里——那正是重做之前
       * 的样子（门板 woodMid 配 woodMid 的墙）。
       */
      parts.push(
        box([leafWidth, leafHeight, CORE], {
          color: PALETTE.woodMid,
          position: [at(0.5), leafHeight / 2, 0],
        }),
      );

      const stileW = STILE / leafWidth;
      for (const t of [stileW / 2, 1 - stileW / 2]) {
        parts.push(
          box([STILE, leafHeight, T], {
            color: PALETTE.wallTrim,
            position: [at(t), leafHeight / 2, 0],
          }),
        );
      }
      const railW = leafWidth - STILE * 2;
      const lockY = leafHeight * 0.44;
      for (const [h, y] of [
        [RAIL_BOTTOM, RAIL_BOTTOM / 2],
        [RAIL_LOCK, lockY],
        [RAIL_TOP, leafHeight - RAIL_TOP / 2],
      ] as const) {
        parts.push(
          box([railW, h, T], {
            color: PALETTE.wallTrim,
            position: [at(0.5), y, 0],
          }),
        );
      }

      /*
       * 拱头：上镶板顶上用**框料填肩角**收出一道弧。三级台阶够了——
       * 低多边形里弧线本来就是几级台阶。给女巫小屋配的：那栋的屋顶和
       * 门洞都是弧线语言，方板门放进去太规矩。
       */
      const upBottom = lockY + RAIL_LOCK / 2;
      const upTop = leafHeight - RAIL_TOP;
      const ARCH = 3;
      // 拱只占上镶板顶上的四成：占满了就不是拱头，是个尖顶
      const archH = ((upTop - upBottom) * 0.42) / ARCH;
      for (let i = 0; i < ARCH; i += 1) {
        const y0 = upTop - archH * (ARCH - i);
        /*
         * 每一级留多宽：照**半圆**取，`keep = √(1 − t²)`，t 是这一级中点
         * 在拱高上的比例。第一版用的是 `1 − sin(...)`，顶上只剩 3% 的宽度
         * ——那不是拱头，是根尖刺（截图里门中间那根竖线就是它）。
         * 半圆到顶还留五成半，肩角只削掉两个角，才读得出是圆头镶板。
         */
        // t 从拱脚往上量：i=0 是最下面一级（t 小、几乎不收），
        // i=ARCH−1 是最上面一级（t 大、收得多）。取反就是个倒拱
        const t = (i + 0.5) / ARCH;
        const keep = Math.sqrt(Math.max(0, 1 - t * t));
        const shoulder = (railW * (1 - keep)) / 2;
        if (shoulder < 0.01) continue;
        for (const sign of [-1, 1]) {
          parts.push(
            box([shoulder, archH, T], {
              color: PALETTE.wallTrim,
              position: [at(0.5) + mirror * sign * (railW - shoulder) / 2, y0 + archH / 2, 0],
            }),
          );
        }
      }

      /*
       * 五金。把手装在锁档上（约 1 米，真门就是这个高度），带一块圆背板
       * ——光一根杆子从门板里伸出来会像插了根钉子。锁孔盖片给
       * `lockable` 的门一个看得见的理由。两面都要：门开着的时候
       * 背面朝人，只做一面会看见一扇没把手的门。
       */
      const handleX = at(1) - mirror * 0.16;
      for (const face of [1, -1] as const) {
        parts.push(
          cylinder(0.055, 0.055, 0.02, 10, {
            color: PALETTE.ironDark,
            position: [handleX, lockY, face * (T / 2 + 0.01)],
            rotation: [Math.PI / 2, 0, 0],
          }),
          cylinder(0.022, 0.022, 0.1, 8, {
            color: PALETTE.brass,
            position: [handleX, lockY, face * (T / 2 + 0.06)],
            rotation: [Math.PI / 2, 0, 0],
          }),
          box([0.05, 0.07, 0.014], {
            color: PALETTE.ironDark,
            position: [handleX, lockY - 0.13, face * (T / 2 + 0.008)],
          }),
        );
      }
      // 合页两片，贴在合页那侧的竖梃上
      for (const y of [leafHeight * 0.18, leafHeight * 0.82]) {
        parts.push(
          box([STILE * 0.8, 0.09, T + 0.03], {
            color: PALETTE.ironDark,
            position: [at(stileW / 2), y, 0],
          }),
        );
      }

      for (const part of parts) pivot.add(part);
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
