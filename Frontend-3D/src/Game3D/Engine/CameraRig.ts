import { MathUtils, PerspectiveCamera, Vector3 } from "three";

/**
 * 第三人称跟随相机：跟在角色身后，Q/E 旋转环绕，滚轮缩放，自由移动。
 *
 * 镜头**严格锁定在屋内**（2026-07-29 定稿）：房间有真实屋顶，墙外什么都没有，
 * 相机永远不允许穿出房间体积。房间是凸盒，所以不用射线检测网格——
 * 从跟随目标沿视线方向做 ray-box 求交（slab 法），预期机位超出内壁就把
 * 相机沿视线拉近。角色退到墙角时镜头自然贴近，和主流第三人称游戏一致。
 */

export type CameraMode = "follow" | "cutscene" | "decorate" | "focus" | "overview";

/** 全景模式要看的那一片：中心、地面高度、要装下的半径 */
export type OverviewShot = {
  centerX: number;
  centerZ: number;
  /** 这一片的地面在多高（院子是 -floorLevel） */
  groundY: number;
  /** 要装进画面的半径（世界单位）。距离按 fov 反推，不写死 */
  radius: number;
  /** 俯角。默认 55°，比跟随镜头的上限还高一截 */
  pitchDegrees?: number;
  /** 方位角。不给就保持当前朝向（截图想换角度再传） */
  yawDegrees?: number;
};

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

/**
 * 全景模式的俯角上限（度）。
 *
 * 跟随镜头卡在 62° 是为了别把人拍成一个头顶；全景没有这个顾虑，
 * 但也**不给到 90°**：正俯视图会让所有立面消失，屋顶一块块贴在地上，
 * 看不出高低差——恰恰是想验证台地和楼梯时最需要看见的东西。
 * 85° 留一点点透视，仍然能看出哪儿高哪儿低。
 */
const OVERVIEW_MAX_PITCH = 85;

/** 全景的远裁剪面。日常是 200（够用且省深度精度），全景要看到放大后的天穹 */
const OVERVIEW_FAR_PLANE = 900;
const DEFAULT_FAR_PLANE = 200;

