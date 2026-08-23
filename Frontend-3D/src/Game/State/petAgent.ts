import {
  AffectionStage,
  CreatureRole,
  isConstructionDone,
  FurnitureCapability,
  PlacementSurface,
  GiftTier,
  cellHasClearance,
  findItemDefinition,
  findPath,
  findPetDefinition,
  findPetTaste,
  findPlaceableItem,
  footprintCells,
  roomCellToWorld,
  worldToRoomCell,
  type GridPosition,
  type PetSave,
  type RoomOccupancy,
  type RoomSave,
} from "core";
import { emit } from "../EventBus";
import {
  findDroppedItem,
  listDroppedItems,
  removeDroppedItem,
} from "./droppedItems";
import {
  claimSite,
  finishSite,
  listSites,
  releaseSite,
} from "./buildings";
import { findBuildingLevel } from "../../Buildings/index";
import { getClock } from "./clock";
import {
  creatureBlockedAt,
  getCurrentMapId,
  getRoom,
  getWorld,
  isWalkable,
  removeCreatureObstacle,
  roomIdAt,
  setCreatureObstacle,
} from "./worldRuntime";

/**
 * 宠物的"父类"：**一只活物的全部基础行为和档案属性都在这一个类里**。
 *
 * 基础行为：发呆（idle）、乱走（wander）、凑过来（approach）、
 * 吃饭（eat）、喝水（drink）、睡觉（sleeping）。
 * 档案属性（所有物种统一）：昵称、好感、成长值、心情、饱食/水分。
 *
 * ## 新物种怎么加
 *
 * **实例化，不继承。** 物种差异全部来自 PetDefinition 的数字
 * （speed / sleepiness / collisionRadius / 食量），加一只新生物 =
 * 注册表加一条 + 造型表加一条，行为代码零改动——舒舒和三只 wisp
 * 已经是同一个类的实例，只是数字不同。真出现"数字表达不了的独有行为"
 * 再考虑子类，别提前为想象中的需求开继承树。
 *
 * ## 吃与喝的现实含义
 *
 * - 饿了 → 找**地上扔着的**能吃的东西（尊重口味表，inedible 不碰）。
 *   和扔掷系统天然打通：扔个煎蛋过去，它会自己颠颠地走过来吃掉。
 * - 渴了 → 找带 WaterSource 能力的家具（现在是橱柜的水槽）凑过去喝。
 * - 掉率故意很慢（默认 8/12 点每小时）：宠物是陪伴不是电子鸡，
 *   玩家忘了喂不该是一种惩罚，心情低一点仅此而已。
 */

export type PetActivity =
  | "hidden"
  | "entering"
  | "idle"
  | "wander"
  | "approach"
  | "sleeping"
  | "eat"
  | "drink"
  /** 站在工地上干活（`CreatureRole.Worker` 专属） */
  | "work";

/** 到达路径终点后要干的事。走路只是手段，这里记着目的 */
type Errand =
  | { kind: "eat"; droppedId: string }
  | { kind: "drink"; at: { x: number; z: number } }
  /** 去某块工地干活。到了就认领，认领了才开始走进度 */
  | { kind: "build"; instanceId: string }
  | null;

/** 饱食/水分低于这条线就开始主动找吃找喝 */
const NEED_SEEK_THRESHOLD = 35;
/** 心情的默认出厂值，也是老存档补默认的值 */
const DEFAULT_MOOD = 70;
const DEFAULT_HUNGER_PER_HOUR = 8;
const DEFAULT_THIRST_PER_HOUR = 12;
/** 睡觉时代谢放缓的倍率 */
const SLEEP_METABOLISM = 0.35;

function gridToWorldXZ(room: RoomSave, cell: GridPosition): [number, number] {
  // 官方换算（RoomAnchor 感知），不再手写平移半间房
  const p = roomCellToWorld(room, cell.x, cell.y);
  return [p.x, p.z];
}

function worldToGrid(room: RoomSave, x: number, z: number): GridPosition {
  return worldToRoomCell(room, x, z);
}

export class PetAgent {
  // ---- 身份 ----
  readonly petId: string;
  readonly definitionId: string;

