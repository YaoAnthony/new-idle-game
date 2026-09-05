import {
  Facing,
  WallOpeningKind,
  anchorOf,
  anchorRectToWorld,
  findDoorDefinition,
  isHouseStowed,
  roomLocalToWorld,
  worldToRoomCell,
  worldToRoomLocal,
  yardBoundsOf,
  type DoorDefinition,
  type DoorSave,
  type GridPosition,
} from "core";
import { emit } from "../EventBus";
import { doorsAssumedOpen } from "./world/walkable";
import { Door, RoomDoor } from "./doorAgent";
import { getResidents } from "./residentsRuntime";
import {
  getCurrentMap,
  getRoom,
  getWorld,
  setDoorBlocker,
  setDoorGate,
  isPhasing,
  setOutdoorPass,
  setStandingSurface,
  setStructureBlocker,
} from "./worldRuntime";
import { territoryStandingAt } from "./territory";
import { listBuildings, rectOf } from "./buildings";
import { buildingsBlockAt, buildingStandHeightAt } from "./world/buildingColliders";

/**
 * 门的集合管理（和 residentsRuntime 同一套摆法：Agent 类管一扇门怎么动，
 * 这里管全体的初始化 / tick / 存取档 / 查询）。
 *
 * 初始化时机：RoomScene 构造时调 initDoors()——门实例来自房间几何
 * （门洞 + 外墙门开口），几何必须已经就位。读档的话 hydrate 会先把
 * DoorSave 寄存进来，init 时按 refId 认领。
 */

const doors = new Map<string, Door>();

/**
 * 按注册表字段选类：有自动开半径的门就是 RoomDoor，没有的是纯基类。
 * 类的选择也由数据驱动——这里不出现任何具体门的 id。
 */
function makeDoor(
  refId: string,
  definition: DoorDefinition,
  cells: readonly GridPosition[],
  center: { x: number; z: number },
  savedLocked?: boolean,
  initiallyLocked?: boolean,
): Door {
  const DoorClass = definition.behavior?.autoOpenRadius ? RoomDoor : Door;
  /*
   * 锁定的优先级：存档 > 这一扇的设定 > 这一种门的默认。
   * 存档最优先是关键——玩家拿钥匙开过的锁，读档不该自己合上。
   */
  const locked = savedLocked ?? initiallyLocked ?? definition.defaultLocked;
  return new DoorClass(refId, definition, cells, center, locked);
}

/** hydrate 先到、房间几何后到，锁定状态在这里等着被 init 认领 */
let pendingSaves: DoorSave[] | null = null;

export function restoreDoors(saved: DoorSave[] | undefined): void {
  pendingSaves = saved ?? null;
}

/**
 * 脚下是不是一块**声明出来的**可走固定面（`MapDefinition.groundFixtures`）。
 *
 * 今天只有两座桥的桥面。地形兜底面不算——那是"大地"，声明面才是"路"。
 */
function onDeclaredSurface(
  map: ReturnType<typeof getCurrentMap>,
  x: number,
  z: number,
): boolean {
  for (const fixture of map.groundFixtures ?? []) {
    const rect = fixture.rect;
    if (!rect) continue;
    if (x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ) {
      return true;
    }
  }
  return false;
}

