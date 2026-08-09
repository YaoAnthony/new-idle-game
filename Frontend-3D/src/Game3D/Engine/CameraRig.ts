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

/**
 * 俯仰角的上下限（度）。
 *
 * 下限 8°：再平就快贴地了，室内会被家具糊满画面。
 * 上限 62°：再高就成俯视图，人物变成一个头顶，也会顶到天花板。
 */
const MIN_PITCH = 8;
const MAX_PITCH = 62;

/** 鼠标拖拽的灵敏度：每像素转多少度 */
const DRAG_YAW_PER_PIXEL = 0.32;
const DRAG_PITCH_PER_PIXEL = 0.22;

/** 墙角贴脸时的最近距离。再近就穿进角色模型里了 */
const MIN_WALL_DISTANCE = 1.15;

/**
 * 弹簧臂放回去的速度（每秒的指数逼近系数）。
 *
 * **收进来是瞬时的、放出去很慢**，这是第三人称弹簧臂的标准不对称：
 * 慢一拍收就穿墙穿家具，是硬缺陷；慢慢放出去只是"镜头回得从容"，
 * 反而更稳。对称处理的话，屋里走两步就会被墙推一下、离开再弹回来，
 * 画面一直在前后拉——那正是最招人晕的一种运动。
 */
const WALL_RELEASE_RATE = 1.6;

/**
 * 放回去的死区。限制只宽松了这么一点就不动——
 * 绕着家具走时可听见的限制会有细碎抖动，不设死区就成了持续的微推拉。
 */
const WALL_RELEASE_DEADZONE = 0.15;

/** 复用的枢轴向量：加了肩后偏移之后的实际取景中心 */
const PIVOT = new Vector3();

export class CameraRig {
  readonly camera: PerspectiveCamera;

  private yaw = 45;
  private desiredYaw = 45;
  private distance: number;
  private desiredDistance: number;
  /** 俯仰角（弧度）。鼠标拖拽可改，和 yaw 一样走平滑插值 */
  private pitch: number;
  private desiredPitch: number;
  private readonly minDistance: number;
  private readonly maxDistance: number;

  private readonly target = new Vector3();
  private readonly desiredTarget = new Vector3();
  private readonly shoulderOffset: number;
  /**
   * 弹簧臂当前允许的距离（带迟滞）。
   * 每帧的原始限制抖得厉害，直接用会让镜头一路推拉，见 WALL_RELEASE_RATE。
   */
  private wallDistance = Infinity;

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

  /**
   * 相机的**禁入盒**（V0.13）：人在院子里时整栋房子是实体，
   * 相机的弹簧臂不许缩进屋顶和外墙里去。和 bounds 是一对镜像——
   * bounds 说"只能在这里面"，obstacle 说"不能进这里面"。
   */
  private obstacle: {
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
    this.desiredPitch = this.pitch;
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
   * 从目标点沿视线方向撞到内壁盒的距离（slab 法，三个轴一起算）。
   * 目标永远在屋内，所以每个轴向都取"正向离开"的那一侧。
   */
  private distanceToBounds(
    origin: Vector3,
    dirX: number,
    dirY: number,
    dirZ: number,
  ): number {
    const bounds = this.bounds;
    if (!bounds) return Infinity;

    let tMax = Infinity;
    const axes: Array<[number, number, number, number]> = [
      [dirX, origin.x, bounds.minX, bounds.maxX],
      [dirY, origin.y, bounds.minY, bounds.maxY],
      [dirZ, origin.z, bounds.minZ, bounds.maxZ],
    ];

    for (const [dir, position, min, max] of axes) {
      if (Math.abs(dir) < 1e-6) continue;
      const t = dir > 0 ? (max - position) / dir : (min - position) / dir;
      if (t < tMax) tMax = t;
    }

    return Math.max(tMax, 0);
  }

  /** 设置 / 清除禁入盒（人在院子里 = 房子的外包围盒；进屋 = null） */
  setObstacleBox(
    box: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
    } | null,
  ): void {
    this.obstacle = box;
  }

