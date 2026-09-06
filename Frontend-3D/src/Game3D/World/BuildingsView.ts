import { DayPhaseId, findDecoration, findResidentInterior } from "core";
import { Box3, BoxGeometry, CanvasTexture, Color, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace, Vector3, type Scene } from "three";

import { on } from "../../Game/EventBus";
import { getClock } from "../../Game/State/clock";
import { porchOf } from "../../Game/Systems/residents/porch";
import { interiorOf } from "../../Game/Systems/residents/interiors";
import { residentDoorOf } from "../../Game/State/doorsRuntime";
import { playerDisplayName } from "../../Game/Systems/residents/affection";
import { homesWithSomeoneIn } from "../../Game/Systems/residents/spots";
import { listBuildings } from "../../Game/State/buildings";
import { groundHeightAt } from "../../Game/State/worldRuntime";
import { GOLD_STAGES } from "../../Buildings/goldJar";
import { buildPlacedBuilding } from "../../Buildings/placement";
import { buildSiteFence, makeGhost } from "../../Buildings/site";
import {
  shopDisplayAnchors,
} from "../../Buildings/furnitureShopInterior";
import { findBuildingLevel } from "../../Buildings/index";
import { HUT_DOOR_WIDTH } from "../../Buildings/residentHut";
import {
  findShop,
  shelfIdFor,
  shelfSlotsOf,
} from "../../Game/Systems/shopkeeping";
import { buildItemVisual } from "../Visual/VisualRegistry";
import { PALETTE } from "../Visual/palette";
import { box, disposeTree } from "../Visual/primitives";

/** 居民房门板开到几度：往屋里转 100°（铰链在左框、绕 y 正转把板子甩向 -z 即屋里），比 90° 多一点，站门口不会被板子边挡视线 */
const OPEN_ANGLE = Math.PI * 0.56;

/**
 * 玩家在领地里建的建筑的**渲染**。
 *
 * 小镇那六家店不走这里——它们由 `OutdoorScene` 从地图定义建，不会变。
 * 这里的东西会：建造、移动、升级都是稀有事件，所以**整组重建**，
 * 不做增量。增量的复杂度（哪栋要删、哪栋只是挪了）换来的性能，在
 * "一天点几次"这个频率下等于零。
 *
 * 两处按实例状态调模型，都靠模型里约好的**节点名**找：
 * - 金库的存量（`gold-stage-*`）：按 `stored / capacity` 分六档，只显示那一档。
 *   一档 = 一个完整造型（箱盖开合 + 一堆币），**这是那个建筑的灵魂**——
 *   玩家一眼看出还能装多少。
 * - 农田的阶段（`stage-*`）：只显示当前阶段那一组。
 */
/**
 * 门牌：一块小木牌，名字画在 CanvasTexture 上。字体走系统回退——这块牌只有几个字，
 * 不值得为它加载一套字。名字不存进世界：谁在看就读谁那份存档里的玩家名。
 */
function buildNamePlate(name: string, x: number, y: number, z: number): Object3D {
  const plate = new Object3D();
  plate.name = "name-plate";
  const board = new Mesh(new BoxGeometry(0.62, 0.22, 0.04), new MeshStandardMaterial({ color: "#8a5a34", roughness: 0.9 }));
  board.castShadow = false;
  plate.add(board);

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#f3e2b8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#4a2f1a";
    context.font = "bold 44px 'LXGW WenKai GB', 'Kaiti SC', 'Nunito', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(name.slice(0, 8), canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const face = new Mesh(new PlaneGeometry(0.56, 0.17), new MeshBasicMaterial({ map: texture }));
  face.position.z = 0.025;
  plate.add(face);
  plate.position.set(x, y, z);
  return plate;
}

export class BuildingsView {
  readonly root = new Object3D();
  private readonly offListeners: Array<() => void> = [];

