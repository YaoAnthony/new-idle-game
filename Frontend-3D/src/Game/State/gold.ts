import {
  BASE_GOLD_CAPACITY,
  depositGold,
  jarCapacity,
  spendGold,
  totalGold,
} from "core";

import { emit } from "../EventBus";
import { isRemoteWorld } from "../Multiplayer/worldLock";
import { pushSystemMessage } from "./chatLog";
import { listBuildings, setBuildingState } from "./buildings";

/**
 * 金币。**罐就是钱包**——你的余额就是所有容器里装的钱之和，容量就是
 * 你能持有的上限。
 *
 * 余额几乎全都活在**建筑实例的 state 里**（`stored`），建筑实例本来就
 * 进存档；这一层因此不必另立一个 `gold: number`，否则罐里的钱和钱包里的
 * 钱就是两个真相，第一次不同步就永远对不上。
 *
 * **唯一的例外是钱匣**（`BASE_GOLD_CAPACITY`，2026-08-23 加）：它要在
 * 一只罐都没有的时候存住钱，那就没有建筑实例可以借宿，只能自己占一个
 * 存档字段（`WorldSave.baseGold`）。它没有破上面那条纪律——余额仍然只有
 * 一份真相，只是这一份的载体从"建筑"放宽成了"容器"。
 *
 * 规则（依次填满、从后往前扣、溢出丢弃）全在 Core 的 `logic/goldJar`。
 */

/**
 * 钱匣里的钱。模块级 + snapshot/restore，和 lamps / buildings 同一个路数。
 *
 * 之所以不去读 `getWorld().baseGold`：那份是**存档快照**，写回要整份重灌，
 * 而这里每存一笔钱都要改它。
 */
let baseStash = 0;

/**
 * **在别人家赚的、还没带回家的钱**（存档 v29，落在 PlayerSave）。
 *
 * 做客时运行时里的罐子是**房主的**，钱直接入账等于往朋友的罐里塞钱；
 * 而自己家的罐子这会儿根本不在运行时里，存不进去。所以先记在人身上，
 * 回家那一刻再走正常入账（`flushPendingGold`）。
 */
let pendingGold = 0;

/**
 * 所有装钱的容器，**钱匣排在最前**。
 *
 * 顺序不是随手排的，它决定了钱从哪进、从哪出：Core 的规则是"依次填满、
 * 从后往前扣"，于是钱匣**先装满、最后才被花掉**，罐子是浮动的那一段。
 * 这正好接上 goldJar.ts 里"让第一只罐尽量保持满，液面看起来稳定"那条
 * ——钱匣没有液面可看，把波动全让给有液面的罐是对的。
 *
 * `instanceId` 缺省 = 这一格是钱匣，不是某个建筑（写回时按这个分流）。
 */
function jars(): Array<{ instanceId?: string; stored: number; capacity: number }> {
  return [
    { stored: baseStash, capacity: BASE_GOLD_CAPACITY },
    ...listBuildings()
      .filter((item) => item.buildingId === "gold_jar")
      .map((item) => ({
        instanceId: item.instanceId,
        stored: typeof item.state?.stored === "number" ? item.state.stored : 0,
        capacity: jarCapacity(item.levelId ?? "l1"),
      })),
  ];
}

export function getGold(): number {
  return totalGold(jars());
}

export function getGoldCapacity(): number {
  return jars().reduce((sum, jar) => sum + jar.capacity, 0);
}

function writeBack(
  before: ReturnType<typeof jars>,
  next: Array<{ stored: number }>,
): void {
  for (const [index, jar] of before.entries()) {
    if (next[index] && next[index].stored !== jar.stored) {
      // 钱匣没有建筑实例，写它自己的那份
      if (jar.instanceId === undefined) {
        baseStash = next[index].stored;
        continue;
      }
      /*
       * 一起写 `fill`：**视图不碰平衡数值**。它只知道"0..1 的比例"，
       * 不知道容量表长什么样——哪天容量改了，视图一行不用动。
       */
      setBuildingState(jar.instanceId, {
        stored: next[index].stored,
        fill: jar.capacity > 0 ? next[index].stored / jar.capacity : 0,
      });
    }
  }
  emit("gold_changed", { gold: getGold(), capacity: getGoldCapacity() });
}

