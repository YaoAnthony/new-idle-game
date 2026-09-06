import {
  ChatMessageKind,
  type GameSave,
  type NetError,
  type WorldRefreshEvent,
  type WorldSave,
} from "core";
/**
 * **和 server 说话一律走这里**，本文件不碰 socket、不认识事件名。
 * 边界的理由见 `Api/game/websocket/index.ts` 的文件头；`tests/netBoundary.test.ts`
 * 会盯着它不许破。
 */
import {
  createSession,
  disconnect,
  joinSession as apiJoinSession,
  leaveSession as apiLeaveSession,
  onAppearance,
  onChat,
  onDisconnect,
  onGesture,
  onParticipantJoined,
  onParticipantLeft,
  onSessionEnded,
  onTransform,
  onWorldOp,
  onWorldRefresh,
  onResidentKeyframes,
  sendResidentKeyframes,
  sendWorldRefresh,
  sendWorldOp,
} from "../../Api/game/websocket";
import {
  getBaseline,
  hydrateGameSave,
  serializeGameSave,
  setBaseline,
  setSaveComposer,
  saveNow,
} from "../../Data/Save";
import { SAVE_SCHEMA_VERSION } from "../../Data/Save/types";
import { emit, on } from "../EventBus";
import { restoreFavors, snapshotFavors } from "../Systems/residents/favors";
import { restorePorch, snapshotPorch } from "../Systems/residents/porch";
import { restoreInteriors, snapshotInteriors } from "../Systems/residents/interiors";
import { snapshotAvatar } from "../State/avatar";
import { pushChatMessage, pushSystemMessage } from "../State/chatLog";
import { restoreClock, snapshotClock } from "../State/clock";
import { reconcileDroppedItems, snapshotDroppedItems } from "../State/droppedItems";
import { setIdIssuer } from "../State/ids";
import { LOCAL_PLAYER_ID, getLocalParticipant } from "../State/participants";
import { restoreStorages, snapshotStorages } from "../State/storage";
import {
  restoreGramophones,
  snapshotGramophones,
} from "../State/gramophones";
import { restoreBuildings, snapshotBuildings } from "../State/buildings";
import { flushPendingGold } from "../State/gold";
import {
  getUnlockedFeatures,
  replaceUnlockedFeatures,
} from "../Systems/events";
import { restoreLamps, snapshotLamps } from "../State/lamps";
import { setRemoteWorldActive } from "./worldLock";
import { restoreWeather, snapshotWeather } from "../State/weather";
import { getWorld, restoreWorld } from "../State/worldRuntime";
import { getClock } from "../State/clock";
import { setDailyRewardShareCounter } from "../Systems/dailyTasks";
import {
  clearRoster,
  listRemote,
  pushSample,
  removeRemote,
  setRemoteAppearance,
  setRemoteGesture,
  upsertRemote,
} from "./roster";
import { applyWorldOp } from "./opApply";
import {
  applyResidentKeyframes,
  reconcileResidents,
  setPuppetMode,
  snapshotResidentKeyframes,
  snapshotResidents,
} from "../State/residentsRuntime";
import { startSyncPump, stopSyncPump } from "./sync";

/**
 * 联机会话状态机。/host /join /leave 背后的全部流程都在这里：
 *
 *   idle ──host()──▶ hosting（自己家变成会话世界，继续正常过日子）
 *   idle ──join()──▶ guest  （快照自家 → 灌入房主世界 → 世界侧存档挂起）
 *   任意 ──leave/断线/被结束──▶ idle（房客恢复自家世界）
 *
 * ---- 房客的存档纪律（这个文件最重要的职责）----
 *
 * 1. 入房前 `serializeGameSave` 抓一份**自己世界**的完整快照留在内存；
 * 2. 装上存档合成器（Data/Save 的 setSaveComposer，单一闸口）：
 *    玩家侧照抄运行时（做客捡的东西实时入档），世界侧永远用快照——
 *    房主的世界进不了自己的档；
 * 3. 退出时合成"自家世界 + 现在的背包"灌回运行时，卸下合成器。
 * 顺序错一步，要么丢做客期间的收获，要么把别人家写进自己档。
 *
 * ---- 权限（2026-08-04 定）----
 *
 * 所有参与者满权限：扔/捡/摆家具/厨房/储物都放行，动作经 world:op
 * 即时广播（见 opApply / State 层的 replay* 入口）。worldLock 的守卫
 * 机制保留但不再激活，是将来做分级权限（访客不能拆家）的挂点。
 */

