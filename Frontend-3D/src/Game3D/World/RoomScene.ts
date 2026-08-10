import {
  BodyPosture,
  DayPhaseId,
  Facing,
  FurnitureCapability,
  WeatherKind,
  findItemDefinition,
  findPath,
  findPetDefinition,
} from "core";
import type { InteractHint } from "core";
import { Raycaster, Scene, Vector2, Vector3 } from "three";

/**
 * 遮挡检测的采样点：沿身体取四个高度，再在肩线左右各加一条。
 *
 * 高度全部从 `CharacterView` 的真实体型算出来，**不要写死数字**——
 * 之前写 1.6 当"头顶"，其实头顶只有 1.42，那条射线打的是头上方的空气；
 * 而腿（地面到胯高 0.34）一条都没覆盖，只挡住下半身的矮家具
 * （脚凳、茶几、边几，摆满时到处都是）就永远不会让开。
 *
 * 横向偏移是因为角色比一条射线宽：只挡住一侧肩膀的柜子，
 * 中心线三条全都打不到。偏移方向按屏幕右方算，不是世界 X。
 */
const OCCLUSION_SAMPLES: Array<{ height: number; lateral: number }> = [
  { height: HEAD_TOP_HEIGHT - 0.15, lateral: 0 },
  { height: SHOULDER_HEIGHT - 0.08, lateral: 0 },
  { height: SHOULDER_HEIGHT - 0.08, lateral: -BODY_HALF_WIDTH },
  { height: SHOULDER_HEIGHT - 0.08, lateral: BODY_HALF_WIDTH },
  { height: HIP_HEIGHT + 0.12, lateral: 0 },
  { height: HIP_HEIGHT * 0.45, lateral: 0 },
];

/**
 * 扔到地上的东西离槽位多近算"扔进去了"。
 *
 * 只比**平面**距离。掉落物现在会真的落在台面上（0.98），灶眼在 1.03，
 * 高度差已经不大了——但仍然只比平面：判定该由"瞄没瞄准"决定，
 * 而不是由物体停下时离台面差几毫米决定。
 *
 * 0.75 是照着灶眼间距（0.8）定的——比间距小一点，所以瞄准哪个灶眼就进哪个，
 * 不会因为半径太大而"扔向左边那口锅，米进了中间那口"。
 */
const KITCHEN_ABSORB_RADIUS = 0.75;

/** 提示气泡的附着目标：家具实例 + 提示数据 + 世界锚点 */
type HintTarget = {
  instanceId: string;
  hint: InteractHint;
  world: Vector3;
};
import { PlacementSurface, findPlaceableItem } from "core";
import { ChatMessageKind } from "core";
import { getAvatar } from "../../Game/State/avatar";
import { pushChatMessage } from "../../Game/State/chatLog";
import { t } from "../../i18n/t";
import {
  findDoorAgent,
  initDoors,
  listDoors,
  tickDoors,
} from "../../Game/State/doorsRuntime";
import type { Door as DoorAgent } from "../../Game/State/doorAgent";
import { getHeld } from "../../Game/State/heldItem";
import {
  consumeSelectedOne,
  getSelectedStack,
} from "../../Game/State/inventory";
import {
  findDroppedItem,
  removeDroppedItem,
  throwItem,
  tickDroppedItems,
} from "../../Game/State/droppedItems";
import {
  throwHeldItem,
  tickItemPickup,
} from "../../Game/Systems/dropping";
import { emit, on, type StationCapability } from "../../Game/EventBus";
import {
  getPet,
  getPets,
  seedInitialPets,
  tickPets,
} from "../../Game/State/petsRuntime";
import {
  getCurrentMap,
  getCurrentMapId,
  getDefinition,
  getRoomStyle,
  getWorld,
  groundHeightAt,
  roomIdAt,
  seedInitialFurniture,
} from "../../Game/State/worldRuntime";
import { outdoorTerrainOf } from "../../Maps/index";
import { buildGroundFixtures } from "./groundFixtures.js";
import { getActiveAction } from "../../Game/Systems/actions";
import { getActiveDialogue, startDialogue } from "../../Game/Systems/dialogue";
import { getEventStage } from "../../Game/Systems/events";
import {
  describeKitchenSlot,
  dumpKitchenSlot,
  interactWithKitchenSlot,
  listKitchenSlots,
  offerToSlot,
  tickKitchen,
  type KitchenSlotRef,
} from "../../Game/Systems/kitchen";
import { tickPortalTravel } from "../../Game/Systems/mapTravel";
import { pickupFurniture } from "../../Game/Systems/placement";
import { eatHeldItem } from "../../Game/Systems/itemUse";
import { openUnpack } from "../../Game/Systems/unpack";
import {
  findAnchor,
  hasFreeAnchor,
  reconcileResting,
  restAtNearest,
  standUp,
} from "../../Game/Systems/resting";
import { startSleep } from "../../Game/Systems/sleep";
import { getClock } from "../../Game/State/clock";
import { getResting, isResting } from "../../Game/State/posture";
import { pruneOrphanStorages } from "../../Game/State/storage";
import { pruneOrphanGramophones } from "../../Game/State/gramophones";
import { allFurnitureInstanceIds } from "../../Game/State/world/entities";
import { getWeather } from "../../Game/State/weather";
import {
  DEFAULT_POSTURE,
  defaultPoseFor,
  findPosture,
} from "../Visual/poses.js";
import { CookwareView } from "./CookwareView.js";
import { DroppedItemView } from "./DroppedItemView.js";
import {
  BODY_HALF_WIDTH,
  HEAD_TOP_HEIGHT,
  HIP_HEIGHT,
  SHOULDER_HEIGHT,
} from "./CharacterView.js";
import { PetView } from "./PetView.js";
import { CameraRig } from "../Engine/CameraRig.js";
import { Lighting } from "../Engine/Lighting.js";
import { stepFade } from "../Engine/Fade.js";
import { setOutlineVisible } from "../Engine/Outline.js";
import { createRenderer, type RendererHandle } from "../Engine/Renderer.js";
import { updateListener } from "../Engine/Soundscape.js";
import { CharacterController } from "../Interaction/CharacterController.js";
import { PlacementController } from "../Interaction/PlacementController.js";
import { buildCharacter } from "./CharacterView.js";
import { RemotePlayersView } from "./RemotePlayersView.js";
import { DailyBoardAnimator } from "./DailyBoardAnimator.js";
import { GramophoneAnimator } from "./GramophoneAnimator.js";
import { cycleMusicMode, getMusicMode } from "../Engine/MusicDirector.js";
import { recordIn, setRecord } from "../../Game/State/gramophones";
import { albumLabelOf } from "../../Data/music/albums";
import {
  FACING_VECTOR,
  FurnitureView,
  furnitureWorldCenter,
  slotWorldPosition,
} from "./FurnitureView.js";
import { HeldItemView } from "./HeldItemView.js";
import {
  DoorView,
  RoomDoorView,
  WindowView,
  buildHouse,
  type BuiltHouse,
} from "./House/index.js";
import { OutdoorScene } from "./OutdoorScene.js";

export type SceneDebugState = {
  phase: DayPhaseId;
  weather: WeatherKind;
  outline: boolean;
  styleId: string;
  character: { x: number; z: number; y: number };
  furnitureCount: number;
};

export class RoomScene {
  readonly scene = new Scene();
  readonly rig: CameraRig;

  private readonly renderer: RendererHandle;
  private readonly lighting: Lighting;
  private readonly built: BuiltHouse;
  private readonly windowViews: WindowView[] = [];
  private readonly outdoor: OutdoorScene;
  /** 联机时房间里其他人的形象。单机时名册是空的，它每帧空转一圈 */
  private readonly remotePlayers: RemotePlayersView;
  /** 每日任务机满格时的那一下弹跳。没机器时什么都不做 */
  private readonly dailyBoardAnimator: DailyBoardAnimator;
  private readonly gramophoneAnimator: GramophoneAnimator;
  /** 外门门板 + 它的逻辑实体，视图每帧照实体画 */
  private readonly doorViews: { view: DoorView; agent: DoorAgent | undefined }[] = [];
  private readonly roomDoorViews = new Map<string, RoomDoorView>();
  /** 上次报"锁着"的时刻。连按 F 只晃门不刷屏（见 interact 里的注释） */
  private lastLockedNoticeAt = 0;
  private readonly furnitureView: FurnitureView;
  private readonly cookwareView: CookwareView;
  private readonly droppedItemView: DroppedItemView;
  // 外观从运行时状态读：hydrate 已在场景构建之前把存档灌进去，
  // 新档则是捏脸界面（或默认值）写入的
  private readonly characterRig = buildCharacter(getAvatar());
  private readonly heldItemView: HeldItemView;
  private readonly controller: CharacterController;
  private readonly placement: PlacementController;

  private phase: DayPhaseId = DayPhaseId.Day;
  private weather: WeatherKind = WeatherKind.Sunny;
  private outlineEnabled = true;

  private readonly petView = new PetView();
  /** 过场镜头：非空表示正在跟拍某只宠物 */
  private cutscenePetId: string | null = null;
  private readonly offEventListeners: Array<() => void> = [];

