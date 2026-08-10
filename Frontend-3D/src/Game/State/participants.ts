import {
  GestureKind,
  Locomotion,
  type ActionId,
  type ParticipantAppearance,
  type ParticipantGesture,
  type ParticipantState,
  type PlacedFurnitureInstanceId,
  type PlayerId,
  type PoseId,
  type WorldPosition,
} from "core";
import { baseMapDefinition } from "../../Maps/index.js";

/**
 * 「谁在哪、在干什么、看起来什么样」。
 *
 * 这是 V0.2 文档里 `RuntimeGameState.participants` 的运行时实现。类型早就在
 * `Core/types/runtime.ts` 里写好了，但一直**零使用**——玩家的坐标只活在
 * `Game3D/Interaction/CharacterController` 里，也就是 three 那一层。
 * 后果不是"忘了存"，是**任何非渲染代码都读不到玩家在哪**：存档读不到，
 * 将来的网络层同样读不到。联机第一件事就是同步各人位置，那时候没有
 * 一个能读的地方，只能从渲染对象里往外掏——这个文件就是那个地方。
 *
 * 权属：**这里是唯一权威**。渲染层每帧把本地玩家写进来、把所有人读出去；
 * 远端玩家将来由网络层写。反过来（渲染层持有、别人来问）就回到今天的死局。
 *
 * ---- 三层结构 ----
 *
 * transform（每帧）/ appearance（变化时）/ gesture（一次性），分层依据见
 * Core 的 runtime.ts。这里对应三个写入口，**故意不合并成一个 setState**：
 * 合并的话调用方每帧都得把 heldItem 一起传进来，而那是个带内容的对象
 * （锅里还有菜），每帧重传等于每帧给 GC 添一份垃圾——正是下面
 * setLocalTransform 特意避开的那件事。
 *
 * 不发事件：位置每帧都在变，广播它等于每帧全场重渲染。要位置的自己来读。
 * 离散变化（开始 / 结束一个行动）才发事件，那条走 `action_changed`。
 * 手势是例外——它一次性、低频，而且**错过就没了**，所以给一个订阅口。
 */

/**
 * 单机时本地玩家的 id。联机接进来之后换成服务端下发的真实 playerId，
 * 但**不要把"本地玩家"退化成"participants 里的第一条"**——
 * 进了别人的房子，第一条是房主。
 */
export const LOCAL_PLAYER_ID: PlayerId = "local";

/** 站着。姿势注册表里的默认姿态，见 Game3D/Visual/poses */
const DEFAULT_POSTURE: PoseId = "stand";

/**
 * 开局站位。**坐标是地图的知识**（每张地图的门开在哪、进门站哪只有
 * 户型数据自己知道），V0.13 起从 home 地图定义读，这里只补上 mapId——
 * 新游戏永远从 home 开始，读档读不到位置时也退回这里。
 *
 * heading 存的是弧度（v19 起），见 Core 的 WorldPosition 注释。
 */
export const SPAWN_POSITION: WorldPosition = {
  mapId: baseMapDefinition.mapId,
  x: baseMapDefinition.spawn.x,
  y: baseMapDefinition.spawn.y,
  heading: baseMapDefinition.spawn.heading,
};

const participants = new Map<PlayerId, ParticipantState>();

function freshState(playerId: PlayerId): ParticipantState {
  return {
    playerId,
    transform: {
      ...SPAWN_POSITION,
      locomotion: Locomotion.Idle,
      liftHeight: 0,
    },
    appearance: {
      heldItem: null,
      restingOn: null,
      posture: DEFAULT_POSTURE,
      activity: null,
    },
  };
}

function ensure(playerId: PlayerId): ParticipantState {
  const existing = participants.get(playerId);
  if (existing) return existing;

  const created = freshState(playerId);
  participants.set(playerId, created);
  return created;
}

export function listParticipants(): ParticipantState[] {
  return [...participants.values()];
}

export function getParticipant(playerId: PlayerId): ParticipantState | undefined {
  return participants.get(playerId);
}

export function getLocalParticipant(): ParticipantState {
  return ensure(LOCAL_PLAYER_ID);
}

// ---- ① 高频层：每帧 ----

/**
 * 本地玩家的位置 / 朝向 / 移动态。渲染层每帧调，所以**原地改不新建对象**——
 * 每帧 alloc 一个 transform 就是每帧给 GC 添一份垃圾。
 *
 * 朝向传的是弧度，存的也是弧度（v19 起）。原来这里有一次
 * `headingToFacing` 量化，把连续角度砍成 4 档再存——那一刀在 3D 里
 * 是看得见的：读档时角色会"啪"地扭到最近的正方向。
 */