/**
 * ack 应答的错误收窄。这个项目 tsconfig 没开 strict，`!reply.ok` 那种
 * 真值收窄在联合类型上不生效（编译报 message 不存在）；对字面量做
 * `=== false` 的比较收窄不吃 strictNullChecks，两边都认。
 */
function unwrapReply<T extends { ok: true }>(reply: T | NetError): T {
  if (reply.ok === false) throw new Error(reply.message);
  return reply;
}

type SessionState =
  | { kind: "idle" }
  | { kind: "hosting"; sessionId: string; joinCode: string; playerId: string }
  | {
      kind: "guest";
      sessionId: string;
      playerId: string;
      hostPlayerId: string;
      /** 入房前自己世界的快照。退出时靠它回家 */
      ownSnapshot: GameSave;
    };

let state: SessionState = { kind: "idle" };
let listenersBound = false;
/** 房主端世界刷新的防抖计时器 */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let stopRefreshWatch: (() => void) | null = null;

export function getSessionState(): SessionState {
  return state;
}

export function isInSession(): boolean {
  return state.kind !== "idle";
}

/**
 * 房客做客中：运行时里的世界是房主的。世界侧的自治系统（天气重掷、
 * 剧情规则）按它闭嘴——那些是**房主的权威**，不是权限问题；
 * 玩家动作本身现在是满权限（见文件头）。
 */
export function isRemoteWorldActive(): boolean {
  return state.kind === "guest";
}



// ---- 开房（房主）----

export async function hostSession(): Promise<string> {
  if (state.kind !== "idle") throw new Error("已经在一个房间里了，先 /leave");

  bindInbound();

  // 世界直接从运行时序列化——房主继续在自己家过日子，无需换世界
  const save = serializeGameSave(getBaseline() ?? undefined);
  const created = unwrapReply(
    await createSession({
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      profile: { name: save.player.name, avatar: snapshotAvatar() },
      world: save.ownWorld,
      transform: { ...getLocalParticipant().transform },
    }),
  );

  state = {
    kind: "hosting",
    sessionId: created.sessionId,
    joinCode: created.joinCode,
    playerId: created.playerId,
  };
  // 此后自己发的对象 id 带上服务端身份，和房客天然不撞（见 State/ids）
  setIdIssuer(created.playerId);
  // 满格奖励"在场每人各一份"：房里几个人就吐几份（自己 + 名册）
  setDailyRewardShareCounter(() => listRemote().length + 1);
  startSyncPump();
  startHostRefreshWatch();
  startKeyframePump();
  emit("net_session_changed", { state: "hosting" });
  return created.joinCode;
}

// ---- 加入（房客）----

export async function joinSession(joinCode: string): Promise<void> {
  if (state.kind !== "idle") throw new Error("已经在一个房间里了，先 /leave");

  bindInbound();

  // 出发前把家里的样子完整拍下来。这份快照是"回家"的唯一凭据
  const ownSnapshot = serializeGameSave(getBaseline() ?? undefined);

  const joined = unwrapReply(
    await apiJoinSession({
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      joinCode,
      profile: { name: ownSnapshot.player.name, avatar: snapshotAvatar() },
    }),
  );

  state = {
    kind: "guest",
    sessionId: joined.sessionId,
    playerId: joined.playerId,
    hostPlayerId: joined.hostPlayerId,
    ownSnapshot,
  };
  setIdIssuer(joined.playerId);
  setDailyRewardShareCounter(() => listRemote().length + 1);

  // 先记下房里已有的人，再换世界——重挂载后的视图第一帧就能看见他们
  clearRoster();
  for (const participant of joined.participants) upsertRemote(participant);

  enterRemoteWorld(ownSnapshot, joined.world);
  startSyncPump();
  emit("net_session_changed", { state: "guest" });
}