  /**
   * 从目标点沿视线方向**撞进**禁入盒的距离（slab 求交的入射 t）。
   * 打不中或起点已在盒内返回 Infinity（后者不该发生——玩家在屋外
   * 枢轴就在屋外；真发生了也不能把距离清零，那等于把相机怼进玩家脸）。
   */
  private distanceToObstacle(
    origin: Vector3,
    dirX: number,
    dirY: number,
    dirZ: number,
  ): number {
    const obstacle = this.obstacle;
    if (!obstacle) return Infinity;

    let tNear = -Infinity;
    let tFar = Infinity;
    const axes: Array<[number, number, number, number]> = [
      [dirX, origin.x, obstacle.minX, obstacle.maxX],
      [dirY, origin.y, obstacle.minY, obstacle.maxY],
      [dirZ, origin.z, obstacle.minZ, obstacle.maxZ],
    ];

    for (const [dir, position, min, max] of axes) {
      if (Math.abs(dir) < 1e-6) {
        // 视线和这个轴平行：起点在槽外就永远打不中
        if (position < min || position > max) return Infinity;
        continue;
      }
      const t1 = (min - position) / dir;
      const t2 = (max - position) / dir;
      const enter = Math.min(t1, t2);
      const exit = Math.max(t1, t2);
      if (enter > tNear) tNear = enter;
      if (exit < tFar) tFar = exit;
    }

    if (tNear > tFar || tFar < 0) return Infinity;
    if (tNear < 0) return Infinity; // 起点已在盒内，见上
    return tNear;
  }

  /** 跟随目标（角色胸口高度） */
  lookAtPoint(x: number, z: number): void {
    this.desiredTarget.set(x, 1.1, z);
  }

  /** 环绕旋转，每次 45°。手柄 / 调试用，键盘不再绑它 */
  rotateStep(direction: 1 | -1): void {
    this.desiredYaw += direction * 45;
  }

  /**
   * 鼠标拖拽转镜头（标准第三人称）。传的是**像素位移**，
   * 灵敏度在这里换算成角度——调手感只改这一处常量。
   *
   * 上下拖动改俯仰角：这是从"固定俯角的动森镜头"升级成
   * 真正的轨道相机，玩家能自己压低视角看窗外的庭院，
   * 也能抬高俯瞰整栋房子的布局。
   */
  orbit(deltaXPixels: number, deltaYPixels: number): void {
    this.desiredYaw -= deltaXPixels * DRAG_YAW_PER_PIXEL;
    this.desiredPitch = MathUtils.degToRad(
      MathUtils.clamp(
        MathUtils.radToDeg(this.desiredPitch) + deltaYPixels * DRAG_PITCH_PER_PIXEL,
        MIN_PITCH,
        MAX_PITCH,
      ),
    );
  }

  /** 镜头瞬间甩到角色背后（进屋、读档时用，不要让玩家看见镜头自己转过去） */
  snapBehind(headingRadians: number): void {
    this.desiredYaw = MathUtils.radToDeg(headingRadians) + 180;
    this.yaw = this.desiredYaw;
    // 平滑用的 target 也一起对齐，否则第一帧会从房间原点飞过来
    this.target.copy(this.desiredTarget);
    this.applyImmediately();
  }

  /**
   * **镜头不会自己转**（2026-07-31 定稿）。
   *
   * 原来走路时会自动把镜头拽到角色背后（150°/秒）。删掉的理由：
   * 治愈 / 布置类游戏（动森、模拟人生、星露谷、Cozy Grove）一律是
   * "相机只在玩家动它的时候动"，自动回中是动作游戏的语言。
   * 世界在脚下自己转是晕眩最直接的来源，而本作玩家大部分时间在屋里
   * 来回走动摆东西，这一转就转个不停。
   *
   * 还有一层耦合：偏航一变，视线撞到的就是另一面墙，弹簧臂的距离限制
   * 跟着跳——**自动转镜头本身在触发推拉**，两个效果互相放大。
   * 停掉自动回中，这条链也一起断了。
   *
   * 进屋和读档仍然用 snapBehind 一次性对齐到背后，那是瞬时的，不是过程。
   */

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
   *
   * `distance` 可覆盖默认的 3.4——舒舒这种体宽 1.6 米以上的对话对象
   * 贴着这个距离取景会把镜头怼进它身体里（调用方按对话对象的
   * 碰撞半径放宽，见 RoomScene 的 `dialogue_changed` 处理）。
   */
  enterDialogue(distance = 3.4): void {
    if (this.distanceBeforeFocus === null) {
      this.distanceBeforeFocus = this.desiredDistance;
    }
    this.desiredDistance = Math.max(this.minDistance, distance);
    this.mode = "cutscene";
  }