export type DepositOutcome = { accepted: number; overflowed: number };

/**
 * 入账。**满了之后多出来的部分丢失**（照 CoC 的储存资源模式）。
 *
 * 溢出只发生在**你主动做任务 / 交易**的那一刻——罐不自增，所以损失永远
 * 是"这一笔本来能拿多少"，不是"放着放着就没了"。这条区别决定了它是
 * 压力还是焦虑。
 *
 * 一只罐都没有时**不再全额溢出**：钱匣先接住前 10 枚（`BASE_GOLD_CAPACITY`）。
 * 原来那版开局第一笔进账就全额流失，玩家看到的第一句反馈是"金币流失了"
 * ——读起来像 bug 而不像设计，这正是钱匣要修的。溢出提示照旧给，
 * 因为"钱装不下"这件事本身仍然要说明白。
 */
export function depositGoldTo(amount: number): DepositOutcome {
  /*
   * **做客时不进这个世界的罐子**（用户 2026-08-23 定："联机的人获得的
   * 金币存到自己的世界的金库里面，而不是这个人的"）。
   *
   * 记在人身上，回家再入账。**这里不谈溢出**：能装下多少是自己家罐子的
   * 事，而那些罐子现在不在运行时里——在别人家就先记账，回家结算。
   */
  if (isRemoteWorld()) {
    const gained = Math.max(0, amount);
    if (gained > 0) {
      pendingGold += gained;
      pushSystemMessage(`${gained} 金币先记在身上，回家进罐`);
      emit("gold_changed", { gold: getGold(), capacity: getGoldCapacity() });
    }
    return { accepted: gained, overflowed: 0 };
  }

  const before = jars();
  const result = depositGold(
    before,
    before.map((jar) => jar.capacity),
    amount,
  );
  writeBack(before, result.next);

  if (result.overflowed > 0) {
    /*
     * 判据从"一个容器都没有"换成"一座**金库**都没有"：钱匣恒在，
     * before.length 再也不会是 0。两句话要分开是因为出路不同——
     * 没库的人该去建库，有库的人该去升级。
     */
    const noJars = before.every((jar) => jar.instanceId === undefined);
    pushSystemMessage(
      noJars
        ? `钱匣只装得下 ${BASE_GOLD_CAPACITY} 枚，${result.overflowed} 金币流失了——在领地里建一座金库`
        : `金库满了，${result.overflowed} 金币流失了——升一级或者再建一座`,
    );
  }
  return { accepted: result.accepted, overflowed: result.overflowed };
}

/**
 * 花钱。不够就不动，返回还差多少。
 *
 * **做客时一分也花不了**：运行时里的罐子是房主的，从里面掏钱就是花朋友
 * 的钱。这条和入账那条必须成对——只改入账不改这里的话，就成了"赚的钱
 * 记自己账上、花的钱掏房主罐子"，那是个刷钱漏洞而不是设计。
 *
 * 身上寄存的那笔也不让花：它还没到家，没进任何一只罐。
 */
export function spendGoldFrom(
  amount: number,
): { ok: true } | { ok: false; short: number } {
  if (isRemoteWorld()) {
    pushSystemMessage("这是别人家的金库，花不了——回自己家再说");
    return { ok: false, short: amount };
  }

  const before = jars();
  const result = spendGold(before, amount);
  if (result.ok === false) return result;
  writeBack(before, result.next);
  return { ok: true };
}