/**
 * 把房主的世界灌进运行时。
 *
 * 复用 hydrateGameSave 而不是逐系统手灌：读档路径是全项目测得最多的
 * 一条路，换世界就该走同一条。玩家侧数据用**自己的快照**（背包、
 * 需求、形象都是自己的），只有 ownWorld 换成房主的；三个字段例外：
 *
 * - position 置空 → 回退到出生点。自己家的坐标在别人家毫无意义；
 * - restingOn 置空 → 那是自己家某件家具的引用，在这边是悬空指针；
 * - activeActionProcess 置空 → /join 入口已经挡了"行动中不能出门"，
 *   这里是双保险（它绑着自己家的家具）。
 */
function enterRemoteWorld(ownSnapshot: GameSave, hostWorld: WorldSave): void {
  /*
   * 合成器先装、再换世界：从这一刻起所有落盘（防抖、pagehide、ESC
   * 手动存）写的都是"自己的玩家数据 + 入房前的自家世界"。做客期间
   * 捡到的东西因此**实时进自己的存档**，中途崩溃也不丢；而房主的
   * 世界永远进不了这份档。第一版用"做客全程不写盘"，两头都吃亏。
   */
  setSaveComposer(() => composeGuestSave(ownSnapshot));
  /*
   * 打上"运行时里是别人的世界"这个位。归属类判断靠它——最要命的是金币：
   * 罐子从这一刻起是房主的，赚到的钱得先记在人身上（见 State/gold）。
   * 真相仍是 state.kind，这里是它在换世界出入口上的镜像。
   */
  setRemoteWorldActive(true);

  const synthetic: GameSave = {
    meta: ownSnapshot.meta,
    player: {
      ...ownSnapshot.player,
      character: {
        ...ownSnapshot.player.character,
        position: undefined,
        restingOn: null,
      },
      activeActionProcess: undefined,
    },
    ownWorld: hostWorld,
  };

  hydrateGameSave(synthetic);
  // 从这一刻起场上的活物全是房主的：不问技能、不掷骰子，只听 op 和关键帧
  setPuppetMode(true);
  emit("net_world_swapped", {});
}

/**
 * 做客期间的存档形状：玩家侧照抄运行时（背包里新捡的肉要保住），
 * 世界侧用入房前的快照。位置/坐姿也取快照——运行时里那份是在
 * **房主家**的坐标，写进自己档等于回家后站在别人家的墙里。
 */
function composeGuestSave(ownSnapshot: GameSave): GameSave {
  const live = serializeGameSave(getBaseline() ?? undefined);
  return {
    meta: live.meta,
    player: {
      ...live.player,
      character: {
        ...live.player.character,
        position: ownSnapshot.player.character.position,
        restingOn: ownSnapshot.player.character.restingOn,
      },
      activeActionProcess: undefined,
    },
    ownWorld: ownSnapshot.ownWorld,
  };
}

/** 回家：合成"自家世界 + 现在的背包"→ 灌回运行时 → 恢复正常存档 */
function exitRemoteWorld(ownSnapshot: GameSave): void {
  setIdIssuer(LOCAL_PLAYER_ID);
  resetDailyRewardShares();
  const final = composeGuestSave(ownSnapshot);
  setSaveComposer(null);
  hydrateGameSave(final);
  // 自家的活物回来了，脑子也还给它们
  setPuppetMode(false);

  /*
   * **顺序是死的**：先把自家世界灌回来，再翻掉"在别人家"这个位，
   * 最后才结算在外面赚的钱。早翻一步 `depositGoldTo` 就会往房主的罐里
   * 塞钱，早结算一步则连罐子都还没回来。
   */
  setRemoteWorldActive(false);
  flushPendingGold();

  // 基线要反映结算之后的状态：钱已经从"身上寄存"挪进了罐子
  setBaseline(serializeGameSave(final));
  emit("net_world_swapped", {});
  void saveNow();
}

