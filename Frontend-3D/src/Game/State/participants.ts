import {
  Facing,
  facingToHeading,
  headingToFacing,
  type ActionId,
  type ParticipantState,
  type PlacedFurnitureInstanceId,
  type PlayerId,
  type WorldPosition,
} from "core";

/**
 * 「谁在哪、在干什么」。
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
 * 不发事件：位置每帧都在变，广播它等于每帧全场重渲染。要位置的自己来读。
 * 离散变化（开始 / 结束一个行动）才发事件，那条走 `action_changed`。
 */

/**
 * 单机时本地玩家的 id。联机接进来之后换成服务端下发的真实 playerId，
 * 但**不要把"本地玩家"退化成"participants 里的第一条"**——
 * 进了别人的房子，第一条是房主。
 */
export const LOCAL_PLAYER_ID: PlayerId = "local";

/**
 * 开局站位：玄关内侧（2LDK 户型门在西墙 z1~2）。
 *
 * 从 CharacterController 搬过来的。出生点是**游戏规则不是渲染细节**——
 * 新游戏放哪、读档读不到位置时退回哪，都要用它，而那两处都不该 import three。
 */
export const SPAWN_POSITION: WorldPosition = {
  mapId: "home",
  x: -8.5,
  y: -6,
  facing: Facing.East,
};

const participants = new Map<PlayerId, ParticipantState>();

function ensure(playerId: PlayerId): ParticipantState {
  const existing = participants.get(playerId);
  if (existing) return existing;

  const created: ParticipantState = {
    playerId,
    position: { ...SPAWN_POSITION },
  };
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

/**
 * 本地玩家的位置。渲染层每帧调，所以**原地改不新建对象**——
 * 每帧 alloc 一个 WorldPosition 就是每帧给 GC 添一份垃圾。
 *
 * 传的是弧度，存的是四向：连续朝向是表现层为了转身平滑才需要的，
 * 逻辑上"面朝哪"四个值就够（见 Core 的 logic/facing）。
 */
export function setLocalTransform(x: number, z: number, heading: number): void {
  const position = ensure(LOCAL_PLAYER_ID).position;
  position.x = x;
  position.y = z;
  position.facing = headingToFacing(heading);
}

/** 本地玩家现在的落脚点，换算成渲染层用的 (x, z, 弧度) */
export function getLocalTransform(): { x: number; z: number; heading: number } {
  const { position } = getLocalParticipant();
  return {
    x: position.x,
    z: position.y,
    heading: facingToHeading(position.facing),
  };
}

/**
 * 正在做的事。**挂在人身上不挂在世界上**——原来存的是
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

export function snapshotLocalPosition(): WorldPosition {
  return { ...getLocalParticipant().position };
}

/** 老存档没有位置 → 用出生点。纯新增可选字段，不需要迁移 */
export function restoreLocalPosition(saved: WorldPosition | undefined): void {
  participants.clear();
  ensure(LOCAL_PLAYER_ID).position = { ...(saved ?? SPAWN_POSITION) };
}
