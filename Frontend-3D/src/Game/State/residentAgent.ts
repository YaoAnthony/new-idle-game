import {
  AffectionStage,
  COMMAND_SKILL_ID,
  CreatureRole,
  GiftTier,
  SKILL_DECIDE_INTERVAL_SECONDS,
  EXPRESSION_SECONDS,
  affectionFromSave,
  findExpression,
  moodSpeed,
  findItemDefinition,
  findResidentDefinition,
  findSkillPriority,
  navBoundsOf,
  type ResidentActivity,
  type ResidentKeyframe,
  type ResidentSave,
} from "core";
import { emit } from "../EventBus";
import {
  creatureBlockedAt,
  creatureBlockingAt,
  PLAYER_OBSTACLE_ID,
  doorGateBlocks,
  getCurrentMap,
  getCurrentMapId,
  getWorld,
  isWalkable,
  withPhasing,
  removeCreatureObstacle,
  setCreatureObstacle,
} from "./worldRuntime";
import { findRoute } from "../Systems/navigation";
import {
  isParallel,
  lastWalkIndex,
  toWire,
  type ActionStep,
  type FacingTarget,
  type Intent,
  type WireIntent,
} from "./actions";
import type { InteractOffer, ResidentEvent, Skill, SkillContext } from "./skills/types";

/**
 * 一只活物的**身体**（居民系统 01，2026-09-06 拆分）。
 *
 * 这个类只管三件事：
 *
 * 1. **物理与档案**：位置、朝向、碰撞体、寻路与走路、让路；饱食 / 水分的
 *    衰减、心情、成长；存档进出。
 * 2. **执行动词**（`actions.ts`）：把 Intent 里的 `walk_to` / `stand` / `sleep` /
 *    `work_at` … 逐个变成位置、计时器和对外的 `state`。
 * 3. **问技能**：闲下来时按优先级问一圈挂着的技能"想干什么"，第一个给出
 *    Intent 的赢；已经在做事时只有更高优先级、且当前允许打断的才能抢。
 *
 * 它**不认识任何具体身份**：这里不得出现 `if (role === Worker)`、`trySeekSite`、
 * `Golem` 这类字样——石傀儡去工地、wisp 找吃的、水獭开面板，全是技能
 * （`skills/`）的事；谁挂什么技能写在子类上（`residents/*.ts`）。`role` 字段
 * 还在，但只当标签用（客源名单、计数、`dormant` 的判据），不再分支行为。
 *
 * ## 一个基类，每种小动物一个子类
 *
 * 用户 2026-09-05 定的形状。子类只做三件事：声明挂哪些技能、覆盖少数钩子、
 * 给自己的技能传参数。子类里出现 `startPathTo` / `this.x =` 就是把行为写回了
 * 子类，退回基类或技能。（这条推翻了本文件原来"实例化不继承"的规矩——那条
 * 防的是"每加一只就复制一份状态机"，现在状态机在基类、行为在技能，
 * 子类只剩声明，那个风险不存在了。）
 *
 * ## 吃与喝的现实含义（沿用）
 *
 * - 饿了 → 找**地上扔着的**能吃的东西（尊重口味表，inedible 不碰）。
 * - 渴了 → 找带 WaterSource 能力的家具凑过去喝。
 * - 掉率故意很慢（默认 8/12 点每小时）：宠物是陪伴不是电子鸡。
 */

export type { ResidentActivity } from "core";

/** 心情的默认出厂值，也是老存档补默认的值 */
const DEFAULT_MOOD = 70;
const DEFAULT_HUNGER_PER_HOUR = 8;
const DEFAULT_THIRST_PER_HOUR = 12;
/** 睡觉时代谢放缓的倍率 */
const SLEEP_METABOLISM = 0.35;
/** `stand` 没给秒数时站多久 */
const DEFAULT_STAND_SECONDS = 2;

/**
 * 按 residentId 找同伴。**由 `residentsRuntime` 在启动时注入**，不在这里 import。
 * 反过来引会成环。只有"让路"用它：一只生物要请另一只挪开。
 */
let peerLookup: ((residentId: string) => ResidentAgent | undefined) | null = null;

export function setPeerLookup(
  lookup: (residentId: string) => ResidentAgent | undefined,
): void {
  peerLookup = lookup;
}

/**
 * `work_at` 这一步"到点没到、工地还在不在"由谁回答。**由 build 技能注入**，
 * 身体不 import 工地系统——同 peerLookup 的理由：方向写在明面上。
 */
export type WorkOutcome = "working" | "done" | "lost";
let workChecker: ((instanceId: string) => WorkOutcome) | null = null;

export function setWorkChecker(checker: (instanceId: string) => WorkOutcome): void {
  workChecker = checker;
}

/** 正在执行的动词的运行时状态（不进存档） */
type StepRun = {
  stepIndex: number;
  /** stand / sit / sleep 的剩余秒数 */
  timer: number;
  /** 这个 Intent 的 onArrive 已经调过（只调一次） */
  arrived: boolean;
};

export class ResidentAgent {
  /** 子类声明：这种小动物挂哪些技能（按 id，实现从 `skills/index` 查）。基类为空 */
  static skills: readonly string[] = [];
  /**
   * 子类声明：身上有哪些**可拆的零件**（石傀儡的 "head"）。零件不全 = 休眠，
   * 自己醒不过来。基类为空 = 没有零件这回事，永远不休眠。
   * 原来这条判据写的是 `role === Worker`——那是基类在认身份；改成子类声明后
   * 基类只问"齐不齐"。
   */
  static parts: readonly string[] = [];

  // ---- 身份 ----
  readonly residentId: string;
  readonly definitionId: string;

  // ---- 档案属性（全物种统一，进存档） ----
  nickname?: string;
  affectionStage = AffectionStage.Stranger;
  lastGiftWorldDayId?: string;
  /** 成长值：吃东西攒出来的。进化系统以后读它 */
  growth = 0;
  /** 心情 0~100：吃喝睡被照顾到就高，饿着渴着就往下走 */
  mood = DEFAULT_MOOD;
  /** 饱食 / 水分，满 100 */
  needs = { hunger: 80, thirst: 80 };