// ---- 离开 ----

export async function leaveSession(): Promise<void> {
  if (state.kind === "idle") return;

  const leaving = state;
  stopSyncPump();
  stopHostRefreshWatch();
  stopKeyframePump();
  clearRoster();

  // 连不上也照样往下走——服务器联系不上时，本地状态更要收干净
  await apiLeaveSession();

  state = { kind: "idle" };
  if (leaving.kind === "guest") {
    exitRemoteWorld(leaving.ownSnapshot);
  } else {
    setIdIssuer(LOCAL_PLAYER_ID);
    resetDailyRewardShares();
  }
  disconnect();
  emit("net_session_changed", { state: "idle" });
}

/** 被动结束（房主跑了 / 断线）。和主动 leave 的区别：不用再通知服务器 */
function endedRemotely(reason: string): void {
  if (state.kind === "idle") return;

  const leaving = state;
  stopSyncPump();
  stopHostRefreshWatch();
  stopKeyframePump();
  clearRoster();
  state = { kind: "idle" };

  if (leaving.kind === "guest") {
    exitRemoteWorld(leaving.ownSnapshot);
    pushSystemMessage(`联机结束（${reason}），已回到自己家`);
  } else {
    setIdIssuer(LOCAL_PLAYER_ID);
  resetDailyRewardShares();
    pushSystemMessage(`联机结束（${reason}）`);
  }
  emit("net_session_changed", { state: "idle" });
}

// ---- 入站 ----

function bindInbound(): void {
  if (listenersBound) return;
  listenersBound = true;

  onParticipantJoined((event) => {
    if (state.kind === "idle") return;
    const player = upsertRemote(event.participant);
    pushSystemMessage(`${player.name} 来了`);
    /*
     * 新来的房客只拿到 pets 切片（位置 + 睡没睡），"藏在屋里"这种只走关键帧。
     * 关键帧只发**变过的**——夜里一屋子人都睡着不动，他永远等不到那一帧，
     * 于是房主看两只都进了屋、房客看两只站在门口（02 双端验收抓到的）。
     * 所以有人进来就把"上次发过什么"清空，下一拍全场重发一遍。
     */
    if (state.kind === "hosting") resetKeyframeFilter();
    emit("net_participant_joined", { playerId: player.playerId, name: player.name });
  });

  onParticipantLeft((event) => {
    if (state.kind === "idle") return;
    removeRemote(event.playerId);
    emit("net_participant_left", { playerId: event.playerId });
  });

  onTransform((event) => {
    pushSample(event.playerId, event.transform);
  });

  onAppearance((event) => {
    setRemoteAppearance(event.playerId, event.appearance);
  });

  onGesture((event) => {
    setRemoteGesture(event.playerId, event.gesture);
  });

  onChat((event) => {
    // 直接入消息记录。**不发 player_said**——那个事件的语义是"本地玩家
    // 说了话"（SpeechBubble 会把气泡画在自己头上）。远端气泡是 M2 的活
    pushChatMessage({
      kind: ChatMessageKind.Player,
      text: event.text,
      speaker: event.name,
    });
  });

  onWorldOp((event) => {
    if (state.kind === "idle") return;
    // 房里其他人的动作，本地立刻重放（扔东西连抛物线一起）。
    // 房主重放后自己的刷新监听会把新世界推给服务端——op 管即时，
    // refresh 管收敛
    applyWorldOp(event.op);
  });

  onWorldRefresh((event) => {
    if (state.kind !== "guest") return;
    applyWorldRefresh(event);
  });

  onResidentKeyframes((event) => {
    if (state.kind !== "guest") return;
    applyResidentKeyframes(event);
  });

  onSessionEnded((event) => {
    endedRemotely(event.reason === "host_left" ? "房主离开了" : "房主结束了联机");
  });

  onDisconnect(() => {
    // 自己断线和房主跑了对本地是一回事：世界的来源没了
    if (state.kind !== "idle") endedRemotely("连接断开");
  });
}