export function setLocalTransform(
  x: number,
  z: number,
  heading: number,
  locomotion: Locomotion = Locomotion.Idle,
  liftHeight = 0,
): void {
  const transform = ensure(LOCAL_PLAYER_ID).transform;
  transform.x = x;
  transform.y = z;
  transform.heading = heading;
  transform.locomotion = locomotion;
  transform.liftHeight = liftHeight;
}

/** 本地玩家现在的落脚点，换算成渲染层用的 (x, z, 弧度) */
export function getLocalTransform(): { x: number; z: number; heading: number } {
  const { transform } = getLocalParticipant();
  return { x: transform.x, z: transform.y, heading: transform.heading };
}

// ---- ② 低频层：状态变了才写 ----

/**
 * 看得见的持续状态：手上拿着什么、坐在哪、什么姿势。
 *
 * 收成一个 patch 而不是四个 setter：这几件事经常一起变（坐下同时换姿态），
 * 分开写会让中间那一帧出现"已经坐下但姿势还站着"的组合。
 */
export function setParticipantAppearance(
  playerId: PlayerId,
  patch: Partial<ParticipantAppearance>,
): void {
  Object.assign(ensure(playerId).appearance, patch);
}

export function setLocalAppearance(patch: Partial<ParticipantAppearance>): void {
  setParticipantAppearance(LOCAL_PLAYER_ID, patch);
}

// ---- ③ 一次性层：手势 ----

type GestureListener = (playerId: PlayerId, gesture: ParticipantGesture) => void;

const gestureListeners = new Set<GestureListener>();

/**
 * 订阅手势。**手势不留状态**——它没有"当前值"可以轮询，
 * 发生的那一刻不通知，这件事就永远丢了。所以这一层必须是推的。
 */
export function onParticipantGesture(listener: GestureListener): () => void {
  gestureListeners.add(listener);
  return () => gestureListeners.delete(listener);
}

export function emitParticipantGesture(
  playerId: PlayerId,
  kind: GestureKind,
  atMs: number = Date.now(),
): void {
  const gesture: ParticipantGesture = { kind, atMs };
  for (const listener of gestureListeners) listener(playerId, gesture);
}

/**
 * 正在做的长时行动。**挂在人身上不挂在世界上**——原来存的是
 * `WorldSave.activeActionProcess`，世界级单数：3 个人进房主的世界，
 * 共用一个"正在进行的行动"槽，两个访客同时开行动直接互相覆盖。
 *
 * 这里存的是轻量的运行时投影（谁、在做哪个行动、从什么时候开始），
 * 给显示和联机广播用；能离线结算的那份耐久记录是 `ActionProcessSave`。
 */
export function setParticipantActivity(
  playerId: PlayerId,
  activity:
    | {
        actionId: ActionId;
        startedAt: number;
        furnitureInstanceId?: PlacedFurnitureInstanceId;
      }
    | null,
): void {
  const participant = ensure(playerId);
  if (activity) participant.activity = activity;
  else delete participant.activity;
}

// ---- 存档 ----
//
// 只存本地这一条，落在 PlayerSave 上：**位置跟着人走**。联机时你带着
// 自己的位置进房主的世界，`WorldPosition.mapId` 负责区分"在自己家"
// 还是"在别人家"。远端玩家的 participant 不进存档——他们的进度存在
// 各自的存档里，这边留一份只会变成过期快照。
//
// **三层里只有 transform 的位置部分进存档。** locomotion / liftHeight
// 是瞬时量：你不会存"我正在跳跃中"，存档跨的是关掉游戏再打开那种尺度。
// appearance 里的 heldItem / restingOn 由各自的模块（heldItem、posture）
// 存，不从这里走——那两处本来就是它们的真相源，这里只是给渲染和网络
// 读的一份投影，存两遍必然对不上。

export function snapshotLocalPosition(): WorldPosition {
  const { transform } = getLocalParticipant();
  return {
    mapId: transform.mapId,
    x: transform.x,
    y: transform.y,
    heading: transform.heading,
  };
}

/** 老存档没有位置 → 用出生点。v19 之前存的是四向，迁移已经转成弧度 */
export function restoreLocalPosition(saved: WorldPosition | undefined): void {
  participants.clear();
  const state = ensure(LOCAL_PLAYER_ID);
  Object.assign(state.transform, saved ?? SPAWN_POSITION);
  state.transform.locomotion = Locomotion.Idle;
  state.transform.liftHeight = 0;
}
