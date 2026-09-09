import {
  Facing,
  defaultAvatarConfig,
  roomStyleDefinitions,
  type AvatarConfig,
} from "core";
import {
  AmbientLight,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

import { FLOOR_LEVEL } from "../../Maps/base/terrain";
import { generateCottageL1 } from "../../Maps/base/layout";
import { buildHouse } from "../../Game3D/World/House/index.js";
import {
  animateCharacter,
  buildCharacter,
  type CharacterRig,
} from "../../Game3D/World/CharacterView.js";
import { PlankDoor } from "../../Game3D/World/House/PlankDoor.js";
import { PALETTE } from "../../Game3D/Visual/palette.js";
import {
  box,
  cylinder,
  disposeTree,
  flatMaterial,
  group,
  sphere,
} from "../../Game3D/Visual/primitives.js";
import { SAVE_SLOT_IDS, type SaveSlotId } from "../../Data/Save/slots";

/**
 * 存档舞台：傍晚，你家小屋前的草地，四个站位一字排开（本地 A / B / C ＋ 云端）。
 * 有档的位置站着**那个档里捏出来的角色本人**；空位是地上一圈虚线圆环。
 *
 * ---- 为什么是独立场景而不是借 RoomScene ----
 *
 * RoomScene 是一整个世界的运行时（寻路、居民、天气、门、家具视图…），
 * 挂起来要先灌一份存档；而这一屏恰恰是"还没选档"的时候。这里只要
 * 一块草地、一栋房子、四个人——自己起一个 Scene 比把 RoomScene 削成
 * 展示模式便宜得多，也不会让"选档"这一屏依赖任何存档状态。
 *
 * 房子用的是游戏里那一栋的同一份配方（`buildHouse` + `generateCottageL1`），
 * 灯光抄的是 Lighting.ts 里黄昏那一档——玩家在这一屏看到的家，就是进去
 * 之后的家。
 *
 * ---- 每帧动的是 style，不是 React ----
 *
 * 名牌位置由 `projectSpots()` 每帧算出屏幕坐标，React 那边用 rAF 拉取、
 * 直接写 transform（和交互气泡、工地进度条同一条管线）。
 */

export type StageSpot = {
  slot: SaveSlotId;
  /** 站位中心的世界坐标 */
  x: number;
  z: number;
};

/** 屏幕上一个站位的投影（给名牌定位用） */
export type ProjectedSpot = {
  slot: SaveSlotId;
  x: number;
  y: number;
  /** 在镜头背后 / 出画时 false，名牌该藏 */
  visible: boolean;
};

export type StageSlotState = {
  slot: SaveSlotId;
  /** 有档时给外观；null = 空位或读不出外观（退回默认外观） */
  avatar: AvatarConfig | null;
  occupied: boolean;
  /** 云端未登录：圆环画成灰的 */
  locked: boolean;
};

/*
 * 四个站位：镜头在 +z 一侧朝 −z 看向房子，世界 +x 就是屏幕右——
 * 数组顺序 A/B/C/云端 对应 x 由正到负，即屏幕上从右往左是 A、B、C、云端。
 * 间距 2.6：角色肩宽约 0.9，两人之间留得下一个圆环的空档，
 * 667×375 的横屏上四个人也排得进画面。
 */
const SPOT_X = [3.9, 1.3, -1.3, -3.9];
const SPOT_Z = 1.5;
const HOUSE_Z = -12;

const DUSK = {
  skyTop: "#6d5a8e",
  skyBottom: "#ff9a5e",
  sun: "#ff8f4d",
  hemiSky: "#c495a6",
  hemiGround: "#8a6a55",
  ambient: "#94809b",
  grass: "#7fa063",
  grassDark: "#6d8c55",
  ringLit: "#ffd98d",
  ringDim: "#b9b0a6",
  cloud: "#ffffff",
};

function skyTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, DUSK.skyTop);
  gradient.addColorStop(1, DUSK.skyBottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 4, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = "srgb";
  return texture;
}

