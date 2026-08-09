import { GestureKind, Locomotion, type PoseId } from "core";
import { MathUtils } from "three";
import { getHeld } from "../../Game/State/heldItem";
import {
  LOCAL_PLAYER_ID,
  emitParticipantGesture,
  getLocalTransform,
  setLocalAppearance,
  setLocalTransform,
} from "../../Game/State/participants";
import {
  PLAYER_OBSTACLE_ID,
  groundHeightAt,
  isWalkable,
  setActorFootprint,
} from "../../Game/State/worldRuntime";
import { DEFAULT_POSTURE, isSupportedPosture } from "../Visual/poses.js";
import type { CharacterRig } from "../World/CharacterView";
import { animateCharacter, applyPose } from "../World/CharacterView";

/**
 * WASD 移动。方向相对相机档位（按屏幕方向走，动森一样），
 * 碰撞是圆形碰撞体压格检测，撞墙时按轴分离滑动而不是卡死。
 */

const SPEED = 3.1;

/**
 * 跑步倍率。1.75 不是随手定的：再高在 24×20 的屋里从这头到那头不到 3 秒，
 * 家具之间的间隙也来不及躲；治愈类的"跑"是省掉长距离的枯燥，
 * 不是竞速。走 3.1 / 跑 5.4，差别一眼看得出来又不失控。
 */
const RUN_MULTIPLIER = 1.75;

const RADIUS = 0.32;

/**
 * 跳跃是纯装饰：不改碰撞体、不改交互距离、不能用来够到平时够不到的地方。
 * 起跳冲量和重力配出「apex ≈0.42m、全程 ≈0.5s」这个手感——数字不是拍脑袋，
 * 是反解出来的：定了想要的顶点高度和滞空时长，用运动学公式倒推
 * v0 = g·t/2、h = v0²/(2g) 算出这两个常量，再取整。
 */
const JUMP_IMPULSE = 3.3;
const JUMP_GRAVITY = 13;

/**
 * 一步能迈多高（世界单位）。缘侧台面 0.4，所以走过去就上去了。
 *
 * **上台阶不靠跳**，这是顺着上面那条"跳跃是纯装饰、不能用来够到
 * 平时够不到的地方"来的：能不能上去必须是走位决定的，一旦要靠跳，
 * 跳跃就从装饰变成了机制，那条约束就破了。现实里缘侧也是抬腿迈上去的，
 * 0.4 米正是"能自然坐下再站起来"的高度（见 Core 的 OutdoorDeck 注释）。
 *
 * 0.55 留了余量：以后真有 0.5 的台子也迈得上，1 米的挡土墙仍然上不去。
 */
const MAX_STEP_UP = 0.55;

/**
 * 落脚面的跟随速度（一阶趋近的系数）。约 0.1 秒走完 0.4 的台阶——
 * 快到不像在坐电梯，又慢到能看出"迈上去"这个动作。
 */
const GROUND_FOLLOW = 22;

export class CharacterController {
  private readonly keys = new Set<string>();
  private walkPhase = 0;
  private elapsed = 0;
  private headingAngle = 0;

  /**
   * 世界坐标。**权威在 `Game/State/participants`**，这里是它的工作副本：
   * 每帧算完写回去（`setLocalTransform`），构造时从那边读初值。
   *
   * 为什么不直接读写那边的对象：移动这段一帧要读写 x/z 十几次
   * （轴分离碰撞、朝向插值），每次都穿过一层函数调用不值得；
   * 而"一帧结束时两边一致"对存档和联机来说已经足够。
   */
  x: number;
  z: number;

  /**
   * 根节点的离地高度。站着是 0；坐下 / 躺下时由 resting 系统抬到
   * `锚点承托面 - HIP_HEIGHT`，胯部就正好落在椅面上。
   */
  supportY = 0;

  /**
   * 跳跃的竖直位移（叠加在 supportY 上）和当前竖直速度。
   * 只有站着才能起跳——坐着躺着时 posture 已经不让走了，跳跃同理挡在
   * 触发那一刻，不需要在这两个字段上另外判断。
   */
  private jumpHeight = 0;
  private jumpVelocity = 0;
  private airborne = false;
  /** 按下空格那一帧记一下，下一次 update() 消费掉（编辑框里打字时不算，见 onKeyDown） */
  private jumpRequested = false;