  // ---- 档案属性（全物种统一，进存档） ----
  nickname?: string;
  affectionStage = AffectionStage.Stranger;
  lastGiftWorldDayId?: string;
  /** 成长值：吃东西攒出来的。进化系统以后读它 */
  growth = 0;
  /** 心情 0~100：吃喝睡被照顾到就高，饿着渴着就往下走 */
  mood = DEFAULT_MOOD;
  /** 饱食 / 水分，满 100。掉到阈值以下自己找吃找喝 */
  needs = { hunger: 80, thirst: 80 };

  // ---- 空间 ----
  x: number;
  z: number;
  heading: number;
  /** 碰撞半径。0 = 不挡路的小团子 */
  readonly radius: number;
  readonly speed: number;
  /**
   * 驻地：出生（或读档落位）的地方。乱走以它为圆心，不超过 `wanderRadius`。
   *
   * 屋里的宠物不受影响（不填半径 = 不限，房间本身就是围栏）；院子是一整块
   * 60×45 的房间，不给半径的话石傀儡会一路溜达到据点另一头。
   */
  homeX: number;
  homeZ: number;
  private readonly wanderRadius: number;

  // ---- 行为状态机（运行时，不进存档） ----
  state: PetActivity = "idle";
  moving = false;
  path: GridPosition[] = [];
  pathIndex = 0;
  idleTimer = 2;
  sleepTimer = 0;
  /** 吃/喝的进食动画还要播多久 */
  private busyTimer = 0;
  /** 路被活物挡住已经等了多久 */
  private blockedFor = 0;
  private errand: Errand = null;

  /** 陪你的还是干活的。干活的不吃不喝不亲近 */
  readonly role: CreatureRole;
  /**
   * 身上装了哪些零件。只对 `CreatureRole.Worker` 有意义。
   *
   * **零件不全 = 休眠**，而且自己醒不过来（见 `dormant`）：石傀儡开场
   * 没有头，坐在那儿就是一堆石头，不该过一会儿自己站起来溜达。
   */
  readonly attachedParts = new Set<string>();

  private readonly sleepiness: number;
  private readonly napSeconds: [number, number];
  private readonly hungerPerHour: number;
  private readonly thirstPerHour: number;

  constructor(
    petId: string,
    definitionId: string,
    at: { x: number; z: number; heading: number },
  ) {
    this.petId = petId;
    this.definitionId = definitionId;
    this.x = at.x;
    this.z = at.z;
    this.heading = at.heading;

    // 性情在构造时从注册表展开一次，tick 是热路径，不再查表
    const definition = findPetDefinition(definitionId);
    this.speed = definition?.behavior?.moveSpeed ?? 1.7;
    this.radius = definition?.collisionRadius ?? 0;
    this.sleepiness = definition?.behavior?.sleepiness ?? 0;
    this.napSeconds = definition?.behavior?.napSeconds ?? [60, 120];
    this.role = definition?.role ?? CreatureRole.Pet;
    this.homeX = at.x;
    this.homeZ = at.z;
    this.wanderRadius =
      definition?.behavior?.wanderRadius ?? Number.POSITIVE_INFINITY;
    this.hungerPerHour =
      definition?.behavior?.hungerPerHour ?? DEFAULT_HUNGER_PER_HOUR;
    this.thirstPerHour =
      definition?.behavior?.thirstPerHour ?? DEFAULT_THIRST_PER_HOUR;

    // 挡路的活物从出现那一刻就要挡，等第一帧 tick 会被穿过去一次
    if (this.radius > 0) {
      setCreatureObstacle(this.petId, this.x, this.z, this.radius);
    }
  }

  /**
   * 这只生物**脚下那个房间**的几何和占用图。
   *
   * 原来这些一律取 `getWorld().room`（主房间）——那是"一图一屋"公理在
   * 生物行为里最后一份拷贝。院子在期 1 变成一个真房间之后，站在院子里的
   * 生物做任何事都会被算到**房子的网格**上：格号换算越界、随机目标点落在
   * 屋里、A* 在屋子的占用图上找路。表现是它站着一动不动，因为每次算路
   * 都失败。石傀儡坐在院子里，是第一只踩到这条的。
   *
   * 查不到（几何还没生成）退回主房间，和 RoomScene 的 `roomOfFurniture`
   * 是同一种兜底态度：至少不指到天外。
   */
  private space(): { room: RoomSave; occupancy: RoomOccupancy } {
    const room = getRoom(roomIdAt(this.x, this.z)) ?? getWorld().room;
    return { room, occupancy: getWorld().occupancyOf(room.roomId) };
  }

