import {
  AffectionStage,
  type GiftTier,
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

export function tickPets(
  deltaSeconds: number,
  player: { x: number; z: number },
): void {
  for (const pet of pets.values()) {
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
