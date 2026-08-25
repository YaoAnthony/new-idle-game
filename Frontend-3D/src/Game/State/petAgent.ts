import {
  AffectionStage,
  CreatureRole,
  isConstructionDone,
  FurnitureCapability,
  PlacementSurface,
  GiftTier,
  findItemDefinition,
  findPetDefinition,
  findPetTaste,
  findPlaceableItem,
  footprintCells,
  roomCellToWorld,
  yardBoundsOf,
  type GridPosition,
  type PetSave,
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
  creatureBlockingAt,
  PLAYER_OBSTACLE_ID,
  doorGateBlocks,
  getCurrentMap,
  getCurrentMapId,
  getRoom,
  getWorld,
  isWalkable,
  removeCreatureObstacle,
  setCreatureObstacle,
} from "./worldRuntime";
import { findRoute } from "../Systems/navigation";

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

/** 某间屋的格号 → 世界坐标。官方换算（RoomAnchor 感知） */
function gridToWorldXZ(room: RoomSave, cell: GridPosition): [number, number] {
  const p = roomCellToWorld(room, cell.x, cell.y);
  return [p.x, p.z];
}

/**
 * 按 petId 找同伴。**由 `petsRuntime` 在启动时注入**，不在这里 import。
 *
 * 反过来引会成环：`petsRuntime` 本来就 import 了 `PetAgent`。ESM 能容忍
 * 环，但那让"谁依赖谁"变得要靠猜；注入一个函数则把方向写在明面上——
 * 名册归 `petsRuntime` 管，个体只是被告知怎么找人。
 *
 * 只有"让路"用它：一只生物要请另一只挪开，除此之外个体之间不互相认识。
 */
let peerLookup: ((petId: string) => PetAgent | undefined) | null = null;

