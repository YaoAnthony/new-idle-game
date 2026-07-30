import {
  BodyPosture,
  DayPhaseId,
  Facing,
  FurnitureCapability,
  WeatherKind,
  findPath,
  roomStyleDefinitions,
} from "core";
import type { InteractHint } from "core";
import { Raycaster, Scene, Vector2, Vector3 } from "three";

/** 提示气泡的附着目标：家具实例 + 提示数据 + 世界锚点 */
type HintTarget = {
  instanceId: string;
  hint: InteractHint;
  world: Vector3;
};
import { PlacementSurface } from "core";
import { emit, on, type StationCapability } from "../../Game/EventBus";
import { getPet, getPets, tickPets } from "../../Game/State/petsRuntime";
import {
  getDefinition,
  getWorld,
  seedInitialFurniture,
} from "../../Game/State/worldRuntime";
import { getActiveAction } from "../../Game/Systems/actions";
import { startDialogue } from "../../Game/Systems/dialogue";
import { getEventStage } from "../../Game/Systems/events";
import {
  describeKitchenSlot,
  dumpKitchenSlot,
  interactWithKitchenSlot,
  listKitchenSlots,
  tickKitchen,
  type KitchenSlotRef,
} from "../../Game/Systems/kitchen";
import { pickupFurniture } from "../../Game/Systems/placement";
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
import { getWeather } from "../../Game/State/weather";
import {
  DEFAULT_POSTURE,
  defaultPoseFor,
  findPosture,
} from "../Visual/poses.js";
import { CookwareView } from "./CookwareView.js";
import { HIP_HEIGHT } from "./CharacterView.js";
import { PetView } from "./PetView.js";
import { CameraRig } from "../Engine/CameraRig.js";
import { Lighting } from "../Engine/Lighting.js";
import { setOutlineVisible } from "../Engine/Outline.js";
import { createRenderer, type RendererHandle } from "../Engine/Renderer.js";
import { CharacterController } from "../Interaction/CharacterController.js";
import { PlacementController } from "../Interaction/PlacementController.js";
import { buildCharacter } from "./CharacterView.js";
import {
  FACING_VECTOR,
  FurnitureView,
  slotWorldPosition,
} from "./FurnitureView.js";
import { buildRoom, type BuiltRoom } from "./RoomBuilder.js";
import { DoorView } from "./DoorView.js";
import { WindowView } from "./WindowView.js";

export type SceneDebugState = {
  phase: DayPhaseId;
  weather: WeatherKind;
  outline: boolean;
  styleId: string;
  character: { x: number; z: number };
  furnitureCount: number;
};

export class RoomScene {
  readonly scene = new Scene();
  readonly rig: CameraRig;

  private readonly renderer: RendererHandle;
  private readonly lighting: Lighting;
  private readonly built: BuiltRoom;
  private readonly windowViews: WindowView[] = [];
  private readonly doorViews: DoorView[] = [];
  private readonly furnitureView: FurnitureView;
  private readonly cookwareView: CookwareView;
  private readonly characterRig = buildCharacter();
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
    | null = null;
  private interactCheckTimer = 0;

  private readonly pickRaycaster = new Raycaster();
  private readonly pickPointer = new Vector2();

  /** 坐下之前站在哪，起身时退回去 */
  private restingReturnTo: { x: number; z: number } | null = null;

  /** 提示气泡附着的家具（独立于 interactTarget，见 refreshInteractTarget） */
  private hintTarget: HintTarget | null = null;
  private readonly projectScratch = new Vector3();

  private readonly detachInput: () => void;