  // ---- 空间 ----
  x: number;
  z: number;
  heading: number;
  /** 碰撞半径。0 = 不挡路的小团子 */
  readonly radius: number;
  /**
   * 无视碰撞体积（`ResidentDefinition.ignoresObstacles`，今天只有石傀儡）。
   * 它看别人：`withPhasing` 包住每一次通行查询；别人看它：不登记成活物障碍。
   * 两边都要做——只做前者它会停在别人身上，那位就当场卡死。
   */
  readonly phasing: boolean;
  readonly speed: number;
  /**
   * 驻地：乱走的圆心，配 `wanderRadius`。进存档，不能读档时拿当时站的位置顶——
   * 那样每存读一次就朝溜达到的地方挪一次。
   */
  homeX: number;
  homeZ: number;
  readonly wanderRadius: number;

  // ---- 行为状态机（运行时，不进存档） ----
  /** 对外报的活动名。由正在执行的动词决定；没有动词时是 idle */
  state: ResidentActivity = "idle";
  moving = false;
  /** 剩下要走的**世界坐标**路点（拉过直的）。用例读它判"让路生效了没有" */
  path: Array<[number, number]> = [];
  pathIndex = 0;
  /** 闲着时离下一次问技能还有多久 */
  idleTimer = 2;
  /** 睡眠剩余（给旧代码 / 表现层看的镜像，真相在 `run.timer`） */
  sleepTimer = 0;
  /** 头顶正在说的话（`speak` 动词）。表现层读 */
  speech: { localizationKey: string; until: number } | null = null;
  /** 头顶正在做的表情（`showExpression`）。表现层读；关键帧带给木偶 */
  expression: { id: string; until: number } | null = null;

  // ---- 对话与记忆（居民系统 03）。前四个进存档，后两个是运行时 ----
  /** 记忆：只加不减。**只有剧情效果 add_memory 写** */
  readonly memories = new Set<string>();
  movedInDayId: string | undefined;
  lastTalkDayId: string | undefined;
  /** 今天聊了几次；和 lastTalkDayId 一起判（换了天就是 0） */
  talksToday = 0;
  /** 这个时段打过招呼了没（不进存档：读档后再打一次很自然） */
  lastGreetPhase: string | null = null;

  // ---- 好感与称呼（居民系统 04）。只有 Systems/residents/affection 的 gainAffection 加分 ----
  /** 隐藏的好感分，只增不减。`affectionStage` 由它推导后写回 */
  affection = 0;
  /** 他给你起的昵称（伙伴档那天抽的；玩家可改） */
  playerNickname: string | undefined;
  /** 玩家改过的口头禅；没改用池子里的 */
  catchphrase: string | undefined;
  /** 上次打招呼是哪天（"几天没人理"读它） */
  lastGreetDayId: string | undefined;
  /** 上一帧玩家在哪（onEvent 要给技能一个 ctx） */
  private lastPlayer: { x: number; z: number } = { x: 0, z: 0 };
  private observeCountdown = SKILL_DECIDE_INTERVAL_SECONDS;

  private blockedFor = 0;
  /** 刚被请着让过路，这段时间内不再被请第二次 */
  private yieldCooldown = 0;
  private decideCountdown = 0;

  private current: Intent | null = null;
  private run: StepRun | null = null;
  private clock = 0;
  /** 这只活过了多少秒（tick 累加）。技能做节流用（reactions 十秒一次） */
  get elapsedSeconds(): number {
    return this.clock;
  }

  /**
   * **木偶模式**（联机做客，01c）：运行时里装着的是房主的世界，这只活物的
   * 行为由房主决定。木偶不问技能、不衰减需求、不掷骰子，只执行网线送来的
   * Intent（`performWire`）和按关键帧纠偏（`applyKeyframe`）。
   */
  puppet = false;
  /** 关键帧纠偏中：0.3 秒内插到这个点 */
  private correction: { x: number; z: number; remaining: number } | null = null;

  /** 陪你的还是干活的。**只当标签用**，不分支行为 */
  readonly role: CreatureRole;
  /** 身上装了哪些零件。零件不全 = 休眠（`dormant`） */
  readonly attachedParts = new Set<string>();

  readonly sleepiness: number;
  readonly napSeconds: [number, number];
  private readonly hungerPerHour: number;
  private readonly thirstPerHour: number;

  /** 挂着的技能（按优先级降序）和开关。开关是运行时的，不进存档 */
  readonly skills: readonly Skill[];
  private readonly disabledSkills = new Set<string>();

  constructor(
    residentId: string,
    definitionId: string,
    at: { x: number; z: number; heading: number },
    skills: readonly Skill[],
  ) {
    this.residentId = residentId;
    this.definitionId = definitionId;
    this.x = at.x;
    this.z = at.z;
    this.heading = at.heading;

    // 性情在构造时从注册表展开一次，tick 是热路径，不再查表
    const definition = findResidentDefinition(definitionId);
    this.speed = definition?.behavior?.moveSpeed ?? 1.7;
    this.radius = definition?.collisionRadius ?? 0;
    this.phasing = definition?.ignoresObstacles ?? false;
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

    this.skills = [...skills].sort(
      (a, b) => priorityOf(b.id) - priorityOf(a.id),
    );

    // 挡路的活物从出现那一刻就要挡，等第一帧 tick 会被穿过去一次
    this.registerObstacle();
  }

  // ---- 生命周期 ----

  /** 从门口走进屋（首次登场过场）。走不进去就原地站着，不硬闯 */
  beginEntering(): void {
    const spot = this.randomFreeSpot();
    if (!spot) return;
    this.perform({
      skillId: "entering",
      priority: priorityOf(COMMAND_SKILL_ID),
      interruptible: false,
      steps: [{ verb: "walk_to", x: spot[0], z: spot[1], state: "entering" }],
      idleAfter: 1.5,
      onDone: () => {
        emit("resident_changed", { residentId: this.residentId, reason: "entered" });
        emit("story_signal", { kind: "resident_entered", subject: this.residentId });
      },
    });
  }