/** 地上的虚线圆环：12 小段方块绕一圈。空位的"这里可以站人"就靠它 */
function dashedRing(color: string): Object3D {
  const segments: Object3D[] = [];
  const count = 12;
  const radius = 0.78;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const dash = box([0.26, 0.05, 0.1], { position: [0, 0, 0], color });
    dash.position.set(Math.cos(angle) * radius, 0.03, Math.sin(angle) * radius);
    dash.rotation.y = -angle + Math.PI / 2;
    segments.push(dash);
  }
  return group("ring", segments);
}

/** 圆环中间那个「＋」：两根短方条 */
function plusMark(color: string): Object3D {
  return group("plus", [
    box([0.5, 0.05, 0.12], { position: [0, 0.03, 0], color }),
    box([0.12, 0.05, 0.5], { position: [0, 0.03, 0], color }),
  ]);
}

/** 云端位头顶飘着的一朵云：三团球，和天空里的云同一个做法 */
function cloudPuff(): Object3D {
  const puff = group("cloud", [
    sphere(0.28, 10, 8, { position: [0, 0, 0], color: DUSK.cloud }),
    sphere(0.2, 10, 8, { position: [-0.3, -0.05, 0.05], color: DUSK.cloud }),
    sphere(0.22, 10, 8, { position: [0.3, -0.03, -0.04], color: DUSK.cloud }),
  ]);
  puff.position.y = 1.3;
  return puff;
}

/** 一个站位：矮石台 + 圆环 + （分身 | 加号 | 云） */
class Spot {
  readonly root = new Object3D();
  readonly hit: Mesh;
  private rig: CharacterRig | null = null;
  private ring: Object3D | null = null;
  private mark: Object3D | null = null;
  private cloud: Object3D | null = null;
  private lift = 0;

  constructor(
    readonly slot: SaveSlotId,
    x: number,
    z: number,
  ) {
    this.root.position.set(x, 0, z);
    // 矮石台：比草地高一点，让人和圆环有个"台"可站
    this.root.add(
      cylinder(1.05, 1.1, 0.14, 24, {
        position: [0, 0.07, 0],
        color: PALETTE.baseStoneDark,
      }),
      cylinder(0.98, 0.98, 0.04, 24, {
        position: [0, 0.16, 0],
        color: PALETTE.paperShade,
      }),
    );
    // 命中体：不可见的圆柱，比人宽一圈，手机上也点得中
    this.hit = cylinder(1.15, 1.15, 2.6, 12, {
      position: [0, 1.3, 0],
      color: "#000000",
    });
    (this.hit.material as MeshBasicMaterial).visible = false;
    this.hit.userData.slot = slot;
    this.root.add(this.hit);
  }

  apply(state: StageSlotState): void {
    this.clearContent();
    if (state.occupied) {
      this.rig = buildCharacter(state.avatar ?? defaultAvatarConfig());
      this.rig.root.position.y = 0.18;
      // 面朝镜头（镜头在 +z）
      this.rig.heading.rotation.y = 0;
      this.root.add(this.rig.root);
      return;
    }
    const color = state.locked ? DUSK.ringDim : DUSK.ringLit;
    this.ring = dashedRing(color);
    this.ring.position.y = 0.18;
    this.root.add(this.ring);
    if (state.slot === "cloud") {
      this.cloud = cloudPuff();
      if (state.locked) {
        this.cloud.traverse((node) => {
          if (node instanceof Mesh)
            (node.material as MeshBasicMaterial).color = new Color(
              DUSK.ringDim,
            );
        });
      }
      this.root.add(this.cloud);
    } else {
      this.mark = plusMark(color);
      this.mark.position.y = 0.18;
      this.root.add(this.mark);
    }
  }

  animate(timeSeconds: number, selected: boolean): void {
    if (this.rig) animateCharacter(this.rig, 0, false, timeSeconds);
    if (this.ring) this.ring.rotation.y = timeSeconds * 0.35;
    if (this.cloud)
      this.cloud.position.y = 1.3 + Math.sin(timeSeconds * 1.3) * 0.08;
    // 选中的台子抬 0.08，用 lerp 收——生硬跳一下会像 bug
    const target = selected ? 0.08 : 0;
    this.lift += (target - this.lift) * 0.15;
    this.root.position.y = this.lift;
  }