/**
 * 房客应用房主的世界刷新：切片经现成的 restore* 灌回运行时。
 * 各视图（FurnitureView / DroppedItemView…）本来就订阅着对应的
 * *_changed 事件，restore 一跑它们自己会同步——读档和联机走同一条管线。
 */
function applyWorldRefresh(event: WorldRefreshEvent): void {
  const { slices } = event;
  if (slices.placedFurniture) {
    restoreWorld({ room: getWorld().room, placedFurniture: slices.placedFurniture });
  }
  // 对账而不是全量替换：正在飞的重放实体要保住运动学（见 State/droppedItems）
  if (slices.droppedItems) reconcileDroppedItems(slices.droppedItems);
  if (slices.inventories) restoreStorages(slices.inventories);
  if (slices.gramophones) restoreGramophones(slices.gramophones);
  if (slices.lamps) restoreLamps(slices.lamps);
  if (slices.buildings) restoreBuildings(slices.buildings);
  /*
   * 进度整份覆盖（协议 v7）。**做客期间盖掉的是自己的进度**，这没问题：
   * 进度是世界状态（`WorldSave.progression`），此刻运行时里装的本来就是
   * 房主的世界；回家时 hydrate 会把自己那份灌回来。
   *
   * 剧情规则不会因此乱跑——做客期间世界侧的自治系统本来就按
   * `isRemoteWorldActive` 闭嘴。
   */
  if (slices.unlockedFeatureIds) {
    replaceUnlockedFeatures(slices.unlockedFeatureIds);
  }
  if (slices.weather) restoreWeather(slices.weather);
  if (slices.clock) restoreClock(slices.clock);
  // 活物（协议 v8）：对账不重建——正在走的路、正在做的动词都保住
  if (slices.pets) reconcileResidents(slices.pets);
  // 委托状态表（协议 v9）：房客只读——画"！"用
  if (slices.favors !== undefined) restoreFavors(slices.favors);
  // 门口展示位 / 门牌（协议 v10）：房客看得见摆的东西；牌上的名字读房主名（世界是房主的）
  if (slices.porch !== undefined) restorePorch(slices.porch);
  // 屋里的槽位（协议 v11，08）：房客进他家看到的东西和房主一样
  if (slices.interiors !== undefined) restoreInteriors(slices.interiors);
}

// ---- 房主端：世界变了就整片刷给全房 ----

/**
 * 刷新合并窗口。第一版是 1000ms 纯尾沿防抖——房客看什么都慢一秒，
 * 被玩家点名（"放椅子要过 0.5sec 才看到"）。现在 op 通道负责即时，
 * 刷新只管收敛，但**前沿照发**：距上次发送超过窗口就立刻发，
 * 连续变更才合并到尾沿。单次操作零等待，连拆一箱行李也只发两次。
 */
const REFRESH_COALESCE_MS = 250;
let lastRefreshAt = 0;

