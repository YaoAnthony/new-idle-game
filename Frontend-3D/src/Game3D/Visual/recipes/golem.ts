import { Object3D } from "three";

import { jitterShade } from "../palette";
import { box } from "../primitives";
import { hash01 } from "../../World/outdoorTerrain";

/**
 * 石傀儡：领地上那尊会干活的石头人。
 *
 * ## 和舒舒是两个极端
 *
 * 骨架照 `shushu.ts` 那套（pivot 节点 + `userData.animate` + `outlineScale`），
 * 但**着色路线相反**：舒舒刻意不走低多边形（高细分球 + 平滑着色，
 * "毛绒绒的大家伙必须圆润"）；石傀儡全是**方盒子加平面着色**——
 * 岩石本来就该有折面，磨圆了反而不像石头。
 *
 * 体块也走"堆石头"的读法：躯干不是一个盒子，是三层错开的石板；
 * 四肢是粗短的方柱。每块的色都在青灰附近抖一点（`jitterShade`），
 * 远看是一尊石像，近看是垒起来的石头。
 *
 * ## 头是拆得下来的
 *
 * `headSocket` 是**脖颈上的空插槽**，头（`head`）挂在它下面。
 * 开场 `setHeadAttached(false)`：头整个摘掉，插槽口露出来。
 * 玩家把头装回去才 `setHeadAttached(true)`。
 *
 * 这个开关挂在 `userData` 上而不是让 ResidentView 去翻子节点：翻子节点等于
 * 让表现层记住"头叫什么名字"，换个模型就得回来改。
 *
 * ## 三种状态
 *
 * - `sleeping`：整体下沉、前倾，像一堆坐着的石头。**开场就是这个**
 * - `idle`：直立，极慢的呼吸似的起伏（石头不喘气，但完全不动就是雕像）
 * - 走路：四肢交替摆，躯干左右轻晃
 *
 * `sleepBlend` 的缓动**本身就是起身/坐下动画**，不需要单独关键帧——
 * 和舒舒同一条路数。
 */

/** 青灰岩。比据点石料冷一档，它不是这儿的石头 */
const STONE = "#7a8189";
const STONE_DARK = "#5e646b";
/** 苔：常年坐着不动，背上长了东西 */
const MOSS = "#6f8a4e";
/** 头装上之后核心亮起来的颜色 */
const CORE = "#ffcf6b";

/** 一块带色抖的石头 */
function rock(
  size: [number, number, number],
  position: [number, number, number],
  seed: number,
  base = STONE,
): Object3D {
  return box(size, {
    color: jitterShade(base, seed, seed * 3 + 1, 0.07),
    position,
  });
}