  constructor(
    private readonly container: HTMLElement,
    options: { seedFurniture?: boolean } = {},
  ) {
    // 读档时屋里的东西来自存档，不能再铺一次房东留下的旧家具和纸箱
    if (options.seedFurniture !== false) seedInitialFurniture();

    const { room } = getWorld();
    this.built = buildRoom(room);
    this.scene.add(this.built.root);

    // 门板：没有它门洞会直接透出背景色
    for (const anchor of this.built.doors) {
      const door = new DoorView(anchor);
      this.doorViews.push(door);
      this.scene.add(door.root);
    }

    for (const anchor of this.built.windows) {
      const view = new WindowView(anchor);
      this.windowViews.push(view);
      this.scene.add(view.root);
    }

    this.furnitureView = new FurnitureView(this.built.size);
    this.scene.add(this.furnitureView.root);

    // 槽位上的锅碗单独一层：家具一天动不了几次，锅里的东西每次投料都变
    this.cookwareView = new CookwareView(this.built.size);
    this.scene.add(this.cookwareView.root);

    this.scene.add(this.petView.root);

    this.scene.add(this.characterRig.root);
    this.controller = new CharacterController(this.characterRig);

    /**
     * 读档时坐姿要在这里补一次。
     *
     * hydrateGameSave 跑在本场景构造**之前**，那时 posture_changed 发出去还没人订阅，
     * 所以光靠事件监听会漏掉"读档后还坐着"这种情况——
     * 和世界、宠物的恢复是同一类时序问题。
     */
    this.applyResting();

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

    // 对话期间锁移动 + 镜头推近（动森式，说话的人占满画面）
    this.offEventListeners.push(
      on("dialogue_changed", ({ open }) => {
        // 过场自己管镜头，别抢
        if (this.cutscenePetId) return;

        this.controller.enabled = !open;
        if (open) this.rig.enterDialogue();
        else this.rig.exitDialogue();
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
    // 镜头锁定屋内：把内壁盒交给相机做视线回缩
    this.rig.setRoomBounds(
      this.built.size.width,
      this.built.size.depth,
      this.built.wallHeight,
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
    );

    this.detachInput = this.attachInput();

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

      if (key === "q") this.rotate(-1);
      if (key === "e") this.rotate(1);
      if (key === "r") this.placement.rotate();
      if (event.key === "Escape") this.placement.cancel();
      // 配错了的出口：倒掉锅里的东西，锅还在（还没有垃圾桶这件家具）
      if (key === "g") {
        const slot = this.nearestKitchenSlot();
        if (slot) dumpKitchenSlot(slot);
      }

      // 坐着 / 躺着时 F 的含义变了，先在这里截住
      if (key === "f" && isResting()) {
        this.interactWhileResting();
        return;
      }

      if (key === "f" && this.interactTarget) {
        if (this.interactTarget.kind === "station") {
          if (this.interactTarget.capability === "sleep") {
            // 床先躺下，躺着再按 F 才睡觉（睡觉是躺着之后的第二步）
            this.restAtTarget(BodyPosture.Lie);
          } else if (this.interactTarget.capability === "sitting") {
            this.restAtTarget(BodyPosture.Sit);
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
          // 初见走完整对话，之后是日常寒暄
          const gifted = getEventStage("pet_arrival") === "gifted";
          startDialogue(
            gifted ? "moss_wisp_casual" : "moss_wisp_first_meet",
            this.interactTarget.petId,
          );
        }
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      this.rig.zoom(event.deltaY * 0.01);
    };

    const onPointerMove = (event: PointerEvent) =>
      this.placement.onPointerMove(event);

    const onClick = () => this.placement.onClick();

    // 右键拿起家具（V0.2：右键举起）
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (this.placement.active) return;

      const rect = canvas.getBoundingClientRect();
      this.pickPointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
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
          pickupFurniture(node.userData.instanceId as string);
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    this.container.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      detachController();
      window.removeEventListener("keydown", onKeyDown);
      this.container.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
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
    const w = rotated ? definition.footprint.height : definition.footprint.width;
    const h = rotated ? definition.footprint.width : definition.footprint.height;

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
      | null = null;
    let bestDistance = 1.9;

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
      if (!definition?.interactHint) continue;

      const center = this.furnitureCenter(placed, definition);
      const distance = Math.hypot(
        center.x - this.controller.x,
        center.z - this.controller.z,
      );
      if (distance >= bestHintDistance) continue;

      bestHintDistance = distance;
      bestHint = {
        instanceId: placed.instanceId,
        hint: definition.interactHint,
        world: new Vector3(
          center.x,
          definition.interactHint.anchorHeight ?? 1.2,
          center.z,
        ),
      };
    }
    this.hintTarget = bestHint;

    for (const placed of placedFurniture) {
      const definition = getDefinition(placed.furnitureId);
      if (!definition) continue;

      const capability = definition.capabilities.includes(
        FurnitureCapability.Crafting,
      )
        ? ("crafting" as const)
        : definition.capabilities.includes(FurnitureCapability.Cooking)
          ? ("cooking" as const)
          : // 床优先当"躺"处理；沙发这类只有 Sitting 的落到坐
            definition.capabilities.includes(FurnitureCapability.Sleep)
            ? ("sleep" as const)
            : definition.capabilities.includes(FurnitureCapability.Sitting)
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
        ? definition.footprint.height
        : definition.footprint.width;
      const h = rotated
        ? definition.footprint.width
        : definition.footprint.height;

      const centerX = gridPosition.x - width / 2 + w / 2;
      const centerZ = gridPosition.y - depth / 2 + h / 2;
      const distance = Math.hypot(
        centerX - this.controller.x,
        centerZ - this.controller.z,
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
          : `station:${target.instanceId}:${target.capability}`;

    if (keyOf(best) === keyOf(this.interactTarget)) return;

    this.interactTarget = best;

    if (best === null) {
      emit("interact_target_changed", null);
    } else if (best.kind === "pet") {
      emit("interact_target_changed", { kind: "pet", petId: best.petId });
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
        if (definition?.capabilities.includes(FurnitureCapability.Sleep)) {
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
      if (definition?.capabilities.includes(FurnitureCapability.Sleep)) {
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
      definition.footprint,
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
      definition.footprint,
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

  /** 家具占地中心的世界坐标（考虑朝向旋转后的宽高） */
  private furnitureCenter(
    placed: { placement: { gridPosition: { x: number; y: number }; facing: Facing } },
    definition: { footprint: { width: number; height: number } },
  ): { x: number; z: number } {
    const { width, depth } = this.built.size;
    const { gridPosition, facing } = placed.placement;
    const rotated = facing === Facing.East || facing === Facing.West;
    const w = rotated ? definition.footprint.height : definition.footprint.width;
    const h = rotated ? definition.footprint.width : definition.footprint.height;

    return {
      x: gridPosition.x - width / 2 + w / 2,
      z: gridPosition.y - depth / 2 + h / 2,
    };
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

    this.projectScratch.copy(this.hintTarget.world).project(this.rig.camera);

    // 投影到相机背后时 z > 1，此时不显示
    if (this.projectScratch.z > 1) return null;

    // 厨具的提示随手上端着什么实时变（"放上灶眼" / "投进锅里" / "起锅"），
    // 所以这里每帧问一次规则表，而不是用家具那句写死的静态提示
    const kitchenSlot = this.nearestKitchenSlot(this.hintTarget.instanceId);
    const kitchenHint = kitchenSlot ? describeKitchenSlot(kitchenSlot) : null;

    // 坐 / 躺同理：同一件家具在"站着"和"坐着"时该说的话不一样
    const restingHint = this.describeRestingHint(this.hintTarget.instanceId);

    const rect = this.container.getBoundingClientRect();
    return {
      instanceId: this.hintTarget.instanceId,
      localizationKey:
        kitchenHint ?? restingHint ?? this.hintTarget.hint.localizationKey,
      action: this.hintTarget.hint.action,
      x: rect.left + ((this.projectScratch.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - this.projectScratch.y) / 2) * rect.height,
    };
  }

  private update(deltaSeconds: number): void {
    this.controller.update(deltaSeconds, this.rig.azimuthDegrees);
    tickPets(deltaSeconds, { x: this.controller.x, z: this.controller.z });
    this.petView.update(deltaSeconds);

    // 火候：只有架在灶眼上、且内容匹配到配方的锅才会走进度
    tickKitchen(deltaSeconds);
    this.cookwareView.update(this.rig.camera);

    // 过场：镜头跟拍进屋的宠物；平时跟随角色
    if (this.cutscenePetId) {
      const pet = getPet(this.cutscenePetId);
      if (pet) this.rig.lookAtPoint(pet.x, pet.z);
    } else {
      this.rig.lookAtPoint(this.controller.x, this.controller.z);

      // 肩后视角：只在常态跟随时回中。对话/专注/过场各自接管了镜头，
      // 这时候把人转到背后会把精心推近的构图搅乱
      if (this.rig.mode === "follow") {
        this.rig.recenterBehind(
          this.controller.heading,
          this.controller.forwardness,
          deltaSeconds,
        );
      }
    }
    this.rig.update(deltaSeconds);

    this.interactCheckTimer += deltaSeconds;
    if (this.interactCheckTimer > 0.15) {
      this.interactCheckTimer = 0;
      this.refreshInteractTarget();
      // 日月位置跟着走。时钟读数本身是 5 秒缓存的，这里跟着交互检查
      // 的节奏刷就够——天体一分钟移动的距离肉眼看不出来
      this.applyCelestial();
    }

    for (const view of this.windowViews) view.update(deltaSeconds);

    // 宠物走到门口 1.2 格内时门自动打开（派遣出门的仪式感）
    for (const door of this.doorViews) {
      const nearPet = getPets().some(
        (pet) =>
          Math.hypot(pet.x - door.root.position.x, pet.z - door.root.position.z) <
          1.2,
      );
      door.setOpen(nearPet);
      door.update(deltaSeconds);
    }
  }

  private applyEnvironment(): void {
    this.lighting.apply(this.phase, this.weather);
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
    for (const view of this.windowViews) view.setCelestial(body, progress);
  }

  beginPlacement(furnitureId: string): void {
    this.placement.begin(furnitureId);
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

  getDebugState(): SceneDebugState {
    return {
      phase: this.phase,
      weather: this.weather,
      outline: this.outlineEnabled,
      styleId: roomStyleDefinitions[0].id,
      character: {
        x: Number(this.controller.x.toFixed(2)),
        z: Number(this.controller.z.toFixed(2)),
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
    this.furnitureView.dispose();
    this.cookwareView.dispose();
    this.renderer.stop();
    this.renderer.dispose();
  }
}
