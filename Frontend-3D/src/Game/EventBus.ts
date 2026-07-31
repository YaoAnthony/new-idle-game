/**
 * 事件总线（V0.2 明确要求）。系统之间不直接互相调用，通过事件解耦。
 * Game3D 渲染层只能通过事件影响游戏状态，不能直接改存档数据。
 */

/**
 * 走近一件家具，按 F 该干什么。
 *
 * 不是 FurnitureCapability 的别名——一件家具可能同时带好几个 capability
 * （坐垫既能坐又能做运动行动），这里是**交互分派时取的那一个**，按优先级选出来。
 */
export type StationCapability =
  | "crafting"
  | "cooking"
  | "sleep"
  | "sitting"
  | "storage"
  | "unpack";

export type GameEvents = {
  /** 世界数据变化（家具增删等），渲染层据此同步场景图 */
  world_changed: { reason: string };
  /** 进入 / 退出布置模式 */
  placement_mode_changed: { active: boolean; itemId: string | null };
  /** 背包内容变化 */
  inventory_changed: { reason: string };
  /** 附近可交互目标变化（按 F 提示用），null 表示离开范围 */
  interact_target_changed:
    | {
        kind: "station";
        instanceId: string;
        furnitureId: string;
        capability: StationCapability;
      }
    | { kind: "pet"; petId: string }
    | null;
  /** 一次性容器（纸箱/奖励箱）的领取面板开合 */
  unpack_changed: { open: boolean };
  /** 玩家按 F 请求打开工作站界面。灶台不走这条——菜是真的在锅里做的 */
  station_open_requested: {
    instanceId: string;
    capability: "crafting";
  };
  /** 手上端着的东西变了（拿起 / 放下 / 装盘） */
  held_changed: Record<string, never>;
  /**
   * 角色坐下 / 躺下 / 起身。
   * 状态在 Game/State/posture，**把锚点换算成坐标和姿势是表现层收到这条之后做的事**
   * ——Game/ 不能碰 three，所以这条事件就是那道分界线。
   */
  posture_changed: Record<string, never>;
  /**
   * 家具槽位内容变化（锅放上灶眼、投料、起锅）。
   * **火候每帧的推进不发事件**——那是渲染层每帧直接读状态，
   * 发出来会把总线刷爆。
   */
  kitchen_changed: { instanceId: string; slotId: string };
  /** 宠物离散状态变化（出场 / 好感度） */
  pet_changed: { petId: string; reason: string };
  /** 对话开关 / 节点推进 */
  dialogue_changed: { open: boolean };
  /** 事件阶段推进 */
  event_progress_changed: { eventId: string; stageId: string };
  /** 过场开始 / 结束（镜头接管） */
  cutscene_changed: { active: boolean };
  /** 行动开始 / 完成 / 取消（专注模式随之进出） */
  action_changed: { status: "started" | "completed" | "cancelled" };
  /** 挡视线的面板开关（工作台等）。剧情用它推迟宠物登场这类过场 */
  blocking_panel_changed: { open: boolean };
  /** 行动清单增删（分类卡角标要重算） */
  action_entries_changed: Record<string, never>;
  /** 睡眠开始 / 结束 */
  sleep_changed: { phase: "start" | "end" };
  /** 饥饿 / 疲劳变化 */
  needs_changed: Record<string, never>;
  /**
   * 跨过世界日（凌晨 4 点 rollover）。
   * 天气据此重掷当天日程，每日限额据此刷新。
   */
  world_day_changed: { worldDayId: string; previousWorldDayId: string };
  /** 跨过时段（晨/昼/暮/夜）。光照、窗外天空、环境音音量吃这条 */
  day_phase_changed: { phase: import("core").DayPhaseId };
  /** 当前天气变了（跨天重掷、或事件/道具/调试写了 override） */
  weather_changed: { weatherId: string; kind: import("core").WeatherKind };
  /**
   * 音频拿到播放许可了。
   * 浏览器要求首次用户交互之后才能出声，所以音景要等这条才能补播。
   */
  audio_unlocked: Record<string, never>;
  /** 吃下了一份食物。表现层接这条放音效，Game/ 不直接驱动 AudioEngine */
  food_eaten: { itemId: string };
  /** 某个储物家具的内容变了 */
  storage_changed: { inventoryId: string };
  /** 玩家按 F 请求打开某个储物家具 */
  storage_open_requested: { instanceId: string; furnitureId: string };
  /** 背包面板被打开（教程用） */
  ui_backpack_opened: Record<string, never>;
  /** 玩法信号：剧情解释器与教程系统监听（内容在 Core storyRules） */
  story_signal: import("core").StorySignal;
  /** 剧情要求显示一条提示 */
  story_toast: { localizationKey: string; durationMs: number };
};

type Listener<T> = (payload: T) => void;

const listeners = new Map<keyof GameEvents, Set<Listener<never>>>();

export function on<K extends keyof GameEvents>(
  event: K,
  listener: Listener<GameEvents[K]>,
): () => void {
  const set = listeners.get(event) ?? new Set();
  set.add(listener as Listener<never>);
  listeners.set(event, set);

  return () => set.delete(listener as Listener<never>);
}

export function emit<K extends keyof GameEvents>(
  event: K,
  payload: GameEvents[K],
): void {
  const set = listeners.get(event);
  if (!set) return;

  for (const listener of set) (listener as Listener<GameEvents[K]>)(payload);
}