  /** 过场 / 对话期间锁输入 */
  enabled = true;

  /** 当前朝向（弧度，从 +z 轴转向 +x）。肩后相机用它决定该转到哪 */
  get heading(): number {
    return this.headingAngle;
  }

  /** 根节点实际渲染的离地高度：承托面 + 跳跃位移。调试查看用 */
  get renderedY(): number {
    return this.supportY + this.jumpHeight;
  }

  /**
   * 姿态层：站 / 坐 / 盘腿 / 躺。坐着躺着时移动输入被忽略（要先起身）。
   * 具体摆成什么样查 Visual/poses 的注册表，这里只记 id。
   */
  posture: PoseId = DEFAULT_POSTURE;

  /** 活动层：伏案写字等。可以和任意姿态叠加——「坐着学习」就是 sit + desk */
  activity: PoseId | null = null;

  /** 上一帧推给 appearance 的姿势。只用来做变化检测，见 update 末尾 */
  private lastPosture: PoseId | null = null;
  private lastActivity: PoseId | null = null;

  /** 脚本寻路：沿格子路径走（行动开始时走到桌边） */
  private scriptedPath: Array<[number, number]> = [];
  private scriptedIndex = 0;
  private onScriptedArrive: (() => void) | null = null;

  constructor(private readonly rig: CharacterRig) {
    // 读档时位置已经灌进 participants 了（hydrate 在 GameView 挂载之前跑），
    // 新游戏则拿到出生点。开局站哪不再是这一层的事
    const { x, z, heading } = getLocalTransform();
    this.x = x;
    this.z = z;
    this.headingAngle = heading;
    rig.root.position.set(this.x, 0, this.z);
  }

  teleport(x: number, z: number): void {
    this.x = x;
    this.z = z;
    // 传送不该带着半空中的动量落到新地方
    this.airborne = false;
    this.jumpVelocity = 0;
    this.jumpHeight = 0;
    // 直接站到目的地的地面上，不是站到 y=0：传到院子里再从地板高度
    // 落下来会看到一下明显的下沉（世界里不再只有一个地面了）
    this.supportY = groundHeightAt(x, z);
    this.rig.root.position.set(x, this.supportY, z);
    setLocalTransform(x, z, this.headingAngle);
  }

  /** 沿世界坐标点列走过去，到达后回调。期间输入被忽略 */
  walkAlong(points: Array<[number, number]>, onArrive: () => void): void {
    this.scriptedPath = points;
    this.scriptedIndex = 0;
    this.onScriptedArrive = onArrive;
    // 脚本寻路（比如走到桌边坐下）不该顶着一截没落地的跳跃位移开始
    this.airborne = false;
    this.jumpVelocity = 0;
    this.jumpHeight = 0;
  }

  cancelScriptedWalk(): void {
    this.scriptedPath = [];
    this.scriptedIndex = 0;
    this.onScriptedArrive = null;
  }

  /** 面向某个世界坐标（坐下后朝向桌子） */
  faceToward(x: number, z: number): void {
    this.headingAngle = Math.atan2(x - this.x, z - this.z);
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
    const key = event.key.toLowerCase();
    this.keys.add(key);

    /*
     * `event.repeat` 是浏览器原生的"这是不是按住不放触发的自动重复"标记——
     * 用它做边沿检测比自己记一个"上一帧按没按"更准，不会因为渲染帧和
     * 按键事件不同步而漏判或多判。按住空格不会连续起跳，跳一次要落地
     * 再按一次；空格默认还会翻页/点中当前聚焦的按钮，一并按掉。
     */
    if (key === " " && !event.repeat) {
      event.preventDefault();
      this.jumpRequested = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };

  /**
   * 摇杆推的方向（各轴 -1~1，和 WASD 同一套语义：z 为负是往前）。
   *
   * **和键盘并存、取绝对值大的那个**，不是二选一也不是相加：
   * - 相加的话，同时按 W 和把摇杆推到底会得到 2，人物瞬间加速一倍
   * - 二选一要判"现在是哪种输入设备"，而二合一设备上这个判断没有正确答案
   * 取绝对值大的既保证了单独用任一种都是满速，也让两种输入自然共存。
   */
  private externalX = 0;
  private externalZ = 0;

  /** 摇杆每帧写这里。松手传 (0, 0) */
  setExternalMove(x: number, z: number): void {
    this.externalX = x;
    this.externalZ = z;
  }

  attach(): () => void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    return () => {
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("keyup", this.onKeyUp);
    };
  }