export function setPeerLookup(
  lookup: (petId: string) => PetAgent | undefined,
): void {
  peerLookup = lookup;
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
  /**
   * 剩下要走的**世界坐标**路点，来自 `findRoute`（拉过直的）。
   *
   * 原来存的是房间格坐标，那是"这只生物只在脚下这间屋里活动"的最后
   * 一份拷贝：格号只有配上具体哪间屋才有意义，于是走到院子和屋子的
   * 交界就没法接着往下算。世界坐标没有这个问题——进屋、上桥、换图
   * 都是同一串数。
   */
  path: Array<[number, number]> = [];
  pathIndex = 0;
  idleTimer = 2;
  sleepTimer = 0;
  /** 吃/喝的进食动画还要播多久 */
  private busyTimer = 0;
  /** 路被活物挡住已经等了多久 */
  private blockedFor = 0;
  /**
   * 刚被请着让过路，这段时间内不再被请第二次。
   *
   * 没有这个冷却的话，两只互相挡着的生物会一人一帧地请对方让路，
   * 谁都走不掉——让路必须是**一次性的动作**，不是持续协商。
   */
  private yieldCooldown = 0;
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

  // ---- 生命周期 ----

  /** 从门口走进屋（首次登场过场）。走不进去就原地站着，不硬闯 */
  beginEntering(): void {
    this.state = "entering";
    const spot = this.randomFreeSpot();
    if (spot) this.startPathTo(spot[0], spot[1]);
  }

  /**
   * 换驻地（期 4：居民搬进自己的房子）。
   *
   * 只挪圆心不挪人：他会自己**溜达过去**——乱走的候选点从此只在新驻地
   * 半径内取，几步之内就走过去了。瞬移过去反而穿帮（正和别人说着话呢）。
   * home 进存档（PetSave.home），读档不漂移。
   */
  rehome(x: number, z: number): void {
    this.homeX = x;
    this.homeZ = z;
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
  /**
   * 走没走在路上。**用例读它判"让路生效了没有"**——直接看 `path.length`
   * 要把私有字段公开，而那会让任何人都能改路径。
   */
  isMovingSomewhere(): boolean {
    return this.pathIndex < this.path.length;
  }

  /** 当前这条路的终点。让路的方向对不对靠它验 */
  debugPathTarget(): { x: number; z: number } | null {
    if (this.pathIndex >= this.path.length) return null;
    const [x, z] = this.path[this.path.length - 1];
    return { x, z };
  }

  /** 用例摆状态用（"正在干活的不让路"这类判据要先把他摆成那个状态） */
  debugSetState(state: PetActivity): void {
    this.state = state;
    this.clearPath();
  }

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

    if (this.yieldCooldown > 0) this.yieldCooldown -= deltaSeconds;

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

    if (wantsApproach && this.startPathTo(player.x, player.z)) {
      this.state = "approach";
      this.idleTimer = 4 + Math.random() * 4;
      return;
    }

    const spot = this.randomFreeSpot();
    if (spot && this.startPathTo(spot[0], spot[1])) {
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
    /*
     * 候选是**所有**没人认领的工地，按下单顺序试——不是只看第一块。
     *
     * 只看第一块的话，一块他去不了的地会把整个队列钉死：体型进寻路
     * 之后"去不了"从边缘情况变成了常态（石傀儡半径 1.1，门洞 2 米，
     * 他进不了屋），玩家在屋里下一单，院子里那十堵墙就再也没人建了。
     *
     * 去不了的地不认领、也不报错，就跳过。它留在队列里等一个**过得去**
     * 的工人——将来有小个子工人时那一单自然会被接走，今天则是一直空着。
     *
     * 顺序仍是**先下单先建**（用户定的排队语义），不改成"就近先建"：
     * 玩家下单的次序是他自己的计划，寻路的方便不该把它打乱。跳过的
     * 只有真去不了的，能去的一块都不越队。
     */
    const candidates = mine
      ? [mine]
      : listSites().filter((site) => !site.construction?.workerId);

    for (const target of candidates) {
      const level = findBuildingLevel(
        target.buildingId,
        target.construction?.targetLevelId ?? target.levelId,
      );
      const reach =
        this.radius +
        0.9 +
        Math.max(level?.footprint.width ?? 2, level?.footprint.height ?? 2) / 2;

      // 已经站在跟前了 → 直接开工，不用再走
      if (Math.hypot(target.x - this.x, target.z - this.z) <= reach) {
        this.beginWork(target.instanceId);
        return true;
      }

      /*
       * 把**楼占多大**也传进去：落脚点只在楼外面找。不传的话前几圈
       * 采样点全落在楼里，等于把候选数从三十几个砍到八个。
       */
      const blocked =
        Math.max(level?.footprint.width ?? 2, level?.footprint.height ?? 2) / 2;
      // 排不出路 = 这块地他过不去（门太窄、地没解锁）。换下一块
      if (!this.seekNear(target.x, target.z, reach, blocked)) continue;

      this.state = "wander";
      this.errand = { kind: "build", instanceId: target.instanceId };
      this.idleTimer = 6;
      return true;
    }
    return false;
  }

  /**
   * **为什么不去建**：逐块工地报原因（调试用）。
   *
   * 用户 2026-08-25 报"石傀儡不过来建造"，而当时完全没有工具能回答这个
   * 问题——`/buildings` 连工地都不显示，`trySeekSite` 里那句"去不了就
   * 跳过"是静默的。三种原因（有人认领了 / 已经站到了 / 排不出路）
   * 从外面长得一模一样：他就是站着不动。
   *
   * 这个方法不改任何状态，只把 `trySeekSite` 的判断复述一遍。
   */
  diagnoseSites(): {
    errand: string;
    sites: Array<{ instanceId: string; verdict: string }>;
  } {
    const errand =
      this.errand?.kind === "build" ? this.errand.instanceId : (this.errand?.kind ?? "(空)");
    return { errand, sites: this.listSiteVerdicts() };
  }

  private listSiteVerdicts(): Array<{ instanceId: string; verdict: string }> {
    return listSites().map((site) => {
      if (site.construction?.workerId && site.construction.workerId !== this.petId) {
        return { instanceId: site.instanceId, verdict: `别人在建（${site.construction.workerId}）` };
      }
      const level = findBuildingLevel(
        site.buildingId,
        site.construction?.targetLevelId ?? site.levelId,
      );
      const reach =
        this.radius +
        0.9 +
        Math.max(level?.footprint.width ?? 2, level?.footprint.height ?? 2) / 2;
      const distance = Math.hypot(site.x - this.x, site.z - this.z);
      if (distance <= reach) {
        return { instanceId: site.instanceId, verdict: `够得着（距离 ${distance.toFixed(1)} ≤ ${reach.toFixed(1)}）` };
      }
      /*
       * 这里**真的去排一次路**（和 `trySeekSite` 走同一个 `seekNear`），
       * 排完把路撤掉——只有真排一次才知道过不过得去，估算不算数。
       */
      const savedPath = this.path;
      const savedIndex = this.pathIndex;
      const blocked =
        Math.max(level?.footprint.width ?? 2, level?.footprint.height ?? 2) / 2;
      const reachable = this.seekNear(site.x, site.z, reach, blocked);
      this.path = savedPath;
      this.pathIndex = savedIndex;
      if (reachable) {
        return {
          instanceId: site.instanceId,
          verdict: `走得到（距离 ${distance.toFixed(1)}）`,
        };
      }
      /*
       * 去不了的话，**分清是"没地方站"还是"站得下但走不过去"**。
       * 两者的修法完全不同：前者要放宽落脚点的搜法，后者是地图或
       * 障碍物的问题。只报一句"排不出路"的话，这两条路要各试一遍。
       */
      let standable = 0;
      let tried = 0;
      const inner = blocked + this.radius;
      const RINGS = 4;
      const DIRECTIONS = 12;
      for (let ring = 0; ring <= RINGS; ring += 1) {
        const d = inner >= reach ? reach : inner + ((reach - inner) * ring) / RINGS;
        const spokes = d <= 0.01 ? 1 : DIRECTIONS;
        const phase = (ring * Math.PI) / DIRECTIONS;
        for (let spoke = 0; spoke < spokes; spoke += 1) {
          const angle = phase + (spoke * Math.PI * 2) / spokes;
          tried += 1;
          if (
            isWalkable(
              site.x + Math.cos(angle) * d,
              site.z + Math.sin(angle) * d,
              this.radius,
              this.petId,
            )
          ) {
            standable += 1;
          }
        }
      }
      /*
       * 走不过去时再问一句：**换个小个子过得去吗**。
       *
       * 过得去 = 路太窄（石傀儡半径 1.1 要 2.2 米净宽，而院子里的过道
       * 未必有）；过不去 = 那片地压根和这儿不连通（地没开、被墙围死）。
       * 两者的修法完全不同：前者是把过道让开或者换个小工人，
       * 后者是那块地根本不该能下单。
       */
      let narrowOnly = false;
      if (standable > 0) {
        const tiny = findRoute(
          { x: this.x, z: this.z },
          { x: site.x, z: site.z },
          { radius: 0.25, snapRings: 4 },
        );
        narrowOnly = Boolean(tiny && tiny.length >= 2);
      }
      return {
        instanceId: site.instanceId,
        verdict:
          standable === 0
            ? `**没地方站**（环带 ${inner.toFixed(1)}~${reach.toFixed(1)}，${tried} 个候选点一个都站不下，半径 ${this.radius}）`
            : narrowOnly
              ? `**路太窄**（小个子过得去，他半径 ${this.radius} 过不去；${standable}/${tried} 个落脚点可站）`
              : `**那片地不连通**（小个子也过不去；${standable}/${tried} 个落脚点可站，距离 ${distance.toFixed(1)}）`,
      };
    });
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

  /**
   * 驻地附近随便挑一个**站得进去**的世界点。
   *
   * 抽样范围先收到驻地圆里，不全图均匀抽：院子 60×45，5 米半径的圆
   * 只占其中不到 3%，均匀抽 24 次有一半机会一个都中不了，表现就是
   * 石傀儡走一段呆站十几秒。不限驻地半径的（屋里的宠物）退回按整张
   * 可走边界抽，和以前一样。
   *
   * 判据只有 `isWalkable(..., this.radius, this.petId)` 一条——它就是
   * 玩家走路用的那条（领地、地形、家具、建筑、体型全在里面）。以前这里
   * 还要先过一遍房间占用图的 `cellHasClearance`，那是两套判定，
   * 而两套判定迟早会给出两个答案。
   */
  private randomFreeSpot(): [number, number] | null {
    const map = getCurrentMap();
    const bounds = yardBoundsOf(map, getWorld().room.floorGrid);
    let minX = bounds.minX + this.radius;
    let maxX = bounds.maxX - this.radius;
    let minZ = bounds.minZ + this.radius;
    let maxZ = bounds.maxZ - this.radius;
    if (Number.isFinite(this.wanderRadius)) {
      minX = Math.max(minX, this.homeX - this.wanderRadius);
      maxX = Math.min(maxX, this.homeX + this.wanderRadius);
      minZ = Math.max(minZ, this.homeZ - this.wanderRadius);
      maxZ = Math.min(maxZ, this.homeZ + this.wanderRadius);
    }
    if (maxX <= minX || maxZ <= minZ) return null;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const x = minX + Math.random() * (maxX - minX);
      const z = minZ + Math.random() * (maxZ - minZ);
      // 上面收的是方框，这里才是真的圆
      if (Math.hypot(x - this.homeX, z - this.homeZ) > this.wanderRadius) continue;
      if (!isWalkable(x, z, this.radius, this.petId)) continue;
      return [x, z];
    }
    return null;
  }

  /**
   * 往一个世界点走。**这是全场唯一的寻路入口**（玩家的自动跑腿走的是
   * 同一个 `findRoute`，只是半径不同）。
   *
   * 体型进参数之后，"太大过不去"就是 `findRoute` 返回 null——路根本
   * 排不出来，这只生物原地待着，不会走到门口顶着门框磨。调用方拿
   * false 当"这趟去不了"处理即可。
   *
   * `snapRings` 收得很紧（2 环 = 1 米）：给大家伙吸得远，等于把
   * "屋里那块地他进不去"偷偷改写成"那就走到屋外墙根站着"。
   */
  private startPathTo(x: number, z: number): boolean {
    const route = findRoute(
      { x: this.x, z: this.z },
      { x, z },
      { radius: this.radius, snapRings: 2 },
    );
    if (!route || route.length < 2) return false;

    this.path = route;
    this.pathIndex = 1;
    return true;
  }

  /**
   * 走到"离目标够近、而且这只生物**真站得进去**"的地方。
   *
   * 为什么不直接走目标点：目标往往落在**阻挡格**里（水槽在橱柜上、
   * 工地中心是要盖房子的地方），谁也站不进去。`reach` 表达的是
   * "凑到跟前就行"。
   *
   * 取样从近到远一圈圈来，每圈八个方位。原来是扫整张房间格表再排序，
   * 那既绑死了"只在这间屋里"，又在院子那种 2700 格的房间上做无谓的
   * 全表扫描。环形取样只关心目标附近那一小块，和房间多大无关。
   *
   * 每个候选点都要过 `isWalkable(..., this.radius, ...)`：**体型在这里
   * 第一次起作用**——大家伙够不到的地方直接不是候选。真一个都没有
   * （比如工地在屋里、他进不去），返回 false，调用方就当这活儿他干不了。
   */
  private seekNear(
    targetX: number,
    targetZ: number,
    reach: number,
    /**
     * 目标本身占多大（半径，米）。给了就**只在它外面找落脚点**——
     * 里面那几圈横竖站不下，试也是白试。
     */
    blockedRadius = 0,
  ): boolean {
    /*
     * ## 只在"站得下的那条环带"里采样
     *
     * 原来是从 0 到 reach 均分五圈。对一颗小摆件没问题，对一栋楼是灾难：
     * 狐狸家 3×3、reach = 半径 1.1 + 0.9 + 占地半宽 1.5 = 3.5，而他至少要
     * 站在 1.5 + 1.1 = 2.6 之外——**前三圈全在房子里**，真正可用的只有最外
     * 那一圈 8 个点。挡掉几个就整栋楼都去不了，而外面看到的只是
     * "石傀儡站着不动"。
     *
     * 现在从 `blockedRadius + 自己的半径` 起步、到 reach 为止均分，
     * 采样点全落在可能站得住的那条环带里；方向也从 8 加到 12，
     * 因为环带窄了，只能靠角度铺开。
     */
    const inner = blockedRadius > 0 ? blockedRadius + this.radius : 0;
    const RINGS = 4;
    const DIRECTIONS = 12;
    for (let ring = 0; ring <= RINGS; ring += 1) {
      const distance =
        inner >= reach
          ? // 环带被压没了（楼太大 / reach 太小）：退回只试最远那一圈
            reach
          : inner + ((reach - inner) * ring) / RINGS;
      // 目标点本身只在没有体积时才值得试一次
      const spokes = distance <= 0.01 ? 1 : DIRECTIONS;
      // 每圈错开半个扇区，免得所有圈的候选点排成几条直线
      const phase = (ring * Math.PI) / DIRECTIONS;
      for (let spoke = 0; spoke < spokes; spoke += 1) {
        const angle = phase + (spoke * Math.PI * 2) / spokes;
        const x = targetX + Math.cos(angle) * distance;
        const z = targetZ + Math.sin(angle) * distance;
        if (!isWalkable(x, z, this.radius, this.petId)) continue;
        if (this.startPathTo(x, z)) return true;
      }
    }
    return false;
  }

  /**
   * 前面暂时过不去：**先请对方让一让，还不行才原地等，等太久才放弃**。
   *
   * 原来只有"等 + 放弃"两档。那对门是对的（门会自己被推开），对生物
   * 不对：**挡路的那位没有任何理由挪开**。一只站在路口的史莱姆能让
   * 石傀儡等满 2.5 秒、然后把整个工地扔掉——而外面看到的只是
   * "石傀儡不来建造"（用户 2026-08-25 报的就是这个）。
   *
   * 所以中间插一档：认出挡路的是谁，请他让开。让路是**一次性动作**
   * 不是持续协商——请过的人进冷却，否则两只互相挡着的会一人一帧地
   * 请对方，谁都走不掉。
   */
  private waitBlocked(deltaSeconds: number): void {
    this.moving = false;
    this.blockedFor += deltaSeconds;

    if (this.blockedFor > 0.35 && this.pathIndex < this.path.length) {
      this.askBlockerToYield();
    }

    if (this.blockedFor > 2.5) {
      this.blockedFor = 0;
      this.clearPath();
      this.errand = null;
      this.state = "idle";
      this.idleTimer = 2 + Math.random() * 3;
    }
  }

  /**
   * 请挡在下一个路点上的那位让开。
   *
   * **不请玩家**：他自己会走，而且被 NPC 推着走很怪。也不请正在忙的
   * （吃、睡、干活）——那会把他从活里拽出来，代价比等一等大。
   */
  private askBlockerToYield(): void {
    const [tx, tz] = this.path[this.pathIndex];
    const who = creatureBlockingAt(tx, tz, this.radius * 0.85, this.petId);
    if (!who || who === PLAYER_OBSTACLE_ID) return;
    peerLookup?.(who)?.yieldAsideFrom(this.x, this.z);
  }

  /**
   * 有人要过，往旁边挪一步。
   *
   * 挪的方向是**背对来人**：他从哪边来，我就往反方向让。原地打转或者
   * 随便挑一边的话，有一半概率让到对方要去的方向上，等于没让。
   *
   * 挪的距离只有一步多（1.4 米）——让路是"侧身"不是"逃跑"，
   * 让完还在原地附近，玩家看着才像礼貌而不是受惊。
   */
  yieldAsideFrom(fromX: number, fromZ: number): void {
    // 冷却中、正忙着、或者本来就在走，都不打断
    if (this.yieldCooldown > 0) return;
    if (this.state === "work" || this.state === "eat" || this.state === "drink") return;
    if (this.state === "sleeping" || this.state === "hidden") return;
    if (this.pathIndex < this.path.length) return;

    const away = Math.atan2(this.x - fromX, this.z - fromZ);
    const STEP = 1.4;
    /*
     * 先试正背方向，不行就左右各偏 45°、90°。八个方向全试不到就算了
     * ——那说明他自己也被围着，让不出来。
     */
    for (const turn of [0, 0.79, -0.79, 1.57, -1.57, 2.36, -2.36, Math.PI]) {
      const angle = away + turn;
      const x = this.x + Math.sin(angle) * STEP;
      const z = this.z + Math.cos(angle) * STEP;
      if (!isWalkable(x, z, this.radius, this.petId)) continue;
      if (!this.startPathTo(x, z)) continue;
      this.state = "wander";
      this.errand = null;
      this.yieldCooldown = 3;
      emit("pet_changed", { petId: this.petId, reason: "yield" });
      return;
    }
  }

  private tickMove(deltaSeconds: number): void {
    const [tx, tz] = this.path[this.pathIndex];
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
      /*
       * ---- 门是**唯一**要在步进里查的静态物 ----
       *
       * 上面那条"静态障碍归 A*"对墙和家具成立，因为它们在规划和行走
       * 两个时刻是同一副样子。门不是：A* 是在"所有没锁的门都开着"的
       * 假设下规划的（withDoorsOpen），那个假设本身没错——一扇关着的
       * 门是"到了要开一下"的动作，不是障碍——但**没人兑现那个动作**。
       * 于是石傀儡照着路径径直穿门而过（2026-08-23 用户报的）。
       *
       * 兑现的方式是站着等：走到门板跟前停下，自动开门（tickDoors）
       * 看见有生物贴上来就把门推开，下一帧路就通了。等的这几帧复用
       * 被活物堵住那套——包括 2.5 秒还不通就放弃重打算，锁着的门
       * 就是这么脱身的。
       */
      if (doorGateBlocks(nextX, nextZ, this.radius)) {
        this.waitBlocked(deltaSeconds);
        return;
      }

      const squeeze = this.radius * 0.85;
      if (creatureBlockedAt(nextX, nextZ, squeeze, this.petId)) {
        this.waitBlocked(deltaSeconds);
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