  // ---- 生命周期 ----

  /** 从门口走进屋（首次登场过场）。走不进去就原地站着，不硬闯 */
  beginEntering(): void {
    this.state = "entering";
    const target = this.randomFreeCell() ?? { x: 6, y: 6 };
    this.startPath(target);
  }

  dispose(): void {
    if (this.radius > 0) removeCreatureObstacle(this.petId);
    this.abandonSite();
  }

  /**
   * 放开手上的工地（被引开、读档、傀儡没了）。工地退回队列。
   *
   * 必须显式退：`workerId` 留着的话那块地永远等着一个不存在的工人，
   * 队里后面的也跟着卡死。
   */
  private abandonSite(): void {
    if (this.errand?.kind !== "build") return;
    releaseSite(this.errand.instanceId);
    this.errand = null;
  }

  /** 调试用：瞬移过去并回到发呆。只有 /pet 命令经 petsRuntime 调它 */
  debugPlace(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.state = "idle";
    this.clearPath();
    this.errand = null;
    this.idleTimer = 1.5;
    if (this.radius > 0) {
      setCreatureObstacle(this.petId, this.x, this.z, this.radius);
    }
  }

  // ---- 基础行为：睡 ----

  fallAsleep(): void {
    this.state = "sleeping";
    const [min, max] = this.napSeconds;
    this.sleepTimer = min + Math.random() * (max - min);
    this.clearPath();
    emit("pet_changed", { petId: this.petId, reason: "sleep" });
  }

  wakeUp(): void {
    // 零件不全的傀儡叫不醒。它不是在睡觉，是**没启动**
    if (this.dormant) return;
    this.state = "idle";
    // 醒来先愣一会儿再决定干什么——猫不会睁眼就走
    this.idleTimer = 2 + Math.random() * 3;
    emit("pet_changed", { petId: this.petId, reason: "wake" });
  }

  /**
   * 零件缺着，动不了。
   *
   * 和"睡着"是两回事：睡着的会自己醒（`sleepTimer` 走完），休眠的不会。
   * 判据只看 `Worker`——宠物没有零件这回事，永远不休眠。
   */
  get dormant(): boolean {
    return this.role === CreatureRole.Worker && !this.attachedParts.has("head");
  }

  /**
   * 装一个零件上去。装齐了就**自己醒过来**——玩家把头按回脖子上，
   * 期待的就是它当场活过来，不该还要再戳一下。
   */
  attachPart(part: string): void {
    if (this.attachedParts.has(part)) return;
    this.attachedParts.add(part);
    emit("pet_changed", { petId: this.petId, reason: "part_attached" });
    if (!this.dormant && this.state === "sleeping") this.wakeUp();
  }

  // ---- 基础行为：吃（外部喂食也走这里，送礼那边调用） ----

  /**
   * 吃进一份东西。地上捡的和玩家手递的都汇到这一条：
   * 饱食按物品的 hungerRestore 恢复，心情按爱不爱吃涨，成长值 +1（爱吃 +2）。
   */
  feed(itemId: string, tier: GiftTier): void {
    const restore = findItemDefinition(itemId)?.food?.hungerRestore ?? 18;
    this.needs.hunger = Math.min(100, this.needs.hunger + restore);

    const moodBump =
      tier === GiftTier.Loved ? 12 : tier === GiftTier.Liked ? 6 : 2;
    this.mood = Math.min(100, this.mood + moodBump);
    this.growth += tier === GiftTier.Loved ? 2 : 1;

    emit("pet_changed", { petId: this.petId, reason: "eat" });
  }

  // ---- 每帧 ----