  /** cameraAzimuthDegrees：相机当前方位角，让 W 永远是"屏幕上方" */
  update(deltaSeconds: number, cameraAzimuthDegrees: number): void {
    this.elapsed += deltaSeconds;

    /*
     * 在脚本寻路的早退之前就把这一帧的跳跃请求消费掉：不消费的话，
     * 剧情正在走路（比如坐下前那几步）时按的空格会一直挂在
     * jumpRequested 上，等剧情结束的第一帧突然蹦一下——一个和玩家
     * 操作完全对不上的延迟反应。
     */
    const wantsJump = this.jumpRequested;
    this.jumpRequested = false;

    // 脚本寻路优先于玩家输入
    if (this.scriptedIndex < this.scriptedPath.length) {
      this.tickScriptedWalk(deltaSeconds);
      return;
    }

    // 坐着 / 躺着不能走。起身由 Systems/resting 的 standUp 负责，
    // 它会把姿态改回 stand，下一帧移动自然恢复
    const seated = isSupportedPosture(this.posture);

    // 跳跃只是好玩，不是玩法：站着、没在腾空、输入没被锁，才能起跳
    if (wantsJump && this.enabled && !seated && !this.airborne) {
      this.airborne = true;
      this.jumpVelocity = JUMP_IMPULSE;
      /*
       * 起跳的**那一刻**发一次手势。
       *
       * 不靠远端看着 liftHeight 从 0 变正来推断起跳：那是采样出来的，
       * 一个包丢了就整跳漏掉，而且起跳音效 / 尘土要精确对上那一帧。
       * 持续量（人在半空多高）和瞬时事件（他起跳了）是两件事，
       * 各走各的层——这正是 ParticipantGesture 存在的理由。
       */
      emitParticipantGesture(LOCAL_PLAYER_ID, GestureKind.Jump);
    }

    if (this.airborne) {
      this.jumpVelocity -= JUMP_GRAVITY * deltaSeconds;
      this.jumpHeight += this.jumpVelocity * deltaSeconds;
      if (this.jumpHeight <= 0) {
        // 落地：清干净，别留一点残余速度让下一次起跳虚高或虚低
        this.jumpHeight = 0;
        this.jumpVelocity = 0;
        this.airborne = false;
      }
    }

    let inputX = 0;
    let inputZ = 0;
    if (this.enabled && !seated) {
      if (this.keys.has("w")) inputZ -= 1;
      if (this.keys.has("s")) inputZ += 1;
      if (this.keys.has("a")) inputX -= 1;
      if (this.keys.has("d")) inputX += 1;

      // 摇杆和键盘取绝对值大的那个（见 externalX 的注释）
      if (Math.abs(this.externalX) > Math.abs(inputX)) inputX = this.externalX;
      if (Math.abs(this.externalZ) > Math.abs(inputZ)) inputZ = this.externalZ;
    }

    const moving = inputX !== 0 || inputZ !== 0;
    /*
     * 按住 Shift 跑。**只影响速度和步频，不改姿态**——跑步姿势要另做
     * 一套 pose，现在共用走路那套，加快步频已经读得出"在跑"。
     * 坐着躺着时 moving 恒假，所以不用单独拦。
     */
    const running = moving && this.keys.has("shift");

    if (moving) {
      const azimuth = MathUtils.degToRad(cameraAzimuthDegrees);
      const sin = Math.sin(azimuth);
      const cos = Math.cos(azimuth);

      // 把屏幕方向旋转到世界方向
      const worldX = inputX * cos + inputZ * sin;
      const worldZ = -inputX * sin + inputZ * cos;

      /**
       * **方向归一化，大小保留**（上限 1）。
       *
       * 原来是无脑除以模长，也就是任何输入都当满速——键盘只有 0/1/√2
       * 三种模长，这么算是对的（斜着走不该比直着走快 41%）。但摇杆是模拟量，
       * 那样写会让"轻轻推一点"和"推到底"跑得一样快，摇杆就退化成了八向摇杆。
       * 夹在 1 以内既保住了键盘斜走不加速，也让摇杆的力度真的有意义。
       */
      const length = Math.hypot(worldX, worldZ);
      const throttle = Math.min(1, length) / length;
      const speed = running ? SPEED * RUN_MULTIPLIER : SPEED;
      const stepX = worldX * throttle * speed * deltaSeconds;
      const stepZ = worldZ * throttle * speed * deltaSeconds;

      /*
       * 能不能挪过去 = 平面上走得通 **且** 那儿的落脚面不比现在高出一步。
       * 高度这一半只有这里知道——walkable 不清楚"我现在站多高"
       * （站在院子里和站在缘侧上，对同一格缘侧的答案是不同的）。
       */
      const canStep = (nx: number, nz: number): boolean =>
        isWalkable(nx, nz, RADIUS, PLAYER_OBSTACLE_ID) &&
        groundHeightAt(nx, nz) - this.supportY <= MAX_STEP_UP;

      // 轴分离：撞墙时沿另一轴滑动。
      // 如果当前已经卡在阻挡格里（比如家具放在了人身上），放开限制让人走出来
      const stuck = !isWalkable(this.x, this.z, RADIUS, PLAYER_OBSTACLE_ID);
      if (stuck || canStep(this.x + stepX, this.z)) this.x += stepX;
      if (stuck || canStep(this.x, this.z + stepZ)) this.z += stepZ;

      const targetAngle = Math.atan2(worldX, worldZ);
      let delta = targetAngle - this.headingAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.headingAngle += delta * Math.min(1, deltaSeconds * 12);

      /*
       * 步频跟着速度走。不跟的话跑起来是"用走路的频率滑过去"——
       * 脚和地面对不上，低多边形也照样看得出来。
       */
      this.walkPhase =
        (this.walkPhase + deltaSeconds * 2.6 * (running ? RUN_MULTIPLIER : 1)) % 1;
    }

    /*
     * 站着时脚跟着地形走（缘侧那类室外平台）。**坐着躺着不碰**——
     * 那时 supportY 是 resting 系统按椅面算好的，跟地形抢会把人拽下椅子。
     *
     * 用趋近不用直接赋值：0.4 的台阶瞬移上去是"贴"上去的，趋近才是
     * "迈"上去的。走下台子同理，是一步跨下来，不是自由落体——0.4 的
     * 落差走重力反而会有一帧腾空，比抬腿难看。
     */
    if (!seated) {
      const ground = groundHeightAt(this.x, this.z);
      this.supportY +=
        (ground - this.supportY) * Math.min(1, GROUND_FOLLOW * deltaSeconds);
    }

    // 坐着躺着时根节点要抬到承托面上（由 resting 系统写进 supportY）；
    // 跳跃的位移叠加在上面——两者不会同时发生（坐着躺着起不了跳），
    // 加法不需要挑一个赢家
    this.rig.root.position.set(this.x, this.supportY + this.jumpHeight, this.z);
    this.rig.heading.rotation.y = this.headingAngle;
    setActorFootprint(this.x, this.z, RADIUS);
    /*
     * 一帧的末尾把权威状态对齐。存档和（将来的）联机都从那边读。
     *
     * 移动态和离地高度也一起写出去。它们原来只喂给 animateCharacter——
     * 也就是**只有本机的渲染知道这个人在跑、在半空**，外面谁都读不到。
     * 联机时远端玩家会因此永远是走路姿势、永远贴着地面滑行。
     *
     * 传 liftHeight 而不是一个 airborne 布尔：中途进房间的人得知道他
     * 在半空的哪个高度，只给布尔的话只能从 0 重播，会看到他凭空下沉。
     *
     * 这两个字段**不进存档**（见 participants 的注释）：没人需要存
     * "我正在跳跃中"。
     */
    setLocalTransform(
      this.x,
      this.z,
      this.headingAngle,
      moving ? (running ? Locomotion.Run : Locomotion.Walk) : Locomotion.Idle,
      /*
       * 发**总的离地高度**（承托面 + 跳跃），不是只发跳跃位移。
       *
       * 原来只发 jumpHeight，等于告诉远端"这个人永远站在 y=0"——
       * 坐在椅子上、站在缘侧上、走进院子里，别人看到的都是贴着
       * 世界原点那个平面。以前全世界确实只有一个地面，所以看不出来；
       * 地板架空之后，做客的人会半截陷进院子里。
       */
      this.supportY + this.jumpHeight,
    );

    // 站着才跑走路 / 待机呼吸；坐着躺着完全交给姿势
    const carrying = getHeld() !== null;
    if (!seated) {
      animateCharacter(
        this.rig,
        this.walkPhase,
        moving,
        this.elapsed,
        carrying,
        this.airborne,
      );
    }

    // 走动时不摆活动层（伏案写字），否则边走边伏案很怪
    const shownActivity = moving ? null : this.activity;
    applyPose(this.rig, this.posture, shownActivity);

    /*
     * 姿势也要进 appearance——那是别人看得见的东西（坐着 / 伏案写字）。
     *
     * **只在变了的时候写**，不是每帧。appearance 是低频层，它的消费方
     * （将来的网络编码器）看到一次写入就会认为"这个人的样子变了，该发包"；
     * 每帧无条件写等于每帧发一个内容完全相同的包。
     *
     * 变化检测放在这里而不是 posture 的 setter 上：这两个是公开字段，
     * 外面（Systems/resting、剧情）直接赋值，没有可以挂钩的写入口。
     * 与其为了埋钩子把字段改成访问器、去动所有调用方，不如在唯一
     * 每帧都跑的地方比一下——两个字符串比较，代价可以忽略。
     */
    if (this.posture !== this.lastPosture || shownActivity !== this.lastActivity) {
      this.lastPosture = this.posture;
      this.lastActivity = shownActivity;
      setLocalAppearance({ posture: this.posture, activity: shownActivity });
    }

    // 伏案时手臂随时间轻微起伏，做出"在写"的感觉。
    // 这是姿势之上的**连续动画**，注册表只描述静态姿势，所以留在这里
    if (this.activity === "desk" && !moving) {
      this.rig.parts.armRight.rotation.x += Math.sin(this.elapsed * 5) * 0.08;
    }
  }