  /** 换驻地（居民搬进自己的房子）。只挪圆心不挪人，他会自己溜达过去 */
  rehome(x: number, z: number): void {
    this.homeX = x;
    this.homeZ = z;
  }

  dispose(): void {
    if (this.radius > 0) removeCreatureObstacle(this.residentId);
    this.abandonIntent();
  }

  // ---- 技能开关 ----

  isSkillEnabled(skillId: string): boolean {
    return !this.disabledSkills.has(skillId);
  }

  setSkillEnabled(skillId: string, enabled: boolean): void {
    if (enabled) this.disabledSkills.delete(skillId);
    else this.disabledSkills.add(skillId);
  }

  /** 正在做的事（只读视图）。指令 `/npc where` 和技能的 ctx 读它 */
  get currentIntent(): Intent | null {
    return this.current;
  }

  /** 正在执行第几步 */
  get currentStepIndex(): number {
    return this.run?.stepIndex ?? -1;
  }

  // ---- 执行动词 ----

  /**
   * 下达一个 Intent。**这是唯一的行为入口**：技能算出来的和 `/npc do` 下的
   * 走同一条路。返回 false = 没接受（正在做更重要的、或者当前不许打断）。
   *
   * 指令（`skillId === command`）无视 `interruptible`——调试口必须立刻生效。
   */
  perform(intent: Intent): boolean {
    if (this.current) {
      const isCommand = intent.skillId === COMMAND_SKILL_ID;
      const canPreempt =
        isCommand ||
        (intent.priority > this.current.priority && this.current.interruptible);
      if (!canPreempt) return false;
      this.abandonIntent();
    }

    this.start(intent);
    // 房主端：让联机层把这个 Intent 原样发给房客（木偶自己不发，否则回环）
    if (!this.puppet) {
      emit("resident_intent_started", { residentId: this.residentId, intent: toWire(intent) });
    }
    return true;
  }

  /**
   * 网线送来的 Intent（房客木偶）。无条件换上——木偶没有别的来源，不存在抢占。
   * 不发 `resident_intent_started`（那是房主的事）。
   */
  performWire(intent: WireIntent): void {
    if (this.current) this.abandonIntent();
    this.start({ ...intent, steps: [...intent.steps] });
  }

  private start(intent: Intent): void {
    this.current = intent;
    this.run = { stepIndex: -1, timer: 0, arrived: false };
    this.clearPath();
    this.advanceStep();
  }

  /** 并行槽动词（gesture / speak）：不排队，立刻发出 */
  performParallel(step: ActionStep): void {
    if (!isParallel(step)) {
      this.perform({
        skillId: COMMAND_SKILL_ID,
        priority: priorityOf(COMMAND_SKILL_ID),
        interruptible: false,
        steps: [step],
      });
      return;
    }
    this.fireParallel(step);
  }

  private fireParallel(step: ActionStep): void {
    if (step.verb === "gesture") {
      emit("resident_gesture", { residentId: this.residentId, gesture: step.gestureId });
    } else if (step.verb === "speak") {
      this.speech = {
        localizationKey: step.localizationKey,
        until: this.clock + (step.seconds ?? 3),
      };
      emit("resident_changed", { residentId: this.residentId, reason: "speak" });
    }
  }

  /** 当前 Intent 作废（被抢、走不到、目的没了）。onInterrupted 收尾，不调 onDone */
  private abandonIntent(): void {
    const intent = this.current;
    this.current = null;
    this.run = null;
    this.clearPath();
    intent?.onInterrupted?.(this);
    if (this.state !== "hidden") this.state = "idle";
  }

  /** 全部动词做完。onDone 结算，然后发呆 idleAfter 秒 */
  private completeIntent(): void {
    const intent = this.current;
    this.current = null;
    this.run = null;
    this.clearPath();
    this.moving = false;
    if (this.state !== "hidden") this.state = "idle";
    this.idleTimer = intent?.idleAfter ?? 1;
    intent?.onDone?.(this);
  }

  /** 进入下一个动词。并行槽的直接发出后继续；串行的设好状态等 tick */
  private advanceStep(): void {
    const intent = this.current;
    const run = this.run;
    if (!intent || !run) return;

    for (;;) {
      run.stepIndex += 1;
      if (run.stepIndex >= intent.steps.length) {
        this.completeIntent();
        return;
      }
      const step = intent.steps[run.stepIndex];

      if (isParallel(step)) {
        this.fireParallel(step);
        continue;
      }

      // 走到最后一个 walk_to 之后（needs 吃到一半）不再允许被抢
      if (intent.lockAfterLastWalk && run.stepIndex > lastWalkIndex(intent.steps)) {
        intent.interruptible = false;
      }

      if (this.enterStep(step, run)) return;
      // 进不去（走不到、坐不下）：整个 Intent 作废
      this.abandonIntent();
      this.idleTimer = 1;
      return;
    }
  }

  /** 开始执行一个串行动词。返回 false = 这一步做不了 */
  private enterStep(step: ActionStep, run: StepRun): boolean {
    switch (step.verb) {
      case "walk_to": {
        if (!this.startPathTo(step.x, step.z)) return false;
        this.state = step.state ?? "wander";
        return true;
      }
      case "stand": {
        this.state = step.state ?? "idle";
        run.timer = step.seconds ?? DEFAULT_STAND_SECONDS;
        if (step.facing !== undefined) this.face(step.facing);
        this.moving = false;
        return true;
      }
      case "sit": {
        this.state = "sitting";
        run.timer = step.seconds ?? Number.POSITIVE_INFINITY;
        if (step.facing !== undefined) this.face(step.facing);
        this.moving = false;
        return true;
      }
      case "sleep": {
        // 藏着（进了屋）的时候睡：人还是藏着——身子不能在门口露出来；窗灯读 isAtHome
        if (this.state !== "hidden") this.state = "sleeping";
        const [min, max] = this.napSeconds;
        run.timer = step.seconds ?? min + Math.random() * (max - min);
        this.sleepTimer = run.timer;
        this.moving = false;
        emit("resident_changed", { residentId: this.residentId, reason: "sleep" });
        return true;
      }
      case "hide": {
        this.state = "hidden";
        this.moving = false;
        if (this.radius > 0) removeCreatureObstacle(this.residentId);
        emit("resident_changed", { residentId: this.residentId, reason: "hide" });
        return true;
      }
      case "show": {
        this.state = "idle";
        this.registerObstacle();
        emit("resident_changed", { residentId: this.residentId, reason: "show" });
        return true;
      }
      case "work_at": {
        this.state = "work";
        this.moving = false;
        if (step.facing !== undefined) this.face(step.facing);
        emit("resident_changed", { residentId: this.residentId, reason: "work" });
        return true;
      }
      default:
        return false;
    }
  }

