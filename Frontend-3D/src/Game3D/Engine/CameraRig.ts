import { MathUtils, PerspectiveCamera, Vector3 } from "three";

/**
 * 第三人称跟随相机：跟在角色身后，Q/E 旋转环绕，滚轮缩放，自由移动。
 *
 * 镜头**严格锁定在屋内**（2026-07-29 定稿）：房间有真实屋顶，墙外什么都没有，
 * 相机永远不允许穿出房间体积。房间是凸盒，所以不用射线检测网格——
 * 从跟随目标沿视线方向做 ray-box 求交（slab 法），预期机位超出内壁就把
 * 相机沿视线拉近。角色退到墙角时镜头自然贴近，和主流第三人称游戏一致。
 */

export type CameraMode = "follow" | "cutscene" | "decorate" | "focus";

export type CameraRigOptions = {
  fov?: number;
  pitchDegrees?: number;
  minDistance?: number;
  maxDistance?: number;
  initialDistance?: number;
  /** 肩后偏移：把角色推到画面一侧，正数=角色偏左、镜头在右肩后 */
  shoulderOffset?: number;
};

/** 手动转镜（Q/E）之后暂停自动回中的时间，免得刚转完就被拽回去 */
const MANUAL_HOLD_SECONDS = 2.5;

/** 自动回中的最大角速度（度/秒）。太快会晕，太慢跟不上转身 */
const RECENTER_DEGREES_PER_SECOND = 150;

/** 复用的枢轴向量：加了肩后偏移之后的实际取景中心 */
const PIVOT = new Vector3();

export class CameraRig {
  readonly camera: PerspectiveCamera;

  private yaw = 45;
  private desiredYaw = 45;
  private distance: number;
  private desiredDistance: number;
  private readonly pitch: number;
  private readonly minDistance: number;
  private readonly maxDistance: number;

  private readonly target = new Vector3();
  private readonly desiredTarget = new Vector3();
  private readonly shoulderOffset: number;
  /** 手动转镜后的冷却，>0 时不自动回中 */
  private manualHold = 0;

  mode: CameraMode = "follow";

