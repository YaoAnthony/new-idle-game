import type { DroppedItem } from "core";
import { emit } from "../EventBus";
import { nextObjectId, syncIdCounters } from "./ids";
import { canPassAtHeight, downhillDirection, surfaceAt } from "./worldRuntime";

/**
 * 扔在地上的东西。
 *
 * 这一层只管**它在哪、往哪飞**，不碰渲染——所以整个文件里没有一个
 * three 的类型，位置速度都是裸数字（`src/Game/` 不许 import three）。
 * 画成什么样是 Game3D/World/DroppedItemView 的事。
 *
 * 为什么不复用 placedFurniture：那边吸附网格、有朝向、要进占用图和通行判定；
 * 扔出去的东西落在连续坐标上、没朝向、谁都能踩过去。合成一张表的话，
 * 每个消费方都得先问一句"这条是摆的还是扔的"。
 */

/** 重力。世界单位 1 ≈ 1 米，所以直接用真实重力，手感不用调 */
const GRAVITY = 9.8;

/** 出手速度：往前 4.2 米/秒、往上 2.6。抛出去大约落在两三格外 */
const THROW_FORWARD = 4.2;
const THROW_UP = 2.6;

/** 出手高度。大致是角色手的位置，从脚下扔出去会像在推地板 */
const THROW_HEIGHT = 0.75;

/** 落地后的水平摩擦（每秒衰减到原来的这个比例）。滑一小段就停 */
const GROUND_DRAG = 0.02;

/** 慢到这个程度就判定停住，免得永远在算一个看不见的滑行 */
const REST_SPEED = 0.05;

/**
 * 撞到家具侧面弹回来时留下多少速度。
 *
 * 0.45 是"砸在柜门上闷一声弹开半格"，不是皮球。这类装满东西的袋子和罐子
 * 本来就不弹——弹性再高一点，扔偏的东西会一路弹到屋子另一头，
 * 玩家得追着捡；再低就变成贴着柜子滑下来，看不出"被挡住了"。
 *
 * 和 GRAVITY / GROUND_DRAG 放在一起：这些是**手感参数**，
 * 调它们是在调"扔起来爽不爽"。规则（哪一格挡到多高）在 Core 的
 * logic/projectile 里，那边才是联机时服务端要读的东西。
 */
const BOUNCE_RESTITUTION = 0.45;

/**
 * 停在家具上的东西往低处滑的速度。
 *
 * 慢是故意的：这不是"被推下去"，是"没放稳，自己溜下来"。快了就成了台面
 * 会主动弹射东西，看着像有人在下面顶。
 */
const SLIDE_OFF_SPEED = 0.8;

/**
 * 慢到这个程度就不再弹，直接算停下。
 *
 * 没有这条会**无限微跳**：每次反弹只是把 vy 乘 0.45，它趋近 0 但永远不等于 0，
 * 于是 `isAirborne` 一直为真、滑落那条分支永远进不去，东西就在台面上
 * 以纳米级振幅抖到天荒地老。所有做弹跳的物理都要有这么一道闸。
 */
const MIN_BOUNCE_SPEED = 0.4;

/**
 * 刚扔出去的东西，这段时间内不会被**扔它的人**捡回来。
 *
 * 没有这条的话按 Q 会原地打转：东西刚出手就落进拾取范围，立刻又回到背包。
 * 所有做过丢弃 + 自动拾取的游戏都要处理这一下。
 */
const PICKUP_LOCK_SECONDS = 1.2;

type DroppedEntity = {
  id: string;
  roomId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 还剩多久才允许被玩家捡起。只在运行时存在，不进存档 */
  pickupLock: number;
  stack: DroppedItem["stack"];
};

let entities: DroppedEntity[] = [];

/**
 * id 发号交给 State/ids，不再在这里数自己的数。
 *
 * 原来是模块级 `counter`，读档时扫存档里的最大后缀续号——单机完全正确，
 * 联机会撞：房主和房客各自从**自己的** counter 发，两人同时扔米饭
 * 都得到 `drop:rice#8`。带发号方前缀之后天然不撞，理由写在 ids.ts。
 */
const DROP_ID_KIND = "drop";

function nextId(itemId: string): string {
  return nextObjectId(DROP_ID_KIND, itemId);
}

export function listDroppedItems(): readonly DroppedEntity[] {
  return entities;
}