  private face(target: FacingTarget): void {
    this.heading =
      typeof target === "number"
        ? target
        : Math.atan2(target.x - this.x, target.z - this.z);
  }

  /** 每帧推进当前动词 */
  private tickStep(deltaSeconds: number): void {
    const intent = this.current;
    const run = this.run;
    if (!intent || !run) return;
    const step = intent.steps[run.stepIndex];
    if (!step) return;

    switch (step.verb) {
      case "walk_to": {
        if (this.pathIndex < this.path.length) {
          this.tickMove(deltaSeconds, step.speedScale ?? 1);
          return;
        }
        this.moving = false;
        // 到了最后一个 walk_to：改世界的那一下在这儿
        if (!run.arrived && run.stepIndex === lastWalkIndex(intent.steps)) {
          run.arrived = true;
          if (intent.onArrive && intent.onArrive(this) === false) {
            this.abandonIntent();
            this.idleTimer = 1;
            return;
          }
        }
        this.advanceStep();
        return;
      }
      case "stand":
      case "sit": {
        run.timer -= deltaSeconds;
        if (run.timer <= 0) this.advanceStep();
        return;
      }
      case "sleep": {
        // 零件不全的不会自己醒：它不是困了，是没启动
        if (this.dormant) return;
        run.timer -= deltaSeconds;
        this.sleepTimer = run.timer;
        if (run.timer <= 0) this.wakeUp();
        return;
      }
      case "work_at": {
        /*
         * 身体不知道"工地完工"是什么。build 技能在加载时注入一个检查函数
         * （同 peerLookup 的做法：方向写在明面上，不反向 import）。
         * 没注入（纯身体的测试）就一直干着。
         */
        const outcome = workChecker?.(step.instanceId) ?? "working";
        if (outcome !== "working") this.finishWorkStep(outcome);
        return;
      }
      case "hide":
      case "show":
        this.advanceStep();
        return;
      default:
        return;
    }
  }

  /**
   * `work_at` 这一步由外面（build 技能的每帧检查）宣告完成或失败。
   * 身体不知道"工地完工"是什么，只知道这一步结束了。
   */
  finishWorkStep(outcome: "done" | "lost"): void {
    const step = this.current?.steps[this.run?.stepIndex ?? -1];
    if (!step || step.verb !== "work_at") return;
    if (outcome === "lost") {
      this.abandonIntent();
      this.idleTimer = 1;
      return;
    }
    emit("resident_changed", { residentId: this.residentId, reason: "work_done" });
    this.advanceStep();
  }

  // ---- 调试口 ----

  /** 走没走在路上。用例读它判"让路生效了没有" */
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
  debugSetState(state: ResidentActivity): void {
    this.current = null;
    this.run = null;
    this.state = state;
    this.clearPath();
  }

  debugPlace(x: number, z: number): void {
    this.abandonIntent();
    this.x = x;
    this.z = z;
    this.state = "idle";
    this.idleTimer = 1.5;
    this.registerObstacle();
  }

  // ---- 睡 ----

  /** 剧情 / 指令让他睡下（无视正在做的事） */
  fallAsleep(): void {
    this.perform({
      skillId: COMMAND_SKILL_ID,
      priority: priorityOf(COMMAND_SKILL_ID),
      interruptible: true,
      steps: [{ verb: "sleep" }],
      idleAfter: 2 + Math.random() * 3,
    });
  }

  /** 在睡：露在外面睡（state）或藏在屋里睡（动词是 sleep、身子藏着） */
  get asleep(): boolean {
    if (this.state === "sleeping") return true;
    const step = this.current?.steps[this.run?.stepIndex ?? -1];
    return this.state === "hidden" && step?.verb === "sleep";
  }

  wakeUp(): void {
    // 零件不全的傀儡叫不醒。它不是在睡觉，是**没启动**
    if (this.dormant) return;
    if (!this.asleep) return;
    const step = this.current?.steps[this.run?.stepIndex ?? -1];
    if (step?.verb === "sleep") {
      // 醒来先愣一会儿再决定干什么——猫不会睁眼就走
      this.advanceStep();
    } else {
      this.state = "idle";
      this.idleTimer = 2 + Math.random() * 3;
    }
    emit("resident_changed", { residentId: this.residentId, reason: "wake" });
  }

  /** 这种动物声明的零件表（子类的 static） */
  private get parts(): readonly string[] {
    return (this.constructor as typeof ResidentAgent).parts;
  }

  /**
   * 零件缺着，动不了。和"睡着"是两回事：睡着的会自己醒，休眠的不会。
   * 没声明零件的物种永远不休眠。
   */
  get dormant(): boolean {
    return this.parts.some((part) => !this.attachedParts.has(part));
  }

  /** 装一个零件上去。装齐了就**自己醒过来** */
  attachPart(part: string): void {
    if (this.attachedParts.has(part)) return;
    this.attachedParts.add(part);
    emit("resident_changed", { residentId: this.residentId, reason: "part_attached" });
    if (!this.dormant && this.state === "sleeping") this.wakeUp();
  }

  // ---- 吃（地上捡的和玩家手递的都汇到这一条） ----

