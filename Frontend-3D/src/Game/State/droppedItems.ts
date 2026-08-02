import type { DroppedItem } from "core";
import { emit } from "../EventBus";
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
let counter = 0;

function nextId(itemId: string): string {
  counter += 1;
  return `drop:${itemId}#${counter}`;
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
export function throwItem(options: {
  roomId: string;
  stack: DroppedItem["stack"];
  from: { x: number; z: number };
  heading: number;
}): string {
  const { roomId, stack, from, heading } = options;

  const id = nextId(stack.itemId);
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
  return id;
}

/** 把一份东西直接放在某处（读档、以后的"轻放"用），不带初速 */
export function settleItem(options: {
  roomId: string;
  stack: DroppedItem["stack"];
  at: { x: number; y: number; z: number };
}): string {
  const id = nextId(options.stack.itemId);
  entities = [
    ...entities,
    {
      id,
      roomId: options.roomId,
      x: options.at.x,
      y: options.at.y,
      z: options.at.z,
      vx: 0,
      vy: 0,
      vz: 0,
      pickupLock: 0,
      stack: options.stack,
    },
  ];

  emit("dropped_items_changed", { reason: "settled" });
  return id;
}

export function removeDroppedItem(id: string): DroppedEntity | undefined {
  const entity = entities.find((item) => item.id === id);
  if (!entity) return undefined;

  entities = entities.filter((item) => item.id !== id);
  emit("dropped_items_changed", { reason: "removed" });
  return entity;
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

  // id 形如 "drop:rice#7"，续号从存档里的最大值往后接，避免撞号
  counter = entities.reduce((max, entity) => {
    const suffix = Number(entity.id.split("#")[1]);
    return Number.isInteger(suffix) && suffix > max ? suffix : max;
  }, 0);

  emit("dropped_items_changed", { reason: "restored" });
}