export function findDroppedItem(id: string): DroppedEntity | undefined {
  return entities.find((entity) => entity.id === id);
}

/**
 * 扔一份东西出去。
 *
 * `heading` 是角色朝向的弧度，和 CharacterController 的 headingAngle 同一套
 * （0 = +Z）。速度由这里给，调用方不需要懂抛物线。
 */
/**
 * 按抛掷参数造一个飞行中的实体。**op 通道的共用底座**：本地扔和
 * 重放别人的扔都走它——同样的初速、同样的重力，各端自己积分出
 * 同一条抛物线（世界几何一致，落点一致；毫米级浮点差由房主的
 * 整片刷新收敛）。
 */
function spawnThrown(
  id: string,
  roomId: string,
  stack: DroppedItem["stack"],
  from: { x: number; z: number },
  heading: number,
): void {
  entities = [
    ...entities,
    {
      id,
      roomId,
      x: from.x,
      y: THROW_HEIGHT,
      z: from.z,
      vx: Math.sin(heading) * THROW_FORWARD,
      vy: THROW_UP,
      vz: Math.cos(heading) * THROW_FORWARD,
      pickupLock: PICKUP_LOCK_SECONDS,
      stack,
    },
  ];
  emit("dropped_items_changed", { reason: "thrown" });
}

export function throwItem(options: {
  roomId: string;
  stack: DroppedItem["stack"];
  from: { x: number; z: number };
  heading: number;
}): string {
  const { roomId, stack, from, heading } = options;

  const id = nextId(stack.itemId);
  spawnThrown(id, roomId, stack, from, heading);
  emit("world_op", {
    op: { kind: "item_thrown", id, roomId, stack, from, heading },
  });
  return id;
}

/**
 * 重放房里其他人的抛掷。**替换而不是跳过**已存在的同 id 实体：
 * op 和整片刷新几乎同时到，刷新那份是"位置快照、速度归零"（读档
 * 语义），先到的话东西会冻在半空——op 带着权威的初始运动学，
 * 无条件以它为准。实测（2026-08-04）：不替换时访客端 vx/vy 全是 0。
 */
export function replayThrownItem(op: {
  id: string;
  roomId: string;
  stack: DroppedItem["stack"];
  from: { x: number; z: number };
  heading: number;
}): void {
  entities = entities.filter((entity) => entity.id !== op.id);
  spawnThrown(op.id, op.roomId, op.stack, op.from, op.heading);
}

/** 把一份东西直接放在某处（读档、以后的"轻放"用），不带初速 */
function spawnSettled(item: DroppedItem): void {
  entities = [
    ...entities,
    {
      id: item.id,
      roomId: item.roomId,
      x: item.position.x,
      y: item.position.y,
      z: item.position.z,
      vx: 0,
      vy: 0,
      vz: 0,
      pickupLock: 0,
      stack: item.stack,
    },
  ];
  emit("dropped_items_changed", { reason: "settled" });
}

export function settleItem(options: {
  roomId: string;
  stack: DroppedItem["stack"];
  at: { x: number; y: number; z: number };
}): string {
  const id = nextId(options.stack.itemId);
  const item: DroppedItem = {
    id,
    roomId: options.roomId,
    position: { ...options.at },
    stack: options.stack,
  };
  spawnSettled(item);
  emit("world_op", { op: { kind: "item_settled", item } });
  return id;
}

/** 重放房里其他人的轻放。同 id 替换（幂等：内容相同就是原地重写） */
export function replaySettledItem(item: DroppedItem): void {
  entities = entities.filter((entity) => entity.id !== item.id);
  spawnSettled(item);
}

function deleteDropped(id: string): DroppedEntity | undefined {
  const entity = entities.find((item) => item.id === id);
  if (!entity) return undefined;

  entities = entities.filter((item) => item.id !== id);
  emit("dropped_items_changed", { reason: "removed" });
  return entity;
}

export function removeDroppedItem(id: string): DroppedEntity | undefined {
  const entity = deleteDropped(id);
  if (!entity) return undefined;
  // 捡走、被锅吸收都从这里走——联机时别人手里那份立刻消失
  emit("world_op", { op: { kind: "item_removed", id } });
  return entity;
}

/** 重放房里其他人的捡取/吸收。不存在就当已经没了（op 晚到） */
export function replayRemovedItem(id: string): void {
  deleteDropped(id);
}