  exitDialogue(): void {
    this.exitFocus();
  }

  /**
   * 布置模式**不动镜头**，只换 mode。
   *
   * 原来会把俯角抬到 48°，理由是"低俯角下贴墙那一行瞄不到"。
   * 但同一次改动里已经加了方向键逐格微调，那才是真解法——
   * 抬俯角只是绕过瞄不准，微调是直接解决它。
   *
   * 保留自动抬俯角的代价是：每进出一次摆放，画面就甩一下。
   * 玩家摆一屋子家具要进出几十次，这个来回比"贴墙难瞄"难受得多。
   * 想俯视就自己拖鼠标，镜头角度归玩家。
   */
  enterDecorate(): void {
    this.mode = "decorate";
  }

  exitDecorate(): void {
    this.mode = "follow";
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
    this.pitch += (this.desiredPitch - this.pitch) * smoothing;
    this.distance += (this.desiredDistance - this.distance) * smoothing;
    this.target.lerp(this.desiredTarget, smoothing);
    this.applyImmediately(deltaSeconds);
  }

  /** 不传 deltaSeconds = 瞬时对齐，弹簧臂不走迟滞（构造 / snapBehind 用） */
  private applyImmediately(deltaSeconds?: number): void {
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

    /**
     * 锁定屋内：**保持玩家要的角度，缩短距离**（弹簧臂，主流第三人称的做法）。
     *
     * 早先的做法是"水平撞墙就把省下的量还给高度"——那是固定俯角时代的
     * 妥协：镜头角度不归玩家管，改构图没人察觉。鼠标能自己调俯仰之后
     * 这条就成了灾难：想压低视角看窗外，镜头却自作主张抬回去顶住天花板，
     * 玩家设的角度永远守不住，手感就是"很别扭"。
     *
     * 现在改成沿视线整体回缩：角色贴墙时镜头自然贴近后脑勺，
     * 这是所有第三人称游戏的既定语言，玩家一拖鼠标就知道该怎么办。
     */
    // 下限比 minDistance 更宽松：真到墙角就得贴脸，硬撑只会穿墙
    // 内壁盒管"别出去"，禁入盒管"别进来"（房子实体），取更近的那个。
    // 房子正好挡在身后时相机会贴近玩家——和屋内贴墙收臂是同一种让步，
    // 挡视线但没挡到臂的墙走遮挡淡出，不归这里管
    const limit = Math.max(
      Math.min(
        this.distanceToBounds(PIVOT, dirX, dirY, dirZ),
        this.distanceToObstacle(PIVOT, dirX, dirY, dirZ),
      ),
      MIN_WALL_DISTANCE,
    );

    if (deltaSeconds === undefined) {
      // 瞬时对齐：构造和 snapBehind 不该看见弹簧臂伸缩的过程
      this.wallDistance = limit;
    } else if (limit < this.wallDistance) {
      // 收进来立刻生效，慢一拍就是穿墙
      this.wallDistance = limit;
    } else if (limit - this.wallDistance > WALL_RELEASE_DEADZONE) {
      this.wallDistance +=
        (limit - this.wallDistance) *
        (1 - Math.exp(-WALL_RELEASE_RATE * deltaSeconds));
    }

    const distance = Math.min(this.distance, this.wallDistance);

    this.camera.position.set(
      PIVOT.x + dirX * distance,
      PIVOT.y + dirY * distance,
      PIVOT.z + dirZ * distance,
    );
    this.camera.lookAt(PIVOT);
  }
}
