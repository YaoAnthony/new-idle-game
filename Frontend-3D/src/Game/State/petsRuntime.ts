import {
  AffectionStage,
  cellHasClearance,
  facingToHeading,
  findPath,
  findPetDefinition,
  headingToFacing,
  type GridPosition,
  type PetSave,
} from "core";
import { emit } from "../EventBus";
import {
  getWorld,
  isWalkable,
  removeCreatureObstacle,
  setCreatureObstacle,
} from "./worldRuntime";

/**
 * 宠物运行时。移动用 Core 的格子 A*（和放置系统共用同一张占用图），
 * 表现层每帧直接读位置渲染，不走事件（离散状态变化才走事件）。
 */

export type PetState =
  | "hidden"
  | "entering"
  | "idle"
  | "wander"
  | "approach"
  /** 睡着了。挡路照挡（碰撞不看状态），但不理人、不游荡 */
  | "sleeping";

export type PetRuntime = {
  petId: string;
  definitionId: string;
  state: PetState;
  x: number;
  z: number;
  /** 朝向（弧度） */
  heading: number;
  affectionStage: AffectionStage;
  /** 玩家改过的昵称。没改过就是 undefined，显示物种的 defaultNicknameKey */
  nickname?: string;
  /** 上次收礼的世界日。每天一次的节流用，见 Systems/gifting.ts */
  lastGiftWorldDayId?: string;

  path: GridPosition[];
  pathIndex: number;
  /** idle 倒计时，归零后随机走一段 */
  idleTimer: number;
  moving: boolean;

  // ---- 从 PetDefinition 抄下来的性情（spawn/restore 时查一次表，tick 里不再查） ----
  /** 移动速度（米/秒） */
  speed: number;
  /** 碰撞半径。0 = 不挡路（wisp 那种能穿过去的小团子） */
  radius: number;
  /** 睡意 0~1：闲下来时打盹的概率 */
  sleepiness: number;
  /** 一觉的时长范围（秒） */
  napSeconds: [number, number];
  /** 睡着时的剩余秒数 */
  sleepTimer: number;
};

const DEFAULT_SPEED = 1.7;

/** 性情字段的展开。查表放在 spawn/restore，tick 每帧跑，别在热路径里查注册表 */
function temperamentOf(definitionId: string): {
  speed: number;
  radius: number;
  sleepiness: number;
  napSeconds: [number, number];
} {
  const definition = findPetDefinition(definitionId);
  return {
    speed: definition?.behavior?.moveSpeed ?? DEFAULT_SPEED,
    radius: definition?.collisionRadius ?? 0,
    sleepiness: definition?.behavior?.sleepiness ?? 0,
    napSeconds: definition?.behavior?.napSeconds ?? [60, 120],
  };
}

function napDuration(pet: PetRuntime): number {
  const [min, max] = pet.napSeconds;
  return min + Math.random() * (max - min);
}

/** 睡下 / 醒来只走这两条路，碰撞登记和事件广播才不会漏 */
function fallAsleep(pet: PetRuntime): void {
  pet.state = "sleeping";
  pet.sleepTimer = napDuration(pet);
  pet.path = [];
  pet.pathIndex = 0;
  pet.moving = false;
  emit("pet_changed", { petId: pet.petId, reason: "sleep" });
}

function wakeUp(pet: PetRuntime): void {
  pet.state = "idle";
  // 醒来先愣一会儿再决定干什么——猫不会睁眼就走
  pet.idleTimer = 2 + Math.random() * 3;
  emit("pet_changed", { petId: pet.petId, reason: "wake" });
}

const pets = new Map<string, PetRuntime>();

export function getPets(): PetRuntime[] {
  return [...pets.values()];
}

export function getPet(petId: string): PetRuntime | undefined {
  return pets.get(petId);
}

export function setPetAffection(petId: string, stage: AffectionStage): void {
  const pet = pets.get(petId);
  if (!pet) return;
  pet.affectionStage = stage;
  emit("pet_changed", { petId, reason: "affection" });
}

/** 记下"今天收过礼了"。节流的判定在 Core，这里只负责存 */
export function markPetGifted(petId: string, worldDayId: string): void {
  const pet = pets.get(petId);
  if (!pet) return;
  pet.lastGiftWorldDayId = worldDayId;
  emit("pet_changed", { petId, reason: "gifted" });
}

function gridToWorldXZ(cell: GridPosition): [number, number] {
  const { room } = getWorld();
  return [
    cell.x - room.floorGrid.width / 2 + 0.5,
    cell.y - room.floorGrid.height / 2 + 0.5,
  ];
}

function worldToGrid(x: number, z: number): GridPosition {
  const { room } = getWorld();
  return {
    x: Math.floor(x + room.floorGrid.width / 2),
    y: Math.floor(z + room.floorGrid.height / 2),
  };
}

