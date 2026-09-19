import { Plane, Raycaster, Vector2, Vector3, type Camera } from "three";

import { groundHeightAt } from "../../Game/State/worldRuntime";
import {
  groundPaintTargetAt,
  layGroundHere,
  type GroundPaintTarget,
} from "../../Game/Systems/grounds";

/**
 * 铺地模式（2026-09-19）：拿着地面物品 → 光标跟着鼠标走，左键落一格。
 *
 * 用户点名要的手感："不应该是 F 放置，而是鼠标选中哪里，然后左键就可以放下，
 * 就和室内装饰一样"。铺路是**连着铺一片**的活儿，走到每一格跟前按一次 F 太笨；
 * 而室内家具早就是点哪儿放哪儿——同一种动作不该有两种手感。
 *
 * 和 `PlacementController` 是**同一个路数的两件东西**，没有合并：
 * 家具那边有虚影模型、朝向、墙面 / 台面三种落点；这边只有一格光标、没有朝向
 * （拼接形状由对偶网格自己算），合进去只会让那个 500 行的类再多三个分支。
 * 共享的是**瞄准的算法**（下面 `aim` 的两段式求解），那段逻辑照抄并注明来处。
 *
 * 光标不在这里画：`GroundsView` 本来就有一枚（撬地时也用它），这里只回答
 * "此刻指着哪一格、能不能落"，由 RoomScene 每帧喂给视图。谁画归谁画。
 */
export class GroundPaintController {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  /** 瞄地面用的水平面，高度每次重设，见 aim() */
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hit = new Vector3();

  private groundId: string | null = null;
  private target: GroundPaintTarget | null = null;

  constructor(
    private readonly camera: Camera,
    private readonly canvas: HTMLElement,
  ) {}

  get active(): boolean {
    return this.groundId !== null;
  }

  /** 此刻指着的那一格（没指着院子就是 null）。RoomScene 拿它喂光标 */
  get current(): GroundPaintTarget | null {
    return this.active ? this.target : null;
  }

  begin(groundId: string): void {
    if (this.groundId === groundId) return;
    this.groundId = groundId;
    this.target = null;
  }

  cancel(): void {
    this.groundId = null;
    this.target = null;
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.groundId) return;

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    this.target = this.aim() ? groundPaintTargetAt(this.hit.x, this.hit.z, this.groundId) : null;
  }

  /**
   * 左键：落一格。返回 true = 这一下被铺地吃掉了（调用方别再当成"点地走路"）。
   *
   * 指着院子外面时**不吃**这一下——不然一进铺地模式，满屏幕都点不动了。
   */
  onClick(): boolean {
    if (!this.groundId || !this.target) return false;

    const groundId = this.groundId;
    const target = this.target;
    layGroundHere(target, groundId);

    /*
     * 手上这摞铺完**不用在这里退出模式**：扣物品会同步发 `held_changed`，
     * 那条链回头就会把模式关掉（RoomScene 的 syncHeldPreview）。和家具那边
     * 一样，这里只负责"还在模式里就把光标刷新一下"——铺完那一格就被占了，
     * 光标当场转红，不用等下一次鼠标移动。
     */
    if (this.active) this.target = groundPaintTargetAt(target.x, target.z, groundId);
    return true;
  }

  /** 场地变了（铺完、撬完、换图）重问一次，光标的绿红当场更新 */
  refresh(): void {
    if (!this.groundId || !this.target) return;
    this.target = groundPaintTargetAt(this.target.x, this.target.z, this.groundId);
  }

  /**
   * 两段式求解，和 `PlacementController.aimAtGround` 同一套：
   * 先打 y=0 的平面拿到一个粗略落点，再按那儿的地面高度把平面抬上去重打一次。
   * 抬高的地面（石台 +0.45）上不补这一下，命中点会顺着视线往远处漂
   * `elevation / tan(俯角)`，指着台面落到台外。
   */
  private aim(): boolean {
    this.plane.constant = 0;
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return false;
    this.plane.constant = -groundHeightAt(this.hit.x, this.hit.z);
    return this.raycaster.ray.intersectPlane(this.plane, this.hit) !== null;
  }
}
