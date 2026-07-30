import type { PoseId } from "core";
import { MathUtils } from "three";
import { isWalkable, setActorFootprint } from "../../Game/State/worldRuntime";
import { DEFAULT_POSTURE, isSupportedPosture } from "../Visual/poses.js";
import type { CharacterRig } from "../World/CharacterView";
import { animateCharacter, applyPose } from "../World/CharacterView";

/**
 * WASD 移动。方向相对相机档位（按屏幕方向走，动森一样），
 * 碰撞是圆形碰撞体压格检测，撞墙时按轴分离滑动而不是卡死。
 */

const SPEED = 3.1;
const RADIUS = 0.32;

export class CharacterController {
  private readonly keys = new Set<string>();
  private walkPhase = 0;
  private elapsed = 0;
  private headingAngle = 0;

  // 出生在西墙门口内侧几步（门洞中心在 z=0），像刚推门进屋。
  // 不贴着门站是给肩后镜头留出背后的空间——贴墙时镜头会被迫抬高俯拍，
  // 开局第一帧就成了头顶特写
  x = -4.5;
  z = 0;

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
   * 本帧输入"有多朝前"：纯 W = 1，横走 = 0，后退 = 0，没动 = 0。
   * 肩后相机用它加权回中，避免横走时镜头自激打圈。
   */
  get forwardness(): number {
    return this.lastForwardness;
  }
  private lastForwardness = 0;

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
    rig.root.position.set(this.x, 0, this.z);
    this.headingAngle = Math.PI / 2; // 面向房间内
  }

  teleport(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.rig.root.position.set(x, 0, z);
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
    }

    const moving = inputX !== 0 || inputZ !== 0;

    // inputZ 为负代表按了 W（往屏幕里走）；归一化后就是"朝前程度"
    this.lastForwardness = moving
      ? Math.max(0, -inputZ / Math.hypot(inputX, inputZ))
      : 0;

    if (moving) {
      const azimuth = MathUtils.degToRad(cameraAzimuthDegrees);
      const sin = Math.sin(azimuth);
      const cos = Math.cos(azimuth);

      // 把屏幕方向旋转到世界方向
      const worldX = inputX * cos + inputZ * sin;
      const worldZ = -inputX * sin + inputZ * cos;

      const length = Math.hypot(worldX, worldZ);
      const stepX = (worldX / length) * SPEED * deltaSeconds;
      const stepZ = (worldZ / length) * SPEED * deltaSeconds;

      // 轴分离：撞墙时沿另一轴滑动。
      // 如果当前已经卡在阻挡格里（比如家具放在了人身上），放开限制让人走出来
      const stuck = !isWalkable(this.x, this.z, RADIUS);
      if (stuck || isWalkable(this.x + stepX, this.z, RADIUS)) this.x += stepX;
      if (stuck || isWalkable(this.x, this.z + stepZ, RADIUS)) this.z += stepZ;

      const targetAngle = Math.atan2(worldX, worldZ);
      let delta = targetAngle - this.headingAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.headingAngle += delta * Math.min(1, deltaSeconds * 12);

      this.walkPhase = (this.walkPhase + deltaSeconds * 2.6) % 1;
    }

    // 坐着躺着时根节点要抬到承托面上（由 resting 系统写进 supportY）
    this.rig.root.position.set(this.x, this.supportY, this.z);
    this.rig.heading.rotation.y = this.headingAngle;
    setActorFootprint(this.x, this.z, RADIUS);

    // 站着才跑走路 / 待机呼吸；坐着躺着完全交给姿势
    if (!seated) {
      animateCharacter(this.rig, this.walkPhase, moving, this.elapsed);
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
    // 脚本寻路期间镜头钉住不动，让角色自己走进画面（比跟拍背影更像过场）
    this.lastForwardness = 0;

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
    animateCharacter(this.rig, this.walkPhase, true, this.elapsed);
  }
}