  /** 附近可交互目标（按 F 提示） */
  private interactTarget:
    | {
        kind: "station";
        instanceId: string;
        capability: StationCapability;
      }
    | { kind: "pet"; petId: string }
    | { kind: "door"; refId: string }
    | null = null;
  private interactCheckTimer = 0;
  /** 遮挡检测的限流计时。射线不必每帧打，镜头转得再快也跟得上 */
  private occlusionCheckTimer = 0;
  private readonly occlusionRaycaster = new Raycaster();
  private readonly occlusionOrigin = new Vector3();
  private readonly occlusionDirection = new Vector3();
  /** 内墙段的滞回计数（>0 表示"正被挡住/刚被放开还没到淡回时机"） */
  private readonly wallReleaseTicks = new Map<string, number>();

  private readonly pickRaycaster = new Raycaster();
  private readonly pickPointer = new Vector2();

  /** 坐下之前站在哪，起身时退回去 */
  private restingReturnTo: { x: number; z: number } | null = null;

  /** 镜头当前用的是不是院子边界盒（玩家在屋外）。滞回用 */
  private cameraOutdoors = false;

  /** 换图后置真：这个场景在等 React 拆，update 全跳过（防踩落点的竞态） */
  private travelFrozen = false;

  /** 提示气泡附着的家具（独立于 interactTarget，见 refreshInteractTarget） */
  private hintTarget: HintTarget | null = null;
  private readonly projectScratch = new Vector3();

  private readonly detachInput: () => void;

  constructor(
    private readonly container: HTMLElement,
    options: { seedFurniture?: boolean } = {},
  ) {
    // 读档时屋里的东西来自存档，不能再铺一次房东留下的旧家具和纸箱
    if (options.seedFurniture !== false) {
      seedInitialFurniture();
      // 家具先摆好，舒舒挑角落时才能避开纸箱占的格子
      seedInitialPets();
    }

    const { room } = getWorld();
    /*
     * 门实例在这儿建：要读房间几何（门洞在哪），几何刚在上面就位。
     * 读档时锁定状态已由 hydrate 寄存进 doorsRuntime，init 会认领。
     */
    initDoors();
    this.built = buildHouse(
      room,
      getCurrentMap().outdoorDecks ?? [],
      getCurrentMap().floorLevel,
      getCurrentMap().openAir ?? false,
    );
    this.scene.add(this.built.root);

    // 门板：没有它门洞会直接透出背景色
    for (const anchor of this.built.doors) {
      const door = new DoorView(anchor);
      this.doorViews.push({ view: door, agent: findDoorAgent(anchor.openingId) });
      this.scene.add(door.root);
    }

    // 内墙门洞的门板，由 Door 实体驱动（自动开关、锁都在逻辑层）
    for (const doorway of room.interiorDoorways ?? []) {
      const agent = findDoorAgent(doorway.doorwayId);
      if (!agent) continue;
      const view = new RoomDoorView(doorway, agent, room.floorGrid);
      this.roomDoorViews.set(doorway.doorwayId, view);
      this.scene.add(view.root);
    }

    for (const anchor of this.built.windows) {
      const view = new WindowView(anchor);
      this.windowViews.push(view);
      this.scene.add(view.root);
    }

    // 屋外的真实世界：森林、河、天穹、真日月。窗户只是画框
    this.outdoor = new OutdoorScene(
      this.scene,
      this.built.size,
      outdoorTerrainOf(getCurrentMapId()),
    );
    // 声明的可走固定件（石阶、平台）。挂 scene 不挂 outdoor.root：
    // 声明里的标高是世界 Y，outdoor.root 整体压了 -floorLevel
    this.scene.add(buildGroundFixtures(getCurrentMap()));
    this.remotePlayers = new RemotePlayersView(this.scene);
    // 现查不缓存：机器可能被收走或摆第二台
    this.dailyBoardAnimator = new DailyBoardAnimator(() =>
      this.furnitureView.findByFurnitureId("furniture_daily_board"),
    );
    this.gramophoneAnimator = new GramophoneAnimator(() =>
      this.furnitureView.findInstancesByFurnitureId("furniture_gramophone"),
    );

    this.furnitureView = new FurnitureView(this.built.size);
    this.scene.add(this.furnitureView.root);

    // 槽位上的锅碗单独一层：家具一天动不了几次，锅里的东西每次投料都变
    this.cookwareView = new CookwareView(this.built.size);
    this.scene.add(this.cookwareView.root);

    this.droppedItemView = new DroppedItemView();
    this.scene.add(this.droppedItemView.root);

    this.scene.add(this.petView.root);

    this.scene.add(this.characterRig.root);
    this.controller = new CharacterController(this.characterRig);
    // 手上端着的东西挂到角色骨架上——在这之前手持物只有右下角一张卡片，
    // 把锅从灶眼拿起来，世界里那口锅就凭空没了
    this.heldItemView = new HeldItemView(this.characterRig.heldAnchor);

    /**
     * 读档时坐姿要在这里补一次。
     *
     * hydrateGameSave 跑在本场景构造**之前**，那时 posture_changed 发出去还没人订阅，
     * 所以光靠事件监听会漏掉"读档后还坐着"这种情况——
     * 和世界、宠物的恢复是同一类时序问题。
     */
    this.applyResting();

    /*
     * 换图冻结（箱庭②修的竞态）：travelTo 把落点写进 participants 后
     * 发 map_changed，但**这个场景要等 React 下一次提交才被 dispose**，
     * 中间还会跑几帧 update——CharacterController 每帧把自己的旧坐标
     * setLocalTransform 回去，落点就被旧场景踩掉了（新场景的控制器
     * 构造时读到的是旧坐标，人切了图却站在原地）。emit 是同步的，
     * 监听里立刻冻结，旧场景从那一刻起只渲染不推进。
     */
    this.offEventListeners.push(
      on("map_changed", () => {
        this.travelFrozen = true;
        // 渲染循环也整个停掉：update 的早退拦不住 Renderer 里 onFrame
        // 之后的那次 render，弃子场景继续出帧只是白烧 GPU（加载遮罩
        // 已经把画面盖住了）
        this.renderer.stop();
      }),
    );

    // 宠物首次进屋：镜头接管跟拍（V0.2 第一天流程的"镜头开始移动"）
    this.offEventListeners.push(
      on("pet_changed", ({ petId, reason }) => {
        if (reason === "spawn") {
          this.cutscenePetId = petId;
          this.rig.mode = "cutscene";
          this.controller.enabled = false;
          emit("cutscene_changed", { active: true });
        }
        if (reason === "entered" && this.cutscenePetId === petId) {
          this.cutscenePetId = null;
          this.rig.mode = "follow";
          this.controller.enabled = true;
          emit("cutscene_changed", { active: false });
        }
      }),
    );

    /**
     * 手上拿着能摆的东西 → 虚影跟着鼠标；换成别的 → 收起来。
     *
     * **这是"在不在摆"的唯一来源**。原来要按 F 才进布置模式，于是
     * "拿着落地灯"和"拿着落地灯且按过 F"是两个状态，而屏幕上没有任何东西
     * 告诉玩家现在是哪个。市面上角色在场的布置类（星露谷、动森、Minecraft）
     * 都没有这个模式：拿着就是能放。有布置模式的是模拟人生那一类，
     * 但那是整个游戏切进建造模式，是一个章节，不是每摆一件按一次键。
     *
     * 镜头**不再**跟着自动抬俯角了。抬俯角原来挂在"进入模式"上，而现在
     * 没有进入这个动作了——挂到选中格上的话，快捷栏划过一把椅子镜头就荡一下。
     * 低视角够不到远处地面格这件事由方向键微调解决（它本来就是为此加的）。
     */
    this.offEventListeners.push(
      on("held_changed", () => this.syncPlacementToHeld()),
    );

    // 扔出去的东西落地那一刻，问一句附近的槽位收不收
    this.offEventListeners.push(
      on("dropped_item_landed", ({ id }) => this.offerLandedItem(id)),
    );

    // 对话期间锁移动 + 镜头推近（动森式，说话的人占满画面）
    this.offEventListeners.push(
      on("dialogue_changed", ({ open }) => {
        // 过场自己管镜头，别抢
        if (this.cutscenePetId) return;

        this.controller.enabled = !open;
        if (open) {
          /**
           * 对话对象体型比人宽得多的话，默认距离（3.4）会把镜头怼进
           * 它身体里——舒舒体宽 1.6 米，贴着玩家取景时人和它站得又近
           * （交互半径本来就够不到 1.9 米外），画面下半部分全是它的肚子。
           * 按碰撞半径放宽距离；没有半径的小家伙（wisp）不变。
           */
          const dialoguePetId = getActiveDialogue()?.petId;
          const dialoguePet = dialoguePetId ? getPet(dialoguePetId) : undefined;
          const distance =
            dialoguePet && dialoguePet.radius > 0
              ? 3.4 + dialoguePet.radius * 2.4
              : undefined;
          this.rig.enterDialogue(distance);
        } else {
          this.rig.exitDialogue();
        }
      }),
    );

    // 行动 / 专注模式：开始时走到家具旁坐下，镜头推近；结束恢复
    this.offEventListeners.push(
      on("action_changed", ({ status }) => {
        if (status === "started") this.beginFocusSequence();
        else this.endFocusSequence();
      }),
    );

    // 睡眠：黑屏期间锁输入，醒来站起来
    this.offEventListeners.push(
      on("sleep_changed", ({ phase }) => {
        this.controller.enabled = phase === "end";
        if (phase === "end") standUp("sleep");
      }),
    );

    // 家具变化后重放一次环境：新摆下的灯具（lamp-light）立刻按当前时段点亮
    this.offEventListeners.push(
      on("world_changed", () => {
        this.applyEnvironment();
        // 坐着的那把椅子被搬走了 / 房间被清空了 → 自动起身
        reconcileResting();
        // 家具没了它的箱子也该没，否则存档会带着永远打不开的幽灵库存。
        // 活名单必须是**全世界**（活跃 + 搁置）的家具：prune 的语义是
        // "不在名单里就删"，只报当前图的话，别图所有箱子的内容会被当
        // 孤儿清掉，下一次自动存盘就永久落盘（箱庭审计的第一红灯）
        pruneOrphanStorages(allFurnitureInstanceIds());
        pruneOrphanGramophones(allFurnitureInstanceIds());
      }),
    );

    // 坐下 / 躺下 / 起身：把锚点换算成坐标和姿势
    this.offEventListeners.push(
      on("posture_changed", () => this.applyResting()),
    );

    /**
     * 昼夜与天气不再由调试命令手动设，而是订阅世界时钟与天气系统。
     * Lighting 与 WindowView 本来就吃 DayPhaseId / WeatherKind，一行都不用改。
     */
    this.offEventListeners.push(
      on("day_phase_changed", ({ phase }) => {
        this.phase = phase;
        this.applyEnvironment();
      }),
    );
    this.offEventListeners.push(
      on("weather_changed", ({ kind }) => {
        this.weather = kind;
        this.applyEnvironment();
      }),
    );

    // 首帧直接读当前值：事件只在"变化时"发，进场景时得主动同步一次
    this.phase = getClock().phase;
    this.weather = getWeather().kind;

    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    this.rig = new CameraRig(aspect);
    // 镜头锁定屋内：边界盒是**整栋房子**。多房间后镜头不锁分区——
    // 客厅进深只有 8 格，锁进去镜头会被顶成俯视。挡视线的内墙
    // 走和家具同一套遮挡淡出（动森的切妻做法），见 refreshOccluders
    this.rig.setRoomBounds(
      this.built.size.width,
      this.built.size.depth,
      // 露天房间（广场）没有天花板，矮墙 2 格锁镜头会把视角摁在地上
      getCurrentMap().openAir ? 10 : this.built.wallHeight,
    );
    // 开局就站在角色背后，不要让玩家看见镜头自己转过去
    this.rig.lookAtPoint(this.controller.x, this.controller.z);
    this.rig.snapBehind(this.controller.heading);

    this.lighting = new Lighting(
      this.scene,
      this.built.size.width,
      this.built.size.depth,
    );

    this.renderer = createRenderer(container, this.scene, this.rig.camera);
    this.placement = new PlacementController(
      this.scene,
      this.rig.camera,
      this.renderer.renderer.domElement,
      this.built.walls,
      () => this.furnitureView.findSurfaceHostViews(),
    );

    this.detachInput = this.attachInput();

    // 补一次初始同步。**必须在 placement 建好之后**——读档进来时手上可能
    // 已经拿着家具了，而 held_changed 早在场景构造之前就发完了
    this.syncPlacementToHeld();

    this.applyEnvironment();
    this.resize();

    this.renderer.start((delta) => this.update(delta));
  }