/** 挑一个这只生物**真站得进去**的格子。按体型过滤——
 * 给 0.95 半径的巨猫挑一个一格宽的缝当目标，A* 要么白搜全图要么
 * 规划出一条走不完的路，表现就是顶着门框反复卡死 */
function randomFreeCell(radius: number): GridPosition | null {
  const { room, occupancy } = getWorld();

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const cell = {
      x: 1 + Math.floor(Math.random() * (room.floorGrid.width - 2)),
      y: 1 + Math.floor(Math.random() * (room.floorGrid.height - 2)),
    };
    if (cellHasClearance(room.floorGrid, occupancy, cell, radius)) return cell;
  }
  return null;
}

function startPath(pet: PetRuntime, goal: GridPosition): boolean {
  const { room, occupancy } = getWorld();
  const path = findPath(
    room.floorGrid,
    occupancy,
    worldToGrid(pet.x, pet.z),
    goal,
    // A* 按这只的体型算路：大家伙不会再被规划进挤不过去的缝
    { clearanceRadius: pet.radius },
  );
  if (!path || path.length < 2) return false;

  pet.path = path;
  pet.pathIndex = 1;
  return true;
}

/** 宠物从门口进屋（首次登场的过场用） */
export function spawnPet(petId: string, definitionId: string): PetRuntime {
  const existing = pets.get(petId);
  if (existing) return existing;

  // 门在西墙中段，门内第一格
  const { room } = getWorld();
  const doorCell = { x: 0, y: Math.floor(room.floorGrid.height / 2) };
  const [x, z] = gridToWorldXZ(doorCell);

  const pet: PetRuntime = {
    petId,
    definitionId,
    state: "entering",
    x,
    z,
    heading: Math.PI / 2,
    affectionStage: AffectionStage.Stranger,
    path: [],
    pathIndex: 0,
    idleTimer: 2,
    moving: false,
    ...temperamentOf(definitionId),
    sleepTimer: 0,
  };

  // 挡路的活物从出现那一刻就要挡：等第一帧 tick 才登记的话，
  // 玩家恰好站在登场路线上会被它穿过去一次
  if (pet.radius > 0) setCreatureObstacle(pet.petId, pet.x, pet.z, pet.radius);

  // 走到房间中部一个空格
  const target = randomFreeCell(pet.radius) ?? { x: 6, y: 6 };
  pets.set(petId, pet);
  startPath(pet, target);
  emit("pet_changed", { petId, reason: "spawn" });
  emit("story_signal", { kind: "pet_spawned", subject: petId });
  return pet;
}

// ---- 存档 ----
//
// 只存"它是谁、在哪、跟你多熟"。路径、idleTimer、moving 这些是每帧重算的
// 运行时状态，读档后重新游荡即可。

/**
 * WorldPosition 是 (mapId, x, y, facing) 的平面坐标，没有第三个轴——
 * 屋里是俯视网格，宠物的 3D z 对应的就是这里的 y。
 * heading 是连续弧度，落档时量化到最近的 Facing（读档后马上又开始游荡，无所谓精度）。
 * 换算搬去了 Core 的 logic/facing：玩家那边也要用同一套，两份迟早会漂。
 */

export function snapshotPets(): Record<string, PetSave> {
  const { room } = getWorld();
  const saved: Record<string, PetSave> = {};

  for (const pet of pets.values()) {
    saved[pet.petId] = {
      petId: pet.petId,
      definitionId: pet.definitionId,
      roomId: room.roomId,
      position: {
        mapId: "home",
        x: pet.x,
        y: pet.z,
        facing: headingToFacing(pet.heading),
      },
      affectionStage: pet.affectionStage,
      growth: 0,
      needs: {},
      nickname: pet.nickname,
      lastGiftWorldDayId: pet.lastGiftWorldDayId,
      // undefined 而不是 false：醒着是默认态，别往每份存档里写一排 false
      sleeping: pet.state === "sleeping" ? true : undefined,
    };
  }

  return saved;
}

export function restorePets(saved: Record<string, PetSave>): void {
  // 上一个世界的活物障碍要跟着清，不然读档后空气里留着一圈看不见的墙
  for (const pet of pets.values()) {
    if (pet.radius > 0) removeCreatureObstacle(pet.petId);
  }
  pets.clear();

  for (const entry of Object.values(saved)) {
    const temperament = temperamentOf(entry.definitionId);
    const pet: PetRuntime = {
      petId: entry.petId,
      definitionId: entry.definitionId,
      // 读档时宠物已经在屋里了，不重放"从门口走进来"的登场过场。
      // 存盘时睡着的接着睡（时长重掷）——大猫每次读档都精神抖擞反而出戏
      state: entry.sleeping ? "sleeping" : "idle",
      x: entry.position.x,
      z: entry.position.y,
      heading: facingToHeading(entry.position.facing),
      affectionStage: entry.affectionStage,
      nickname: entry.nickname,
      lastGiftWorldDayId: entry.lastGiftWorldDayId,
      path: [],
      pathIndex: 0,
      idleTimer: 1 + Math.random() * 3,
      moving: false,
      ...temperament,
      sleepTimer: 0,
    };
    if (pet.state === "sleeping") pet.sleepTimer = napDuration(pet);
    if (pet.radius > 0) setCreatureObstacle(pet.petId, pet.x, pet.z, pet.radius);

    pets.set(entry.petId, pet);
    emit("pet_changed", { petId: entry.petId, reason: "restored" });
  }
}