/**
 * 还在空中吗。
 *
 * **只此一处**。物理要它决定加不加重力，表现层要它决定转不转——
 * 两边各写一遍 `y > 0` 的下场刚发生过：物理这边改成"高于脚下那个面"，
 * 渲染那边没跟上，停在灶台上的东西就永远转下去。
 *
 * 判的是"脚下那个面"而不是"y 等于 0"：东西会**途经**台面高度
 * （砸上去的那一瞬间、往边上溜的那几帧），那时候它不该被当成落地了。
 */
export function isAirborne(entity: DroppedEntity): boolean {
  return entity.vy !== 0 || entity.y > surfaceAt(entity.x, entity.z) + 0.0001;
}

/** 已经停稳、而且过了拾取保护期的那些 */
export function isPickable(entity: DroppedEntity): boolean {
  return entity.pickupLock <= 0 && !isAirborne(entity);
}

/**
 * 推进一帧：抛物线 + 撞家具 + 落地摩擦。
 *
 * "地面"不再恒等于 0——砸在灶台上是砸在 0.98 米高的台面上，不是穿过去。
 * 哪一格挡到多高由 `surfaceAt` 从占用图查（规则在 Core 的 logic/projectile），
 * 这个文件只负责积分和手感。
 *
 * **家具不接东西**：砸在台面上的原路弹开，垂直落下的往低处溜，最后都到地上。
 * 台面留给锅。
 *
 * 横向撞墙 / 撞柜体按**轴分离**处理，和角色走路撞墙是同一套：沿 x 撞了就
 * 只把 x 的速度弹回来，z 照走。合在一起判的话，斜着扔到墙角会整个反向弹出来，
 * 看着像被墙推了一把。
 *
 * 落地那一刻会喊一声 `dropped_item_landed`，锅吸食材就挂在那个事件上，
 * 而不是每帧去问"附近有没有锅"。台面上落地也算落地，所以扔上灶台
 * 照样触发——吸进锅的那段逻辑一行都不用改。
 */
export function tickDroppedItems(deltaSeconds: number): void {
  if (entities.length === 0) return;

  for (const entity of entities) {
    if (entity.pickupLock > 0) entity.pickupLock -= deltaSeconds;

    const ground = surfaceAt(entity.x, entity.z);

    if (isAirborne(entity)) {
      entity.vy -= GRAVITY * deltaSeconds;
      entity.y += entity.vy * deltaSeconds;

      if (entity.y <= ground) {
        // 撞上去那一刻的下坠速度。弹回来要按它算，清零之后就问不到了
        const impactVy = entity.vy;

        entity.y = ground;
        entity.vy = 0;

        /**
         * **先问槽位收不收，再决定弹不弹。**
         *
         * 顺序不能反：台面是不接东西的（见下面），扔向灶眼的米要是先被弹走
         * 就永远进不了锅。这一喊是同步的，`offerLandedItem` 收下的话
         * 会当场把这份实体从 entities 里摘掉——所以下一行才问得出结果。
         */
        emit("dropped_item_landed", { id: entity.id });
        const absorbed = !entities.includes(entity);

        if (!absorbed && ground > 0 && Math.abs(impactVy) > MIN_BOUNCE_SPEED) {
          /**
           * 台面不是搁板：砸在家具上的东西原路弹回去，不留在上面。
           *
           * 做过"停在台面上"那一版——物理上更真，顺带还能把东西放桌上。
           * 但那样灶台会慢慢积一层玩家扔歪的杂物，而站在地上够不着它们，
           * 只能再扔一次把它们撞下来。**台面留给锅**，别的东西弹到地上，
           * 走过去就能捡。
           *
           * 横向也反向，不只是竖直：只弹竖直的话它会在台面上一路小跳，
           * 跳到没劲还是停在上面，等于没解决。
           */
          entity.vy = -impactVy * BOUNCE_RESTITUTION;
          entity.vx *= -BOUNCE_RESTITUTION;
          entity.vz *= -BOUNCE_RESTITUTION;
        } else {
          /**
           * 真落到地上了：把横向动量吃掉大半。
           *
           * 不吃的话它还要再滑一米才停——而"扔向灶台"这个动作的判定就在
           * 落地那一刻，滑一米意味着玩家瞄准的位置和实际判定的位置差一整格，
           * 扔十次中不了三次。米袋子砸地上本来也不会滑出去一米。
           */
          entity.vx *= 0.25;
          entity.vz *= 0.25;
        }
      }
    } else {
      /**
       * 停在家具上了 → 往低处推一把，让它自己滑下去。
       *
       * 弹开那条规则管的是"砸上去的东西弹回来"，但**垂直落下的东西横向
       * 速度是 0**，反向弹也还是原地弹，跳到没劲就停在台面上了。
       * （读档恢复的掉落物同理，速度不进存档。）
       * 这一条是那种情况的兜底：只要还站在家具上，就一直往矮的那边溜，
       * 直到脚下是地板。方向查占用图，不写死"往哪边"。
       */
      if (ground > 0) {
        const downhill = downhillDirection(entity.x, entity.z);
        // 直接**维持**一个爬行速度，不是每帧加速度：加速度要和下面的
        // 指数摩擦解联立才知道最后爬多快，改一个数得重算另一个
        if (downhill && Math.hypot(entity.vx, entity.vz) < SLIDE_OFF_SPEED) {
          entity.vx = downhill.x * SLIDE_OFF_SPEED;
          entity.vz = downhill.z * SLIDE_OFF_SPEED;
        }
      }

      // 落地之后横向再滑一小段。指数衰减，和帧率无关
      const damp = Math.pow(GROUND_DRAG, deltaSeconds);
      entity.vx *= damp;
      entity.vz *= damp;
      if (Math.hypot(entity.vx, entity.vz) < REST_SPEED) {
        entity.vx = 0;
        entity.vz = 0;
      }
    }

    const nextX = entity.x + entity.vx * deltaSeconds;
    const nextZ = entity.z + entity.vz * deltaSeconds;

    if (canPassAtHeight(nextX, entity.z, entity.y)) entity.x = nextX;
    else entity.vx *= -BOUNCE_RESTITUTION;

    if (canPassAtHeight(entity.x, nextZ, entity.y)) entity.z = nextZ;
    else entity.vz *= -BOUNCE_RESTITUTION;
  }
}

