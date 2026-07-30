import {
  AffectionStage,
  Facing,
  findPath,
  type GridPosition,
  type PetSave,
} from "core";
import { emit } from "../EventBus";
import { getWorld } from "./worldRuntime";

/**
 * 宠物运行时。移动用 Core 的格子 A*（和放置系统共用同一张占用图），
 * 表现层每帧直接读位置渲染，不走事件（离散状态变化才走事件）。
 */

export type PetState = "hidden" | "entering" | "idle" | "wander" | "approach";

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
};

const SPEED = 1.7;

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

function randomFreeCell(): GridPosition | null {
  const { room, occupancy } = getWorld();

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const cell = {
      x: 1 + Math.floor(Math.random() * (room.floorGrid.width - 2)),
      y: 1 + Math.floor(Math.random() * (room.floorGrid.height - 2)),
    };
    if (!occupancy.blocked.has(`${cell.x},${cell.y}`)) return cell;
  }
  return null;
}

function startPath(pet: PetRuntime, goal: GridPosition): boolean {
  const { room, occupancy } = getWorld();
  const path = findPath(room.floorGrid, occupancy, worldToGrid(pet.x, pet.z), goal);
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
  };

  // 走到房间中部一个空格
  const target = randomFreeCell() ?? { x: 6, y: 6 };
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
 */
function headingToFacing(heading: number): Facing {
  const quarter = Math.round(heading / (Math.PI / 2)) & 3;
  return [Facing.North, Facing.East, Facing.South, Facing.West][quarter];
}

const FACING_HEADING: Record<Facing, number> = {
  [Facing.North]: 0,
  [Facing.East]: Math.PI / 2,
  [Facing.South]: Math.PI,
  [Facing.West]: -Math.PI / 2,
};

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
    };
  }

  return saved;
}

export function restorePets(saved: Record<string, PetSave>): void {
  pets.clear();

  for (const entry of Object.values(saved)) {
    pets.set(entry.petId, {
      petId: entry.petId,
      definitionId: entry.definitionId,
      // 读档时宠物已经在屋里了，不重放"从门口走进来"的登场过场
      state: "idle",
      x: entry.position.x,
      z: entry.position.y,
      heading: FACING_HEADING[entry.position.facing] ?? 0,
      affectionStage: entry.affectionStage,
      nickname: entry.nickname,
      lastGiftWorldDayId: entry.lastGiftWorldDayId,
      path: [],
      pathIndex: 0,
      idleTimer: 1 + Math.random() * 3,
      moving: false,
    });
    emit("pet_changed", { petId: entry.petId, reason: "restored" });
  }
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
      const step = Math.min(SPEED * deltaSeconds, distance);
      pet.x += (dx / distance) * step;
      pet.z += (dz / distance) * step;

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

  const target = randomFreeCell();
  if (target && startPath(pet, target)) {
    pet.state = "wander";
  }
  pet.idleTimer = 3 + Math.random() * 5;
}
