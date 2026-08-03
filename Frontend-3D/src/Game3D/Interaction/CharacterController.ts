import type { PoseId } from "core";
import { MathUtils } from "three";
import { getHeld } from "../../Game/State/heldItem";
import {
  getLocalTransform,
  setLocalTransform,
} from "../../Game/State/participants";
import {
  PLAYER_OBSTACLE_ID,
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

  /** 过场 / 对话期间锁输入 */
  enabled = true;

  /** 当前朝向（弧度，从 +z 轴转向 +x）。肩后相机用它决定该转到哪 */
  get heading(): number {
    return this.headingAngle;
  }

  /**
   * 姿态层：站 / 坐 / 盘腿 / 躺。坐着躺着时移动输入被忽略（要先起身）。
   * 具体摆成什么样查 Visual/poses 的注册表，这里只记 id。
   */
  posture: PoseId = DEFAULT_POSTURE;

  /** 活动层：伏案写字等。可以和任意姿态叠加——「坐着学习」就是 sit + desk */
  activity: PoseId | null = null;

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
    this.rig.root.position.set(x, 0, z);
    setLocalTransform(x, z, this.headingAngle);
  }

  /** 沿世界坐标点列走过去，到达后回调。期间输入被忽略 */
  walkAlong(points: Array<[number, number]>, onArrive: () => void): void {
    this.scriptedPath = points;
    this.scriptedIndex = 0;
    this.onScriptedArrive = onArrive;
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
    this.keys.add(event.key.toLowerCase());
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

    // 脚本寻路优先于玩家输入
    if (this.scriptedIndex < this.scriptedPath.length) {
      this.tickScriptedWalk(deltaSeconds);
      return;
    }

    // 坐着 / 躺着不能走。起身由 Systems/resting 的 standUp 负责，
    // 它会把姿态改回 stand，下一帧移动自然恢复
    const seated = isSupportedPosture(this.posture);

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

      // 轴分离：撞墙时沿另一轴滑动。
      // 如果当前已经卡在阻挡格里（比如家具放在了人身上），放开限制让人走出来
      const stuck = !isWalkable(this.x, this.z, RADIUS, PLAYER_OBSTACLE_ID);
      if (stuck || isWalkable(this.x + stepX, this.z, RADIUS, PLAYER_OBSTACLE_ID)) this.x += stepX;
      if (stuck || isWalkable(this.x, this.z + stepZ, RADIUS, PLAYER_OBSTACLE_ID)) this.z += stepZ;

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

    // 坐着躺着时根节点要抬到承托面上（由 resting 系统写进 supportY）
    this.rig.root.position.set(this.x, this.supportY, this.z);
    this.rig.heading.rotation.y = this.headingAngle;
    setActorFootprint(this.x, this.z, RADIUS);
    // 一帧的末尾把权威状态对齐。存档和（将来的）联机都从那边读
    setLocalTransform(this.x, this.z, this.headingAngle);

    // 站着才跑走路 / 待机呼吸；坐着躺着完全交给姿势
    const carrying = getHeld() !== null;
    if (!seated) {
      animateCharacter(this.rig, this.walkPhase, moving, this.elapsed, carrying);
    }

    // 走动时不摆活动层（伏案写字），否则边走边伏案很怪
    applyPose(this.rig, this.posture, moving ? null : this.activity);

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

    this.rig.root.position.set(this.x, 0, this.z);
    this.rig.heading.rotation.y = this.headingAngle;
    setActorFootprint(this.x, this.z, RADIUS);
    setLocalTransform(this.x, this.z, this.headingAngle);
    animateCharacter(this.rig, this.walkPhase, true, this.elapsed);
  }
}