  tick(deltaSeconds: number, player: { x: number; z: number }): void {
    if (this.state === "hidden") return;

    if (this.radius > 0) {
      setCreatureObstacle(this.petId, this.x, this.z, this.radius);
    }

    this.decayNeeds(deltaSeconds);
    this.driftMood(deltaSeconds);

    if (this.state === "sleeping") {
      // 零件不全的不会自己醒：它不是困了，是没启动
      if (this.dormant) return;
      this.sleepTimer -= deltaSeconds;
      if (this.sleepTimer <= 0) this.wakeUp();
      return;
    }

    if (this.state === "eat" || this.state === "drink") {
      this.busyTimer -= deltaSeconds;
      if (this.busyTimer <= 0) this.finishBusy();
      return;
    }

    if (this.state === "work") {
      this.tickWork(deltaSeconds);
      return;
    }

    if (this.pathIndex < this.path.length) {
      this.tickMove(deltaSeconds);
      return;
    }

    // 路走完了
    this.moving = false;

    if (this.state === "entering") {
      this.state = "idle";
      this.idleTimer = 1.5;
      emit("pet_changed", { petId: this.petId, reason: "entered" });
      emit("story_signal", { kind: "pet_entered", subject: this.petId });
      return;
    }

    if (this.errand) {
      this.arriveAtErrand();
      return;
    }

    this.idleTimer -= deltaSeconds;
    if (this.idleTimer > 0) return;

    this.chooseNextActivity(player);
  }

  // ---- 行为选择：需求 > 睡意 > 亲近 > 乱走 ----

  private chooseNextActivity(player: { x: number; z: number }): void {
    /*
     * 干活的不吃不喝不亲近（`CreatureRole.Worker`）。
     *
     * 跳过这三支而不是给它一套"永不饿"的数字：石傀儡是石头，"它不饿"
     * 不是把 `hungerPerHour` 调成 0 那种意思，是**这个概念对它不成立**。
     * 数字调法还会让它在存档里带着一组永远 80 的饱食度，看着像忘了实现。
     *
     * 施工那一支（去工地干活）等下一期，接在这里。
     */
    const worker = this.role === CreatureRole.Worker;

    // 有活就先干活，压倒一切（包括游荡）。工地不会自己等人
    if (worker && this.trySeekSite()) return;

    if (!worker) {
      // 饿了渴了优先于一切安排——但找不到吃的就不硬找，继续过日子
      if (this.needs.hunger < NEED_SEEK_THRESHOLD && this.trySeekFood()) return;
      if (this.needs.thirst < NEED_SEEK_THRESHOLD && this.trySeekWater()) return;
    }

    if (this.sleepiness > 0 && Math.random() < this.sleepiness) {
      this.fallAsleep();
      return;
    }

    // 熟悉后偶尔主动走向玩家（好感度的空间表现）
    const nearPlayer = Math.hypot(player.x - this.x, player.z - this.z) < 2.2;
    const wantsApproach =
      !worker &&
      this.affectionStage !== AffectionStage.Stranger &&
      !nearPlayer &&
      Math.random() < 0.45;

    if (
      wantsApproach &&
      this.startPath(worldToGrid(this.space().room, player.x, player.z))
    ) {
      this.state = "approach";
      this.idleTimer = 4 + Math.random() * 4;
      return;
    }

    const target = this.randomFreeCell();
    if (target && this.startPath(target)) {
      this.state = "wander";
    }
    this.idleTimer = 3 + Math.random() * 5;
  }

  // ---- 干活：去工地 ----

  /**
   * 找一块该干的工地走过去。
   *
   * **一次只认一块**：手上已经有活（`construction.workerId` 是自己）就
   * 接着干那块，不会半路改主意跑去另一个工地——那正是用户要的"建 A 的
   * 时候 B 不会动工"。
   *
   * 挑的是**最早下单的**那块（`listSites()` 保持数组顺序 = 下单顺序）。
   * 先来先建是玩家唯一能预测的规则；按距离挑的话，玩家下单的顺序和
   * 开工的顺序对不上，看着像随机。
   */
  private trySeekSite(): boolean {
    const mine = listSites().find(
      (site) => site.construction?.workerId === this.petId,
    );
    const target = mine ?? listSites().find((site) => !site.construction?.workerId);
    if (!target) return false;

    // 已经站在跟前了 → 直接开工，不用再走
    const level = findBuildingLevel(
      target.buildingId,
      target.construction?.targetLevelId ?? target.levelId,
    );
    const reach =
      this.radius + 0.9 + Math.max(level?.footprint.width ?? 2, level?.footprint.height ?? 2) / 2;
    if (Math.hypot(target.x - this.x, target.z - this.z) <= reach) {
      this.beginWork(target.instanceId);
      return true;
    }

    if (!this.seekNear(target.x, target.z, reach)) return false;
    this.state = "wander";
    this.errand = { kind: "build", instanceId: target.instanceId };
    this.idleTimer = 6;
    return true;
  }