  feed(itemId: string, tier: GiftTier): void {
    const restore = findItemDefinition(itemId)?.food?.hungerRestore ?? 18;
    this.needs.hunger = Math.min(100, this.needs.hunger + restore);

    const moodBump =
      tier === GiftTier.Loved ? 12 : tier === GiftTier.Liked ? 6 : 2;
    this.mood = Math.min(100, this.mood + moodBump);
    this.growth += tier === GiftTier.Loved ? 2 : 1;

    emit("resident_changed", { residentId: this.residentId, reason: "eat" });
  }

  // ---- F 交互：问技能 ----

  /** 玩家按 F。第一个愿意回答的技能说了算；都不答 → null，调用方走默认对话 */
  interact(player: { x: number; z: number }): InteractOffer | null {
    const ctx = this.contextFor(player);
    for (const skill of this.skills) {
      if (!skill.interact || !this.isSkillEnabled(skill.id)) continue;
      const offer = skill.interact(ctx);
      if (offer) return offer;
    }
    return null;
  }

  // ---- 每帧 ----

  tick(deltaSeconds: number, player: { x: number; z: number }): void {
    this.clock += deltaSeconds;
    this.lastPlayer = player;
    if (this.speech && this.speech.until <= this.clock) this.speech = null;
    if (this.expression && this.expression.until <= this.clock) {
      this.expression = null;
      emit("resident_changed", { residentId: this.residentId, reason: "expression" });
    }
    if (this.state === "hidden") {
      /*
       * 藏起来的（在屋里）不占格、不衰减、不走路，但**动词照样推进、技能照样问**——
       * 不然 `hide` 之后永远没人能让他 `show`（02 的回家 / 出门靠这个）。
       */
      if (this.current) {
        this.tickStep(deltaSeconds);
      } else if (!this.puppet) {
        this.idleTimer -= deltaSeconds;
        if (this.idleTimer <= 0 && !this.consultSkills(player)) {
          this.idleTimer = 3 + Math.random() * 5;
        }
      }
      return;
    }
    this.phased(() => this.tickInner(deltaSeconds, player));
  }

  private tickInner(deltaSeconds: number, player: { x: number; z: number }): void {
    this.registerObstacle();

    if (this.yieldCooldown > 0) this.yieldCooldown -= deltaSeconds;
    if (!this.puppet) {
      this.decayNeeds(deltaSeconds);
      this.driftMood(deltaSeconds);
    }
    this.tickCorrection(deltaSeconds);

    // 并行槽技能（greet）每半秒看一眼，不管手上有没有事、不看优先级
    if (!this.puppet) {
      this.observeCountdown -= deltaSeconds;
      if (this.observeCountdown <= 0) {
        this.observeCountdown = SKILL_DECIDE_INTERVAL_SECONDS;
        this.observeSkills(player);
      }
    }

    if (this.current) {
      this.tickStep(deltaSeconds);
      if (this.puppet) return;
      // 做着事也定期问一圈：有更要紧的（饿了、有活了）就抢过来
      this.decideCountdown -= deltaSeconds;
      if (this.decideCountdown <= 0) {
        this.decideCountdown = SKILL_DECIDE_INTERVAL_SECONDS;
        if (this.current?.interruptible) this.consultSkills(player);
      }
      return;
    }

    this.moving = false;
    if (this.puppet) return;
    this.idleTimer -= deltaSeconds;
    if (this.idleTimer > 0) return;

    if (!this.consultSkills(player)) {
      // 没人想干什么：过几秒再问
      this.idleTimer = 3 + Math.random() * 5;
    }
  }

  // ---- 联机：关键帧 ----

  /** 此刻的关键帧（房主每 0.5 秒发一次有变化的） */
  keyframe(): ResidentKeyframe {
    const step = this.current?.steps[this.run?.stepIndex ?? -1];
    return {
      id: this.residentId,
      x: this.x,
      z: this.z,
      heading: this.heading,
      verb: step && !isParallel(step) ? step.verb : null,
      flavor: step?.verb === "stand" ? step.flavor : undefined,
      hidden: this.state === "hidden",
      expression: this.expression?.id,
      speaking: this.speech?.localizationKey,
    };
  }

  /**
   * 房客按房主的关键帧纠偏：偏差 < 0.6 m 忽略（两端寻路格子略有差异是正常的）；
   * 0.6~3 m 用 0.3 秒插过去；> 3 m 直接放。动词不一致就切——房主在睡，
   * 木偶还站着，就让它睡下。
   */
  applyKeyframe(frame: ResidentKeyframe): void {
    if (!Number.isFinite(frame.x) || !Number.isFinite(frame.z)) return;
    const distance = Math.hypot(frame.x - this.x, frame.z - this.z);
    if (distance > 3) {
      this.x = frame.x;
      this.z = frame.z;
      this.heading = frame.heading;
      this.correction = null;
      this.clearPath();
      this.registerObstacle();
    } else if (distance >= 0.6) {
      this.correction = { x: frame.x, z: frame.z, remaining: 0.3 };
    }

    // 表情跟着房主（03）：房客看得见他在做什么表情，台词第一版不同步（那是对着房主说的）
    if (frame.expression && frame.expression !== this.expression?.id) this.showExpression(frame.expression);

    const hidden = this.state === "hidden";
    if (frame.hidden !== hidden) {
      this.performWire({ skillId: "keyframe", priority: 0, interruptible: true, steps: [{ verb: frame.hidden ? "hide" : "show" }] });
      return;
    }
    const step = this.current?.steps[this.run?.stepIndex ?? -1];
    const verb = step && !isParallel(step) ? step.verb : null;
    if (frame.verb === verb) return;
    if (frame.verb === "sleep" || frame.verb === "sit" || frame.verb === "stand") {
      this.performWire({
        skillId: "keyframe",
        priority: 0,
        interruptible: true,
        steps: [frame.verb === "sleep"
          ? { verb: "sleep", seconds: 3600 }
          : frame.verb === "sit"
            ? { verb: "sit", facing: frame.heading }
            : { verb: "stand", seconds: 3600, facing: frame.heading, flavor: frame.flavor, state: frame.flavor === "eating" ? "eat" : frame.flavor === "drinking" ? "drink" : undefined }],
      });
    } else if (frame.verb === null && this.current) {
      this.abandonIntent();
    }
  }