export function buildStoneGolem(): Object3D {
  const root = new Object3D();
  root.name = "stone-golem";

  /*
   * `rig` 是**整个人**：走路时的上下颠簸动它，不动 `root`。
   *
   * 这条是踩过的坑：第一版走路的颠簸写成 `root.position.y = ...`，而
   * `root.position` 是 `ResidentView` 每帧用来把生物放到**地面高度**上的
   * （`groundHeightAt`）。动它等于把地面高度覆盖掉——院子地面在 −0.45，
   * 于是石傀儡整个浮在空中 0.45 米。
   * ResidentView 的约定写得很清楚："内部只动自己的子节点，root 的位置朝向
   * 仍归这里管"。多一个中间节点就守住了这条。
   */
  const rig = new Object3D();
  rig.name = "rig";
  root.add(rig);

  /*
   * `body` 管整体的坐/站。腿不挂在它下面——坐下时躯干往下沉，腿却要
   * 留在地上折起来，两者的动法不一样。
   */
  const body = new Object3D();
  body.name = "body";
  rig.add(body);

  /*
   * 躯干：**宽肩窄腰**。
   *
   * 第一版是三块 1.5 宽的石板越堆越窄，站起来读成一根**石柱**——没有腰，
   * 手臂缩在轮廓里面，从远处只看得见一个长方体。人形的辨识度几乎全在
   * 剪影上：肩要比腰宽出去一截，头和肩之间要留出脖子，手臂要挂在轮廓
   * **外面**。这三条办到了，哪怕全身同一个灰也读得出是个人形。
   *
   * 每层之间垫一块窄的深色"石缝"：把一根柱子断成几块石头。
   */
  body.add(
    // 胯：最窄，压在腿上
    rock([0.9, 0.4, 0.72], [0, 0.34, 0], 1),
    rock([0.98, 0.1, 0.78], [0, 0.58, 0], 4, STONE_DARK),
    // 腰
    rock([1.02, 0.46, 0.8], [0.03, 0.86, -0.02], 2),
    rock([1.14, 0.1, 0.88], [0, 1.12, 0], 5, STONE_DARK),
    // 胸/肩：最宽的一层，手臂从它两头挂出去
    rock([1.34, 0.62, 0.94], [-0.02, 1.48, 0.02], 3),
  );
  // 胸口那道缝：头装上之后从这里透光
  const core = box([0.3, 0.3, 0.1], {
    color: CORE,
    position: [0, 1.46, 0.48],
    castShadow: false,
  });
  core.name = "core";
  core.visible = false;
  body.add(core);

  // 背上的苔：几块贴着上层石板
  for (let i = 0; i < 5; i += 1) {
    const t = hash01(i * 4.7);
    body.add(
      box([0.16 + t * 0.2, 0.06, 0.14 + t * 0.16], {
        color: jitterShade(MOSS, i, 7, 0.1),
        position: [-0.5 + t * 1.0, 1.8, -0.34 + hash01(i * 9.1) * 0.4],
        castShadow: false,
      }),
    );
  }

  // ---- 脖颈插槽：头摘掉时露出来的那个口 ----
  const headSocket = new Object3D();
  headSocket.name = "head-socket";
  /*
   * 脖子在肩上方**留出一段空隙**（肩顶 1.79，插槽 1.9）。没有这段空隙，
   * 头就是直接坐在肩上的第四块石头，剪影上分不出哪是头。
   */
  headSocket.position.set(0, 1.9, 0);
  body.add(headSocket);
  // 插槽口本身（一圈深色的凹槽），头装不装都在
  headSocket.add(
    box([0.44, 0.14, 0.4], { color: STONE_DARK, position: [0, -0.04, 0] }),
  );

  const head = buildGolemHead();
  head.position.set(0, 0.44, 0);
  headSocket.add(head);

  // ---- 手臂：粗短方柱，肩上一块石头当关节 ----
  const arms: Object3D[] = [];
  for (const side of [-1, 1] as const) {
    const pivot = new Object3D();
    pivot.name = side < 0 ? "arm-left" : "arm-right";
    /*
     * 肩关节挂在胸那层的**外面**（胸半宽 0.67，肩心 0.86）：手臂整条
     * 落在躯干轮廓之外，剪影上才有两条竖线。第一版肩心 0.82 而躯干半宽
     * 0.75，手臂几乎贴着身子，远看就没有手臂。
     */
    pivot.position.set(side * 0.86, 1.62, 0);
    pivot.add(
      rock([0.4, 0.4, 0.44], [side * 0.04, 0, 0], side < 0 ? 11 : 12),
      rock([0.32, 0.8, 0.36], [side * 0.08, -0.58, 0], side < 0 ? 13 : 14),
      // 拳头：比小臂宽，砸下去才有分量。垂到胯那一层，是长臂的读法
      rock([0.46, 0.42, 0.48], [side * 0.1, -1.14, 0], side < 0 ? 15 : 16),
    );
    arms.push(pivot);
    body.add(pivot);
  }

  // ---- 腿：挂在 root 上不挂 body，坐下时腿留在地上 ----
  const legs: Object3D[] = [];
  for (const side of [-1, 1] as const) {
    const pivot = new Object3D();
    pivot.name = side < 0 ? "leg-left" : "leg-right";
    // 腿分得比胯宽一点（胯半宽 0.45，腿心 0.3）：站着有个稳的八字
    pivot.position.set(side * 0.3, 0.46, 0);
    pivot.add(
      rock([0.44, 0.52, 0.48], [0, -0.14, 0], side < 0 ? 21 : 22),
      rock([0.52, 0.22, 0.64], [0, -0.42, 0.08], side < 0 ? 23 : 24),
    );
    legs.push(pivot);
    rig.add(pivot);
  }

  // ---- 装/摘头 ----
  let headAttached = true;
  root.userData.setHeadAttached = (attached: boolean): void => {
    headAttached = attached;
    head.visible = attached;
    core.visible = attached;
  };
  root.userData.isHeadAttached = (): boolean => headAttached;

  // ---- 动画 ----
  let elapsed = 0;
  let sleepBlend = 0;
  let initialized = false;
  let walkPhase = 0;
  let workPhase = 0;
  const smooth = (t: number): number => t * t * (3 - 2 * t);

  root.userData.animate = (
    deltaSeconds: number,
    resident: { state: string; moving: boolean },
  ): void => {
    elapsed += deltaSeconds;

    const asleep = resident.state === "sleeping";
    // 第一帧直接对齐：开场它本来就坐着，不该先站起来再坐下演一遍
    if (!initialized) {
      sleepBlend = asleep ? 1 : 0;
      initialized = true;
    }

    /*
     * 坐下慢、起身慢，两边都慢——石头动起来就该费劲。
     * （舒舒是"睡下慢起身快"，因为被吵醒是利索的；石傀儡没有"被吵醒"，
     * 它是**被重新启动**，那是个吃力的过程。）
     */
    const target = asleep ? 1 : 0;
    sleepBlend +=
      Math.sign(target - sleepBlend) *
      Math.min(Math.abs(target - sleepBlend), 0.45 * deltaSeconds);
    const eased = smooth(sleepBlend);

    /*
     * 坐下：躯干沉下去、**略**前倾。
     *
     * 第一版沉 0.62、倾 0.3，配上平摊出去的腿，读出来是一堆塌掉的石头
     * 而不是"坐着的石像"。坐着的人形要保住**竖直的躯干**——塌下去那点
     * 交给腿和肩就够了。
     */
    body.position.y = -0.46 * eased;
    body.rotation.x = 0.14 * eased;

    // 腿：坐着时往前伸出去，脚落在地上
    for (const [i, leg] of legs.entries()) {
      const side = i === 0 ? -1 : 1;
      leg.rotation.x = -1.2 * eased;
      leg.position.y = 0.46 - 0.28 * eased;
      leg.position.z = 0.36 * eased;

      // 走路：交替前后摆
      if (!asleep && resident.moving) {
        leg.rotation.x += Math.sin(walkPhase + (side > 0 ? Math.PI : 0)) * 0.5;
      }
    }

    /*
     * 干活：双臂**交替抡起砸下**。用 `−|sin|` 而不是 `sin`：抬起来慢、
     * 砸下去到底停一下，那一下停顿才是"砸"；正弦上下对称，读起来像挥手。
     */
    const working = resident.state === "work";
    if (working) workPhase += deltaSeconds * 2.6;
    else workPhase = 0;

    // 手臂：坐着时垂在身侧微微内收；走路时和腿反相摆
    for (const [i, arm] of arms.entries()) {
      const side = i === 0 ? -1 : 1;
      // 坐着时手臂垂直挂着、略微外撇，像撑在地上
      arm.rotation.x = 0.05 * eased;
      arm.rotation.z = side * 0.2 * eased;
      if (!asleep && resident.moving) {
        arm.rotation.x += Math.sin(walkPhase + (side > 0 ? 0 : Math.PI)) * 0.38;
      }
      if (working) {
        const swing = Math.abs(Math.sin(workPhase + (side > 0 ? Math.PI / 2 : 0)));
        arm.rotation.x -= 1.5 * swing;
      }
    }

    // 砸下去时整个上身跟着往前送一点，力才从身体里出来
    if (working) {
      body.rotation.x += Math.abs(Math.sin(workPhase)) * 0.12;
    }

    if (!asleep && resident.moving) {
      // 步频跟着"石头很沉"走：慢，但每步幅度大
      walkPhase += deltaSeconds * 3.4;
      // 躯干左右晃，重心从一条腿倒到另一条
      body.rotation.z = Math.sin(walkPhase) * 0.05;
      // 动 rig 不动 root：root 的 y 是 ResidentView 给的地面高度
      rig.position.y = Math.abs(Math.sin(walkPhase)) * 0.04;
    } else {
      walkPhase = 0;
      body.rotation.z = 0;
      rig.position.y = 0;
      /*
       * 站着不动时极慢地起伏一点。石头不喘气，但**完全不动就是雕像**——
       * 这一下起伏是"里面还有东西在运转"的唯一证据。没头的时候不给，
       * 那时候它就该是一堆石头。
       */
      if (!asleep && headAttached) {
        body.position.y += Math.sin(elapsed * 1.1) * 0.012;
      }
    }

    // 核心呼吸似的明暗：装了头才有
    if (headAttached) {
      const pulse = 0.75 + Math.sin(elapsed * 1.6) * 0.25;
      core.scale.set(1, pulse, 1);
    }
  };

  // 描边收细：两米多的身板配默认描边宽会变成粗黑边
  root.userData.outlineScale = 1.014;

  return root;
}