  /** 站定、转向工地、认领它。认领那一刻才开始走进度 */
  private beginWork(instanceId: string): void {
    const site = listSites().find((item) => item.instanceId === instanceId);
    if (!site) {
      this.state = "idle";
      this.idleTimer = 1;
      return;
    }
    claimSite(instanceId, this.petId, getClock().sample.nowUtc);
    this.heading = Math.atan2(site.x - this.x, site.z - this.z);
    this.state = "work";
    this.clearPath();
    this.errand = { kind: "build", instanceId };
    emit("pet_changed", { petId: this.petId, reason: "work" });
  }

  /**
   * 干活那一帧：到点就完工，然后接着找下一块。
   *
   * 进度不在这里推——它是从 `startUtc / finishUtc` 算出来的（Core 的
   * `constructionProgress`）。这里只负责**看时候到没到**，以及"人还在不在
   * 工地上"：玩家把石傀儡引开的话，工地要退回队列，不能人走了活还在干。
   */
  private tickWork(deltaSeconds: number): void {
    void deltaSeconds;
    const instanceId =
      this.errand?.kind === "build" ? this.errand.instanceId : undefined;
    const site = instanceId
      ? listSites().find((item) => item.instanceId === instanceId)
      : undefined;

    if (!site) {
      // 工地没了（被拆了 / 读档换了世界）：回去发呆
      this.errand = null;
      this.state = "idle";
      this.idleTimer = 1;
      return;
    }

    if (isConstructionDone(site, getClock().sample.nowUtc)) {
      finishSite(site.instanceId);
      this.errand = null;
      this.state = "idle";
      // 完工立刻找下一块：队里还有的话，玩家看见他转身就走
      this.idleTimer = 0.4;
      emit("pet_changed", { petId: this.petId, reason: "work_done" });
    }
  }

  // ---- 基础行为：吃（找地上的） ----

  private trySeekFood(): boolean {
    const taste = findPetTaste(this.definitionId);

    let best: { id: string; x: number; z: number } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entity of listDroppedItems()) {
      const definition = findItemDefinition(entity.stack.itemId);
      // 只吃"食物"；口味表明说不能吃的不碰（生米生肉对它是真的没法吃）
      if (!definition?.food) continue;
      if (taste?.inedible.includes(entity.stack.itemId)) continue;

      const distance = Math.hypot(entity.x - this.x, entity.z - this.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { id: entity.id, x: entity.x, z: entity.z };
      }
    }
    if (!best) return false;