  private tickCorrection(deltaSeconds: number): void {
    const c = this.correction;
    if (!c) return;
    const t = Math.min(1, deltaSeconds / Math.max(c.remaining, 1e-3));
    this.x += (c.x - this.x) * t;
    this.z += (c.z - this.z) * t;
    c.remaining -= deltaSeconds;
    if (c.remaining <= 0) {
      this.x = c.x;
      this.z = c.z;
      this.correction = null;
    }
  }

  private contextFor(player: { x: number; z: number }): SkillContext {
    return { agent: this, player, current: this.current };
  }

  /**
   * 按优先级问一圈。已经在做事时只问比它优先级高的。
   * 返回 true = 有技能接手了。
   */
  private consultSkills(player: { x: number; z: number }): boolean {
    const ctx = this.contextFor(player);
    const hidden = this.state === "hidden";
    for (const skill of this.skills) {
      if (!skill.decide || !this.isSkillEnabled(skill.id)) continue;
      // 藏着的时候只问声明过"藏着也管"的技能，别让 wander 把人拉出去
      if (hidden && !skill.worksWhileHidden) continue;
      if (this.current && priorityOf(skill.id) <= this.current.priority) break;
      const intent = skill.decide(ctx);
      if (intent && this.perform(intent)) return true;
    }
    return false;
  }

  /** 问一遍所有实现了 `observe` 的技能（并行槽）。藏着时只问声明过的 */
  private observeSkills(player: { x: number; z: number }): void {
    const ctx = this.contextFor(player);
    const hidden = this.state === "hidden";
    for (const skill of this.skills) {
      if (!skill.observe || !this.isSkillEnabled(skill.id)) continue;
      if (hidden && !skill.worksWhileHidden) continue;
      skill.observe(ctx);
    }
  }

  /** 世界里发生了什么，告诉挂了 `onEvent` 的技能（reactions）。木偶不管 */
  notify(event: ResidentEvent): void {
    if (this.puppet) return;
    const ctx = this.contextFor(this.lastPlayer);
    for (const skill of this.skills) {
      if (!skill.onEvent || !this.isSkillEnabled(skill.id)) continue;
      skill.onEvent(ctx, event);
    }
  }

  // ---- 对话与记忆（居民系统 03） ----

  /** 往嘴上放一句（并行槽，不打断手里的事） */
  say(localizationKey: string, seconds?: number): void {
    this.performParallel({ verb: "speak", localizationKey, seconds });
  }

  /** 做个表情：头顶冒图标；表情表里有动作的顺手播（造型没实现就只冒图标） */
  showExpression(id: string, seconds = EXPRESSION_SECONDS): void {
    this.expression = { id, until: this.clock + seconds };
    const gesture = findExpression(id)?.gesture;
    if (gesture) emit("resident_gesture", { residentId: this.residentId, gesture });
    emit("resident_changed", { residentId: this.residentId, reason: "expression" });
  }

  /** 记一件事。已经记得就 no-op。**只给剧情效果 add_memory 调** */
  remember(memoryId: string): boolean {
    if (this.memories.has(memoryId)) return false;
    this.memories.add(memoryId);
    return true;
  }

  forget(memoryId: string): boolean {
    return this.memories.delete(memoryId);
  }

  /** 今天聊了几次。换了天就是 0 */
  talksOn(worldDayId: string): number {
    return this.lastTalkDayId === worldDayId ? this.talksToday : 0;
  }

  /** 按 F 聊了一次 */
  noteTalk(worldDayId: string): void {
    this.talksToday = this.talksOn(worldDayId) + 1;
    this.lastTalkDayId = worldDayId;
  }

  resetTalks(): void {
    this.talksToday = 0;
    this.lastTalkDayId = undefined;
    this.lastGreetPhase = null;
  }

  /** 撤掉正在执行的指令 Intent（对话关掉后不用再面向玩家站着） */
  cancelCommand(): void {
    if (this.current?.skillId !== COMMAND_SKILL_ID) return;
    this.abandonIntent();
    this.idleTimer = 0.5;
  }

  // ---- 需求与心情 ----

  private decayNeeds(deltaSeconds: number): void {
    const metabolism = this.state === "sleeping" ? SLEEP_METABOLISM : 1;
    const hours = (deltaSeconds / 3600) * metabolism;
    this.needs.hunger = Math.max(0, this.needs.hunger - this.hungerPerHour * hours);
    this.needs.thirst = Math.max(0, this.needs.thirst - this.thirstPerHour * hours);
  }

  /** 心情朝需求算出的目标漂：一顿好饭高兴一阵子，日子过得好不好才决定长期心情 */
  private driftMood(deltaSeconds: number): void {
    const worst = Math.min(this.needs.hunger, this.needs.thirst);
    const target = worst < 20 ? 25 : worst >= 60 ? 85 : 55;
    this.mood += (target - this.mood) * Math.min(1, deltaSeconds * 0.02);
  }

  // ---- 寻路与移动（所有物种共用，体型由 radius 表达） ----

  /**
   * 把自己登记成活物障碍。**穿行的不登记**——单向穿行会让它变成一堵
   * 会走路的幽灵墙。
   */
  private registerObstacle(): void {
    if (this.radius <= 0 || this.phasing) return;
    setCreatureObstacle(this.residentId, this.x, this.z, this.radius);
  }

  /** 在自己的通行规则下跑一段。穿行的角色包一层 `withPhasing` */
  private phased<T>(fn: () => T): T {
    return this.phasing ? withPhasing(fn) : fn();
  }

  private clearPath(): void {
    this.path = [];
    this.pathIndex = 0;
    this.moving = false;
  }