/** 一个轴对齐的盒子。禁入盒用它，一栋建筑一个 */
export type ObstacleBox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};
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
   * 相机的**禁入盒**（V0.13）：人在室外时每栋实心建筑都是实体，
   * 相机的弹簧臂不许缩进屋顶和外墙里去。和 bounds 是一对镜像——
   * bounds 说"只能在这里面"，obstacles 说"不能进这些里面"。
   *
   * **是一组不是一个**（2026-08-10）：原来只挂得下一栋房子，小镇长出
   * 商业街之后六家店铺全在禁入盒之外——人走在街上镜头直接缩进店铺
   * 体内，满屏一块深色。房子从来就不止一栋。
   */
  private obstacles: ObstacleBox[] = [];

  /**
   * 全景模式：不为空就**整套约束全停**——内壁盒、禁入盒、弹簧臂、
   * 肩后偏移、距离上限、俯角上限，一个都不生效。
   *
   * 为什么是"停"不是"放宽"：这些限制每一条都是为了"跟在人身后还能
   * 看得见"服务的，全景根本不跟人。留着任何一条都会在某张图上莫名
   * 其妙地把镜头拽回去——据点的镜头会被院子的内壁盒压到 10 的高度，
   * 小镇的会被六个店铺禁入盒切成一段一段。
   */
  private overview: OverviewShot | null = null;

  /** 进全景前的机位，退出时原样放回（否则玩家回来发现镜头飞了） */
  private beforeOverview: {
    yaw: number;
    pitch: number;
    distance: number;
    mode: CameraMode;
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

    this.camera = new PerspectiveCamera(fov, aspect, 0.1, DEFAULT_FAR_PLANE);
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
    /** 这一片的地面在多高。院子比室内地板低（见 MapDefinition.floorLevel） */
    floorY = 0,
  ): void {
    this.bounds = {
      minX: minX + margin,
      maxX: maxX - margin,
      // 相机不许钻进地里。**跟着这一片的地面走**，不是固定 0.25——
      // 院子沉下去之后固定值会把相机卡在离地 0.7 的高度上，
      // 平视院子的镜头就压不下来了
      minY: floorY + 0.25,
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

  /** 设置 / 清除禁入盒（人在室外 = 每栋实心建筑一个盒；进屋 = 空数组） */
  setObstacleBoxes(boxes: ObstacleBox[]): void {
    this.obstacles = boxes;
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
    // 每个盒子算一遍，取最近的一次撞击（挡在最前面的那栋说了算）
    let nearest = Infinity;
    for (const obstacle of this.obstacles) {
      const hit = this.hitBox(obstacle, origin, dirX, dirY, dirZ);
      if (hit < nearest) nearest = hit;
    }
    return nearest;
  }

  /** 单个盒子的 slab 求交 */
  private hitBox(
    obstacle: ObstacleBox,
    origin: Vector3,
    dirX: number,
    dirY: number,
    dirZ: number,
  ): number {
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

  /**
   * 跟随目标（角色胸口高度）。
   *
   * `footY` 是那个人**脚下**的高度：世界里不再只有一个地面了
   * （室内地板 0、院子 -floorLevel、缘侧 0），写死 1.1 的话人走进
   * 院子就会被框低一截——镜头看的还是屋里的胸口高度。
   */
  lookAtPoint(x: number, z: number, footY = 0): void {
    // 全景不跟人。RoomScene 每帧都会调这个，不挡住的话镜头会被一路
    // 拽回角色身上——"看全景"变成"从很远处看这个人"
    if (this.overview) return;
    this.desiredTarget.set(x, footY + 1.1, z);
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
        // 全景里可以一路抬到近乎正俯视：绕着看构图正是它的用处
        this.overview ? OVERVIEW_MAX_PITCH : MAX_PITCH,
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
    if (this.overview) {
      // 全景的上限跟着这一片的大小走（能退到装下两倍半径），
      // 而不是跟随镜头那个为室内定的 10——那点行程在箱庭尺度上等于没有
      const far = this.fitDistance(this.overview.radius * 2);
      this.desiredDistance = MathUtils.clamp(
        this.desiredDistance + delta * 4,
        this.minDistance,
        far,
      );
      return;
    }
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

  /**
   * 进全景：镜头脱离角色，升到高处俯瞰整片箱庭。
   *
   * 距离**按 fov 反推**不写死一个数：`radius / tan(半张角)`，取横竖
   * 两个张角里更窄的那个（横屏时是竖向）。写死的话换一张更大的图就
   * 装不下，改 fov 或换个宽高比也会露馅——而这个命令的全部用处就是
   * "一眼看全"，装不下就等于没用。
   */
  enterOverview(shot: OverviewShot): void {
    if (!this.beforeOverview) {
      this.beforeOverview = {
        yaw: this.desiredYaw,
        pitch: this.desiredPitch,
        distance: this.desiredDistance,
        mode: this.mode,
      };
    }
    this.overview = shot;
    this.mode = "overview";
    // 远裁剪面：默认 200 是按地面视角定的，高空俯瞰时天穹和对岸都在
    // 那之外，不推出去会看见天被切掉一半
    this.camera.far = OVERVIEW_FAR_PLANE;
    this.camera.updateProjectionMatrix();

    this.desiredPitch = MathUtils.degToRad(
      MathUtils.clamp(shot.pitchDegrees ?? 55, MIN_PITCH, OVERVIEW_MAX_PITCH),
    );
    if (shot.yawDegrees !== undefined) this.desiredYaw = shot.yawDegrees;
    this.desiredDistance = this.fitDistance(shot.radius);

    // 一步到位，不看镜头飞上去的过程：飞行途中会穿过屋顶和树冠，
    // 而这个命令是给截图用的，过程越短越好
    this.yaw = this.desiredYaw;
    this.pitch = this.desiredPitch;
    this.distance = this.desiredDistance;
    this.target.set(shot.centerX, shot.groundY, shot.centerZ);
    this.desiredTarget.copy(this.target);
    this.applyImmediately();
  }

  /** 退全景，机位放回进去之前的样子 */
  exitOverview(): void {
    if (!this.overview) return;
    this.overview = null;
    this.camera.far = DEFAULT_FAR_PLANE;
    this.camera.updateProjectionMatrix();
    const saved = this.beforeOverview;
    this.beforeOverview = null;
    if (!saved) {
      this.mode = "follow";
      return;
    }
    this.desiredYaw = saved.yaw;
    this.yaw = saved.yaw;
    this.desiredPitch = saved.pitch;
    this.pitch = saved.pitch;
    this.desiredDistance = saved.distance;
    this.distance = saved.distance;
    this.mode = saved.mode === "overview" ? "follow" : saved.mode;
    // 弹簧臂重新量一遍：全景期间它一直是 Infinity，直接跟随会先穿一帧墙
    this.wallDistance = Infinity;
    this.applyImmediately();
  }

  get inOverview(): boolean {
    return this.overview !== null;
  }

  /** 装下半径 radius 的一片需要多远。横竖两个张角取更窄的那个 */
  private fitDistance(radius: number): number {
    const vHalf = MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    return radius / Math.tan(Math.max(Math.min(vHalf, hHalf), 1e-3));
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

    /*
     * 全景：约束整套停用，机位就是"中心点 + 视线方向 × 距离"。
     * 提前返回而不是层层加 if——夹取、肩后偏移、弹簧臂三段都要绕过，
     * 混在一起写下去这个函数就没人敢改了。
     */
    if (this.overview) {
      this.camera.position.set(
        this.target.x + dirX * this.distance,
        this.target.y + dirY * this.distance,
        this.target.z + dirZ * this.distance,
      );
      this.camera.lookAt(this.target);
      return;
    }

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