export function initDoors(): void {
  doors.clear();
  const { room } = getWorld();
  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;
  const savedByRef = new Map(
    (pendingSaves ?? []).map((save) => [save.refId, save]),
  );

  // ---- 内墙门洞上的门 ----
  // 房子收起来了就一扇门都不建（外墙门那边由 findDoors 答空兜住）
  for (const doorway of isHouseStowed(room) ? [] : (room.interiorDoorways ?? [])) {
    if (!doorway.doorId) continue;
    const definition = findDoorDefinition(doorway.doorId);
    if (!definition) {
      // 注册表审计启动时已经报过拼错的 id；这里是老档带着已删门种的情况
      if (import.meta.env.DEV) {
        console.warn(`[door] 门洞 ${doorway.doorwayId} 引用了未知门种 ${doorway.doorId}`);
      }
      continue;
    }

    const cells: GridPosition[] = [];
    for (let i = 0; i < doorway.span; i += 1) {
      cells.push(
        doorway.axis === "x"
          ? { x: doorway.cell.x + i, y: doorway.cell.y }
          : { x: doorway.cell.x, y: doorway.cell.y + i },
      );
    }
    // 门心先在房本地系里算，再经锚点入世界——door.center 的消费方
    // （自动开门的距离、自动跑腿的路径相交）拿它和人物的世界坐标比
    const centerLocal = {
      x: doorway.cell.x + (doorway.axis === "x" ? doorway.span / 2 : 0.5) - halfW,
      z: doorway.cell.y + (doorway.axis === "y" ? doorway.span / 2 : 0.5) - halfD,
    };
    const center = roomLocalToWorld(room, centerLocal.x, centerLocal.z);

    const door = makeDoor(
      doorway.doorwayId,
      definition,
      cells,
      center,
      savedByRef.get(doorway.doorwayId)?.locked,
      doorway.initiallyLocked,
    );
    doors.set(door.refId, door);
  }

  // ---- 大门（外墙开口）----
  /**
   * 大门的穿行通道，**房本地系**（outdoorPass 的判定统一在本地系里做）。
   *
   * 原来这里写死了"大门在西墙"：中心 `-halfW + 0.5`、通道沿 z 排、
   * 穿墙判 `local.x < -halfW`。2LDK 的门恰好在西墙，所以从没露馅——
   * 女巫小屋的门开在南墙，这套把它算到了西墙上（实测门心 (−6.5, 5)，
   * 该是 (−5, 15)）。这是和"房子中心 = 原点""一图一主屋"同一类的隐含
   * 公理，现在按**墙的朝向**推：沿哪根轴排、在哪条边、往哪个方向穿。
   */
  let frontDoorRef: string | null = null;
  let pass: { axis: "x" | "z"; min: number; max: number; edge: number; side: 1 | -1 } | null =
    null;
  const frontDefinition = findDoorDefinition("front_door");
  if (frontDefinition) {
    for (const wall of Object.values(room.walls)) {
      for (const opening of wall.openings) {
        if (opening.kind !== WallOpeningKind.Door) continue;
        const w = opening.size.width;
        const from = opening.gridPosition.x;
        /*
         * 墙格 ↔ 房本地的约定（WallSave.frame 的注释）：北/南墙沿 +x 铺、
         * 从西端数；东/西墙沿 +z 铺、从北端数。门心贴在墙内侧半格。
         */
        let centerLocal: { x: number; z: number };
        switch (wall.facing) {
          case Facing.North:
            centerLocal = { x: from + w / 2 - halfW, z: -halfD + 0.5 };
            pass = { axis: "x", min: from - halfW, max: from + w - halfW, edge: -halfD, side: -1 };
            break;
          case Facing.South:
            centerLocal = { x: from + w / 2 - halfW, z: halfD - 0.5 };
            pass = { axis: "x", min: from - halfW, max: from + w - halfW, edge: halfD, side: 1 };
            break;
          case Facing.East:
            centerLocal = { x: halfW - 0.5, z: from + w / 2 - halfD };
            pass = { axis: "z", min: from - halfD, max: from + w - halfD, edge: halfW, side: 1 };
            break;
          default: // West
            centerLocal = { x: -halfW + 0.5, z: from + w / 2 - halfD };
            pass = { axis: "z", min: from - halfD, max: from + w - halfD, edge: -halfW, side: -1 };
        }
        /*
         * cells 留空——外墙格本来就不可走，不需要它再挡一次；
         * center 给自动开关和交互扫描用。大门在注册表里也带自动开半径
         * （收得很小），所以 makeDoor 会给它 RoomDoor：派遣出门的开门
         * 仪式就是这一条行为。
         */
        const door = makeDoor(
          opening.openingId,
          frontDefinition,
          [],
          roomLocalToWorld(room, centerLocal.x, centerLocal.z),
          savedByRef.get(opening.openingId)?.locked,
        );
        doors.set(door.refId, door);
        frontDoorRef = door.refId;
      }
    }
  }

  /**
   * 碰撞圆是不是正对着大门、并且在往外（或往里）穿那条边。
   * 沿墙的那根轴要整个人都在门洞跨度里（挡住"贴着墙外侧蹭"），
   * 垂直那根轴要压到门所在的那条边而不是对面的边。
   */
  const throughFrontDoor = (local: { x: number; z: number }, radius: number): boolean => {
    if (!pass) return false;
    const along = pass.axis === "x" ? local.x : local.z;
    const across = pass.axis === "x" ? local.z : local.x;
    if (along - radius < pass.min || along + radius > pass.max) return false;
    return pass.side > 0
      ? across + radius > pass.edge - 0.01
      : across - radius < pass.edge + 0.01;
  };

  pendingSaves = null;
  // 基线跟着门一起重建，否则换房间后第一帧会拿旧门的状态比对
  lastOpen.clear();
  for (const door of doors.values()) lastOpen.set(door.refId, door.open);

  /*
   * 把"关着的门挡路"注册进 isWalkable。回调注册而不是让 worldRuntime
   * 直接 import 这里——那是个循环依赖（这里要 getWorld）。
   */
  setDoorBlocker((gx, gy) => {
    for (const door of doors.values()) {
      if (door.blocksCell(gx, gy)) return true;
    }
    return false;
  });

  /*
   * 生物走到门前该停下等门开（见 walkable 的 doorGateBlocks）。
   *
   * 停的位置是**身体碰到门板那一刻**：体表距门心 ≤ 0，也就是圆盖住了
   * 门心。不另设一个"门前 0.4 米"之类的数——那个数每换一种体型就得重调，
   * 而"碰到门了"本来就是从半径推得出来的。
   *
   * 只拿门心当门，不摊开 `cells`：门洞最宽两格，任何过得去的生物它的
   * 碰撞圆都必然盖过门心。摊开要把房本地格换算回世界系，为一个够用的
   * 近似值背一整套锚点换算不划算。
   */
  setDoorGate((x, z, radius) => {
    for (const door of doors.values()) {
      if (door.open) continue;
      if (Math.hypot(x - door.center.x, z - door.center.z) <= radius) {
        return true;
      }
    }
    return false;
  });

  /*
   * 室外通行判定（isWalkable 的边界分支走这里）。三层，由外到内：
   * 1. 院子有边——可走边界从地图定义推（yardBoundsOf，四向边距可以
   *    不均匀），草地视觉更大没关系，
   *    能看到的远处和能走到的范围不是一回事。
   * 2. 碰撞圆不压着房子 → 院子里自由走。
   * 3. 压着房子 = 正在穿墙，只有一种合法情况：大门开着、
   *    且整个人都在门洞的 z 跨度里、且压的是西墙那条边。
   *    z 校验挡住"贴着南北墙外侧蹭"，x 校验挡住"从东墙穿进来"。
   */
  /*
   * 建筑的模型碰撞（期 B）。**穿行的角色整层豁免**——和它当初无视
   * 矩形规则是同一条语义，只是矩形换成了模型。
   */
  setStructureBlocker((x, z, radius) => {
    /*
     * 两类结构，两种穿行语义（期 D）：
     * - **玩家盖的楼**：穿行的角色（石傀儡）整层豁免——他的活儿要求他
     *   到得了每一个工地，见 golemPhasing。
     * - **地图布景**（小镇的六家店）：谁都挡，穿行也不例外。它们是
     *   世界本身，不是玩家摆出来的东西——和穿行不豁免地形是同一条线。
     */
    if (!isPhasing() && buildingsBlockAt(listBuildings(), x, z, radius)) return true;
    return buildingsBlockAt(getCurrentMap().buildings ?? [], x, z, radius);
  });

  /*
   * 模型站立面（期 C）。**不看穿行**：高度对谁都是真的，石傀儡穿墙
   * 不等于悬空走。
   */
  setStandingSurface((x, z, base) =>
    buildingStandHeightAt(listBuildings(), x, z, base),
  );

  setOutdoorPass((x, z, radius) => {
    const map = getCurrentMap();
    const bounds = yardBoundsOf(map, getWorld().room.floorGrid);
    if (
      x - radius < bounds.minX ||
      x + radius > bounds.maxX ||
      z - radius < bounds.minZ ||
      z + radius > bounds.maxZ
    ) {
      return false;
    }

    /*
     * **领地外不能走**，不只是不能建（决策 T1）。三态各有各的答法：
     *
     * - `locked` —— 还没开的格，直接拦。
     * - `owned` —— 你的地，往下走别的判定。
     * - `outside` —— **领地不管这里**，交给地理：脚下得是一块**声明出来的**
     *   可走面（`groundFixtures`，今天就是两座桥的桥面）才让过。
     *
     * 最后那条不是多余的谨慎，是实测逼出来的。领地矩形的东、南两边画在
     * 旧院墙线上，而墙拆了之后（T12）墙线到河岸之间还剩一条平地走廊；
     * 按"格外一律放行"的写法，人可以从开局格往南出界、沿走廊绕到东边、
     * 直接上桥——"扩充两次才看得到桥"被整个绕过去（实测路径
     * (5.3,18.3) → (20.3,18.3) → (20.8,−3.3)）。
     *
     * 用"是不是声明面"而不是"再画一圈禁行盒"：桥是**声明即可走**的
     * （承托面那套），河岸带只是兜底地形。判据落在已有的数据上，不新增
     * 一份要和地图同步维护的边界。
     *
     * 判点不判圆：和 `isIndoors` 同一条理由——问的是"这个人在不在自己
     * 地里"，一个人不可能半只脚在领地内。
     *
     * 导航网格自动跟随（它采样 `isWalkable`），`world_changed` 已经触发
     * `invalidateNavGrid`——开一块地之后 `/go` 立刻能走过去。
     */
    const standing = territoryStandingAt(x, z);
    if (standing === "locked") return false;
    if (standing === "outside" && !onDeclaredSurface(map, x, z)) return false;

    /*
     * **领地上玩家建的建筑**：碰撞圆压到就不许过，除非正对着门。
     *
     * 两类建筑都走这一条：
     * - 没有内景的（金币罐、农田）——纯实心，门那一段也不放行；
     * - 有内景的（小屋、房子）——**只有门口那一段是口子**。少了这条，
     *   人能从任意一面墙走进屋：`roomIdAt` 在屋里返回那间屋，通行判定
     *   走屋内分支，而屋内分支只看地板边界不看墙。这正是主屋那条
     *   "穿墙只能走门"规矩的推广。
     */
    /*
     * 楼的挡人从这里搬走了（期 B，模型即碰撞）：现在由 isWalkable 顶部
     * 的 structureBlocker 按**模型**判——门洞能走是因为那一段没有
     * 三角形，"门心 1.5 米豁免"和"实心楼一票否决"两条手写规则整段退役。
     *
     * 这里只剩一个标记：人在某栋楼的**脚印**里时要跳过院子占用图。
     * 脚印进占用图是给放置校验用的，通行不该在它上面二次上锁——
     * 门槛死区那个老 bug 就是两头都拦出来的。
     */
    let insideBuilding = false;
    for (const placement of listBuildings()) {
      const rect = rectOf(placement);
      if (
        x + radius > rect.minX &&
        x - radius < rect.maxX &&
        z + radius > rect.minZ &&
        z - radius < rect.maxZ
      ) {
        insideBuilding = true;
        break;
      }
    }

    /*
     * 院子网格内的点：问**院子那张占用图**（院里的家具、房子脚印）。
     * 网格外（桥、河、镇）不问——那些地方本来就没有格子。
     *
     * 围墙阻挡盒本期**不**并进占用图：它们还要给镜头当禁入盒，两处
     * 各读各的。合并是以后的收口，现在合了会让镜头那边少一份数据。
     */
    /*
     * **人已经在某栋楼的占地里了就别再问院子那张图。**
     *
     * 楼的脚印同时进了院子的占用图（挡放置、挡从外面穿墙）和上面那条
     * "只能走门"的规则。两处都拦的话，**门槛那一圈正好死在中间**：
     * 门那条规则放行了，脚印又挡了一次，于是屋里和门口在导航网格上
     * 是两个不连通的岛（实测：门格连通、屋内不连通，中间整整一行全黑）。
     *
     * 谁负责哪一段分清楚：进出楼由门那条规则管，院子的占用图只管院子。
     */
    /*
     * 主屋的脚印同理——它不在 listBuildings() 里（那是玩家盖的楼），
     * 但它的占地一样进了院子的占用图。少了这一句，屋里最南一行（门槛
     * 那一圈）在导航网格上整行全黑：人从屋里贴近南墙时走到这儿，
     * 院子那张图说"这格是房子"，而房子自己的门规则在后面还没轮到。
     * 实测就是这么断的：洗手间到大门外找不到路。
     */
    const house = getWorld().room;
    const houseRect = anchorRectToWorld(anchorOf(house), {
      minX: -house.floorGrid.width / 2,
      maxX: house.floorGrid.width / 2,
      minZ: -house.floorGrid.height / 2,
      maxZ: house.floorGrid.height / 2,
    });
    const overlapsPrimary =
      !isHouseStowed(house) &&
      x + radius > houseRect.minX &&
      x - radius < houseRect.maxX &&
      z + radius > houseRect.minZ &&
      z - radius < houseRect.maxZ;

    /*
     * 院子那张占用图里装的是家具和楼的脚印——同样是"玩家摆出来的东西"，
     * 穿行时一并不问。主屋的脚印也在里面，但主屋的边界另有一段
     * （本函数末尾的 `overlapsHouse` + 大门规则）在管，跳过这里不会
     * 让它穿进客厅。
     */
    const yard =
      isPhasing() || insideBuilding || overlapsPrimary
        ? undefined
        : getRoom(map.outdoorRoomId);
    if (yard) {
      const cell = worldToRoomCell(yard, x, z);
      if (
        cell.x >= 0 &&
        cell.y >= 0 &&
        cell.x < yard.floorGrid.width &&
        cell.y < yard.floorGrid.height &&
        getWorld().occupancyOf(yard.roomId).blocked.has(`${cell.x},${cell.y}`)
      ) {
        return false;
      }
    }

    /*
     * 小镇店铺这类布景的挡人也搬去 structureBlocker 了（期 D）：
     * 按**模型**判，和玩家的楼一套机制。`map.outdoorBlockers` 还在——
     * 但只剩镜头在用（禁入盒是取景约束，不是脚的碰撞），走路这边
     * 不再读它。
     */

    /*
     * **一堵墙都没有的房间没有边界**（小镇广场）。
     *
     * 下面那两段（豁口 / 大门）默认"房间是围起来的"，围墙上开了一个
     * 口子，能不能过就看那个口子。广场把矮墙拆掉之后这个前提没了：
     * 没有开口，passMinZ/passMaxZ 是初值，判定退化成"哪儿都过不去"，
     * 人被封在广场正中——寻路套件一跑就是"广场→台地找不到路"。
     *
     * 与其在下面补特例，不如把前提写出来：墙是边界的定义，没有墙就
     * 没有边界。以后再有别的露天场地（集市、码头）自动适用。
     */
    if (Object.keys(getWorld().room.walls).length === 0) return true;

    /*
     * **房子不在场也就没有边界**（2026-08-20）。上面那条说的是"没有墙
     * 的房间"（广场），这条说的是"房子收起来了"——蓝图里的四面墙还在
     * 数据里躺着，光看 walls 判不出来。少了它，收房子之后人会被一圈
     * 看不见的墙圈在原地：判定要求"大门开着才能穿越"，而门早随房走了。
     */
    if (isHouseStowed(getWorld().room)) return true;

    /*
     * 从这里起是"和房子本体打交道"的判定，统一转进**房本地系**做
     * （RoomAnchor）：房子挪走/转向后，墙线、门洞 z 跨度、西墙判据
     * 全都自动跟着——上面院界和布景占地是地理，继续用世界坐标。
     */
    const local = worldToRoomLocal(getWorld().room, x, z);
    const overlapsHouse =
      local.x + radius > -halfW &&
      local.x - radius < halfW &&
      local.z + radius > -halfD &&
      local.z - radius < halfD;
    if (!overlapsHouse) return true;

    /*
     * 到这儿说明正在穿越"房间"的边界。房子只有开着大门才过得去；
     * **露天场地（小镇广场这类）不一样**——它墙上的那个口子是个豁口，
     * 不是一扇要按 F 开的门。硬套房子的规矩会把广场变成一个封死的
     * 院子：玩家 /goto town 落在广场正中，四面矮墙，走不出去。
     * （实测踩到过，是这次做寻路时导航网格只连出 660 格才发现的。）
     */
    if (map.openAir) return throughFrontDoor(local, radius);

    const frontDoor = frontDoorRef ? doors.get(frontDoorRef) : undefined;
    // 导航采样时当门开着（走到跟前自动跑腿会开）——见 walkable 的 withDoorsOpen
    const passable = frontDoor?.open || (doorsAssumedOpen() && !frontDoor?.locked);
    if (!passable) return false;
    return throughFrontDoor(local, radius);
  });
}