  /**
   * 驻地附近随便挑一个**站得进去**的世界点。技能（wander / entering）用。
   *
   * 抽样范围先收到驻地圆里，不全图均匀抽：院子 60×45，5 米半径的圆只占
   * 不到 3%，均匀抽 24 次有一半机会一个都中不了。判据只有
   * `isWalkable(..., this.radius, this.residentId)` 一条——它就是玩家走路用的那条。
   */
  randomFreeSpot(radiusOverride?: number): [number, number] | null {
    const wanderRadius = radiusOverride ?? this.wanderRadius;
    return this.phased(() => {
      const map = getCurrentMap();
      const bounds = navBoundsOf(map, getWorld().room.floorGrid);
      let minX = bounds.minX + this.radius;
      let maxX = bounds.maxX - this.radius;
      let minZ = bounds.minZ + this.radius;
      let maxZ = bounds.maxZ - this.radius;
      if (Number.isFinite(wanderRadius)) {
        minX = Math.max(minX, this.homeX - wanderRadius);
        maxX = Math.min(maxX, this.homeX + wanderRadius);
        minZ = Math.max(minZ, this.homeZ - wanderRadius);
        maxZ = Math.min(maxZ, this.homeZ + wanderRadius);
      }
      if (maxX <= minX || maxZ <= minZ) return null;

      for (let attempt = 0; attempt < 24; attempt += 1) {
        const x = minX + Math.random() * (maxX - minX);
        const z = minZ + Math.random() * (maxZ - minZ);
        // 上面收的是方框，这里才是真的圆
        if (Math.hypot(x - this.homeX, z - this.homeZ) > wanderRadius) continue;
        if (!isWalkable(x, z, this.radius, this.residentId)) continue;
        return [x, z];
      }
      return null;
    });
  }

  /**
   * 在目标附近找一个"离得够近、而且这只生物**真站得进去、真走得到**"的落脚点。
   * 技能用它把"凑到工地 / 食物跟前"解析成一个确切坐标，再写进 `walk_to`。
   *
   * 目标往往落在阻挡格里（水槽在橱柜上、工地中心是要盖房子的地方），
   * 所以只在 `blockedRadius + 自己的半径` 到 `reach` 这条环带里采样，
   * 每圈 12 个方位、每圈错开半个扇区。每个候选点都真排一次路——
   * 只有真排一次才知道过不过得去。**不改自己的路径**（排完撤掉）。
   */
  findSpotNear(
    targetX: number,
    targetZ: number,
    reach: number,
    blockedRadius = 0,
  ): { x: number; z: number } | null {
    return this.phased(() => {
      const inner = blockedRadius > 0 ? blockedRadius + this.radius : 0;
      const RINGS = 4;
      const DIRECTIONS = 12;
      for (let ring = 0; ring <= RINGS; ring += 1) {
        const distance =
          inner >= reach ? reach : inner + ((reach - inner) * ring) / RINGS;
        const spokes = distance <= 0.01 ? 1 : DIRECTIONS;
        const phase = (ring * Math.PI) / DIRECTIONS;
        for (let spoke = 0; spoke < spokes; spoke += 1) {
          const angle = phase + (spoke * Math.PI * 2) / spokes;
          const x = targetX + Math.cos(angle) * distance;
          const z = targetZ + Math.sin(angle) * distance;
          if (!isWalkable(x, z, this.radius, this.residentId)) continue;
          if (this.routeTo(x, z)) return { x, z };
        }
      }
      return null;
    });
  }

  /** 排一条路但不走。`findSpotNear` 和 diagnose 用 */
  routeTo(x: number, z: number): Array<[number, number]> | null {
    const route = findRoute(
      { x: this.x, z: this.z },
      { x, z },
      { radius: this.radius, snapRings: 2, phasing: this.phasing },
    );
    return route && route.length >= 2 ? route : null;
  }

  /**
   * 往一个世界点走。**这是全场唯一的寻路入口**。体型进参数之后，"太大过不去"
   * 就是 `findRoute` 返回 null——这只生物原地待着，不会走到门口顶着门框磨。
   * `snapRings` 收得很紧（2 环 = 1 米）：给大家伙吸得远，等于把"屋里那块地
   * 他进不去"偷偷改写成"那就走到屋外墙根站着"。
   */
  private startPathTo(x: number, z: number): boolean {
    const route = this.routeTo(x, z);
    if (!route) return false;
    this.path = route;
    this.pathIndex = 1;
    return true;
  }

  /**
   * 前面暂时过不去：**先请对方让一让，还不行才原地等，等太久才放弃**。
   * 让路是一次性动作不是持续协商——请过的人进冷却。
   */
  private waitBlocked(deltaSeconds: number): void {
    this.moving = false;
    this.blockedFor += deltaSeconds;

    if (this.blockedFor > 0.35 && this.pathIndex < this.path.length) {
      this.askBlockerToYield();
    }

    if (this.blockedFor > 2.5) {
      this.blockedFor = 0;
      this.abandonIntent();
      this.idleTimer = 2 + Math.random() * 3;
    }
  }

  /** 请挡在下一个路点上的那位让开。不请玩家，也不请正在忙的 */
  private askBlockerToYield(): void {
    const [tx, tz] = this.path[this.pathIndex];
    const who = creatureBlockingAt(tx, tz, this.radius * 0.85, this.residentId);
    if (!who || who === PLAYER_OBSTACLE_ID) return;
    peerLookup?.(who)?.yieldAsideFrom(this.x, this.z);
  }

  /**
   * 有人要过，往旁边挪一步。方向是**背对来人**；距离只有一步多（1.4 米）——
   * 让路是"侧身"不是"逃跑"。
   */
  yieldAsideFrom(fromX: number, fromZ: number): void {
    this.phased(() => this.yieldAsideFromInner(fromX, fromZ));
  }