  constructor(private readonly scene: Scene) {
    this.root.name = "player-buildings";
    this.scene.add(this.root);
    this.rebuild();

    this.offListeners.push(
      on("world_changed", ({ reason }) => {
        // 建筑变了、或者整份世界换了（读档、联机刷新）都要重建
        if (reason === "buildings" || reason === "restored") this.rebuild();
      }),
    );
    /*
     * 状态变了**只更新那一栋**，不重建。液面每存一次钱就要动，作物阶段
     * 每过一阵就要换——整组重建的代价（拆几百个网格再建回来）在这个
     * 频率下是真的贵，而且会打断正在播的动画。
     */
    this.offListeners.push(
      on("building_state_changed", ({ instanceId }) => this.refreshOne(instanceId)),
    );

    /*
     * 窗灯（居民系统 02）：**纯表现**——谁在家由运行时算（`homesWithSomeoneIn`），
     * 不进存档、不进建筑状态。活物一动就重算一次；傍晚 / 夜里才亮，白天顶着一盏
     * 灯看不见也费。木偶也有 hidden 和位置，房客那边算出来一样。
     */
    this.offListeners.push(on("resident_changed", () => this.refreshWindowLights()));
    this.offListeners.push(on("day_phase_changed", () => this.refreshWindowLights()));
    this.offListeners.push(on("favors_changed", () => this.refreshWindowLights()));
    this.offListeners.push(on("porch_changed", () => this.refreshPorch()));
    this.offListeners.push(on("interiors_changed", () => this.refreshInteriors()));
    // 居民房的门板（08）：逻辑层的 Door 一开合就转板子
    this.offListeners.push(on("door_toggled", ({ refId, open }) => this.swingDoor(refId, open)));

    /*
     * 货架一变就重摆店里的展示位（上架面板关不关都无所谓——storage 的
     * 每次增删都发这个事件，"关掉箱子之后货就摆出来了"是它的自然结果，
     * 而且中途开着面板搬货也能看见橱窗实时变，比等关门那一下更活）。
     */
    this.offListeners.push(
      on("storage_changed", ({ inventoryId }) => {
        const shop = findShop();
        if (shop && inventoryId === shelfIdFor(shop)) this.refreshShopGoods();
      }),
    );
  }