  private tickScriptedWalk(deltaSeconds: number): void {
    const [tx, tz] = this.scriptedPath[this.scriptedIndex];
    const dx = tx - this.x;
    const dz = tz - this.z;
    const distance = Math.hypot(dx, dz);

    if (distance < 0.08) {
      this.scriptedIndex += 1;
      if (this.scriptedIndex >= this.scriptedPath.length) {
        const arrive = this.onScriptedArrive;
        this.cancelScriptedWalk();
        arrive?.();
      }
    } else {
      const step = Math.min(SPEED * deltaSeconds, distance);
      this.x += (dx / distance) * step;
      this.z += (dz / distance) * step;

      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - this.headingAngle;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.headingAngle += diff * Math.min(1, deltaSeconds * 12);
      this.walkPhase = (this.walkPhase + deltaSeconds * 2.6) % 1;
    }

    // 脚步跟着地形：写死 0 的话剧情走位一旦经过院子，人会踩在半空
    this.supportY = groundHeightAt(this.x, this.z);
    this.rig.root.position.set(this.x, this.supportY, this.z);
    this.rig.heading.rotation.y = this.headingAngle;
    setActorFootprint(this.x, this.z, RADIUS);
    // 剧情走位也是"在走"，远端看到的必须是走路而不是原地滑行。
    // 脚本寻路永远是走速（上面用的就是 SPEED，没有跑的分支）
    setLocalTransform(
      this.x,
      this.z,
      this.headingAngle,
      Locomotion.Walk,
      this.supportY,
    );
    animateCharacter(this.rig, this.walkPhase, true, this.elapsed);
  }
}