/**
 * 上一帧每扇门的开合状态。用来在**一个地方**检测跳变——
 * 门可能被玩家按 F 开、被宠物自动开、以后还可能被剧情开，
 * 各处自己发事件迟早会漏掉一条路径。比对状态则不管谁改的都抓得到。
 */
const lastOpen = new Map<string, boolean>();

/** 每帧驱动自动开关。生物 = 宠物这类非玩家活物；玩家开门永远走 F */
export function tickDoors(): void {
  if (doors.size === 0) return;
  // 带上体型：自动开关的距离量到体表，大家伙要早一点开（见 RoomDoor.tick）
  const creatures = getResidents().map((resident) => ({
    x: resident.x,
    z: resident.z,
    radius: resident.radius,
  }));
  for (const door of doors.values()) {
    door.tick(creatures);

    const previous = lastOpen.get(door.refId);
    if (previous !== door.open) {
      lastOpen.set(door.refId, door.open);
      // 首帧（previous 是 undefined）不发：那是初始化不是"门动了"
      if (previous !== undefined) {
        emit("door_toggled", {
          refId: door.refId,
          open: door.open,
          x: door.center.x,
          z: door.center.z,
        });
      }
    }
  }
}

export function listDoors(): Door[] {
  return [...doors.values()];
}

export function findDoorAgent(refId: string): Door | undefined {
  return doors.get(refId);
}

export function snapshotDoors(): DoorSave[] {
  /*
   * 门实例还没建（读档之后、RoomScene 的 initDoors 之前）时，快照
   * 原样退回寄存的那份——否则这个窗口里存一次盘，全部锁状态清零。
   * 认领过（doors 非空）之后寄存已经消费掉，走正常路径。
   */
  if (doors.size === 0 && pendingSaves) return pendingSaves;

  return listDoors().map((door) => ({
    refId: door.refId,
    definitionId: door.definition.id,
    locked: door.locked,
  }));
}
