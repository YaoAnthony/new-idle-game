import {
  AffectionStage,
  cellHasClearance,
  findPetDefinition,
  type GiftTier,
  type GridPosition,
  type PetSave,
} from "core";
import { emit } from "../EventBus";
import { PetAgent, type PetActivity } from "./petAgent";
import { getWorld } from "./worldRuntime";

/**
 * 活着的宠物们。**每只都是 PetAgent 的实例**——行为状态机、吃喝睡、
 * 心情成长全在那个类里（见 petAgent.ts 顶部的"新物种怎么加"）。
 * 这个文件只剩三件事：持有实例表、对外提供查询、存档进出。
 *
 * 原来这里是 260 行的裸对象 + tickPet 大函数。换成类不是为了面向对象
 * 本身，是因为"宠物"确实是**同一套行为的多个实例**——舒舒和 wisp
 * 跑的是同一个状态机，差异全是注册表数字。裸对象时代每加一个字段
 * 要同时改 spawn / restore / tick 三处，漏一处就是静默 bug
 * （growth 和 needs 在存档里躺了一个月，一直被硬编码成 0 和 {}，
 * 就是这么来的）。
 */

// 旧名字的别名：外面已经有人按这两个名字引用，改名不值得动八个文件
export type PetRuntime = PetAgent;
export type PetState = PetActivity;

const pets = new Map<string, PetAgent>();

export function getPets(): PetAgent[] {
  return [...pets.values()];
}

export function getPet(petId: string): PetAgent | undefined {
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

/** 手递的食物也走 agent 的进食结算：饱食、心情、成长值一条路 */
export function feedPet(petId: string, itemId: string, tier: GiftTier): void {
  pets.get(petId)?.feed(itemId, tier);
}

/** 宠物从门口进屋（首次登场的过场用） */
export function spawnPet(petId: string, definitionId: string): PetAgent {
  const existing = pets.get(petId);
  if (existing) return existing;

  // 门在西墙中段，门内第一格
  const { room } = getWorld();
  const doorCell = { x: 0, y: Math.floor(room.floorGrid.height / 2) };
  const pet = new PetAgent(petId, definitionId, {
    x: doorCell.x - room.floorGrid.width / 2 + 0.5,
    z: doorCell.y - room.floorGrid.height / 2 + 0.5,
    heading: Math.PI / 2,
  });

  pets.set(petId, pet);
  pet.beginEntering();
  emit("pet_changed", { petId, reason: "spawn" });
  emit("story_signal", { kind: "pet_spawned", subject: petId });
  return pet;
}

/**
 * 调试用：把一只宠物直接放到某个坐标（跳过登场过场）。
 * 只给 /pet 命令用——正式的登场永远走 spawnPet 的"从门口进来"。
 */
export function debugPlacePet(petId: string, x: number, z: number): void {
  const pet = pets.get(petId);
  if (!pet) return;
  pet.debugPlace(x, z);
  emit("pet_changed", { petId, reason: "restored" });
}

/**
 * 新游戏开局：舒舒已经在屋里睡着了。
 *
 * 和 `spawnPet` 是两条不同的路——那条是"从门口走进来"的登场过场（苔苔的
 * 首次登场用），舒舒不是这样认识的：搬家那天它就已经在角落里呼呼大睡，
 * 剧情的开头是"叫不叫得醒"，不是"看它走进来"。所以这里直接放置 + 立刻
 * 睡下，不走 beginEntering()，也不发 pet_spawned/pet_entered（那两个信号
 * 语义就是"刚从门口进来"，舒舒从来没经历过这件事）。
 *
 * 调用时机和 `seedInitialFurniture()` 一样：只在真正的新游戏跑，
 * 读档走 restorePets 那条路。
 */
export function seedInitialPets(): void {
  if (pets.size > 0) return;

  const definitionId = "shushu";
  const radius = findPetDefinition(definitionId)?.collisionRadius ?? 0;
  const { room, occupancy } = getWorld();

  // 偏南偏东的一角：远离玄关那两个箱子（西墙门口）和北墙的落地窗，
  // 大家伙缩在角落睡觉，不挡新手教程的必经之路
  const preferred: GridPosition[] = [
    { x: 19, y: 15 },
    { x: 18, y: 16 },
    { x: 20, y: 14 },
    { x: 6, y: 15 },
  ];

  let cell = preferred.find((candidate) =>
    cellHasClearance(room.floorGrid, occupancy, candidate, radius),
  );

  // 首选角落被占了（户型变了、家具改了）就退到随机扫描，
  // 和 PetAgent 挑游荡目标用的是同一套逻辑，总能落地
  if (!cell) {
    for (let attempt = 0; attempt < 30 && !cell; attempt += 1) {
      const candidate = {
        x: 1 + Math.floor(Math.random() * (room.floorGrid.width - 2)),
        y: 1 + Math.floor(Math.random() * (room.floorGrid.height - 2)),
      };
      if (cellHasClearance(room.floorGrid, occupancy, candidate, radius)) {
        cell = candidate;
      }
    }
  }

  // 房间小到连一格都放不下它的极端情况：安静跳过，总比硬塞进墙里好
  if (!cell) return;

  const pet = new PetAgent(`pet-${definitionId}`, definitionId, {
    x: cell.x - room.floorGrid.width / 2 + 0.5,
    z: cell.y - room.floorGrid.height / 2 + 0.5,
    heading: 0,
  });
  pet.fallAsleep();

  pets.set(pet.petId, pet);
  emit("pet_changed", { petId: pet.petId, reason: "seeded" });
}

/**
 * `frozenPetId`：正在跟它对话的那一只不推进。
 *
 * 这是实测撞出来的坑：对话打开时玩家的移动会锁（RoomScene 的
 * `dialogue_changed` 处理），但宠物的自主行为原来没有对应的锁——
 * 舒舒被戳醒、聊到一半，它自己的 idleTimer 归零、80% 睡意一掷，
 * 它就在对话文字还没讲完的时候自己躺回去睡着了，和屏幕上"你笑了笑，
 * 它没说完又睡着了"这句台词各自发生、时间对不上。对话本身是一段
 * "时间暂停"的场景，正在被谈论的那个对象不该在这段时间里自己乱走。
 * 场上其它宠物不受影响，照常过日子。
 */
export function tickPets(
  deltaSeconds: number,
  player: { x: number; z: number },
  frozenPetId?: string | null,
): void {
  for (const pet of pets.values()) {
    if (pet.petId === frozenPetId) continue;
    pet.tick(deltaSeconds, player);
  }
}

// ---- 存档 ----

export function snapshotPets(): Record<string, PetSave> {
  const { room } = getWorld();
  const saved: Record<string, PetSave> = {};
  for (const pet of pets.values()) {
    saved[pet.petId] = pet.toSave(room.roomId);
  }
  return saved;
}

export function restorePets(saved: Record<string, PetSave>): void {
  // 上一个世界的活物障碍要跟着清，不然读档后空气里留着一圈看不见的墙
  for (const pet of pets.values()) pet.dispose();
  pets.clear();

  for (const entry of Object.values(saved)) {
    pets.set(entry.petId, PetAgent.fromSave(entry));
    emit("pet_changed", { petId: entry.petId, reason: "restored" });
  }
}