/**
 * **能扣多少扣多少**，返回实际扣掉的数。
 *
 * 和 `spendGoldFrom` 分成两个函数而不是加一个 `partial` 参数：调用点
 * 读起来必须一眼看出是哪种语义。买东西钱不够就是买不成（全有或全无）；
 * 被偷、被罚这类是"有多少拿多少"，两者混在一个函数里，将来一定有人
 * 传错那个布尔。今天唯一的调用方是剧情效果 `adjust_gold` 的负数支。
 */
export function takeGoldUpTo(amount: number): number {
  if (isRemoteWorld()) {
    pushSystemMessage("这是别人家的金库，动不了——回自己家再说");
    return 0;
  }
  const take = Math.max(0, Math.min(Math.floor(amount), getGold()));
  if (take === 0) return 0;
  const before = jars();
  const result = spendGold(before, take);
  // take 已经收到余额以内，spendGold 不该失败；防御一下不写回
  if (result.ok === false) return 0;
  writeBack(before, result.next);
  return take;
}

/**
 * 把每只罐的液面比例重算一遍。
 *
 * **升级/拆罐会改容量但不改余额**，而 `fill` 是"余额 ÷ 容量"——不重算的话
 * 升完级液面还贴在罐口上，看起来像"升级白升了"（实测：l1 满罐 50 升到
 * l2 容量 150，液面纹丝不动）。
 *
 * 由订阅 `world_changed` 的那一处调，不放在 `buildings.ts` 里：那一层
 * 不该知道"金币"这回事，它管的是任意建筑的位置和等级。
 */
export function refreshJarFills(): void {
  for (const jar of jars()) {
    // 钱匣没有模型也就没有液面
    if (jar.instanceId === undefined) continue;
    const fill = jar.capacity > 0 ? jar.stored / jar.capacity : 0;
    setBuildingState(jar.instanceId, { fill });
  }
  emit("gold_changed", { gold: getGold(), capacity: getGoldCapacity() });
}

// ---- 存档 ----

/**
 * 钱匣的余额。罐里的钱不走这里——那份跟着建筑实例一起进
 * `WorldSave.buildings`，只有钱匣没有实例可以借宿。
 */
export function snapshotBaseGold(): number {
  return baseStash;
}

export function restoreBaseGold(saved: number | undefined): void {
  /*
   * 老存档没有这个字段 → 匣子空着（0），不是"补发 10 枚"。
   *
   * 还要**夹到当前容量**：容量是可调的数（今天 10），调小之后老存档里
   * 那个大数会让余额长期超出上限——`depositGold` 只管不往里塞，
   * 不会把已经超了的削回来。
   */
  baseStash = Math.max(0, Math.min(saved ?? 0, BASE_GOLD_CAPACITY));
}

/** 身上寄存的、还没带回家的钱。做客时赚的都先落这儿 */
export function getPendingGold(): number {
  return pendingGold;
}

/**
 * 回家结算：把寄存的钱走一遍正常入账，然后清零。
 *
 * **该溢出照样溢出**——罐装不下是罐的事，不因为这笔钱是在外面赚的就
 * 网开一面。溢出提示由 `depositGoldTo` 自己给，玩家因此知道"这趟白跑了
 * 一半"，而不是钱悄悄没了。
 *
 * 调用点只有一处：session 的 exitRemoteWorld，**在自家世界灌回来之后**。
 * 早一步的话罐子还是房主的，等于把钱送人。
 */
export function flushPendingGold(): DepositOutcome {
  const owed = pendingGold;
  if (owed <= 0) return { accepted: 0, overflowed: 0 };
  // 先清零再入账：depositGoldTo 现在走的是本地世界那条路，不会再回到寄存
  pendingGold = 0;
  return depositGoldTo(owed);
}

export function snapshotPendingGold(): number {
  return pendingGold;
}

export function restorePendingGold(saved: number | undefined): void {
  pendingGold = Math.max(0, saved ?? 0);
}