  /** 相机可活动的内壁盒（含安全边距）。setRoomBounds 前不做约束 */
  private bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  } | null = null;

  constructor(aspect: number, options: CameraRigOptions = {}) {
    const {
      fov = 50,
      pitchDegrees = 32,
      minDistance = 3,
      // 室内视角的最远档：再远也会被内壁回缩，留太大只会造成滚轮空行程
      maxDistance = 10,
      initialDistance = 7,
      shoulderOffset = 0.5,
    } = options;
    this.shoulderOffset = shoulderOffset;

    this.camera = new PerspectiveCamera(fov, aspect, 0.1, 200);
    this.pitch = MathUtils.degToRad(pitchDegrees);
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;
    this.distance = initialDistance;
    this.desiredDistance = initialDistance;

    this.applyImmediately();
  }

  /** 当前朝向（度），供"WASD 相对屏幕方向"换算用 */
  get azimuthDegrees(): number {
    return this.yaw;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** 告诉相机房间的内壁在哪。margin 是相机离墙/天花板的最小距离 */
  setRoomBounds(
    width: number,
    depth: number,
    wallHeight: number,
    margin = 0.35,
  ): void {
    this.setBoundsRect(-width / 2, width / 2, -depth / 2, depth / 2, wallHeight, margin);
  }

  /**
   * 任意矩形的内壁盒。目前唯一的调用方是 setRoomBounds（整栋房子）——
   * "按分区锁相机"的方案已放弃（客厅进深 8 格会把镜头顶成俯视），
   * 挡视线的内墙走遮挡淡出。保留矩形形式是为了以后多层/别馆。
   */
  setBoundsRect(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    wallHeight: number,
    margin = 0.35,
  ): void {
    this.bounds = {
      minX: minX + margin,
      maxX: maxX - margin,
      minY: 0.25,
      maxY: wallHeight - margin,
      minZ: minZ + margin,
      maxZ: maxZ - margin,
    };
  }

  /**
   * 从目标点沿水平方向 (dirX, dirZ)（单位向量）出发撞到墙的距离（slab 法）。
   * 目标永远在屋内，所以每个轴向都取"正向离开"的那一侧。
   *
   * 只算水平：垂直方向由 applyImmediately 单独处理，见那里的注释。
   */
  private distanceToWalls(
    origin: Vector3,
    dirX: number,
    dirZ: number,
  ): number {
    const bounds = this.bounds;
    if (!bounds) return Infinity;

    let tMax = Infinity;
    const axes: Array<[number, number, number, number]> = [
      [dirX, origin.x, bounds.minX, bounds.maxX],
      [dirZ, origin.z, bounds.minZ, bounds.maxZ],
    ];

    for (const [dir, position, min, max] of axes) {
      if (Math.abs(dir) < 1e-6) continue;
      const t = dir > 0 ? (max - position) / dir : (min - position) / dir;
      if (t < tMax) tMax = t;
    }

    return Math.max(tMax, 0);
  }

  /** 跟随目标（角色胸口高度） */
  lookAtPoint(x: number, z: number): void {
    this.desiredTarget.set(x, 1.1, z);
  }

  /** 环绕旋转，每次 45°。手动转过之后暂时不自动回中 */
  rotateStep(direction: 1 | -1): void {
    this.desiredYaw += direction * 45;
    this.manualHold = MANUAL_HOLD_SECONDS;
  }

  /** 镜头瞬间甩到角色背后（进屋、读档时用，不要让玩家看见镜头自己转过去） */
  snapBehind(headingRadians: number): void {
    this.desiredYaw = MathUtils.radToDeg(headingRadians) + 180;
    this.yaw = this.desiredYaw;
    this.manualHold = 0;
    // 平滑用的 target 也一起对齐，否则第一帧会从房间原点飞过来
    this.target.copy(this.desiredTarget);
    this.applyImmediately();
  }

  /**
   * 肩后视角的核心：把镜头慢慢转到角色背后。
   *
   * `forwardness` 是"输入有多朝前"（纯 W = 1，横走 = 0，后退 = 0）。
   * **必须用它加权，否则会自激**——WASD 是相机相对的，如果按住 A 时相机也跟着
   * 角色左转，"左"就一直在变，人会原地画圈。只在往前走时回中，转身自然跟到背后，
   * 横走和倒退时镜头钉住不动，玩家能看清自己在往哪挪。
   */
  recenterBehind(
    headingRadians: number,
    forwardness: number,
    deltaSeconds: number,
  ): void {
    if (this.manualHold > 0) {
      this.manualHold = Math.max(0, this.manualHold - deltaSeconds);
      return;
    }

    const weight = MathUtils.clamp(forwardness, 0, 1);
    if (weight <= 0.001) return;

    // 目标方位角 = 角色朝向 + 180°，取和当前 desiredYaw 最近的等价角
    const behind = MathUtils.radToDeg(headingRadians) + 180;
    let delta = (behind - this.desiredYaw) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    const maxStep = RECENTER_DEGREES_PER_SECOND * weight * deltaSeconds;
    this.desiredYaw += MathUtils.clamp(delta, -maxStep, maxStep);
  }

  zoom(delta: number): void {
    this.desiredDistance = MathUtils.clamp(
      this.desiredDistance + delta,
      this.minDistance,
      this.maxDistance,
    );
  }

  /** 拉到最远，纵览整个房间 */
  zoomToFit(): void {
    this.desiredDistance = this.maxDistance;
  }

  private distanceBeforeFocus: number | null = null;

  /** 专注模式：镜头推近，画面安静下来 */
  /**
   * 对话镜头：比专注模式更近，让说话的人占满画面下半部分（动森式）。
   * 对话框占屏幕下方约三分之一，所以视线中心要稍微抬高。
   */
  enterDialogue(): void {
    if (this.distanceBeforeFocus === null) {
      this.distanceBeforeFocus = this.desiredDistance;
    }
    this.desiredDistance = Math.max(this.minDistance, 3.4);
    this.mode = "cutscene";
  }

  exitDialogue(): void {
    this.exitFocus();
  }

  enterFocus(): void {
    if (this.distanceBeforeFocus === null) {
      this.distanceBeforeFocus = this.desiredDistance;
    }
    this.desiredDistance = Math.max(this.minDistance, 4.2);
    this.mode = "focus";
  }

  exitFocus(): void {
    if (this.distanceBeforeFocus !== null) {
      this.desiredDistance = this.distanceBeforeFocus;
      this.distanceBeforeFocus = null;
    }
    this.mode = "follow";
  }

  update(deltaSeconds: number): void {
    const smoothing = 1 - Math.exp(-8 * deltaSeconds);

    this.yaw += (this.desiredYaw - this.yaw) * smoothing;
    this.distance += (this.desiredDistance - this.distance) * smoothing;
    this.target.lerp(this.desiredTarget, smoothing);
    this.applyImmediately();
  }

  private applyImmediately(): void {
    const azimuth = MathUtils.degToRad(this.yaw);

    // 视线方向的单位向量（目标 → 相机）
    const dirX = Math.sin(azimuth) * Math.cos(this.pitch);
    const dirY = Math.sin(this.pitch);
    const dirZ = Math.cos(azimuth) * Math.cos(this.pitch);

    // 目标点先夹回盒内（角色贴墙时胸口可能落在相机安全边距之外）
    const bounds = this.bounds;
    if (bounds) {
      this.target.x = MathUtils.clamp(this.target.x, bounds.minX, bounds.maxX);
      this.target.y = MathUtils.clamp(this.target.y, bounds.minY, bounds.maxY);
      this.target.z = MathUtils.clamp(this.target.z, bounds.minZ, bounds.maxZ);
    }

    // 肩后偏移：镜头和视线中心一起横移，角色因此偏在画面一侧而不是正中。
    // 屏幕右方向量（相机朝 -dir 看，up 是 +Y）
    const rightX = Math.cos(azimuth);
    const rightZ = -Math.sin(azimuth);
    PIVOT.set(
      this.target.x + rightX * this.shoulderOffset,
      this.target.y,
      this.target.z + rightZ * this.shoulderOffset,
    );
    if (bounds) {
      PIVOT.x = MathUtils.clamp(PIVOT.x, bounds.minX, bounds.maxX);
      PIVOT.z = MathUtils.clamp(PIVOT.z, bounds.minZ, bounds.maxZ);
    }

    // 锁定屋内。水平和垂直**分开**处理，这是肩后视角能用的关键：
    //
    // 角色贴着墙站时，"背后"就在墙里。如果只会沿视线整体回缩，镜头会一路贴到
    // 后脑勺上（实测就是这样）。所以撞墙时只压缩水平距离，把省下来的量还给
    // 高度——镜头改为**从上方越过肩膀往下看**，构图还在，人也没被怼脸。
    // 天花板同理只夹高度：夹了之后俯角自然变平，缩放行程不会被卡死。
    const horizontal = Math.cos(this.pitch);
    const dirHX = horizontal === 0 ? 0 : dirX / horizontal;
    const dirHZ = horizontal === 0 ? 0 : dirZ / horizontal;

    const wallLimit = this.distanceToWalls(PIVOT, dirHX, dirHZ);
    const wantH = this.distance * horizontal;
    const h = Math.min(wantH, wallLimit);

    // 水平被压掉多少，就往上抬多少（保持总视距），再受天花板约束
    const wantV = this.distance * dirY;
    const raisedV = Math.sqrt(
      Math.max(this.distance * this.distance - h * h, wantV * wantV),
    );
    const maxV = bounds ? Math.max(bounds.maxY - PIVOT.y, 0.2) : raisedV;
    const v = Math.min(raisedV, maxV);

    this.camera.position.set(PIVOT.x + dirHX * h, PIVOT.y + v, PIVOT.z + dirHZ * h);
    this.camera.lookAt(PIVOT);
  }
}
