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
  tick(_creaturePositions: readonly { x: number; z: number }[]): void {}

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

  override tick(creaturePositions: readonly { x: number; z: number }[]): void {
    const behavior = this.definition.behavior;
    const openRadius = behavior?.autoOpenRadius;
    // 锁着不自动开：锁的意义就是拦住所有不带钥匙的东西
    if (!openRadius || this.locked) return;
    const closeRadius = behavior.autoCloseRadius ?? openRadius + 0.8;

    let nearest = Infinity;
    for (const creature of creaturePositions) {
      const distance = Math.hypot(
        creature.x - this.center.x,
        creature.z - this.center.z,
      );
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