  private attachInput(): () => void {
    const canvas = this.renderer.renderer.domElement;
    const detachController = this.controller.attach();

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      const key = event.key.toLowerCase();

      // 想走就自动起身，不用先按 F。坐着躺着时移动输入被控制器忽略，
      // 所以这里必须先把姿态改回站立，否则玩家会以为卡住了
      if ("wasd".includes(key) && isResting()) standUp("moved");

      // Q/E 转向已退役：镜头改成鼠标左键拖拽（标准第三人称）
      if (key === "r") this.placement.rotate();

      // 布置模式：方向键逐格微调（鼠标在低俯角下够不到远处的格子）
      if (this.placement.active) {
        if (event.key === "ArrowUp") this.placement.nudge(0, -1);
        if (event.key === "ArrowDown") this.placement.nudge(0, 1);
        if (event.key === "ArrowLeft") this.placement.nudge(-1, 0);
        if (event.key === "ArrowRight") this.placement.nudge(1, 0);
      }
      /**
       * Esc 不再管布置了。
       *
       * 它原来的职责是"退出布置模式"，而现在没有模式可退——真按下去只会
       * 把虚影藏起来，然后下一次 held_changed 又给放出来，留下一个只有
       * 半秒寿命的状态。不想摆就换一格快捷栏，虚影本身不点击也不会落地。
       */
      // 配错了的出口：倒掉锅里的东西，锅还在（还没有垃圾桶这件家具）
      if (key === "g") this.dumpKitchen();
      if (key === "f") this.interact();
      if (key === "q") this.throwHeld();
    };

    /**
     * 触摸按钮走这条路，**不伪造 KeyboardEvent**。
     *
     * 合成的键盘事件 `isTrusted` 是 false，解锁不了音频（本项目踩过这个坑），
     * 而且等于把"按了哪个键"和"要做什么"焊死——键位以后要可重映射。
     */
    const offAction = on("game_action_requested", ({ action }) => {
      if (action === "interact") this.interact();
      else if (action === "throw") this.throwHeld();
      else if (action === "rotate_placement") this.placement.rotate();
      else if (action === "dump_kitchen") this.dumpKitchen();
    });
    this.offEventListeners.push(offAction);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      /**
       * 摆放模式下滚轮身兼两职：转方向，不缩放镜头。
       *
       * 摆家具时手在滚轮上找角度是很自然的动作（不用先松开鼠标去按 R），
       * 而这时候镜头缩放反而不太会用到——虚影已经贴着鼠标了，画面远近
       * 不影响摆放判断。两者选一个的话转向更常用，缩放让位。
       */
      if (this.placement.active) {
        this.placement.rotate(event.deltaY > 0 ? 1 : -1);
        return;
      }