// ---- 存档 ----

export function snapshotDroppedItems(): DroppedItem[] {
  return entities.map((entity) => ({
    id: entity.id,
    roomId: entity.roomId,
    position: { x: entity.x, y: entity.y, z: entity.z },
    stack: { ...entity.stack },
  }));
}

/**
 * 联机刷新用的**对账**，不是读档的全量替换。
 *
 * 三条规则：服务端没有的删掉；本地没有的补上（速度未知，按静置落点
 * 生成，悬空的由重力接管）；**两边都有的保留本地运动学**——那可能是
 * 一份正在飞的重放实体，拿"位置快照 + 零速度"去覆盖它，东西就冻在
 * 半空了（op 先到、刷新后到的常见时序，实测踩过）。
 */
export function reconcileDroppedItems(saved: DroppedItem[] | undefined): void {
  const target = saved ?? [];
  const targetIds = new Set(target.map((item) => item.id));

  const before = entities.length;
  entities = entities.filter((entity) => targetIds.has(entity.id));
  let changed = entities.length !== before;

  const have = new Set(entities.map((entity) => entity.id));
  for (const item of target) {
    if (have.has(item.id)) continue;
    spawnSettled(item); // 自带 dropped_items_changed
    changed = false; // spawn 已经广播过，结尾那条不用再发
  }

  if (changed) emit("dropped_items_changed", { reason: "restored" });
}

export function restoreDroppedItems(saved: DroppedItem[] | undefined): void {
  entities = (saved ?? []).map((item) => ({
    id: item.id,
    roomId: item.roomId,
    x: item.position.x,
    y: item.position.y,
    z: item.position.z,
    // 速度不进存档：半空中那一瞬间的速度没有保留价值，
    // 读回来重力会把它接着拽到地上，落点几乎不变
    vx: 0,
    vy: 0,
    vz: 0,
    pickupLock: 0,
    stack: item.stack,
  }));

  /*
   * 续号交给 ids 那边统一做（它只认自己发的号，别人的不算）。
   *
   * 这里**只报掉落物这一类**，家具那类由 worldRuntime 自己报——
   * 两边合着报的话，谁先谁后就决定了另一边会不会被清掉，
   * 而 syncIdCounters 是清空重建的。各报各的会互相覆盖，所以
   * 改成了累加式：见 ids.ts 的 syncIdCounters。
   */
  syncIdCounters(entities.map((entity) => entity.id));

  emit("dropped_items_changed", { reason: "restored" });
}