function startHostRefreshWatch(): void {
  const send = (): void => {
    if (state.kind !== "hosting") return;
    lastRefreshAt = Date.now();
    // **全片发**。变更本来就低频（合并过），挑着发省的那点字节抵不上
    // "漏发一片"的排查成本——期 2 的建筑就是漏了整整一片才没在联机里
    // 出现过（协议 v7 补上）
    sendWorldRefresh({
      // 摊成可变数组：运行时那份是 readonly，而切片类型要可变的。
      // 原来走无类型的 socket.emit 时这个错位是看不见的
      placedFurniture: [...getWorld().placedFurniture],
      droppedItems: snapshotDroppedItems(),
      inventories: snapshotStorages(),
      weather: snapshotWeather(),
      clock: snapshotClock(),
      gramophones: snapshotGramophones(),
      lamps: snapshotLamps(),
      // 期 2 的建筑（协议 v7）。罐子的液面也搭这趟车——fill 存在实例的
      // state 里，跟着建筑走
      buildings: snapshotBuildings(),
      // 开了哪几块地（协议 v7）。领地围栏靠它跟着房主往外挪
      unlockedFeatureIds: [...getUnlockedFeatures()],
      // 活物（协议 v8）：谁在场、在哪。房客拿它对账生灭
      pets: snapshotResidents(),
      // 委托（协议 v9，居民系统 05）：房客要看到谁头顶挂着"！"
      favors: snapshotFavors() ?? {},
      porch: snapshotPorch() ?? {},
      interiors: snapshotInteriors() ?? {},
    });
  };

  const schedule = (): void => {
    if (refreshTimer) return; // 已有尾沿在等，这次变更会被它捎上
    const sinceLast = Date.now() - lastRefreshAt;
    if (sinceLast >= REFRESH_COALESCE_MS) {
      send();
      return;
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      send();
    }, REFRESH_COALESCE_MS - sinceLast);
  };

  const offs = [
    on("world_changed", ({ reason }) => reason !== "restored" && schedule()),
    on("dropped_items_changed", ({ reason }) => reason !== "restored" && schedule()),
    on("storage_changed", () => schedule()),
    on("gramophone_changed", () => schedule()),
    on("lamp_changed", () => schedule()),
    on("weather_changed", () => schedule()),
    on("kitchen_changed", () => schedule()),
    // 活物的生灭（登场、移除、读档）才值得整片刷；吃睡走这类每秒好几条的不刷，
    // 那些由 op 和关键帧管
    on("resident_changed", ({ reason }) =>
      ["spawn", "removed", "seeded", "restored", "entered"].includes(reason) && schedule()),
    // 委托状态表变了（05）：房客那边的"！"要跟着挂上 / 摘掉
    on("favors_changed", () => schedule()),
    on("porch_changed", () => schedule()),
    on("interiors_changed", () => schedule()),
  ];
  stopRefreshWatch = () => {
    for (const off of offs) off();
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };
}

function stopHostRefreshWatch(): void {
  stopRefreshWatch?.();
  stopRefreshWatch = null;
}

/**
 * 离场时把奖励份数复位。
 *
 * 不复位的话回到单机还按"最后一次房里的人数"吐——一个人在家打满
 * 四格，地上滚出三颗番茄，而且没有任何线索解释为什么。
 */
function resetDailyRewardShares(): void {
  setDailyRewardShareCounter(() => 1);
}

/**
 * 每日任务的两条本地事件 → op。
 *
 * 和 world_op 分开走，因为它们的**数据源不是 State 层的写入口**——
 * 进度住在 dailyBoard 里，而那个模块不认识网络，也不该认识。
 * Systems 层在完成动作后喊一声 `*_locally`，这里翻译成 op。
 *
 * 只转发 `_locally` 那两条（本地做的），不转发 `daily_board_changed`
 * （收到别人的 op 也会发那条）——否则一条打勾会在房里无限弹射。
 */
on("daily_board_ticked_locally", ({ progress }) => {
  if (state.kind === "idle") return;
  sendWorldOp({
    kind: "daily_board_ticked",
    worldDayId: getClock().worldDayId,
    progress,
  });
});

on("daily_board_claimed_locally", () => {
  if (state.kind === "idle") return;
  sendWorldOp({ kind: "daily_board_claimed", worldDayId: getClock().worldDayId });
});