    if (!this.seekNear(best.x, best.z, this.radius + 0.9)) return false;
    this.errand = { kind: "eat", droppedId: best.id };
    this.state = "wander";
    return true;
  }

  // ---- 基础行为：喝（找水源家具） ----

  private trySeekWater(): boolean {
    const { placedFurniture } = getWorld();

    for (const placed of placedFurniture) {
      const item = findPlaceableItem(placed.furnitureId);
      if (!item?.placement.capabilities.includes(FurnitureCapability.WaterSource)) {
        continue;
      }
      if (placed.placement.kind !== PlacementSurface.Floor) continue;

      // 家具中心 = 占地格的平均。水槽在台面哪一端注册表没说，
      // 先凑到家具边上喝——"够得着"由 reach 半径表达
      const cells = footprintCells(
        placed.placement.gridPosition,
        item.placement.footprint,
        placed.placement.facing,
        item.placement.footprintMask,
      );
      let sumX = 0;
      let sumZ = 0;
      // 家具的格号属于**它自己那个房间**，不是这只生物脚下的那个
      const furnitureRoom = getRoom(placed.placement.roomId) ?? getWorld().room;
      for (const cell of cells) {
        const [wx, wz] = gridToWorldXZ(furnitureRoom, cell);
        sumX += wx;
        sumZ += wz;
      }
      const centerX = sumX / cells.length;
      const centerZ = sumZ / cells.length;

      if (this.seekNear(centerX, centerZ, this.radius + 2.2)) {
        this.errand = { kind: "drink", at: { x: centerX, z: centerZ } };
        this.state = "wander";
        return true;
      }
    }
    return false;
  }

  /** 到达差事地点：确认目标还在、够得着，然后开始吃/喝 */
  private arriveAtErrand(): void {
    const errand = this.errand;
    this.errand = null;
    if (!errand) return;

    if (errand.kind === "eat") {
      const entity = findDroppedItem(errand.droppedId);
      // 路上被玩家捡走了 → 白跑一趟，回去发呆（这本身就挺像猫的）
      if (!entity) {
        this.idleTimer = 1;
        this.state = "idle";
        return;
      }
      const distance = Math.hypot(entity.x - this.x, entity.z - this.z);
      if (distance > this.radius + 1.2) {
        this.idleTimer = 1;
        this.state = "idle";
        return;
      }

      this.heading = Math.atan2(entity.x - this.x, entity.z - this.z);
      this.state = "eat";
      this.busyTimer = 2.6;
      this.errand = errand; // 吃完要知道吃的是哪一份
      emit("pet_changed", { petId: this.petId, reason: "eat" });
      return;
    }

    if (errand.kind === "build") {
      this.beginWork(errand.instanceId);
      return;
    }

    this.heading = Math.atan2(errand.at.x - this.x, errand.at.z - this.z);
    this.state = "drink";
    this.busyTimer = 3.2;
    emit("pet_changed", { petId: this.petId, reason: "drink" });
  }

  /** 吃/喝动画播完，结算 */
  private finishBusy(): void {
    if (this.state === "eat" && this.errand?.kind === "eat") {
      const entity = removeDroppedItem(this.errand.droppedId);
      if (entity) {
        const taste = findPetTaste(this.definitionId);
        const itemId = entity.stack.itemId;
        const tier = taste?.loved.includes(itemId)
          ? GiftTier.Loved
          : taste?.disliked.includes(itemId)
            ? GiftTier.Disliked
            : GiftTier.Liked;
        this.feed(itemId, tier);
      }
    }

    if (this.state === "drink") {
      this.needs.thirst = Math.min(100, this.needs.thirst + 60);
      this.mood = Math.min(100, this.mood + 3);
    }

    this.errand = null;
    this.state = "idle";
    this.idleTimer = 2 + Math.random() * 2;
  }

  // ---- 需求与心情 ----

  private decayNeeds(deltaSeconds: number): void {
    const metabolism = this.state === "sleeping" ? SLEEP_METABOLISM : 1;
    const hours = (deltaSeconds / 3600) * metabolism;
    this.needs.hunger = Math.max(0, this.needs.hunger - this.hungerPerHour * hours);
    this.needs.thirst = Math.max(0, this.needs.thirst - this.thirstPerHour * hours);
  }

  /**
   * 心情不是直接加减，是**朝目标漂**：目标由需求算出来（被照顾 → 高，
   * 饿着渴着 → 低）。吃到爱吃的那些瞬间加成会被慢慢拉回目标——
   * 一顿好饭高兴一阵子，日子过得好不好才决定长期心情。
   */
  private driftMood(deltaSeconds: number): void {
    const worst = Math.min(this.needs.hunger, this.needs.thirst);
    const target = worst < 20 ? 25 : worst >= 60 ? 85 : 55;
    this.mood += (target - this.mood) * Math.min(1, deltaSeconds * 0.02);
  }

  // ---- 寻路与移动（所有物种共用，体型由 radius 表达） ----

  private clearPath(): void {
    this.path = [];
    this.pathIndex = 0;
    this.moving = false;
  }

  private randomFreeCell(): GridPosition | null {
    const { room, occupancy } = this.space();

    /*
     * 抽样范围要**先收到驻地附近**，不能全房间均匀抽再筛。
     *
     * 院子是 60×45 = 2700 格，5 米半径的圆只占 79 格——均匀抽的命中率
     * 不到 3%，抽 24 次有一半的机会一个都中不了。表现是石傀儡走一段
     * 就呆站十几秒，看着像卡住了。屋里的宠物不受影响（不限半径时
     * 范围就是整个房间，和以前一模一样）。
     */
    const grid = room.floorGrid;
    let minX = 1;
    let maxX = grid.width - 2;
    let minY = 1;
    let maxY = grid.height - 2;
    if (Number.isFinite(this.wanderRadius)) {
      const homeCell = worldToGrid(room, this.homeX, this.homeZ);
      const span = Math.ceil(this.wanderRadius);
      minX = Math.max(minX, homeCell.x - span);
      maxX = Math.min(maxX, homeCell.x + span);
      minY = Math.max(minY, homeCell.y - span);
      maxY = Math.min(maxY, homeCell.y + span);
      if (maxX < minX || maxY < minY) return null;
    }

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const cell = {
        x: minX + Math.floor(Math.random() * (maxX - minX + 1)),
        y: minY + Math.floor(Math.random() * (maxY - minY + 1)),
      };
      if (!cellHasClearance(grid, occupancy, cell, this.radius)) {
        continue;
      }

      const [wx, wz] = gridToWorldXZ(room, cell);
      // 驻地半径（上面收的是方框，这里才是真的圆）
      if (Math.hypot(wx - this.homeX, wz - this.homeZ) > this.wanderRadius) {
        continue;
      }
      /*
       * 还要过**真正的可走判定**。`cellHasClearance` 只看这个房间的占用图
       * （家具、房子脚印），它不知道领地——院子里一大半是没解锁的地，
       * 光看占用图的话石傀儡会径直走进围栏外面去。`isWalkable` 是玩家
       * 走路用的同一条规则（领地三态、地形、建筑），生物和玩家该受同样的
       * 约束。传自己的 id，免得被自己的碰撞体挡住。
       */
      if (!isWalkable(wx, wz, this.radius, this.petId)) continue;

      return cell;
    }
    return null;
  }

  private startPath(goal: GridPosition): boolean {
    const { room, occupancy } = this.space();
    const path = findPath(
      room.floorGrid,
      occupancy,
      worldToGrid(room, this.x, this.z),
      goal,
      // A* 按这只的体型算路：大家伙不会被规划进挤不过去的缝
      { clearanceRadius: this.radius },
    );
    if (!path || path.length < 2) return false;

    this.path = path;
    this.pathIndex = 1;
    return true;
  }

  /**
   * 找一个"离目标点够近、且这只生物真站得进去"的格子并走过去。
   * 大家伙够不到目标格本身（比如水槽在阻挡格里），reach 半径表达"凑近就行"。
   */
  private seekNear(targetX: number, targetZ: number, reach: number): boolean {
    const { room, occupancy } = this.space();

    const candidates: Array<{ cell: GridPosition; distance: number }> = [];
    for (let gy = 1; gy < room.floorGrid.height - 1; gy += 1) {
      for (let gx = 1; gx < room.floorGrid.width - 1; gx += 1) {
        const cell = { x: gx, y: gy };
        const [wx, wz] = gridToWorldXZ(room, cell);
        const distance = Math.hypot(wx - targetX, wz - targetZ);
        if (distance > reach) continue;
        if (!cellHasClearance(room.floorGrid, occupancy, cell, this.radius)) {
          continue;
        }
        candidates.push({ cell, distance });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    // 只试前几个：目标周围要是整片都不可达，再试也是全图搜索白费
    for (const candidate of candidates.slice(0, 6)) {
      if (this.startPath(candidate.cell)) return true;
    }
    return false;
  }

  private tickMove(deltaSeconds: number): void {
    const [tx, tz] = gridToWorldXZ(this.space().room, this.path[this.pathIndex]);
    const dx = tx - this.x;
    const dz = tz - this.z;
    const distance = Math.hypot(dx, dz);
    this.moving = true;

    if (distance < 0.06) {
      this.pathIndex += 1;
      return;
    }

    const step = Math.min(this.speed * deltaSeconds, distance);
    const nextX = this.x + (dx / distance) * step;
    const nextZ = this.z + (dz / distance) * step;

    if (this.radius > 0) {
      /**
       * 步进只查**活物**（玩家堵在路上、别的大家伙路过）。
       * 静态的墙和家具不再查——A* 已经按体型算过路，重复查会在
       * 两格心之间的线段中点误杀（圆到障碍的距离沿线段是凸的，
       * 中点可以比两端更贴近障碍），表现是 moving=true 原地空转。
       * 代价是拐角处毛皮可能蹭进家具一拳深——毛就是软的，蹭着才对。
       *
       * 对活物用 0.85 倍半径：玩家贴脸站着时两圆正好相切（实测过，
       * 玩家的移动恰停在 1.27m 切点上），按全尺寸判它就被贴身的玩家
       * 永久堵死。缩一点等于允许毛皮和人轻微重叠地擦过去。
       *
       * **不做轴分离**。宠物的路径是正交的（A* 格子路），运动轴被挡时
       * 另一轴步长本来就是零——"沿另一轴滑"永远假成功，零进度还
       * 永远触发不了放弃（上一版就是这么原地磨了三百秒）。被挡就
       * **原地等**：玩家走开自然继续；等太久才放弃重打算。
       * 站着等的猫和绕着你钻的猫，前者才像个大家伙。
       */
      const squeeze = this.radius * 0.85;
      if (creatureBlockedAt(nextX, nextZ, squeeze, this.petId)) {
        this.moving = false;
        this.blockedFor += deltaSeconds;
        if (this.blockedFor > 2.5) {
          this.blockedFor = 0;
          this.clearPath();
          this.errand = null;
          this.state = "idle";
          this.idleTimer = 2 + Math.random() * 3;
        }
        return;
      }
      this.blockedFor = 0;
      this.x = nextX;
      this.z = nextZ;
    } else {
      this.x = nextX;
      this.z = nextZ;
    }

    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - this.heading;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * Math.min(1, deltaSeconds * 10);
  }

  // ---- 存档 ----

  toSave(roomId: string): PetSave {
    return {
      petId: this.petId,
      definitionId: this.definitionId,
      roomId,
      position: {
        // 宠物跟着世界走：存的是当前地图（多地图时代宠物在哪张图存哪张）
        mapId: getCurrentMapId(),
        x: this.x,
        y: this.z,
        // v19 起存连续弧度。原来这里是 headingToFacing(this.heading)——
        // agent 内部全程连续转身，只在存盘那一刹被砍成 4 档，
        // 读档后宠物会"啪"地扭一下。同玩家那条，见 Core 的 WorldPosition
        heading: this.heading,
      },
      affectionStage: this.affectionStage,
      growth: this.growth,
      needs: { ...this.needs },
      mood: this.mood,
      nickname: this.nickname,
      lastGiftWorldDayId: this.lastGiftWorldDayId,
      home: { x: this.homeX, z: this.homeZ },
      // undefined 而不是 false：醒着是默认态，别往每份存档里写一排 false
      sleeping: this.state === "sleeping" ? true : undefined,
      // 同理：没有零件概念的物种不写这个字段
      attachedParts:
        this.role === CreatureRole.Worker ? [...this.attachedParts] : undefined,
    };
  }

  static fromSave(entry: PetSave): PetAgent {
    const agent = new PetAgent(entry.petId, entry.definitionId, {
      x: entry.position.x,
      z: entry.position.y,
      heading: entry.position.heading,
    });

    // 驻地：老存档没有就用读档位置兜底
    if (entry.home) {
      agent.homeX = entry.home.x;
      agent.homeZ = entry.home.z;
    }

    agent.affectionStage = entry.affectionStage;
    agent.nickname = entry.nickname;
    agent.lastGiftWorldDayId = entry.lastGiftWorldDayId;
    agent.growth = entry.growth ?? 0;
    agent.mood = entry.mood ?? DEFAULT_MOOD;
    agent.needs = {
      hunger: entry.needs?.hunger ?? 80,
      thirst: entry.needs?.thirst ?? 80,
    };

    /*
     * 零件：**老存档没有这个字段 → 按齐全算**。现有四只宠物本来就没有
     * 零件这回事，不能因为新加了字段就集体判成"缺零件"而全体瘫在地上。
     * 只有 Worker 才可能真的缺——它的存档一定写了这个字段。
     */
    if (entry.attachedParts) {
      for (const part of entry.attachedParts) agent.attachedParts.add(part);
    } else if (agent.role === CreatureRole.Worker) {
      agent.attachedParts.add("head");
    }

    // 存盘时睡着的接着睡（时长重掷）。读档不重放"从门口进来"的登场
    if (entry.sleeping) {
      agent.state = "sleeping";
      const [min, max] = agent.napSeconds;
      agent.sleepTimer = min + Math.random() * (max - min);
    } else {
      agent.idleTimer = 1 + Math.random() * 3;
    }
    return agent;
  }
}