  private yieldAsideFromInner(fromX: number, fromZ: number): void {
    // 冷却中、正忙着、或者本来就在走，都不打断
    if (this.yieldCooldown > 0) return;
    if (this.state === "work" || this.state === "eat" || this.state === "drink") return;
    if (this.state === "sleeping" || this.state === "hidden") return;
    if (this.pathIndex < this.path.length) return;

    const away = Math.atan2(this.x - fromX, this.z - fromZ);
    const STEP = 1.4;
    // 先试正背方向，不行就左右各偏 45°、90°。八个方向全试不到就算了
    for (const turn of [0, 0.79, -0.79, 1.57, -1.57, 2.36, -2.36, Math.PI]) {
      const angle = away + turn;
      const x = this.x + Math.sin(angle) * STEP;
      const z = this.z + Math.cos(angle) * STEP;
      if (!isWalkable(x, z, this.radius, this.residentId)) continue;
      if (!this.routeTo(x, z)) continue;
      this.yieldCooldown = 3;
      this.perform({
        skillId: "yield",
        priority: priorityOf("nap"),
        interruptible: true,
        steps: [{ verb: "walk_to", x, z }],
      });
      emit("resident_changed", { residentId: this.residentId, reason: "yield" });
      return;
    }
  }

  private tickMove(deltaSeconds: number, speedScale: number): void {
    const [tx, tz] = this.path[this.pathIndex];
    const dx = tx - this.x;
    const dz = tz - this.z;
    const distance = Math.hypot(dx, dz);
    this.moving = true;

    if (distance < 0.06) {
      this.pathIndex += 1;
      return;
    }

    // 04：心情影响步子——低落慢一点，高兴轻快一点（纯表现，数字在 moodTuning）
    const step = Math.min(this.speed * speedScale * moodSpeed(this.mood) * deltaSeconds, distance);
    const nextX = this.x + (dx / distance) * step;
    const nextZ = this.z + (dz / distance) * step;

    if (this.radius > 0) {
      /*
       * 步进只查**活物**和**门**。静态的墙和家具归 A*——重复查会在两格心之间
       * 的线段中点误杀。门是唯一要在步进里查的静态物：A* 假设没锁的门都开着，
       * 兑现那个假设的方式是走到门板跟前站着等，自动开门看见有生物贴上来就推开。
       * 被活物挡就**原地等**：玩家走开自然继续；等太久才放弃重打算。
       */
      if (doorGateBlocks(nextX, nextZ, this.radius)) {
        this.waitBlocked(deltaSeconds);
        return;
      }
      const squeeze = this.radius * 0.85;
      if (!this.phasing && creatureBlockedAt(nextX, nextZ, squeeze, this.residentId)) {
        this.waitBlocked(deltaSeconds);
        return;
      }
      this.blockedFor = 0;
    }
    this.x = nextX;
    this.z = nextZ;

    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - this.heading;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * Math.min(1, deltaSeconds * 10);
  }

  // ---- 存档 ----

  toSave(roomId: string): ResidentSave {
    return {
      residentId: this.residentId,
      definitionId: this.definitionId,
      roomId,
      position: {
        mapId: getCurrentMapId(),
        x: this.x,
        y: this.z,
        // v19 起存连续弧度
        heading: this.heading,
      },
      affectionStage: this.affectionStage,
      growth: this.growth,
      needs: { ...this.needs },
      mood: this.mood,
      nickname: this.nickname,
      lastGiftWorldDayId: this.lastGiftWorldDayId,
      home: { x: this.homeX, z: this.homeZ },
      // 03：记忆 / 搬来 / 上次聊 / 今天聊了几次。空的不写，和 sleeping 同一个理由
      memories: this.memories.size > 0 ? [...this.memories] : undefined,
      movedInDayId: this.movedInDayId,
      lastTalkDayId: this.lastTalkDayId,
      talksToday: this.talksToday > 0 ? this.talksToday : undefined,
      // 04：好感分永远写（老档没有的迁移时按档位补）；昵称 / 口头禅 / 招呼日没有就不写
      affection: this.affection,
      playerNickname: this.playerNickname,
      catchphrase: this.catchphrase,
      lastGreetDayId: this.lastGreetDayId,
      // undefined 而不是 false：醒着是默认态，别往每份存档里写一排 false
      sleeping: this.state === "sleeping" ? true : undefined,
      // 同理：没有零件概念的物种不写这个字段
      attachedParts: this.parts.length > 0 ? [...this.attachedParts] : undefined,
    };
  }

  /** 从存档回填档案。构造由工厂（`residents/index`）负责，这里只填字段 */
  applySave(entry: ResidentSave): void {
    // 驻地：老存档没有就用读档位置兜底
    if (entry.home) {
      this.homeX = entry.home.x;
      this.homeZ = entry.home.z;
    }
    this.affectionStage = entry.affectionStage;
    this.nickname = entry.nickname;
    this.lastGiftWorldDayId = entry.lastGiftWorldDayId;
    this.growth = entry.growth ?? 0;
    this.mood = entry.mood ?? DEFAULT_MOOD;
    this.memories.clear();
    for (const memory of entry.memories ?? []) this.memories.add(memory);
    this.movedInDayId = entry.movedInDayId;
    this.lastTalkDayId = entry.lastTalkDayId;
    this.talksToday = entry.talksToday ?? 0;
    // 04：老档没分 → 按当前档位的下限补（和迁移 v39 同一个函数）
    this.affection = affectionFromSave(entry.affection, entry.affectionStage);
    this.playerNickname = entry.playerNickname;
    this.catchphrase = entry.catchphrase;
    this.lastGreetDayId = entry.lastGreetDayId;
    this.needs = {
      hunger: entry.needs?.hunger ?? 80,
      thirst: entry.needs?.thirst ?? 80,
    };

    /*
     * 零件：**老存档没有这个字段 → 按齐全算**。有零件的物种存档一定写了它；
     * 没有的物种也不能因为字段缺失被判成"缺零件"集体瘫掉。
     */
    if (entry.attachedParts) {
      for (const part of entry.attachedParts) this.attachedParts.add(part);
    } else {
      for (const part of this.parts) this.attachedParts.add(part);
    }

    // 存盘时睡着的接着睡（时长重掷）。读档不重放"从门口进来"的登场
    if (entry.sleeping) {
      this.fallAsleep();
    } else {
      this.idleTimer = 1 + Math.random() * 3;
    }
  }
}

/** 技能 id → 优先级。表里没有的（yield / entering 这种内部 Intent）按给的数 */
export function priorityOf(skillId: string): number {
  return findSkillPriority(skillId)?.priority ?? 0;
}
