import { LOCAL_PLAYER_ID } from "./participants";

/**
 * 世界里那些**耐久对象**的 id 发号处（掉落物、玩家摆下的家具实例）。
 *
 * 集中在这里而不是各自 `counter += 1`，是为了联机。原来两处各有一个模块级
 * 计数器，读档时各自从存档里的最大值续号——单机完全正确，联机直接撞：
 * 房主和房客各自从**自己的** counter 发号，两人同时扔一份米饭都会得到
 * `drop:rice#8`，服务端没法判断这是一份还是两份。
 *
 * 方案是给 id 加**发号方前缀**：`local:drop:rice#8`。三种做法里选它的理由——
 *
 * - *服务端统一发号*：最防作弊，但扔东西要等一个 RTT 才看得见。丢弃是
 *   高频小动作，慢半拍手感立刻就垮。MC、Valheim 都是本地生成 + 服务端校验。
 * - *全面换 UUID*：碰撞归零、不需要任何协调，但 `chair#3` 会变成一串乱码，
 *   命令行、日志、调试里全废——这个项目有命令行系统，代价是实打实的。
 * - *前缀*：单机时前缀恒为 `local`，行为和以前一样；联机时换成真实
 *   playerId 就天然不撞，且仍然读得懂。
 *
 * **前缀只表示"谁发的号"，不表示"归谁所有"。** 房客扔在房主家的东西
 * id 里带着房客的 playerId，但它属于那个世界——退出房间后仍然留在地上。
 * 归属看它存在哪份 WorldSave 里，不看 id。
 */

/**
 * 当前发号方。单机恒为 `local`（= LOCAL_PLAYER_ID）；
 * 接联机后由网络层在握手完成时换成服务端下发的真实 playerId。
 *
 * 可变而不是常量：换 id 的时机在运行中（加入房间那一刻），
 * 而已经发出去的 id 不受影响——它们已经写进世界了。
 */
let issuer: string = LOCAL_PLAYER_ID;

/** 联机握手完成后调用。**只影响此后新发的号**，不回改任何已有对象 */
export function setIdIssuer(playerId: string): void {
  issuer = playerId;
}

export function getIdIssuer(): string {
  return issuer;
}

/**
 * 各类对象的计数器。按 kind 分开计，`drop` 和 `furniture` 各数各的——
 * 共用一个的话，扔十次东西会让下一把椅子叫 `chair#11`，看着像丢了十把椅子。
 */
const counters = new Map<string, number>();

/**
 * 发一个新 id：`<issuer>:<kind>:<name>#<n>`。
 *
 * 例：`local:drop:rice#8`、`local:furniture:furniture_chair#3`
 */
export function nextObjectId(kind: string, name: string): string {
  const key = `${kind}:${name}`;
  const next = (counters.get(key) ?? 0) + 1;
  counters.set(key, next);
  return `${issuer}:${key}#${next}`;
}

/**
 * 换一份世界之前清空计数器。**只有读档 / 新游戏该调**。
 *
 * 和 syncIdCounters 分开，是因为报数的有好几家（掉落物一家、家具一家，
 * 以后还会有别的）。如果 sync 自带清空，那么后调的那一家会把先调的
 * 成果抹掉——两边都"正确地"报了自己那摊，结果只剩最后一摊生效，
 * 下一次发号就撞上先报的那家。这种 bug 只在"扔过东西又摆过家具再读档"
 * 的顺序下才现形，很难查。清空是**换世界**这件事的一部分，不是报数的。
 */
export function resetIdCounters(): void {
  counters.clear();
}

/**
 * 把计数器推到已有对象的最大号之后，避免新发的号撞上它们。**累加，不清空。**
 *
 * **只认自己发的号**：别人（联机时的房主）发的 `host-42:drop:rice#8`
 * 用的是他自己的计数器，我这边的续号跟它没关系，也不该被它推高——
 * 否则每次进一趟别人家，自己的号就白白跳掉一大截。
 */
export function syncIdCounters(existingIds: Iterable<string>): void {
  for (const id of existingIds) {
    const parsed = parseObjectId(id);
    if (!parsed || parsed.issuer !== issuer) continue;
    const key = `${parsed.kind}:${parsed.name}`;
    if ((counters.get(key) ?? 0) < parsed.serial) counters.set(key, parsed.serial);
  }
}

export type ParsedObjectId = {
  issuer: string;
  kind: string;
  name: string;
  serial: number;
};

/**
 * 拆一个 id。认不出来返回 null——**不抛异常**：id 会出现在存档里，
 * 而存档可能是手改过的、也可能来自更新的客户端。一条读不懂的记录
 * 不该带崩整次读档，跳过它就是了。
 */
export function parseObjectId(id: string): ParsedObjectId | null {
  const hash = id.lastIndexOf("#");
  if (hash < 0) return null;

  const serial = Number(id.slice(hash + 1));
  if (!Number.isInteger(serial)) return null;

  // issuer 和 kind 各占一段，剩下的全是 name——name 里本来就带冒号
  // （物品 id 不带，但将来难说），所以从左边切两刀，不用 split
  const head = id.slice(0, hash);
  const first = head.indexOf(":");
  if (first < 0) return null;
  const second = head.indexOf(":", first + 1);
  if (second < 0) return null;

  return {
    issuer: head.slice(0, first),
    kind: head.slice(first + 1, second),
    name: head.slice(second + 1),
    serial,
  };
}