// ---- 活物（协议 v8，居民系统 01c）：房主权威，房客是木偶 ----
//
// 意图复制：房主端每一只换上新 Intent 就原样发一条 op，房客用同一套动词自己走。
// 只有房主发——木偶不发 resident_intent_started（residentAgent 里判 puppet），
// 这里再判一次 hosting 是双保险。
on("resident_intent_started", ({ residentId, intent }) => {
  if (state.kind !== "hosting") return;
  sendWorldOp({ kind: "resident_intent", residentId, intent, atMs: Date.now() });
});

/** 关键帧节拍（毫秒）。2 Hz：足够兜住走路分叉，又不至于像玩家位置流那样一直发 */
const KEYFRAME_INTERVAL_MS = 500;
let keyframeTimer: ReturnType<typeof setInterval> | null = null;
let lastKeyframes = new Map<string, string>();

/**
 * 房主每 0.5 秒把**有变化的**活物关键帧推给全房。变化 = 位置动了超过 5 cm、
 * 朝向变了、动词 / 隐身 / 台词变了。全场没变就不发。
 */
function startKeyframePump(): void {
  stopKeyframePump();
  keyframeTimer = setInterval(() => {
    if (state.kind !== "hosting") return;
    const frames = snapshotResidentKeyframes();
    const changed = frames.filter((frame) => {
      const key = `${frame.x.toFixed(1)}|${frame.z.toFixed(1)}|${frame.heading.toFixed(2)}|${frame.verb ?? ""}|${frame.flavor ?? ""}|${frame.hidden ? 1 : 0}|${frame.speaking ?? ""}`;
      const seen = lastKeyframes.get(frame.id);
      if (seen === key) return false;
      lastKeyframes.set(frame.id, key);
      return true;
    });
    if (changed.length === 0) return;
    sendResidentKeyframes({ atMs: Date.now(), residents: changed });
  }, KEYFRAME_INTERVAL_MS);
}

function stopKeyframePump(): void {
  if (keyframeTimer) clearInterval(keyframeTimer);
  keyframeTimer = null;
  lastKeyframes = new Map();
}

/** 忘掉"上次发过什么"：下一拍把全场关键帧重发（新房客进来时用） */
function resetKeyframeFilter(): void {
  lastKeyframes = new Map();
}

// ---- 出站 op：本地世界突变 → 发给全房 ----
//
// State 层的公开写入口做了什么都会喊一声 world_op（见 EventBus 注释）。
// 这里只在会话中转发；单机时这条订阅空转。重放入口不发 world_op，
// 所以收到别人的 op 不会被再广播回去（无回环）。
on("world_op", ({ op }) => {
  if (state.kind === "idle") return;
  // 连接断了就丢——disconnect 处理会把整场收掉（丢弃在 Api 那一层做）
  sendWorldOp(op);
});

// ---- 回标题 ----

/**
 * ESC 的"回到标题"对会话意味着离开。App 那边的 saveNow 在挂起状态下
 * 是空操作（不会把房主的世界写进自己档），所以这里**不必抢在它前面**；
 * 房客也不做世界恢复——马上就回标题了，运行时整个会被丢掉，
 * "继续游戏"读的是自己的存档（做客期间从没被写过）。
 */
on("ui_return_to_title", () => {
  if (state.kind === "idle") return;

  const leaving = state;
  stopSyncPump();
  stopHostRefreshWatch();
  stopKeyframePump();
  clearRoster();
  state = { kind: "idle" };
  setIdIssuer(LOCAL_PLAYER_ID);
  resetDailyRewardShares();
  /*
   * 房客回标题：把"自家世界 + 现在的背包"灌回运行时再卸合成器。
   * 这个监听比 App 那个先注册（模块 import 早于组件挂载，EventBus 按
   * 注册序回调），所以跑在 App 的 saveNow 之前——它落盘时读到的
   * 已经是正确的自家形状，不会把房主的世界写进档。
   */
  if (leaving.kind === "guest") {
    const final = composeGuestSave(leaving.ownSnapshot);
    setSaveComposer(null);
    hydrateGameSave(final);
    setBaseline(final);
  }
  disconnect();
  emit("net_session_changed", { state: "idle" });
});