/**
 * 调试用：把一只宠物直接放到某个坐标（跳过登场过场）。
 * 只给 /pet 命令用——正式的登场永远走 spawnPet 的"从门口进来"。
 */
export function debugPlacePet(petId: string, x: number, z: number): void {
  const pet = pets.get(petId);
  if (!pet) return;

  pet.x = x;
  pet.z = z;
  pet.state = "idle";
  pet.path = [];
  pet.pathIndex = 0;
  pet.moving = false;
  pet.idleTimer = 1.5;
  if (pet.radius > 0) setCreatureObstacle(pet.petId, pet.x, pet.z, pet.radius);
  emit("pet_changed", { petId, reason: "restored" });
}

export function tickPets(deltaSeconds: number, player: { x: number; z: number }): void {
  for (const pet of pets.values()) {
    tickPet(pet, deltaSeconds, player);
  }
}

function tickPet(
  pet: PetRuntime,
  deltaSeconds: number,
  player: { x: number; z: number },
): void {
  if (pet.state === "hidden") return;

  // 挡路的活物每帧上报自己的圆。睡着也照挡——碰撞跟状态无关
  if (pet.radius > 0) setCreatureObstacle(pet.petId, pet.x, pet.z, pet.radius);

  if (pet.state === "sleeping") {
    pet.sleepTimer -= deltaSeconds;
    if (pet.sleepTimer <= 0) wakeUp(pet);
    return;
  }

  // 沿路径移动
  if (pet.pathIndex < pet.path.length) {
    const [tx, tz] = gridToWorldXZ(pet.path[pet.pathIndex]);
    const dx = tx - pet.x;
    const dz = tz - pet.z;
    const distance = Math.hypot(dx, dz);
    pet.moving = true;

    if (distance < 0.06) {
      pet.pathIndex += 1;
    } else {
      const step = Math.min(pet.speed * deltaSeconds, distance);
      const nextX = pet.x + (dx / distance) * step;
      const nextZ = pet.z + (dz / distance) * step;

      if (pet.radius > 0) {
        /**
         * 大家伙的圆比一格宽，A* 按格算的路它未必挤得过去——
         * 沿路径每一步再做轴分离的圆碰撞（和玩家同一套）。
         * 两个轴都走不动就放弃这条路原地歇着，别顶着墙口无限蹭。
         */
        const okX = isWalkable(nextX, pet.z, pet.radius, pet.petId);
        const okZ = isWalkable(pet.x, nextZ, pet.radius, pet.petId);
        if (okX) pet.x = nextX;
        if (okZ) pet.z = nextZ;
        if (!okX && !okZ) {
          pet.path = [];
          pet.pathIndex = 0;
          pet.moving = false;
          pet.idleTimer = 2 + Math.random() * 3;
          return;
        }
      } else {
        pet.x = nextX;
        pet.z = nextZ;
      }

      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - pet.heading;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      pet.heading += diff * Math.min(1, deltaSeconds * 10);
    }
    return;
  }

  // 路径走完
  pet.moving = false;

  if (pet.state === "entering") {
    pet.state = "idle";
    pet.idleTimer = 1.5;
    emit("pet_changed", { petId: pet.petId, reason: "entered" });
    emit("story_signal", { kind: "pet_entered", subject: pet.petId });
    return;
  }

  // 熟悉后偶尔主动走向玩家（好感度的空间表现）
  pet.idleTimer -= deltaSeconds;
  if (pet.idleTimer > 0) return;

  // 睡意优先于一切安排：懒的家伙闲下来大概率直接躺下
  if (pet.sleepiness > 0 && Math.random() < pet.sleepiness) {
    fallAsleep(pet);
    return;
  }

  const nearPlayer =
    Math.hypot(player.x - pet.x, player.z - pet.z) < 2.2;

  const wantsApproach =
    pet.affectionStage !== AffectionStage.Stranger &&
    !nearPlayer &&
    Math.random() < 0.45;

  if (wantsApproach) {
    const goal = worldToGrid(player.x, player.z);
    if (startPath(pet, goal)) {
      pet.state = "approach";
      pet.idleTimer = 4 + Math.random() * 4;
      return;
    }
  }

  const target = randomFreeCell(pet.radius);
  if (target && startPath(pet, target)) {
    pet.state = "wander";
  }
  pet.idleTimer = 3 + Math.random() * 5;
}
