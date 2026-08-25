import {
  AffectionStage,
  cellHasClearance,
  findPetDefinition,
  roomCellToWorld,
  type GiftTier,
  type GridPosition,
  type PetSave,
} from "core";
import { emit } from "../EventBus";
import { PetAgent, type PetActivity,
  setPeerLookup,
} from "./petAgent";
import { getWorld, roomIdAt } from "./worldRuntime";

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

/*
 * 把"按 id 找同伴"交给个体（让路要用）。名册归这里管，`PetAgent` 只是
 * 被告知怎么找人——反过来让它 import 这个文件会成环。
 */
setPeerLookup(getPet);

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
  const doorWorld = roomCellToWorld(room, doorCell.x, doorCell.y);
  const pet = new PetAgent(petId, definitionId, {
    x: doorWorld.x,
    z: doorWorld.z,
    heading: Math.PI / 2,
  });

  pets.set(petId, pet);
  pet.beginEntering();
  emit("pet_changed", { petId, reason: "spawn" });
  emit("story_signal", { kind: "pet_spawned", subject: petId });
  return pet;
}

/**
 * 把一只生物从运行时**送走**（期 3：水獭的来去、小龙的离场）。
 *
 * 是移除不是隐藏——隐藏的话碰撞体还在，玩家会撞到一团空气，
 * `refreshInteractTarget` 也还会把它算进交互竞争。
 *
 * 不发 `pet_spawned` 的反向信号：剧情里没有"谁走了"要接的后果，
 * 视图靠 `pet_changed` + PetView 的清扫把模型收走。
 */
export function removePet(petId: string): boolean {
  const pet = pets.get(petId);
  if (!pet) return false;
  pet.dispose();
  pets.delete(petId);
  emit("pet_changed", { petId, reason: "removed" });
  return true;
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
 * 让一只宠物**已经在屋里睡着**地出现（不走"从门口走进来"的登场过场）。
 *
 * 和 `spawnPet` 是两条不同的路：那条是登场演出（推门进来、发
 * pet_spawned/pet_entered）；这条是"它本来就在这儿"，直接落位 + 立刻睡下，
 * 不发那两个信号——它们的语义就是"刚从门口进来"，用在这里是撒谎。
 *
 * **不再有开局自动调用。** 原来 RoomScene 的构造函数里写死了一句
 * `seedInitialPets()` 让舒舒睡在新家角落，那是旧剧情（出租屋那条线）的
 * 舞台调度；剧情推倒之后它成了没有来由的演出。现在这是一个**能力**，
 * 由剧情决定用不用：新剧情想安排谁"一开场就在屋里"，从 storyRules 调它。
 *
 * 找不到落脚点（房间太小、格子全占了）时安静返回 null，不硬塞进墙里。
 */
export function placeSleepingPet(definitionId: string): PetAgent | null {
  const radius = findPetDefinition(definitionId)?.collisionRadius ?? 0;
  const { room, occupancy } = getWorld();

  // 偏南偏东的一角：远离玄关那两个箱子（西墙门口）和北墙的落地窗，
  // 大家伙缩在角落睡觉，不挡必经之路
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

  if (!cell) return null;

  const cellWorld = roomCellToWorld(room, cell.x, cell.y);
  const pet = new PetAgent(`pet-${definitionId}`, definitionId, {
    x: cellWorld.x,
    z: cellWorld.z,
    heading: 0,
  });
  pet.fallAsleep();

  pets.set(pet.petId, pet);
  emit("pet_changed", { petId: pet.petId, reason: "seeded" });
  return pet;
}

/**
 * 把一只生物**直接放在某个世界坐标上**，可选立刻睡下 / 缺零件。
 *
 * 和上面两条的分别：`spawnPet` 是登场演出（推门进来、发 pet_spawned），
 * `placeSleepingPet` 是"它本来就在屋里"（按房间格子挑角落）。这一条是
 * **"它本来就在世界的这个地方"**——收世界坐标，不问房间，因为石傀儡
 * 坐在院子里，而院子的"角落"是没有意义的概念。
 *
 * `missingParts` 给了就把那些零件摘掉：石傀儡开场没有头，于是它
 * `dormant`，坐在那儿自己醒不过来（见 `PetAgent.dormant`）。
 */
export function placeCreatureAt(
  definitionId: string,
  at: { x: number; z: number; heading?: number },
  options: { asleep?: boolean; missingParts?: string[] } = {},
): PetAgent {
  const petId = `pet-${definitionId}`;
  const existing = pets.get(petId);
  if (existing) return existing;

  const pet = new PetAgent(petId, definitionId, {
    x: at.x,
    z: at.z,
    heading: at.heading ?? 0,
  });

  /*
   * 零件：默认齐全，再按 `missingParts` 摘。反过来写（默认全缺、按需装）
   * 的话，每加一个零件都要回来补一次"记得装上"，漏一次就是一只瘫在地上
   * 的傀儡——默认可用、显式弄坏，是更难出错的那一边。
   */
  pet.attachedParts.add("head");
  for (const part of options.missingParts ?? []) pet.attachedParts.delete(part);

  if (options.asleep || pet.dormant) pet.fallAsleep();

  pets.set(petId, pet);
  emit("pet_changed", { petId, reason: "seeded" });
  return pet;
}

/**
 * 开局就在世界上的生物。和 `seedInitialFurniture` 是一对：那条摆东西，
 * 这条摆活物，都只在**新档**跑一次。
 *
 * 现在只有石傀儡。他**没有头、坐在院子东侧休眠**——头在院子西侧
 * （由 `seedInitialFurniture` 摆），玩家得绕过房子去拿。分居两侧是有意的：
 * 走那一趟的路上会经过井，顺带把院子逛了一遍。
 */
export function seedInitialCreatures(): void {
  if (pets.size > 0) return;
  placeCreatureAt(
    "stone_golem",
    // 房子东边那条带子（房子占 x −10..−1），面朝西——正对着走出大门的人
    { x: 1.5, z: 8, heading: -Math.PI / 2 },
    { missingParts: ["head"] },
  );
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
  const saved: Record<string, PetSave> = {};
  for (const pet of pets.values()) {
    /*
     * 每只按**自己站的位置**记 roomId（屋里/院子各归各），不再全体
     * 盖成当前房间——原来那行 `toSave(room.roomId)` 是审计抓出来的
     * 存档损坏点：多地图之后一次存盘会把全世界宠物的户口集体迁到
     * 当前房间。运行时分桶后场上只有本图的宠物，roomIdAt 恒正确。
     */
    saved[pet.petId] = pet.toSave(roomIdAt(pet.x, pet.z));
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