/**
 * 石傀儡的头，**单独导出**：它既要装在傀儡脖子上，也要能作为一件掉在
 * 地上的物品被玩家捡走。同一个函数两处用，捡到手里的和装上去的
 * 长得一模一样——这是"这就是它的头"最省事的证明。
 */
export function buildGolemHead(): Object3D {
  const head = new Object3D();
  head.name = "golem-head";

  /*
   * 头比肩窄一大截（肩宽 1.34，头宽 0.86）。低多边形人形靠比例说话：
   * 头要是和肩差不多宽，整个上半身就糊成一块。
   */
  head.add(
    rock([0.86, 0.72, 0.78], [0, 0, 0], 31),
    // 下颌：比头略窄，往前探
    rock([0.68, 0.22, 0.62], [0, -0.4, 0.06], 32),
    // 额上一块凸起，像戴了顶石帽子
    rock([0.74, 0.18, 0.66], [0, 0.42, -0.02], 33, STONE_DARK),
  );

  // 眼：两道横槽。发光的是符文不是眼球——它不是活物，是被点着的石头
  for (const side of [-1, 1] as const) {
    head.add(
      box([0.19, 0.085, 0.06], {
        color: CORE,
        position: [side * 0.2, 0.05, 0.4],
        castShadow: false,
      }),
    );
  }

  // 插榫：装回脖子时插进插槽的那一截
  head.add(box([0.34, 0.2, 0.3], { color: STONE_DARK, position: [0, -0.46, 0] }));

  return head;
}
