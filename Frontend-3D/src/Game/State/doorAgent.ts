import type { DoorDefinition, DoorRefId, GridPosition } from "core";

/**
 * 门的运行时实体（继承结构在这一层）：
 * - `Door` 基类：开/关状态机 + 锁 + F 交互。没有任何自主行为——
 *   大门就是纯基类实例，只听吩咐。
 * - `RoomDoor` 子类：叠加"生物靠近自动开、都走了自动关"。
 *
 * 种类参数（自动开关半径、可否上锁）全部来自 Core 注册表的
 * DoorDefinition，类只解释字段——加一种门不需要新的子类，除非
 * 它有真正新的**行为**（比如将来的滑门要换动画轴，那是表现层的事）。
 *
 * 定义层的集中地图见 Core/types/doors.ts 文件头。
 */

export type DoorInteractOutcome = "opened" | "closed" | "locked";

/**
 * 门看生物只看两件事：站在哪、多大只。
 *
 * `radius` 是**体型**，不是可选的装饰——自动开关的距离量到体表而不是
 * 体心（见 RoomDoor.tick）。省略时按体心算，只有测试里那种质点才该省。
 */
export type CreatureProbe = { x: number; z: number; radius?: number };

export class Door {
  readonly refId: DoorRefId;
  readonly definition: DoorDefinition;

  /**
   * 门洞占的格子。关着的门把这些格子变成阻挡（只挡连续坐标的
   * 通行检测 isWalkable；**寻路不看它**——会寻路的都是生物，
   * 生物走到门前门就自动开了，让 A* 绕路反而是错的）。
   */
  readonly cells: readonly GridPosition[];

  /** 门心的世界坐标。自动开关按到这个点的距离算 */
  readonly center: { readonly x: number; readonly z: number };

  open = false;
  locked: boolean;

  /**
   * 这扇门的主人（居民房的门，08）。有主人的门锁不锁不由存档定，由**主人在不在**定
   * （doorsRuntime 每帧写）；`homeRect` 是他家的占地，"在屋里"按它判。
   */
  owner?: string;
  homeRect?: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(
    refId: DoorRefId,
    definition: DoorDefinition,
    cells: readonly GridPosition[],
    center: { x: number; z: number },
    savedLocked?: boolean,
  ) {
    this.refId = refId;
    this.definition = definition;
    this.cells = cells;
    this.center = center;
    this.locked = savedLocked ?? definition.defaultLocked ?? false;
  }

  /**
   * 玩家按 F。锁着的门不响应开合，只回报"锁着"让交互层去提示——
   * 开着锁上的门同样不让关：锁定语义是"门被固定在当前状态"，
   * 而不只是"打不开"。
   */
  interact(): DoorInteractOutcome {
    if (this.locked) return "locked";
    this.open = !this.open;
    return this.open ? "opened" : "closed";
  }

  lock(): void {
    this.locked = true;
  }

  unlock(): void {
    this.locked = false;
  }

  /** 每帧驱动。基类无自主行为，子类覆写 */
  tick(creatures: readonly CreatureProbe[]): void {
    void creatures;
  }

  /** 关着时挡不挡这个格子 */
  blocksCell(gx: number, gy: number): boolean {
    if (this.open) return false;
    return this.cells.some((cell) => cell.x === gx && cell.y === gy);
  }
}

export class RoomDoor extends Door {
  /**
   * 这次开门是不是自动开的。**自动关只关自动开的门**：
   * 玩家手动开的门要一直开着等玩家自己关——不区分的话，玩家 F 开门、
   * 下一帧 tick 发现附近没有生物，门当着玩家的面又关上了。
   */
  private autoOpened = false;

  override interact(): DoorInteractOutcome {
    const outcome = super.interact();
    if (outcome !== "locked") this.autoOpened = false;
    return outcome;
  }

  override tick(creatures: readonly CreatureProbe[]): void {
    const behavior = this.definition.behavior;
    const openRadius = behavior?.autoOpenRadius;
    // 锁着不自动开：锁的意义就是拦住所有不带钥匙的东西
    if (!openRadius || this.locked) return;
    const closeRadius = behavior.autoCloseRadius ?? openRadius + 0.8;

    /*
     * 距离量到**体表**，不是体心。
     *
     * 注册表里那个半径想说的是"走到门口了"，而到没到门口是**身体**的事。
     * 按体心量的话这个数对每种体型含义都不一样：猫（半径 0.3）在门外
     * 0.9 米就开，石傀儡（半径 1.1）要等身子探进门洞 0.1 米才开——门在
     * 它背后弹开，看起来就是直接穿门而过。（2026-08-23 用户报的就是这个。）
     *
     * 减半径之后，1.2 处处是"体表离门心 1.2"，加多大的家伙都不用回来
     * 重调这张表。
     */
    let nearest = Infinity;
    for (const creature of creatures) {
      const distance =
        Math.hypot(creature.x - this.center.x, creature.z - this.center.z) -
        (creature.radius ?? 0);
      if (distance < nearest) nearest = distance;
    }

    if (!this.open && nearest <= openRadius) {
      this.open = true;
      this.autoOpened = true;
    } else if (this.open && this.autoOpened && nearest >= closeRadius) {
      this.open = false;
      this.autoOpened = false;
    }
  }
}