      this.rig.zoom(event.deltaY * 0.01);
    };

    /**
     * 鼠标左键拖拽转镜头（标准第三人称）。
     *
     * 左键身兼两职：**短按是点击**（放置模式落座家具），
     * **拖动是转镜头**。用位移阈值区分——按下后移动超过 4 像素
     * 就判定成拖拽，这一次的抬起不再触发点击。
     * 主流第三人称游戏都是这么处理"一个键两种意图"的。
     *
     * setPointerCapture 是为了拖出画布边缘也不丢事件——
     * 少了它，甩镜头甩到窗口外面镜头就卡住不动了。
     */
    let dragPointerId: number | null = null;
    let dragLastX = 0;
    let dragLastY = 0;
    let dragDistance = 0;

    const DRAG_THRESHOLD_PIXELS = 4;

    /**
     * 还按着的手指。**触摸没有右键也没有滚轮**，这两件事要靠手势补：
     * 双指捏合 = 缩放，长按 = 拿起家具。
     * 用 Map 而不是数组：pointerup 时按 id 删，不用线性查找。
     */
    const activePointers = new Map<number, { x: number; y: number }>();

    /** 长按拿起的计时器和起点（手指挪动超过阈值就取消，那是在拖镜头） */
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    const LONG_PRESS_MS = 500;

    const cancelLongPress = (): void => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    /** 双指之间的距离。捏合缩放靠它的变化量 */
    let pinchDistance = 0;
    const distanceBetweenPointers = (): number => {
      const points = [...activePointers.values()];
      if (points.length < 2) return 0;
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };

    const onPointerDown = (event: PointerEvent) => {
      // 鼠标只认左键；触摸和笔没有 button 的概念（一律是 0）
      if (event.pointerType === "mouse" && event.button !== 0) return;

      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      // 第二根手指落下 = 进入捏合，记基准距离并放弃这一次的拖拽/点击
      if (activePointers.size === 2) {
        pinchDistance = distanceBetweenPointers();
        cancelLongPress();
        dragPointerId = null;
        return;
      }
      if (activePointers.size > 2) return;

      dragPointerId = event.pointerId;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      dragDistance = 0;
      canvas.setPointerCapture(event.pointerId);

      /**
       * 触摸的长按 = 鼠标的右键。摆放模式下不接管——那时候按住是在瞄位置，
       * 长按弹出"拿起别的家具"会把正在摆的那件挤掉。
       */
      if (event.pointerType !== "mouse" && !this.placement.active) {
        const { clientX, clientY } = event;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (this.pickFurnitureAt(clientX, clientY)) {
            // 拿起来了就取消这一次的点击，否则抬手会立刻把它放回去
            dragPointerId = null;
          }
        }, LONG_PRESS_MS);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const tracked = activePointers.get(event.pointerId);
      if (tracked) {
        tracked.x = event.clientX;
        tracked.y = event.clientY;
      }

      // 双指：捏合缩放，不转镜头（两根手指同时转会又转又缩，很难控制）
      if (activePointers.size >= 2) {
        const next = distanceBetweenPointers();
        if (pinchDistance > 0 && next > 0) {
          // 张开（next 变大）= 拉近，和滚轮上推拉近保持一致
          this.rig.zoom((pinchDistance - next) * 0.02);
        }
        pinchDistance = next;
        return;
      }

      if (dragPointerId === event.pointerId) {
        const dx = event.clientX - dragLastX;
        const dy = event.clientY - dragLastY;
        dragLastX = event.clientX;
        dragLastY = event.clientY;
        dragDistance += Math.abs(dx) + Math.abs(dy);

        // 手指挪了就不是长按了，是在拖镜头
        if (dragDistance > DRAG_THRESHOLD_PIXELS) cancelLongPress();

        if (dragDistance > DRAG_THRESHOLD_PIXELS) {
          this.rig.orbit(dx, dy);
          // 拖镜头时不喂放置预览，否则虚影会跟着乱跳
          return;
        }
      }

      this.placement.onPointerMove(event);
    };

    const onPointerUp = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      // 松到只剩一根手指：重新记基准，否则下一帧会按"双指距离突变"猛缩一下
      pinchDistance = activePointers.size >= 2 ? distanceBetweenPointers() : 0;
      cancelLongPress();

      if (dragPointerId !== event.pointerId) return;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      /**
       * 触摸落座家具前要先把虚影挪到手指位置。
       *
       * 鼠标一直在动，`onPointerMove` 早就把虚影喂到位了；手指是"点下去
       * 才第一次有位置"，不补这一下的话，第一次点击会把家具放到**上一次**
       * 手指抬起的地方——而那通常是屏幕另一头。
       */
      if (
        dragDistance <= DRAG_THRESHOLD_PIXELS &&
        event.pointerType !== "mouse" &&
        this.placement.active
      ) {
        this.placement.onPointerMove(event);
      }

      // 拖过就不是点击了
      if (dragDistance <= DRAG_THRESHOLD_PIXELS) this.placement.onClick();
      dragPointerId = null;
    };

    const onPointerCancel = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      pinchDistance = 0;
      cancelLongPress();
      if (dragPointerId === event.pointerId) dragPointerId = null;
    };

    // 右键拿起家具（V0.2：右键举起）。触摸那边是长按，见 onPointerDown
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (this.placement.active) return;
      this.pickFurnitureAt(event.clientX, event.clientY);
    };

    window.addEventListener("keydown", onKeyDown);
    this.container.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      detachController();
      cancelLongPress();
      window.removeEventListener("keydown", onKeyDown);
      this.container.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }

  /**
   * 屏幕坐标处有家具就拿起来，返回拿没拿到。
   * 鼠标右键和触摸长按共用——两条路要选中同一件东西。
   */
  private pickFurnitureAt(clientX: number, clientY: number): boolean {
    const rect = this.renderer.renderer.domElement.getBoundingClientRect();
    this.pickPointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.pickRaycaster.setFromCamera(this.pickPointer, this.rig.camera);

    const hits = this.pickRaycaster.intersectObject(
      this.furnitureView.root,
      true,
    );
    for (const hit of hits) {
      let node: typeof hit.object | null = hit.object;
      while (node && !node.userData.instanceId) node = node.parent;
      if (node?.userData.instanceId) {
        const result = pickupFurniture(node.userData.instanceId as string);
        // 被挡要说话：右键一张摆着东西的桌子毫无反应，玩家只会以为坏了
        if (result.ok === false && result.reason === "not_empty") {
          pushChatMessage({
            kind: ChatMessageKind.System,
            text: t("placement.not_empty"),
          });
        }
        return true;
      }
    }
    return false;
  }

  /** 行动开始：A* 走到支撑家具旁的空格，面向家具，进入专注 */
  private beginFocusSequence(): void {
    const action = getActiveAction();
    if (!action) return;

    const { placedFurniture, room, occupancy } = getWorld();
    const placed = placedFurniture.find(
      (item) => item.instanceId === action.furnitureInstanceId,
    );
    const definition = placed ? getDefinition(placed.furnitureId) : undefined;
    if (!placed || !definition) return;

    const { gridPosition, facing } = placed.placement;
    const rotated = facing === Facing.East || facing === Facing.West;
    const { footprint } = definition.placement;
    const w = rotated ? footprint.height : footprint.width;
    const h = rotated ? footprint.width : footprint.height;

    const centerX = gridPosition.x - room.floorGrid.width / 2 + w / 2;
    const centerZ = gridPosition.y - room.floorGrid.height / 2 + h / 2;

    // 家具四周找一个可走的邻格
    const candidates: Array<{ x: number; y: number }> = [];
    for (let dx = -1; dx <= w; dx += 1) {
      candidates.push({ x: gridPosition.x + dx, y: gridPosition.y - 1 });
      candidates.push({ x: gridPosition.x + dx, y: gridPosition.y + h });
    }
    for (let dy = 0; dy < h; dy += 1) {
      candidates.push({ x: gridPosition.x - 1, y: gridPosition.y + dy });
      candidates.push({ x: gridPosition.x + w, y: gridPosition.y + dy });
    }

    const start = {
      x: Math.floor(this.controller.x + room.floorGrid.width / 2),
      y: Math.floor(this.controller.z + room.floorGrid.height / 2),
    };

    this.controller.enabled = false;

    for (const cell of candidates) {
      if (occupancy.blocked.has(`${cell.x},${cell.y}`)) continue;
      const path = findPath(room.floorGrid, occupancy, start, cell, {
        allowBlockedGoal: false,
      });
      if (!path) continue;

      const points = path.map(
        (p): [number, number] => [
          p.x - room.floorGrid.width / 2 + 0.5,
          p.y - room.floorGrid.height / 2 + 0.5,
        ],
      );
      this.controller.walkAlong(points, () => {
        this.enterFocusPose(centerX, centerZ);
      });
      return;
    }

    // 找不到路就原地进入专注（至少不阻塞行动）
    this.enterFocusPose(centerX, centerZ);
  }

  /**
   * 到位之后摆出干活的样子。
   *
   * **旁边有空椅子就先坐下**——这就是"坐"作为动作原语被行动系统调用的地方，
   * 走的是和按 F 坐下完全同一条路（restAtNearest）。
   * 坐下之后再叠加 desk 活动层，于是「坐着学习」= sit + desk 两层。
   */
  private enterFocusPose(furnitureX: number, furnitureZ: number): void {
    const seated = restAtNearest(
      BodyPosture.Sit,
      { x: this.controller.x, z: this.controller.z },
      // 只坐手边这一两格内的椅子，不会跑到房间另一头
      { maxCells: 2 },
    );

    // 坐姿的朝向由椅子决定（椅子朝哪你就朝哪），所以坐下了就别再扭头看家具，
    // 否则会变成"歪着身子坐在椅子上"。站着干活才需要面向家具
    if (!seated) this.controller.faceToward(furnitureX, furnitureZ);

    this.controller.activity = "desk";
    this.rig.enterFocus();
  }

  private endFocusSequence(): void {
    this.controller.cancelScriptedWalk();
    this.controller.activity = null;
    // 干完活站起来。standUp 会把人退回坐下之前站的位置
    standUp("action");
    this.controller.enabled = true;
    this.rig.exitFocus();
  }

  /** 找角色附近最近的可交互目标（每 0.15s 查一次，遍历便宜） */
  private refreshInteractTarget(): void {
    const { placedFurniture } = getWorld();
    const { width, depth } = this.built.size;

    let best:
      | {
          kind: "station";
          instanceId: string;
          capability: StationCapability;
        }
      | { kind: "pet"; petId: string }
      | { kind: "door"; refId: string }
      | null = null;
    let bestDistance = 1.9;

    // 门和宠物/工作站平级，按距离竞争。大门也在内——出门就靠它
    for (const door of listDoors()) {
      const distance = Math.hypot(
        door.center.x - this.controller.x,
        door.center.z - this.controller.z,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { kind: "door", refId: door.refId };
      }
    }

    // 宠物优先级和工作站平级，按距离竞争
    for (const pet of getPets()) {
      if (pet.state === "hidden" || pet.state === "entering") continue;
      const distance = Math.hypot(
        pet.x - this.controller.x,
        pet.z - this.controller.z,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { kind: "pet", petId: pet.petId };
      }
    }

    // 提示气泡的目标独立于"按 F 干什么"：所有带 interactHint 的家具都会浮气泡，
    // 哪怕它暂时没有可执行的交互（比如盆栽），这样房间才有"处处可点"的生机
    let bestHint: HintTarget | null = null;
    let bestHintDistance = 2.4;

    for (const placed of placedFurniture) {
      const definition = getDefinition(placed.furnitureId);
      if (!definition?.placement.interactHint) continue;

      const center = furnitureWorldCenter(
        placed,
        definition.placement,
        this.built.size,
      );
      const distance = Math.hypot(
        center.x - this.controller.x,
        center.z - this.controller.z,
      );
      if (distance >= bestHintDistance) continue;

      bestHintDistance = distance;

      /**
       * 唱片机的气泡显示**当前播放模式**（顺序播放/随机播放/单曲循环），
       * 按 F 切完文案立刻换。和门的开/关一个道理：气泡描述的是状态，
       * 状态在运行时，数据表里那个 key 只是兜底。
       */
      const holdingRecord = Boolean(
        findItemDefinition(getSelectedStack()?.itemId ?? "")?.record,
      );
      const hint = definition.placement.capabilities.includes(
        FurnitureCapability.MusicPlayer,
      )
        ? {
            ...definition.placement.interactHint,
            // 拿着唱片时 F 的含义变了，气泡跟着变（和门开/关同理）
            localizationKey: holdingRecord
              ? "hint.gramophone_insert"
              : `music.mode.${getMusicMode()}`,
          }
        : definition.placement.interactHint;

      bestHint = {
        instanceId: placed.instanceId,
        hint,
        world: new Vector3(
          center.x,
          definition.placement.interactHint.anchorHeight ?? 1.2,
          center.z,
        ),
      };
    }
    // 门的气泡和家具提示竞争同一个位置：开门/关门/锁着，随实体状态换词
    for (const door of listDoors()) {
      const distance = Math.hypot(
        door.center.x - this.controller.x,
        door.center.z - this.controller.z,
      );
      if (distance >= bestHintDistance) continue;
      bestHintDistance = distance;
      /*
       * 锁着的门也照常显示"开门"——F 试图做的正是开门这件事。
       * 写"锁着"是提前替玩家把门试过了。
       */
      bestHint = {
        instanceId: door.refId,
        hint: {
          localizationKey: door.open ? "door.hint.close" : "door.hint.open",
          action: "interact",
        },
        world: new Vector3(door.center.x, 1.7, door.center.z),
      };
    }
    this.hintTarget = bestHint;

    for (const placed of placedFurniture) {
      const definition = getDefinition(placed.furnitureId);
      if (!definition) continue;

      const capability = definition.placement.capabilities.includes(
        FurnitureCapability.Unpack,
      )
        ? ("unpack" as const)
        : definition.placement.capabilities.includes(FurnitureCapability.DailyBoard)
        ? ("daily_board" as const)
        : definition.placement.capabilities.includes(FurnitureCapability.MusicPlayer)
        ? ("music_player" as const)
        : definition.placement.capabilities.includes(FurnitureCapability.Crafting)
        ? ("crafting" as const)
        : definition.placement.capabilities.includes(FurnitureCapability.Cooking)
          ? ("cooking" as const)
          : definition.placement.capabilities.includes(FurnitureCapability.Storage)
            ? ("storage" as const)
            : // 床优先当"躺"处理；沙发这类只有 Sitting 的落到坐
              definition.placement.capabilities.includes(FurnitureCapability.Sleep)
              ? ("sleep" as const)
              : definition.placement.capabilities.includes(FurnitureCapability.Sitting)
                ? ("sitting" as const)
                : null;
      if (!capability) continue;

      // 坐具坐满了就别再抢交互目标，否则走近沙发按 F 毫无反应还不知道为什么
      if (
        (capability === "sitting" || capability === "sleep") &&
        !hasFreeAnchor(
          placed.instanceId,
          capability === "sleep" ? BodyPosture.Lie : BodyPosture.Sit,
        )
      ) {
        continue;
      }

      const { gridPosition, facing } = placed.placement;
      const rotated = facing === Facing.East || facing === Facing.West;
      const w = rotated
        ? definition.placement.footprint.height
        : definition.placement.footprint.width;
      const h = rotated
        ? definition.placement.footprint.width
        : definition.placement.footprint.height;

      /**
       * 距离算到**占地矩形的最近边**，不是中心。
       *
       * 原来按中心算、阈值 1.9——那是给 1×1、2×1 小家具定的。
       * L 形橱柜占 6×4，中心离灶眼就有 2.35 米，玩家贴着灶台站着
       * 也锁不上交互目标，"灶台上放不了东西"就是这么来的。
       * 按最近边算，家具多大都能正常交互。
       */
      const minX = gridPosition.x - width / 2;
      const minZ = gridPosition.y - depth / 2;
      const distance = Math.hypot(
        Math.max(minX - this.controller.x, 0, this.controller.x - (minX + w)),
        Math.max(minZ - this.controller.z, 0, this.controller.z - (minZ + h)),
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        best = { kind: "station", instanceId: placed.instanceId, capability };
      }
    }

    const keyOf = (
      target: typeof best | typeof this.interactTarget,
    ): string =>
      target === null
        ? "none"
        : target.kind === "pet"
          ? `pet:${target.petId}`
          : target.kind === "door"
            ? `door:${target.refId}`
            : `station:${target.instanceId}:${target.capability}`;

    if (keyOf(best) === keyOf(this.interactTarget)) return;

    this.interactTarget = best;

    if (best === null) {
      emit("interact_target_changed", null);
    } else if (best.kind === "pet") {
      emit("interact_target_changed", { kind: "pet", petId: best.petId });
    } else if (best.kind === "door") {
      emit("interact_target_changed", { kind: "door", refId: best.refId });
    } else {
      emit("interact_target_changed", {
        kind: "station",
        instanceId: best.instanceId,
        furnitureId:
          placedFurniture.find((item) => item.instanceId === best.instanceId)
            ?.furnitureId ?? "",
        capability: best.capability,
      });
    }
  }

  /**
   * 坐具 / 床的提示文案。同一件家具在不同状态下该说的话不一样：
   * 站着看椅子是"坐下"，坐着看它是"起来"，躺在床上是"睡吧"。
   */
  private describeRestingHint(instanceId: string): string | null {
    const resting = getResting();

    if (resting?.instanceId === instanceId) {
      const ref = findAnchor(resting.instanceId, resting.anchorId);
      if (ref?.anchor.posture === BodyPosture.Lie) {
        const placed = getWorld().placedFurniture.find(
          (item) => item.instanceId === instanceId,
        );
        const definition = placed
          ? getDefinition(placed.furnitureId)
          : undefined;
        if (definition?.placement.capabilities.includes(FurnitureCapability.Sleep)) {
          return "hint.sleep_now";
        }
      }
      return "hint.stand";
    }

    /**
     * 站着的时候不覆盖——让家具自己写好的味道文案出来
     * （"坐下歇会儿"比"坐下"好听）。这个函数只负责补上**状态变了之后**
     * 家具数据表达不了的那几句：起来、睡吧。
     */
    return null;
  }

  /**
   * 主交互（键盘 F / 手机上的主按钮）。
   *
   * 从 onKeyDown 的 if 链里抽出来的：键盘和触摸按钮要走**同一条路**，
   * 否则手机上那套要么复制一份逻辑（两边迟早漂），要么伪造 KeyboardEvent
   * （合成事件 isTrusted 为 false，解锁不了音频——这个坑本项目踩过）。
   *
   * 优先级：坐着躺着时含义变了（起身 / 睡觉）→ 附近有目标就操作目标 →
   * 都没有就用手上那件东西。
   */
  interact(): void {
    if (isResting()) {
      this.interactWhileResting();
      return;
    }

    if (this.interactTarget) {
      if (this.interactTarget.kind === "door") {
        const { refId } = this.interactTarget;
        const agent = findDoorAgent(refId);
        if (agent?.interact() === "locked") {
          /*
           * 锁着不是靠气泡预告的，是**推一下才发现**：门板顶一下弹回来，
           * 同时旁白说一句。预先在气泡上写"锁着"等于替玩家把门试过了，
           * 那扇门就再也没有"咦"的一下。
           *
           * 门每次都晃（物理反馈该跟手），话有 2 秒冷却——连按 F 时
           * 同一句话刷满消息栏，比不说还糟。
           */
          this.roomDoorViews.get(refId)?.nudge();
          const now = performance.now();
          if (now - this.lastLockedNoticeAt > 2000) {
            this.lastLockedNoticeAt = now;
            pushChatMessage({
              kind: ChatMessageKind.Story,
              text: t("door.locked_feedback"),
            });
          }
        }
        return;
      }
      if (this.interactTarget.kind === "station") {
        if (this.interactTarget.capability === "sleep") {
          // 床先躺下，躺着再按 F 才睡觉（睡觉是躺着之后的第二步）
          this.restAtTarget(BodyPosture.Lie);
        } else if (this.interactTarget.capability === "storage") {
          const { instanceId } = this.interactTarget;
          emit("storage_open_requested", {
            instanceId,
            furnitureId:
              getWorld().placedFurniture.find(
                (item) => item.instanceId === instanceId,
              )?.furnitureId ?? "",
          });
        } else if (this.interactTarget.capability === "sitting") {
          this.restAtTarget(BodyPosture.Sit);
        } else if (this.interactTarget.capability === "unpack") {
          // 纸箱/奖励箱：弹领取面板，收下才真的入包并消失
          openUnpack(this.interactTarget.instanceId);
        } else if (this.interactTarget.capability === "daily_board") {
          emit("daily_board_open_requested", {});
        } else if (this.interactTarget.capability === "music_player") {
          /*
           * 两种 F（2026-08-05 定）：
           * - **手上拿着唱片** → 换唱片：新的塞进去，旧的从机器里
           *   弹出来落地自己捡（走 throwItem，物理和联机同步现成）。
           * - 空手 → 轻交互，循环切播放模式（顺序→随机→单曲循环）。
           * 反馈都走消息栏一句 + 气泡文案（下面 hint 动态覆盖）。
           */
          const held = getSelectedStack();
          const heldRecord = held
            ? findItemDefinition(held.itemId)?.record
            : undefined;
          if (held && heldRecord) {
            const machineId = this.interactTarget.instanceId;
            const ejected = recordIn(machineId);
            if (ejected === held.itemId) {
              // 同一张再塞一遍没有意义，告诉玩家它已经在里面了
              pushChatMessage({
                kind: ChatMessageKind.System,
                text: t("music.record_already_in"),
              });
            } else {
              consumeSelectedOne();
              setRecord(machineId, held.itemId);
              // 旧唱片从机器那儿朝玩家弹出来。roomIdAt/getWorld 已在本文件引入
              if (ejected) {
                const placed = getWorld().placedFurniture.find(
                  (item) => item.instanceId === machineId,
                );
                const center = placed
                  ? furnitureWorldCenter(
                      placed,
                      getDefinition(placed.furnitureId)!.placement,
                      this.built.size,
                    )
                  : { x: this.controller.x, z: this.controller.z };
                throwItem({
                  roomId: roomIdAt(center.x, center.z),
                  stack: {
                    stackId: `record:${ejected}`,
                    itemId: ejected,
                    quantity: 1,
                  },
                  from: { x: center.x, z: center.z },
                  heading: Math.atan2(
                    this.controller.x - center.x,
                    this.controller.z - center.z,
                  ),
                });
              }
              const albumId = heldRecord.albumId;
              pushChatMessage({
                kind: ChatMessageKind.System,
                text: `♪ ${t("music.record_swapped")}${albumLabelOf(albumId)}`,
              });
            }
          } else {
            const mode = cycleMusicMode();
            pushChatMessage({
              kind: ChatMessageKind.System,
              text: `♪ ${t(`music.mode.${mode}`)}`,
            });
          }
        } else if (this.interactTarget.capability === "cooking") {
          // 灶台不开面板：菜是真的在锅里做出来的。
          // 对着离自己最近的那个灶眼操作（放锅 / 投料 / 起锅 / 端起来）
          const slot = this.nearestKitchenSlot();
          if (slot) interactWithKitchenSlot(slot);
        } else {
          emit("station_open_requested", {
            instanceId: this.interactTarget.instanceId,
            capability: this.interactTarget.capability,
          });
        }
      } else {
        /**
         * 对话选哪一段是**这只宠物的内容**，不是交互系统的逻辑——
         * 原来这里直接写死 moss_wisp_first_meet/casual 两个字面量 id，
         * 加舒舒发现这处理只认得苔灵一个物种。现在按 PetDefinition
         * 声明的 dialogues/bondEventId 查，加宠物不用回来改这段。
         */
        const petId = this.interactTarget.petId;
        const pet = getPet(petId);
        const definition = pet ? findPetDefinition(pet.definitionId) : undefined;
        const known = definition?.bondEventId
          ? getEventStage(definition.bondEventId) === "gifted"
          : true;
        const dialogueId = known
          ? definition?.dialogues?.casual
          : definition?.dialogues?.firstMeet;

        if (dialogueId) {
          // 已经认识、还在睡的话先醒过来再聊——日常寒暄没有专门的
          // "戳醒"仪式，那是初见剧情自己的桥段
          if (known && pet?.state === "sleeping") pet.wakeUp();
          startDialogue(dialogueId, petId);
        }
      }
      return;
    }

    /**
     * 附近没有可交互目标时，F = **用手上那件东西**（现在只剩"吃"）。
     *
     * 原来这件事绑在"按数字键选中快捷栏"上，于是想看看 3 号格是什么，
     * 一按就把菜吃了。选中和使用是两回事，帮助行里写的也一直是"F 使用"。
     */
    eatHeldItem();
  }

  /**
   * 摇杆推的方向（各轴 -1~1）。触摸层每帧喂进来，键盘那侧不受影响。
   *
   * 走这里而不是让 UI 直接摸 `controller`：控制器是 Interaction 层的内部
   * 实现，React 组件不该知道它存在——同理，将来换成手柄摇杆也是喂这一个口。
   */
  setMoveInput(x: number, z: number): void {
    this.controller.setExternalMove(x, z);
    // 坐着躺着时摇杆推不动人，得先起身——和键盘 WASD 那条一样的处理
    if ((x !== 0 || z !== 0) && isResting()) standUp("moved");
  }

  /** 把手上那一份扔出去（键盘 Q / 手机上的扔出按钮） */
  throwHeld(): void {
    throwHeldItem({
      x: this.controller.x,
      z: this.controller.z,
      heading: this.controller.heading,
    });
  }

  /** 配错了的出口：倒掉锅里的东西，锅还在（还没有垃圾桶这件家具） */
  dumpKitchen(): void {
    const slot = this.nearestKitchenSlot();
    if (slot) dumpKitchenSlot(slot);
  }

  /** 走到跟前按 F：占用目标家具上离自己最近的空锚点 */
  private restAtTarget(posture: BodyPosture): void {
    if (this.interactTarget?.kind !== "station") return;

    restAtNearest(
      posture,
      { x: this.controller.x, z: this.controller.z },
      { instanceId: this.interactTarget.instanceId },
    );
  }

  /**
   * 坐着 / 躺着时按 F。
   *
   * 躺在床上按 F = 睡觉（睡觉是躺下之后的第二步，不是一键完成）；
   * 其余情况 = 起身。
   */
  private interactWhileResting(): void {
    const resting = getResting();
    const ref = resting
      ? findAnchor(resting.instanceId, resting.anchorId)
      : undefined;

    if (ref?.anchor.posture === BodyPosture.Lie) {
      const placed = getWorld().placedFurniture.find(
        (item) => item.instanceId === ref.instanceId,
      );
      const definition = placed ? getDefinition(placed.furnitureId) : undefined;

      // 只有真正能睡的家具（带 Sleep 能力）才睡；躺在沙发上只是躺着
      if (definition?.placement.capabilities.includes(FurnitureCapability.Sleep)) {
        startSleep();
        return;
      }
    }

    standUp("player");
  }

  /**
   * 把"坐在哪个锚点"落到角色身上：位置、朝向、离地高度、姿势。
   *
   * 这是 Core 的锚点数据到画面的**唯一落地点**。
   * 承托面高度只从 anchor.offset.y 来，姿势只管肢体角度，两边不重复存高度。
   */
  private applyResting(): void {
    const resting = getResting();

    if (!resting) {
      this.controller.posture = DEFAULT_POSTURE;
      this.controller.supportY = 0;

      // 退回坐下之前站的地方。不退的话人会站在椅子占的格子里
      // （椅子 blocksMovement），只能靠"卡住脱困"挪出来，很难看
      if (this.restingReturnTo) {
        this.controller.teleport(
          this.restingReturnTo.x,
          this.restingReturnTo.z,
        );
        this.restingReturnTo = null;
      }
      return;
    }

    this.restingReturnTo = resting.returnTo;

    const ref = findAnchor(resting.instanceId, resting.anchorId);
    const placed = getWorld().placedFurniture.find(
      (item) => item.instanceId === resting.instanceId,
    );
    const definition = placed ? getDefinition(placed.furnitureId) : undefined;

    if (!ref || !placed || !definition) return;
    if (placed.placement.kind !== PlacementSurface.Floor) return;

    const world = slotWorldPosition(
      placed.placement,
      definition.placement.footprint,
      ref.anchor.offset,
      this.built.size,
    );

    const poseId = ref.anchor.poseId ?? defaultPoseFor(ref.anchor.posture);
    const pose = findPosture(poseId);

    this.controller.teleport(world.x, world.z);
    this.controller.posture = poseId;
    // 胯部落在承托面上；躺着还要再抬起半个身子的厚度，不然会陷进床垫
    this.controller.supportY =
      world.y - HIP_HEIGHT + (pose.supportLift ?? 0);
    this.controller.faceToward(
      world.x + FACING_VECTOR[ref.facing][0],
      world.z + FACING_VECTOR[ref.facing][1],
    );
  }

  /** 槽位的世界坐标。墙面家具没有槽位，所以只处理地面家具 */
  private kitchenSlotWorld(
    ref: KitchenSlotRef,
  ): { x: number; y: number; z: number } | null {
    const placed = getWorld().placedFurniture.find(
      (item) => item.instanceId === ref.instanceId,
    );
    if (!placed || placed.placement.kind !== PlacementSurface.Floor) return null;

    const definition = getDefinition(placed.furnitureId);
    if (!definition) return null;

    return slotWorldPosition(
      placed.placement,
      definition.placement.footprint,
      ref.slot.offset,
      this.built.size,
    );
  }

  /**
   * 离玩家最近的槽位。灶台有左右两个灶眼，站位决定操作哪一个——
   * 这比"弹个面板让你选"自然得多。
   */
  private nearestKitchenSlot(instanceId?: string): KitchenSlotRef | undefined {
    let best: KitchenSlotRef | undefined;
    let bestDistance = 2.2;

    for (const ref of listKitchenSlots()) {
      if (instanceId && ref.instanceId !== instanceId) continue;

      const world = this.kitchenSlotWorld(ref);
      if (!world) continue;

      const distance = Math.hypot(
        world.x - this.controller.x,
        world.z - this.controller.z,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ref;
      }
    }

    return best;
  }

  /**
   * 把当前提示气泡投影到屏幕坐标供 React 定位。
   * 每帧被 UI 层拉取，所以复用同一个 Vector3，不产生垃圾。
   */
  getHintBubble(): {
    instanceId: string;
    localizationKey: string;
    action?: string;
    x: number;
    y: number;
  } | null {
    if (!this.hintTarget) return null;

    /**
     * 厨具的气泡挂到**最近的那个槽位**，不是家具中心。
     *
     * L 形橱柜占 6×4，气泡挂中心就浮在凹口上方——三个灶眼共用一个
     * 飘在半空的提示，玩家看不出说的是哪一个。挂到槽位上之后，
     * 你站在哪个灶眼前，气泡就在那个灶眼上，"是哪一个"不言自明。
     */
    const kitchenSlot = this.nearestKitchenSlot(this.hintTarget.instanceId);
    const slotWorld = kitchenSlot ? this.kitchenSlotWorld(kitchenSlot) : null;

    if (slotWorld) {
      this.projectScratch.set(slotWorld.x, slotWorld.y + 0.45, slotWorld.z);
    } else {
      this.projectScratch.copy(this.hintTarget.world);
    }
    this.projectScratch.project(this.rig.camera);

    // 投影到相机背后时 z > 1，此时不显示
    if (this.projectScratch.z > 1) return null;

    // 厨具的提示随手上端着什么实时变（"放上灶眼" / "投进锅里" / "起锅"），
    // 所以这里每帧问一次规则表，而不是用家具那句写死的静态提示
    const kitchenHint = kitchenSlot ? describeKitchenSlot(kitchenSlot) : null;

    // 坐 / 躺同理：同一件家具在"站着"和"坐着"时该说的话不一样
    const restingHint = this.describeRestingHint(this.hintTarget.instanceId);

    /**
     * 没有可执行动作时显示**槽位状态**而不是家具那句"做饭"。
     * 空手站在空灶眼前，"按 F 做饭"是句假话——按了什么也不会发生。
     * 改成报状态（"空灶眼" / 锅里装着什么），并且不显示按键标签。
     */
    const slotStatus =
      kitchenSlot && !kitchenHint
        ? kitchenSlot.content
          ? "cooking.status.has_cookware"
          : "cooking.status.empty_burner"
        : null;

    const rect = this.container.getBoundingClientRect();
    return {
      instanceId: this.hintTarget.instanceId,
      localizationKey:
        kitchenHint ?? restingHint ?? slotStatus ?? this.hintTarget.hint.localizationKey,
      // 没有可执行动作就别显示按键——按了不会发生任何事
      action: slotStatus ? undefined : this.hintTarget.hint.action,
      x: rect.left + ((this.projectScratch.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - this.projectScratch.y) / 2) * rect.height,
    };
  }

  /**
   * 角色头顶的屏幕坐标。说话气泡挂在这里。
   *
   * 和 getHintBubble 共用同一套投影（世界坐标 → NDC → 容器内像素），
   * 各写一份的话镜头缩放时两个气泡会对不齐——它们本来就该在同一个平面上。
   */
  getSpeechAnchor(): { x: number; y: number } | null {
    this.projectScratch.set(
      this.controller.x,
      HEAD_TOP_HEIGHT + this.controller.supportY + 0.28,
      this.controller.z,
    );
    this.projectScratch.project(this.rig.camera);

    // 投影到相机背后时 z > 1
    if (this.projectScratch.z > 1) return null;

    const rect = this.container.getBoundingClientRect();
    return {
      x: rect.left + ((this.projectScratch.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - this.projectScratch.y) / 2) * rect.height,
    };
  }

  /**
   * 从相机往角色身上的若干采样点打射线，挡在中间的家具要让开。
   *
   * 只取"比角色近"的命中——角色背后的家具没挡着任何东西，
   * 淡掉它们只会让屋子平白空一块。采样点的取法见 `OCCLUSION_SAMPLES`。
   */
  private refreshOccluders(): void {
    const camera = this.rig.camera.position;

    // 屏幕右方（水平面内、垂直于相机→角色的方向），横向采样沿它偏移
    const flatX = this.controller.x - camera.x;
    const flatZ = this.controller.z - camera.z;
    const flatLength = Math.hypot(flatX, flatZ);
    if (flatLength < 0.001) return;
    const rightX = -flatZ / flatLength;
    const rightZ = flatX / flatLength;

    const next = new Set<string>();

    for (const sample of OCCLUSION_SAMPLES) {
      this.occlusionOrigin.copy(camera);
      this.occlusionDirection
        .set(
          this.controller.x + rightX * sample.lateral,
          sample.height,
          this.controller.z + rightZ * sample.lateral,
        )
        .sub(this.occlusionOrigin);

      const toCharacter = this.occlusionDirection.length();
      if (toCharacter < 0.001) continue;
      this.occlusionDirection.divideScalar(toCharacter);

      this.occlusionRaycaster.set(this.occlusionOrigin, this.occlusionDirection);
      // 留一点余量，免得贴着角色的桌沿被判成遮挡物反复闪
      this.occlusionRaycaster.far = Math.max(toCharacter - 0.35, 0.01);

      for (const hit of this.occlusionRaycaster.intersectObject(
        this.furnitureView.root,
        true,
      )) {
        let node: typeof hit.object | null = hit.object;
        while (node && !node.userData.instanceId) node = node.parent;
        if (node?.userData.instanceId) {
          next.add(node.userData.instanceId as string);
        }
      }
    }

    this.furnitureView.setOccluders(next);

    // 墙体同理：挡在镜头和角色之间就整段让开（动森切妻）。
    // 命中即淡出，放开要等几拍——和家具的滞回一个道理。
    //
    // V0.13 起检测三组：内墙隔断、外墙皮、屋顶。人在屋内时后两组
    // 永远打不中（射线整段都在屋内，外皮和屋顶都在体外）；人在屋外、
    // 房子挡住镜头时，命中的那面外墙/屋顶整体让开——"从外面看得到
    // 屋里的布局"就是这一条在干活。
    const hitWalls = new Set<import("three").Object3D>();
    for (const sample of OCCLUSION_SAMPLES) {
      this.occlusionOrigin.copy(this.rig.camera.position);
      this.occlusionDirection
        .set(
          this.controller.x,
          sample.height,
          this.controller.z,
        )
        .sub(this.occlusionOrigin);
      const distance = this.occlusionDirection.length();
      if (distance < 0.001) continue;
      this.occlusionDirection.divideScalar(distance);
      this.occlusionRaycaster.set(this.occlusionOrigin, this.occlusionDirection);
      this.occlusionRaycaster.far = Math.max(distance - 0.35, 0.01);
      for (const group of this.occluderGroups()) {
        for (const hit of this.occlusionRaycaster.intersectObject(group, true)) {
          let node: import("three").Object3D | null = hit.object;
          while (node && node.parent !== group) node = node.parent;
          if (node) hitWalls.add(node);
        }
      }
    }

    for (const group of this.occluderGroups()) {
      for (const segment of group.children) {
        if (hitWalls.has(segment)) {
          this.wallReleaseTicks.set(segment.uuid, 3);
        } else {
          const left = (this.wallReleaseTicks.get(segment.uuid) ?? 0) - 1;
          if (left > 0) this.wallReleaseTicks.set(segment.uuid, left);
          else this.wallReleaseTicks.delete(segment.uuid);
        }
      }
    }
  }

  /** 参与遮挡淡出的三组墙体（直接子节点 = 淡出单位） */
  private occluderGroups(): import("three").Object3D[] {
    return [
      this.built.interiorWalls,
      this.built.exteriorWalls,
      this.built.roofShell,
    ];
  }

  private update(deltaSeconds: number): void {
    // 换图后这个场景已是弃子，只等 React 拆——不许再动任何状态
    if (this.travelFrozen) return;

    this.controller.update(deltaSeconds, this.rig.azimuthDegrees);

    // 音景要知道玩家站在哪儿（家具音的距离衰减、分区档案、脚步声）。
    // 往里推而不是让音景去问控制器——控制器是 Interaction 层的，反向依赖会绕一圈
    updateListener(this.controller.x, this.controller.z, deltaSeconds);

    tickPets(
      deltaSeconds,
      { x: this.controller.x, z: this.controller.z },
      getActiveDialogue()?.petId,
    );
    // 宠物走完再让门看一眼谁靠近了——同帧的位置，门不会慢半拍
    tickDoors();
    this.syncCameraBounds();
    this.petView.update(deltaSeconds);
    this.remotePlayers.update(deltaSeconds);
    this.dailyBoardAnimator.update(deltaSeconds);
    this.gramophoneAnimator.update(deltaSeconds);

    // 火候：只有架在灶眼上、且内容匹配到配方的锅才会走进度
    tickKitchen(deltaSeconds);
    this.cookwareView.update(this.rig.camera, deltaSeconds);

    tickDroppedItems(deltaSeconds);
    tickItemPickup({ x: this.controller.x, z: this.controller.z });
    this.droppedItemView.update(deltaSeconds);

    // 过场：镜头跟拍进屋的宠物；平时跟随角色。
    // 第三个参数是被拍者**脚下**的高度——世界里不再只有一个地面了，
    // 不传的话人走进院子（-floorLevel）会被框低一截
    if (this.cutscenePetId) {
      const pet = getPet(this.cutscenePetId);
      if (pet) this.rig.lookAtPoint(pet.x, pet.z, groundHeightAt(pet.x, pet.z));
    } else {
      const dialoguePetId = getActiveDialogue()?.petId;
      const dialoguePet = dialoguePetId ? getPet(dialoguePetId) : undefined;
      if (dialoguePet && dialoguePet.radius > 0) {
        // 对着体型比人大得多的对象说话：镜头看两者中点，不然贴着玩家
        // 取景会让镜头埋进它身体里（配合上面 enterDialogue 放宽的距离）
        const midX = (this.controller.x + dialoguePet.x) / 2;
        const midZ = (this.controller.z + dialoguePet.z) / 2;
        this.rig.lookAtPoint(midX, midZ, groundHeightAt(midX, midZ));
      } else {
        this.rig.lookAtPoint(
          this.controller.x,
          this.controller.z,
          this.controller.supportY,
        );
      }
    }
    this.rig.update(deltaSeconds);

    // 遮挡检测限流，淡入淡出本身每帧走——否则透明度会一跳一跳的
    this.occlusionCheckTimer += deltaSeconds;
    if (this.occlusionCheckTimer > 0.1) {
      this.occlusionCheckTimer = 0;
      this.refreshOccluders();
    }
    this.furnitureView.tickFade(deltaSeconds);
    // 墙体（内墙/外墙/屋顶）的淡出淡回每帧推进，检测在 refreshOccluders 里限流。
    // 外墙和屋顶淡得更透（0.12 vs 0.25）：内墙让开时半透着还能提示
    // "这里有堵墙"，外墙让开是为了看清整个屋内布局，留太多就白让了
    for (const group of this.occluderGroups()) {
      const hiddenOpacity = group === this.built.interiorWalls ? 0.25 : 0.12;
      for (const segment of group.children) {
        const hidden = this.wallReleaseTicks.has(segment.uuid);
        stepFade(segment, hidden ? hiddenOpacity : 1, deltaSeconds, hidden ? 6 : 3);
      }
    }

    this.interactCheckTimer += deltaSeconds;
    if (this.interactCheckTimer > 0.15) {
      this.interactCheckTimer = 0;
      this.refreshInteractTarget();
      // 出入口是"踩上去就走"的地面（箱庭②），跟着交互检查的节奏查——
      // 0.15s 一次在走速 3.1 下最多滞后半格，触发带有 1.5 格深，够用
      tickPortalTravel(this.controller.x, this.controller.z);
      // 日月位置跟着走。时钟读数本身是 5 秒缓存的，这里跟着交互检查
      // 的节奏刷就够——天体一分钟移动的距离肉眼看不出来
      this.applyCelestial();
    }

    for (const view of this.windowViews) view.update(deltaSeconds);
    this.outdoor.update(deltaSeconds);

    /*
     * 门板全部照 Door 实体画。原来这里硬编码"宠物距门 1.2 格就开"——
     * 那份逻辑已经收进注册表（front_door.behavior）由 doorsRuntime 驱动，
     * 视图只负责把 open 画成摆角。
     */
    for (const { view, agent } of this.doorViews) {
      view.setOpen(agent?.open ?? false);
      view.update(deltaSeconds);
    }
    for (const view of this.roomDoorViews.values()) view.update(deltaSeconds);
  }

  private applyEnvironment(): void {
    this.lighting.apply(this.phase, this.weather);
    this.outdoor.apply(this.phase, this.weather);
    for (const view of this.windowViews) view.apply(this.phase, this.weather);
    this.applyCelestial();
  }

  /**
   * 把日月摆到窗外。
   *
   * 单独一个方法而不是塞进 applyEnvironment：天体位置是**连续变化**的
   * （每分钟都在动），而 applyEnvironment 只在跨时段/换天气时才跑一次。
   */
  private applyCelestial(): void {
    const { body, progress } = getClock().celestial;
    this.outdoor.setCelestial(body, progress);
  }

  /**
   * 一份东西落地了：附近有槽位就递过去问一句。
   *
   * 这里只回答**几何问题**（哪个槽位最近、够不够近）——收不收是规则问题，
   * 交给 Game/Systems/kitchen 的 offerToSlot，那边走的是和按 F 投料
   * 完全同一条 Core 判定链。
   */
  private offerLandedItem(id: string): void {
    const entity = findDroppedItem(id);
    if (!entity) return;

    let best: KitchenSlotRef | undefined;
    let bestDistance = KITCHEN_ABSORB_RADIUS;

    for (const ref of listKitchenSlots()) {
      const world = this.kitchenSlotWorld(ref);
      if (!world) continue;

      const distance = Math.hypot(world.x - entity.x, world.z - entity.z);
      if (distance >= bestDistance) continue;

      bestDistance = distance;
      best = ref;
    }
    if (!best) return;

    const accepted = offerToSlot(best, {
      itemId: entity.stack.itemId,
      quality: entity.stack.state?.quality,
      container: entity.stack.state?.container,
    });
    if (accepted) removeDroppedItem(id);
  }

  /** 手上拿的是能摆的东西 → 出虚影；换成别的或空手 → 收起来 */
  private syncPlacementToHeld(): void {
    const held = getHeld();
    const placeable = held ? findPlaceableItem(held.itemId) : undefined;

    if (placeable) this.placement.begin(placeable.id);
    else this.placement.cancel();
  }

  rotate(direction: 1 | -1): void {
    this.rig.rotateStep(direction);
  }

  /**
   * 昼夜与天气由世界时钟 / 天气系统推导，**没有对外的 setter**。
   * 想改就去拨时钟（debugJumpToPhase）或写天气覆盖（debugForceWeather），
   * 让调试和正式走同一条路。
   */

  setOutlineEnabled(enabled: boolean): void {
    this.outlineEnabled = enabled;
    this.furnitureView.setOutlineEnabled(enabled);
    setOutlineVisible(this.characterRig.root, enabled);
  }

  zoomToFit(): void {
    this.rig.zoomToFit();
  }

  /**
   * 玩家进出屋子时切镜头边界盒。
   *
   * 屋内是房子的内壁盒（弹簧臂贴墙收臂那套）；屋外换成整个院子，
   * **同时把房子设成禁入盒**——不切的话人一出门，镜头目标还被夹在
   * 房子里，人越走越远直到出画。
   *
   * 判据按房子占地的**四条边**判（V0.13 修复：原来只看西墙一条线
   * `x < -width/2`，人绕到北/东/南面时系统仍认为在屋内，把镜头枢轴
   * 硬夹回屋内边界盒——"贴着外墙走镜头被吸进屋"的病根就是这一行）。
   * 几何和 worldRuntime 的 isIndoors 同一份，这里多了 0.25 的滞回：
   * 站在门槛上反复横跳时两套盒子来回切，滞回把抖动吃掉。
   *
   * 屋外的禁入盒罩到屋脊：房子现在有外墙皮和屋顶（阶段 B），镜头
   * 缩进去会在近平面切出闪烁的碎片。房子挡住视线但没挡到弹簧臂的
   * 情况走遮挡淡出（refreshOccluders 的三组墙体），不归这里管。
   */
  private syncCameraBounds(): void {
    const { width, depth } = this.built.size;
    const halfW = width / 2;
    const halfD = depth / 2;

    // 正值 = 在房子占地外多远（按最深越界的轴算）
    const outside = Math.max(
      Math.abs(this.controller.x) - halfW,
      Math.abs(this.controller.z) - halfD,
    );
    const next = this.cameraOutdoors ? outside > -0.25 : outside > 0.25;
    if (next === this.cameraOutdoors) return;
    this.cameraOutdoors = next;

    if (next) {
      const { yardMargin, floorLevel } = getCurrentMap();
      this.rig.setBoundsRect(
        -halfW - yardMargin,
        halfW + yardMargin,
        -halfD - yardMargin,
        halfD + yardMargin,
        // 院子没有天花板；上限要够看全屋顶（屋脊 ~7.8）
        10,
        undefined,
        -floorLevel,
      );
      this.rig.setObstacleBox({
        minX: -halfW - 0.3,
        maxX: halfW + 0.3,
        // 房子架空之后底面在院子地面上，禁入盒要跟着下探——
        // 不然镜头能从基礎底下的那条缝钻进屋里
        minY: -floorLevel,
        maxY: this.built.ridgeHeight + 0.1,
        minZ: -halfD - 0.3,
        maxZ: halfD + 0.3,
      });
    } else {
      this.rig.setRoomBounds(
        width,
        depth,
        getCurrentMap().openAir ? 10 : this.built.wallHeight,
      );
      this.rig.setObstacleBox(null);
    }
  }

  /** 调试传送（/tp 命令用）。走 controller 的 teleport，位置同步进 participants */
  debugTeleport(x: number, z: number): void {
    this.controller.teleport(x, z);
  }

  getDebugState(): SceneDebugState {
    return {
      phase: this.phase,
      weather: this.weather,
      outline: this.outlineEnabled,
      styleId: getRoomStyle().id,
      character: {
        x: Number(this.controller.x.toFixed(2)),
        z: Number(this.controller.z.toFixed(2)),
        y: Number(this.controller.renderedY.toFixed(3)),
      },
      furnitureCount: getWorld().placedFurniture.length,
    };
  }

  resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.rig.setAspect(width / Math.max(height, 1));
    this.renderer.resize(width, height);
  }

  dispose(): void {
    this.detachInput();
    for (const off of this.offEventListeners) off();
    this.placement.cancel();
    this.remotePlayers.dispose();
    this.dailyBoardAnimator.dispose();
    this.furnitureView.dispose();
    this.outdoor.dispose();
    this.cookwareView.dispose();
    this.heldItemView.dispose();
    this.droppedItemView.dispose();
    this.petView.dispose();
    this.renderer.stop();
    this.renderer.dispose();
  }
}