  private clear(): void {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      disposeTree(child);
    }
  }

  private rebuild(): void {
    this.clear();

    /*
     * 全场传进去：围墙要按四邻决定自己长什么样。整组重建本来就在做，
     * 所以放一堵墙、拆一堵墙，旁边那几堵会跟着换形状，不用额外接线。
     */
    const all = listBuildings();
    for (const placement of all) {
      const node = buildPlacedBuilding(placement, all);
      if (!node) continue;
      /*
       * 踩地形高度，不是一律 y=0。领地里有起伏，一排等高的建筑在坡上
       * 会半截埋进土里——和围栏的桩子同一条理由。
       *
       * 读**存下来的标高**而不是在这儿现问 `groundHeightAt`：带内景的楼
       * 会在自己脚下铺一块地板面，`groundHeightAt` 优先答那块地板，于是
       * 壳和地板必然对得上、却可以一起偏离地形（2026-08-25 的绿房子浮空
       * 就是这么来的）。标高由 `placeBuilding`/`restoreBuildings` 用
       * `siteHeightAt` 统一定，这里只负责照着摆。
       */
      node.position.y = placement.elevation;
      applyState(node, placement.state);

      /*
       * **工地**：成品变半透明 + 围一圈围栏。
       *
       * 半透明的说"将来会是什么"，围栏说"这块地被占了"——只有虚影的话
       * 远处几乎看不见，领地上一块地已经被下单这件事就读不出来。
       */
      if (placement.construction) {
        makeGhost(node);
        this.root.add(buildSiteFence(placement, groundHeightAt));
      }

      this.root.add(node);
    }

    // 楼是重建出来的，橱窗里的货也要跟着回来
    this.refreshShopGoods();
    this.refreshWindowLights();
    this.refreshPorch();
    this.refreshInteriors();
    this.buildDoorLeaves();
  }

  /**
   * 居民房的室内（08）：固定陈设 + 你送的东西各在各的槽。数据两份——陈设和槽位是内容
   * （Core `residentInteriorDefinitions`），槽里摆着什么是 `WorldSave.interiors`。
   * 和门口展示位同一套做法：挂在楼的节点下，坐标是型号本地系，`noCollide`（模型碰撞
   * 是从 `buildPlacedBuilding` 另建的，这里加的东西本来就不在里面）。
   */
  refreshInteriors(): void {
    for (const node of this.root.children) {
      if (!node.name.startsWith("building-")) continue;
      const instanceId = node.name.slice("building-".length);
      const old = node.getObjectByName("interior");
      if (old) {
        node.remove(old);
        disposeTree(old);
      }
      const placement = listBuildings().find((item) => item.instanceId === instanceId);
      if (!placement || placement.construction) continue;
      const definition = findResidentInterior(placement.buildingId);
      if (!definition) continue;

      const group = new Object3D();
      group.name = "interior";
      group.userData.noCollide = true;
      const bounds = new Box3();
      const size = new Vector3();
      const put = (itemId: string, x: number, z: number, rotation: number, y: number | undefined, cap: number): void => {
        const visual = buildItemVisual(itemId);
        if (!visual) return;
        bounds.setFromObject(visual);
        bounds.getSize(size);
        // 小屋里放不下一张 2×1 的桌子：按包围盒缩到装下（只缩不放，和橱窗样品同一条）
        const scale = Math.min(1, cap / Math.max(size.x, size.z, 0.001));
        visual.scale.setScalar(scale);
        // 挂墙的按给的高度挂；落地的底压到地板面（地板顶面 0.12）
        visual.position.set(x, y !== undefined ? y : 0.12 - bounds.min.y * scale, z);
        visual.rotation.y = rotation;
        visual.userData.noCollide = true;
        group.add(visual);
      };
      for (const fixture of definition.fixed) put(fixture.itemId, fixture.x, fixture.z, fixture.rotation ?? 0, fixture.y, 1.1);
      const entry = interiorOf(instanceId);
      entry?.gifts.forEach((itemId, index) => {
        const slot = definition.giftSlots[index];
        if (!itemId || !slot) return;
        put(itemId, slot.x, slot.z, slot.rotation ?? 0, slot.surface === "wall" ? slot.y : undefined, 0.95);
      });
      node.add(group);
    }
  }

  /**
   * 居民房的门板（08）。外壳的门洞是真洞（"走得进去"是这三栋唯一的硬要求），门板
   * 不能进模型——模型即碰撞，板子进了模型就永远堵着。所以板子在这儿单独挂、`noCollide`，
   * 挡人靠逻辑层的 Door（doorGate）。铰链在门框左侧，开门往屋里转。
   */
  private readonly doorLeaves = new Map<string, { pivot: Object3D; open: boolean }>();

  private buildDoorLeaves(): void {
    this.doorLeaves.clear();
    for (const node of this.root.children) {
      if (!node.name.startsWith("building-")) continue;
      const instanceId = node.name.slice("building-".length);
      const door = residentDoorOf(instanceId);
      const placement = listBuildings().find((item) => item.instanceId === instanceId);
      const level = placement ? findBuildingLevel(placement.buildingId, placement.levelId) : undefined;
      if (!door || !level) continue;
      const half = level.footprint.height / 2;
      const doorW = HUT_DOOR_WIDTH;
      const leafH = 2.7 - 0.26 - 0.05;
      const pivot = new Object3D();
      pivot.name = "door-leaf";
      pivot.position.set(-doorW / 2 + 0.02, 0.1, half);
      const leaf = box([doorW - 0.06, leafH, 0.06], {
        position: [(doorW - 0.06) / 2, leafH / 2, 0],
        color: PALETTE.shopWood,
      });
      leaf.userData.noCollide = true;
      // 门板上两道横档，不然是一块光板
      for (const y of [leafH * 0.3, leafH * 0.72]) {
        const rail = box([doorW - 0.14, 0.08, 0.03], { position: [(doorW - 0.06) / 2, y, 0.045], color: PALETTE.woodMid, castShadow: false });
        rail.userData.noCollide = true;
        pivot.add(rail);
      }
      pivot.add(leaf);
      pivot.rotation.y = door.open ? OPEN_ANGLE : 0;
      node.add(pivot);
      this.doorLeaves.set(door.refId, { pivot, open: door.open });
    }
  }

  /** 门一开合就转板子：几帧的小补间，别一下跳过去 */
  private swingDoor(refId: string, open: boolean): void {
    const leaf = this.doorLeaves.get(refId);
    if (!leaf || leaf.open === open) return;
    leaf.open = open;
    const from = leaf.pivot.rotation.y;
    const to = open ? OPEN_ANGLE : 0;
    const started = performance.now();
    const step = (): void => {
      const k = Math.min(1, (performance.now() - started) / 220);
      leaf.pivot.rotation.y = from + (to - from) * (1 - (1 - k) * (1 - k));
      if (k < 1 && this.doorLeaves.get(refId) === leaf) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /**
   * 门口展示位与门牌（居民系统 07）。数据在 `WorldSave.porch`（只有剧情效果写）。
   * 展示位上的家具按包围盒缩到 0.8，底压到地上；标 `noCollide`——它不是 placedFurniture，
   * 不占格也不参与碰撞。门牌是一块木牌 + 画上去的名字（渲染时读玩家名，不存进世界）。
   */
  refreshPorch(): void {
    for (const node of this.root.children) {
      if (!node.name.startsWith("building-")) continue;
      const instanceId = node.name.slice("building-".length);
      const old = node.getObjectByName("porch");
      if (old) {
        node.remove(old);
        disposeTree(old);
      }
      const entry = porchOf(instanceId);
      if (!entry || (entry.items.length === 0 && !entry.namePlate && !entry.decoration)) continue;
      const placement = listBuildings().find((item) => item.instanceId === instanceId);
      const level = placement ? findBuildingLevel(placement.buildingId, placement.levelId) : undefined;
      if (!placement || !level) continue;

      const porch = new Object3D();
      porch.name = "porch";
      porch.userData.noCollide = true;

      const bounds = new Box3();
      const size = new Vector3();
      const slots = level.porchSlots ?? [];
      entry.items.forEach((itemId, index) => {
        const slot = slots[index];
        if (!itemId || !slot) return;
        const visual = buildItemVisual(itemId);
        if (!visual) return;
        bounds.setFromObject(visual);
        bounds.getSize(size);
        const scale = Math.min(0.8, 0.9 / Math.max(size.x, size.z, 0.001));
        visual.scale.setScalar(scale);
        visual.position.set(slot[0], -bounds.min.y * scale, slot[1]);
        visual.userData.noCollide = true;
        porch.add(visual);
      });

      if (entry.namePlate && level.namePlate) {
        const [x, y, z] = level.namePlate;
        porch.add(buildNamePlate(playerDisplayName(), x, y, z));
      }
      // 11：门楣上的装饰（生日彩带 / 节日灯笼）。查表拿 visualId，占位几何
      if (entry.decoration && level.decorationAnchor) {
        const visualId = findDecoration(entry.decoration)?.visualId;
        if (visualId) {
          const [x, y, z] = level.decorationAnchor;
          const decoration = buildPorchDecoration(visualId);
          decoration.position.set(x, y, z);
          porch.add(decoration);
        }
      }
      node.add(porch);
    }
  }

  /**
   * 把货架上的**真货**摆上店内的展示位。
   *
   * 假商品剪影已经从内景里删掉（furnitureShopInterior 里写了理由），
   * 台面归这里管：货架前几件、每件一个代表模型，随机分配到锚点上。
   *
   * ## 大件缩小
   *
   * 展示位是 0.55 见方的台面格，一张 2×1 的书桌原样摆上去会把整面墙
   * 吃掉。按包围盒等比缩到装下（只缩不放：小东西保持原大，放大会糊）。
   * 这不是"假装商品是模型"——现实家具店的橱窗样品本来就有缩样。
   *
   * ## 随机但不抖
   *
   * 洗牌的随机数用**货架内容做种子**（简单字符串 hash）：同一批货怎么
   * 摆是定的，换一批货才换布局。用 Math.random 的话整组重建（挪一堵墙、
   * 读档）都会让橱窗里的东西跳一次位，看着像闹鬼。
   */
  private refreshShopGoods(): void {
    const shop = findShop();
    if (!shop) return;
    const node = this.root.getObjectByName(`building-${shop}`);
    if (!node) return;

    // 拆旧摆新。整组重建走 rebuild → 这里，单独变化走 storage_changed → 这里
    const old = node.getObjectByName("shop-goods");
    if (old) {
      node.remove(old);
      disposeTree(old);
    }

    const placement = listBuildings().find((item) => item.instanceId === shop);
    if (!placement || placement.construction) return;
    const level = findBuildingLevel(placement.buildingId, placement.levelId);
    if (!level) return;

    const goods = new Object3D();
    goods.name = "shop-goods";

    const anchors = [
      ...shopDisplayAnchors(level.footprint.width / 2, level.footprint.height / 2),
    ];
    const stocked = shelfSlotsOf(shop).filter(
      (slot): slot is NonNullable<typeof slot> => slot !== null,
    );

    // 种子洗牌（Fisher–Yates + LCG）：内容不变布局就不变
    let seed = 0;
    for (const slot of stocked) {
      for (const ch of slot.itemId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    }
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = anchors.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [anchors[i], anchors[j]] = [anchors[j], anchors[i]];
    }

    const bounds = new Box3();
    const size = new Vector3();
    for (const [index, slot] of stocked.entries()) {
      const anchor = anchors[index];
      if (!anchor) break; // 展示位比货位少时，多出来的货只在货架数据里

      const visual = buildItemVisual(slot.itemId);
      if (!visual) continue;

      bounds.setFromObject(visual);
      bounds.getSize(size);
      const footprint = Math.max(size.x, size.z, 0.001);
      // 只缩不放；高度也管着点，别让落地灯顶穿上面那层格板
      const scale = Math.min(1, anchor.maxSize / footprint, 1.1 / Math.max(size.y, 0.001));
      visual.scale.setScalar(scale);
      // 模型原点不一定在底面：把包围盒的底压到台面上
      visual.position.set(
        anchor.x,
        anchor.y - bounds.min.y * scale,
        anchor.z,
      );
      visual.rotation.y = rand() * Math.PI * 2;
      goods.add(visual);
    }

    node.add(goods);
  }

  /** 谁在家谁的窗就亮（夜里）。窗户网格由建模配方打 `userData.window` 标 */
  refreshWindowLights(): void {
    const phase = getClock().phase;
    const dark = phase === DayPhaseId.Dusk || phase === DayPhaseId.Night;
    // 05：病着的白天也亮——"咕噜没出门，窗灯白天也亮着"就是他病了的信号
    const lit = dark ? homesWithSomeoneIn() : homesWithSomeoneIn(true);
    for (const node of this.root.children) {
      if (!node.name.startsWith("building-")) continue;
      const instanceId = node.name.slice("building-".length);
      setWindowsLit(node, lit.has(instanceId));
    }
  }

  /** 按实例 id 找到那一栋，只把状态重新贴一遍 */
  private refreshOne(instanceId: string): void {
    const node = this.root.getObjectByName(`building-${instanceId}`);
    if (!node) return;
    const placement = listBuildings().find((item) => item.instanceId === instanceId);
    if (placement) applyState(node, placement.state);
  }

  dispose(): void {
    for (const off of this.offListeners) off();
    this.clear();
    this.scene.remove(this.root);
  }
}

/** 把实例状态映射到模型上。认不出的状态就什么都不做——布景不该因为数据没准备好而崩 */
function applyState(node: Object3D, state: Record<string, unknown> | undefined): void {
  if (!state) return;

  // ---- 金币罐的币堆：按存了多少分六档（空箱 + 五档）----
  const fill = typeof state.fill === "number" ? state.fill : undefined;
  if (fill !== undefined) {
    /*
     * `fill` 是 `stored / capacity`，由状态层算好——那是**平衡数值**。
     * "这个比例该显示第几档"是**表现**，所以换算在视图这边：
     * 一分钱没有 → 空箱；只要有钱就至少摆一枚；满档留给"快满了"。
     *
     * 上一版是一片连续上下走的液面。分档看得清得多：空箱和满箱一眼分得
     * 出，中间几档也各有各的形状；连续液面在 12% 和 18% 之间是看不出来的。
     */
    const stage =
      fill <= 0.001
        ? 0
        : Math.min(GOLD_STAGES, Math.max(1, Math.ceil(fill * GOLD_STAGES)));
    node.traverse((child) => {
      if (!child.name.startsWith("gold-stage-")) return;
      child.visible = child.name === `gold-stage-${stage}`;
    });
  }

  // ---- 农田的阶段 ----
  const stage = typeof state.stage === "string" ? state.stage : undefined;
  if (stage) {
    node.traverse((child) => {
      if (!child.name.startsWith("stage-")) return;
      child.visible = child.name === `stage-${stage}`;
    });
  }
}

/**
 * 窗户亮 / 灭：换玻璃的自发光。材质先克隆一次（配方里的材质可能是共享的），
 * 之后只改 emissive。没有 emissive 的材质（Basic）就什么都不做。
 */
/**
 * 门口装饰的占位几何（11）：生日 = 一串彩色小旗 + 两只气球；节日 = 三只灯笼。
 * 参考图到了再换，接口只有 visualId。
 */
function buildPorchDecoration(visualId: string): Object3D {
  const group = new Object3D();
  group.userData.noCollide = true;
  if (visualId === "porch_birthday") {
    const colors = ["#e76f51", "#f4a261", "#e9c46a", "#2a9d8f", "#8ab6d6"];
    for (let i = 0; i < 7; i += 1) {
      const x = -1.2 + (i * 2.4) / 6;
      const sag = 0.12 * Math.sin((i / 6) * Math.PI);
      const flag = box([0.16, 0.2, 0.02], { color: colors[i % colors.length], position: [x, -0.14 - sag, 0.05], castShadow: false });
      flag.userData.noCollide = true;
      group.add(flag);
    }
    const string = box([2.5, 0.015, 0.015], { color: "#f2e6c4", position: [0, -0.02, 0.05], castShadow: false });
    string.userData.noCollide = true;
    group.add(string);
    for (const [x, color] of [[-1.35, "#f4a2c0"], [1.35, "#8ab6d6"]] as const) {
      const balloon = box([0.26, 0.32, 0.26], { color, position: [x, 0.25, 0.1], castShadow: false });
      balloon.userData.noCollide = true;
      group.add(balloon);
    }
  } else {
    for (const x of [-1.1, 0, 1.1]) {
      const lantern = box([0.24, 0.32, 0.24], { color: "#d9402a", position: [x, -0.25, 0.1], castShadow: false });
      lantern.userData.noCollide = true;
      const cap = box([0.3, 0.05, 0.3], { color: "#f2c14e", position: [x, -0.06, 0.1], castShadow: false });
      cap.userData.noCollide = true;
      group.add(lantern, cap);
    }
  }
  return group;
}

function setWindowsLit(node: Object3D, lit: boolean): void {
  node.traverse((child) => {
    if (!child.userData.window) return;
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.userData.windowMaterialOwned) {
      mesh.material = (mesh.material as Material).clone();
      mesh.userData.windowMaterialOwned = true;
    }
    const material = mesh.material as Material & { emissive?: Color; emissiveIntensity?: number };
    if (!material.emissive) return;
    if (lit) {
      material.emissive.set("#ffb95c");
      material.emissiveIntensity = 1.4;
    } else {
      material.emissive.set("#000000");
      material.emissiveIntensity = 0;
    }
  });
}