  clearContent(): void {
    for (const node of [this.rig?.root, this.ring, this.mark, this.cloud]) {
      if (!node) continue;
      this.root.remove(node);
      disposeTree(node);
    }
    this.rig = null;
    this.ring = null;
    this.mark = null;
    this.cloud = null;
  }

  dispose(): void {
    this.clearContent();
    disposeTree(this.root);
  }
}

export class SaveStageScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly spots: Spot[];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly scratch = new Vector3();
  private house: Object3D | null = null;
  private readonly doors: PlankDoor[] = [];
  private frame = 0;
  private readonly startedAt = performance.now();
  private lastFrameAt = performance.now();
  private selected: SaveSlotId | null = null;
  /*
   * 镜头两档：全景（看整块草地和房子）/ 特写（推到选中的站位跟前）。
   * 位置和注视点都存"当前值 + 目标值"，每帧 lerp 收——切档是一段推轨，
   * 不是一下跳过去。
   */
  private readonly camPos = new Vector3(0, 4.6, 14);
  private readonly camPosTarget = new Vector3(0, 4.6, 14);
  private readonly camLook = new Vector3(0, 2.0, -3);
  private readonly camLookTarget = new Vector3(0, 2.0, -3);
  /** 每帧渲染完把四个站位的屏幕坐标交出去（名牌定位用） */
  private frameListener: ((spots: ProjectedSpot[]) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onPick: (slot: SaveSlotId) => void,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = skyTexture();

    this.camera = new PerspectiveCamera(32, 1, 0.1, 80);
    this.camera.position.set(0, 4.6, 14);
    this.camera.lookAt(0, 2.0, -3);

    // 灯：Lighting.ts 黄昏那一档——西北方几乎平射的橙光
    this.scene.add(new HemisphereLight(DUSK.hemiSky, DUSK.hemiGround, 0.55));
    this.scene.add(new AmbientLight(DUSK.ambient, 0.35));
    const sun = new DirectionalLight(DUSK.sun, 2.0);
    sun.position.set(-6, 3.2, 4);
    this.scene.add(sun);

    // 草地：一大片圆盘 + 几块深色草斑，边缘隐进天色里
    const ground = new Mesh(
      new CircleGeometry(40, 48),
      flatMaterial(DUSK.grass),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    for (const [px, pz, r] of [
      [6, 4, 2.2],
      [-7, 2, 1.8],
      [2, -3, 1.4],
      [-3, 6, 1.2],
      [8, -5, 2.6],
    ]) {
      const patch = new Mesh(
        new CircleGeometry(r, 18),
        flatMaterial(DUSK.grassDark),
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(px, 0.01, pz);
      this.scene.add(patch);
    }

    this.spots = SAVE_SLOT_IDS.map(
      (slot, index) => new Spot(slot, SPOT_X[index], SPOT_Z),
    );
    for (const spot of this.spots) this.scene.add(spot.root);

    this.buildHouse();

    canvas.addEventListener("pointerdown", this.onPointerDown);
    this.resize();
    this.loop();
  }

  /**
   * 游戏里那一栋：同一份配方（女巫小屋 L1），锚点放在舞台后方、正面朝镜头。
   * 建不出来（配方缺东西）就没有房子——舞台照样能用，别让选档卡在一栋
   * 装饰性的房子上。
   */
  private buildHouse(): void {
    try {
      const style = roomStyleDefinitions[0];
      const room = {
        ...generateCottageL1({ roomId: "living", style }),
        // 小屋的门开在本地南墙；朝北摆（不转）门就正对镜头的 +z
        // elevation = 室内地板高于草地的那 0.45——和游戏里的院子同一份数
        anchor: {
          x: 0,
          z: HOUSE_Z,
          elevation: FLOOR_LEVEL,
          facing: Facing.North,
        },
      };
      const built = buildHouse(room, [], FLOOR_LEVEL, false);
      this.house = built.root;
      this.scene.add(this.house);
      // 门板：门洞不装板会直接透出天空
      for (const anchor of built.doors) {
        const door = new PlankDoor(anchor);
        this.doors.push(door);
        this.scene.add(door.root);
      }
    } catch (error) {
      console.warn("[save-stage] 房子没建出来：", error);
    }
  }

  setSlots(states: StageSlotState[]): void {
    for (const state of states) {
      this.spots.find((spot) => spot.slot === state.slot)?.apply(state);
    }
  }

  onFrame(listener: ((spots: ProjectedSpot[]) => void) | null): void {
    this.frameListener = listener;
  }

  /**
   * 选中 → 镜头推到那个站位跟前。
   *
   * 人要站在**画面左侧**，右边留给信息卡：注视点从站位中心往世界 +x
   * （镜头朝 −z 看，+x 是屏幕右）挪一段，挪多少按当前视角和画幅算——离镜头 3.6 米处画面
   * 半宽的 55%，这样不管是 16:9 还是 SE 的 667×375，人都落在左边三分之一
   * 附近，不会被卡盖住也不会贴边。
   */
  select(slot: SaveSlotId | null): void {
    this.selected = slot;
    const spot = slot ? this.spots.find((item) => item.slot === slot) : null;
    if (!spot) {
      this.camPosTarget.set(0, 4.6, 14);
      this.camLookTarget.set(0, 2.0, -3);
      return;
    }
    const distance = 3.6;
    const halfWidth =
      Math.tan((this.camera.fov / 2) * (Math.PI / 180)) *
      distance *
      this.camera.aspect;
    const side = halfWidth * 0.55;
    const { x, z } = spot.root.position;
    this.camPosTarget.set(x + side, 1.7, z + distance);
    this.camLookTarget.set(x + side, 1.05, z);
  }

  /** 四个站位头顶（名牌挂的地方）的屏幕坐标，相对画布 */
  projectSpots(): ProjectedSpot[] {
    const rect = this.canvas.getBoundingClientRect();
    return this.spots.map((spot) => {
      this.scratch.set(spot.root.position.x, 2.35, spot.root.position.z);
      this.scratch.project(this.camera);
      return {
        slot: spot.slot,
        x: ((this.scratch.x + 1) / 2) * rect.width,
        y: ((1 - this.scratch.y) / 2) * rect.height,
        visible: this.scratch.z < 1,
      };
    });
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    /*
     * 窄画幅（横屏矮屏）把视角开大一点，四个人才不出画：
     * 视角是竖向的，画幅越扁、横向能看到的越少。
     */
    this.camera.fov = width / height > 2 ? 30 : width / height > 1.6 ? 37 : 42;
    this.camera.updateProjectionMatrix();
    // 特写的横向偏移是按画幅算的，画幅变了要重算
    if (this.selected) this.select(this.selected);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.spots.map((spot) => spot.hit),
      false,
    );
    const slot = hits[0]?.object.userData.slot as SaveSlotId | undefined;
    if (slot) this.onPick(slot);
  };

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const t = (now - this.startedAt) / 1000;
    const dt = (now - this.lastFrameAt) / 1000;
    this.lastFrameAt = now;
    for (const spot of this.spots) spot.animate(t, spot.slot === this.selected);
    /*
     * 按真实时间收敛（每秒吃掉剩余距离的 99%），不按帧数：
     * 掉帧或页面被节流时推轨照样在半秒左右到位，而不是拖成慢动作。
     */
    const ease = 1 - Math.exp(-dt * 5);
    this.camPos.lerp(this.camPosTarget, ease);
    this.camLook.lerp(this.camLookTarget, ease);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
    this.frameListener?.(this.projectSpots());
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    for (const spot of this.spots) spot.dispose();
    if (this.house) disposeTree(this.house);
    for (const door of this.doors) disposeTree(door.root);
    (this.scene.background as CanvasTexture | null)?.dispose();
    this.renderer.dispose();
  }
}
