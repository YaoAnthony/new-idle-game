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
  | "unpack"
  | "daily_board"
  | "music_player"
  | "bath"
  | "lighting"
  | "consign";

export type GameEvents = {
  /** 世界数据变化（家具增删等），渲染层据此同步场景图 */
  world_changed: { reason: string };
  /**
   * 一栋楼的实例状态变了（罐里的钱、田里的进度）。
   *
   * 和 `world_changed` 分开：那条会触发整组重建 + 导航网格作废，而状态
   * 变化每秒可能好几次（液面涨、作物长）。听这条的只有视图，做轻量更新。
   */
  building_state_changed: { instanceId: string };
  /** 余额或上限变了（存钱、花钱、建罐、升罐、拆罐） */
  gold_changed: { gold: number; capacity: number };
  /**
   * 建筑选址的状态（虚影跟鼠标 / 已选定 / 合不合法）。确认条听它。
   *
   * `committed` 是这条设计的关键位：选定之后虚影**不消失**，玩家能走开
   * 绕一圈再决定——UI 要靠它区分"还在挑"和"挑好了等你点确认"。
   */
  building_placement_changed: {
    active: boolean;
    mode?: "build" | "move" | "upgrade";
    buildingId?: string;
    levelId?: string;
    valid?: boolean;
    reason?: string;
    committed?: boolean;
    label?: string;
  };
  /** 确认条按了什么。UI 只发意图，动手的是场景里的控制器 */
  building_placement_action: { action: "confirm" | "reselect" | "cancel" };
  /**
   * 自动跑腿结束：到了 / 玩家接管 / 找不到路。
   *
   * `hint` 说的是**为什么**走不过去，只在 failed 时可能有值。今天只有
   * 一种：`"territory"` = 领地还没扩到那边。通用的"找不到路"会让玩家
   * 以为是 bug，而这是玩法。
   */
  auto_walk_ended: {
    label: string;
    reason: "player" | "done" | "failed";
    hint?: "territory";
  };

  /**
   * 换了箱庭地图（箱庭①B）。**状态层已经切完**（实体上架/取下、
   * 位置已挪到目的地）才发——GameView 听到后拆掉旧 RoomScene 重建。
   * 加载遮罩也听它出场。
   */
  map_changed: { mapId: string; localizationKey: string };
  /** 新地图的 RoomScene 挂载完成。加载遮罩听它退场 */
  map_scene_ready: { mapId: string };
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
    | { kind: "resident"; residentId: string }
    | { kind: "door"; refId: string }
    | null;
  /**
   * 某扇门开了或关了。带世界坐标——听感要按距离衰减，
   * 而订阅方（音景）不该反过来去查门在哪。
   */
  door_toggled: { refId: string; open: boolean; x: number; z: number };
  /** 一次性容器（纸箱/奖励箱）的领取面板开合 */
  unpack_changed: { open: boolean };
  /**
   * ESC 菜单点了一格，请求打开某个面板。
   *
   * 走事件而不是把各面板的 open 提到上层：每个面板的开关本来就归它自己管
   * （B 开背包、右上角按钮开行动），菜单只是**多一个入口**。
   * 提上去的话，每加一个面板就要动一次共享状态。
   */
  ui_panel_requested: { panel: "backpack" | "actions" | "settings" | "chat" };
  /** ESC 菜单请求回到标题界面（存盘之后） */
  ui_return_to_title: Record<string, never>;
  /**
   * 玩家按 F 请求打开**建造面板**（对着醒着的石傀儡）。
   *
   * 没有对话这一步：用户定的"不用说话，点开就是面板"。石傀儡是工头
   * 不是村民，走过去就该直接看到能盖什么。
   */
  build_shop_open_requested: Record<string, never>;
  /**
   * 玩家按 F 请求打开**交易面板**（对着在场的水獭，期 3）。
   * 和石傀儡的建造面板同一个路数：商人是摊主不是村民，
   * 走过去就该看到能买卖什么，寒暄留给剧情主动拉起的对话。
   */
  /**
   * 开交易面板。**带上是哪个商人**——水獭和小鱼人共用同一块面板，
   * 卖什么、能不能卖给他、限不限量全看这个 id。
   */
  trade_open_requested: { merchantId: string };
  /** 玩家按 F 对着自己盖的建筑：开管理面板（迁移/拆除/升级/概览） */
  building_panel_open_requested: { instanceId: string };
  /** 面板请求进入选址（迁移/升级都要选位置，由场景的控制器接管） */
  building_siting_requested: {
    mode: "move" | "upgrade";
    instanceId: string;
    levelId?: string;
  };
  /** 玩家按 F 请求打开工作站界面。灶台不走这条——菜是真的在锅里做的 */
  station_open_requested: {
    instanceId: string;
    capability: "crafting";
  };
  /**
   * 消息流里多了一条（玩家打的字 / 命令反馈 / 剧情提示 / NPC 说话）。
   * 裁剪也走这条——聊天面板重读一遍列表就是了，几百条的量级不值得
   * 为"加了一条"和"删了几条"分两个事件。
   */
  chat_message: { id: string; kind: string };
  /** 玩家在聊天框里说了句话（不是命令）。头顶那个气泡吃这条 */
  player_said: { text: string };
  /** 手上端着的东西变了（拿起 / 放下 / 装盘） */
  held_changed: Record<string, never>;
  /**
   * 地上那堆东西**增删了**（扔出、捡走、读档）。
   * **飞行中的位置不发事件**——那是每帧都在动的量，走总线会把它刷爆，
   * 渲染层每帧直接读状态（和火候进度条同一个路子）。
   */
  dropped_items_changed: { reason: string };
  /**
   * 一份掉落物落地了。
   *
   * "锅吸进食材"挂在这条上，而不是每帧去问"附近有没有锅"——
   * 吸收是个一次性的时刻，不是一个持续状态。
   */
  dropped_item_landed: { id: string };
  /**
   * 角色坐下 / 躺下 / 起身。
   * 状态在 Game/State/posture，**把锚点换算成坐标和姿势是表现层收到这条之后做的事**
   * ——Game/ 不能碰 three，所以这条事件就是那道分界线。
   */
  posture_changed: Record<string, never>;
  /** 浴缸水位到了转折点（开始注水/满/开始放水/空）。逐帧涨落不发 */
  bath_changed: { instanceId: string };
  /**
   * 家具槽位内容变化（锅放上灶眼、投料、起锅）。
   * **火候每帧的推进不发事件**——那是渲染层每帧直接读状态，
   * 发出来会把总线刷爆。
   */
  kitchen_changed: { instanceId: string; slotId: string };
  /** 宠物离散状态变化（出场 / 好感度） */
  resident_changed: { residentId: string; reason: string };
  /** 剧情效果 prompt_text（04）：改他叫你的昵称 / 他的口头禅，弹一个单行输入 */
  text_prompt_requested: { residentId: string; target: "nickname" | "catchphrase" };
  /** 委托状态表变了（05）：日记本右页、"！"气泡、联机切片都读它 */
  favors_changed: { reason: string };
  /**
   * 一只活物换上了新 Intent（居民系统 01c）。房主端的联机层把它原样发成
   * `resident_intent` op；木偶不发（否则回环）。单机时空转。
   */
  resident_intent_started: { residentId: string; intent: import("core").ResidentWireIntent };
  /**
   * 让某只宠物演一下一次性动作（摇头之类）。纯表现层，ResidentView 转发给
   * 造型自己的 `userData.playGesture`——没实现对应手势的物种静默不理。
   */
  resident_gesture: { residentId: string; gesture: string };
  /** 对话开关 / 节点推进 */
  dialogue_changed: { open: boolean };
  /** 事件阶段推进 */
  event_progress_changed: { eventId: string; stageId: string };
  /** 过场开始 / 结束（镜头接管） */
  cutscene_changed: { active: boolean };
  /** 行动开始 / 完成 / 取消（专注模式随之进出） */
  action_changed: { status: "started" | "completed" | "cancelled" };
  /**
   * 有没有面板挡着视线。剧情用它推迟宠物登场这类过场，触摸端用它收起按钮。
   *
   * **只有一个发送方**：EscArbiter 从面板栈（Redux 的 ui.panelStack）派生出来。
   * 原来是每块面板各喊各的，同一个布尔被最后说话的那个覆盖——"背包开着"却报
   * "没人开着"，ESC 于是既关了背包又弹出侧边栏。要问"谁开着"请读面板栈，
   * 这条事件只回答"有没有"。
   */
  blocking_panel_changed: { open: boolean };
  /** 该不该显示触摸操作（设备变化或手动覆盖） */
  touch_mode_changed: { touch: boolean };
  /** F3 调试模式开关。HUD 据此显示/收起调试面板（坐标等） */
  debug_mode_changed: { enabled: boolean };
  /**
   * 请求执行一个玩法动作。**键盘和触摸按钮走同一条路**——
   * 手机上的按钮不去伪造 KeyboardEvent，那种合成事件 `isTrusted` 是 false，
   * 解锁不了音频（本项目已经踩过"音频解锁必须真实手势"的坑），
   * 而且等于把"按了哪个键"和"要做什么"这两件事永久焊死。
   * 键位以后可重映射（V0.2 要求），届时改的只有键盘那一侧的映射表。
   */
  game_action_requested: {
    action: "interact" | "throw" | "rotate_placement" | "dump_kitchen";
  };
  /** 行动清单增删（分类卡角标要重算） */
  action_entries_changed: Record<string, never>;
  /** 事后补记的每日额度变了（用掉一格 / 跨天归零 / 读档） */
  action_log_changed: { reason: "logged" | "reset" | "restored" };
  /** 系列任务变了（建/改/删链或节点、节点完成、结项）。UI 整棵重读，不做增量 */
  action_chains_changed: { reason: string };
  /**
   * 开箱面板该弹了（节点完成=小箱，整链结项=大箱）。
   * 奖励此刻**已经入包**，面板只负责演出——错过事件不丢东西。
   * rarity 是箱里最高的一档，箱子模型按它换木/银/金
   */
  action_chest_ready: {
    size: "node" | "chain";
    title: string;
    /**
     * 链专属的三样。**行动开箱没有链，所以都是可选的**（期 2）——
     * 硬塞空串的话 ChestOverlay 会去查一条不存在的链；不填由它退到
     * 缺省图标和缺省配色（`chainEmoji` / `chainColor` 本来就带兜底）。
     */
    chainId?: string;
    nodeId?: string;
    iconId?: string;
    colorId?: string;
    rarity: import("core").Rarity;
    items: Array<{ itemId: string; quantity: number }>;
  };
  /** 睡眠开始 / 结束 */
  sleep_changed: { phase: "start" | "end" };
  /** 饥饿 / 疲劳变化 */
  needs_changed: Record<string, never>;
  /**
   * 跨过世界日（rollover，见 Core/Data/time；现在是 00:00）。
   * 天气据此重掷当天日程，每日限额据此刷新。
   */
  world_day_changed: { worldDayId: string; previousWorldDayId: string };

  /**
   * 自动生活（专注期间角色自己过日子）换了一步。
   *
   * 计划器（`Systems/autoLife`）→ 场景（RoomScene）方向：场景收到后负责
   * **身体部分**——寻路走过去、摆姿势；走到了回 `auto_step_arrived`，
   * 计划器再开演出计时、到点结算效果（吃饭扣真库存）。
   *
   * 决策和执行隔一条事件总线是用户点名的形状：以后 NPC 慰问、浇水
   * 都是"表里加一行 + 场景多认一种步子"，两头独立生长。
   */
  auto_step_changed: { step: import("core").AutoStepKind };
  /** 日记本的历史变了（记了一笔/补发了奖励/读档）。UI 整棵重读 */
  diary_changed: Record<string, never>;

  /**
   * 收银台领了钱，请 UI 放金币飞行演出。
   *
   * `x/y` 是收银台投影到屏幕上的像素点（RoomScene 算好递过来——UI 层
   * 拿不到相机）。**钱在发事件之前已经入账**：动画是纯演出，错过、
   * 关掉、崩了都不丢钱，和开箱那条同一纪律。
   */
  coin_fly_requested: { amount: number; x: number; y: number };
  /** 场景 → 计划器：这一步的身体部分完成了（走到了/没路可走原地算到） */
  auto_step_arrived: { step: import("core").AutoStepKind };
  /**
   * 一栋楼**真的完工了**（finishSite 那一刻；下单、认领都不算）。
   * 剧情信号 building_completed 由 story.ts 从这里翻译——State 层
   * 不 import Systems/story，否则是 State → Systems → State 的循环。
   */
  building_completed: { buildingId: string; instanceId: string };
  /** 跨过时段（晨/昼/暮/夜）。光照、窗外天空、环境音音量吃这条 */
  day_phase_changed: { phase: import("core").DayPhaseId };
  /** 当前天气变了（跨天重掷、或事件/道具/调试写了 override） */
  weather_changed: { weatherId: string; kind: import("core").WeatherKind };
  /**
   * 音频拿到播放许可了。
   * 浏览器要求首次用户交互之后才能出声，所以音景要等这条才能补播。
   */
  audio_unlocked: Record<string, never>;
  /**
   * 玩家在白噪音台上拧了某条推子。
   *
   * 面板本来就在轮询"现在有哪几行"，这条只为**手感**：拖滑块要即刻回显，
   * 等下一轮轮询会有半拍延迟。轮询管"有哪些"，事件管"我刚改的这一条"。
   */
  mixer_changed: { channel: string };
  /** 换曲或切模式。唱片旋转动画、提示气泡的文案听这条 */
  music_changed: { mode: string; trackLabel: string | null };
  /** 某台唱片机里的唱片换了（本地或远端）。instanceId 为空串 = 整表重灌（读档） */
  gramophone_changed: { instanceId: string };
  /**
   * 某盏灯的开关被拉了（本地或远端）。instanceId 为空串 = 整表重灌（读档）。
   *
   * 表现层听这条去压那盏灯的点光和自发光。**不复用 world_changed**：
   * 那条会触发整组家具重建 + 导航网格作废，为拉一下开关做这些太重了。
   */
  lamp_changed: { instanceId: string };
  /** 吃下了一份食物。表现层接这条放音效，Game/ 不直接驱动 AudioEngine */
  food_eaten: { itemId: string };
  /** 某个储物家具的内容变了 */
  storage_changed: { inventoryId: string };
  /** 玩家按 F 请求打开某个储物家具 */
  storage_open_requested: { instanceId: string; furnitureId: string };
  /** 家具小店的上架面板（期 5）。从建筑管理面板那一颗按钮发出 */
  shelf_open_requested: { instanceId: string };
  /** 寄售箱面板：玩家对着箱子按 F */
  consign_open_requested: { instanceId: string };
  /** 今日报纸（期 7）。出刊那天早上自动弹一次，之后从侧边栏开 */
  newspaper_open_requested: Record<string, never>;
  /**
   * 玩家按 F 请求打开每日任务面板。不带 instanceId——
   * 进度是全家一份（WorldSave.dailyBoard），哪台机器打开的都一样。
   */
  daily_board_open_requested: Record<string, never>;
  /** 背包面板被打开（教程用） */
  ui_backpack_opened: Record<string, never>;
  /** 玩法信号：剧情解释器与教程系统监听（内容在 Core storyRules） */
  story_signal: import("core").StorySignal;
  /** 剧情要求显示一条提示 */
  story_toast: { localizationKey: string; durationMs: number };

  // ---- 每日任务机器（V0.11）----

  /** 个人清单变了（写/改/删池子、抽签、打勾、重抽） */
  daily_tasks_changed: { reason: string };
  /** 全家共享进度变了（打勾、跨天归零、领奖、联机重放） */
  daily_board_changed: { reason: string };
  /**
   * **本地**刚推进了一格 / 领了奖。带 `_locally` 后缀是为了和上面两条
   * 区分：那两条是"状态变了"（收到别人的 op 也会发），这两条是
   * "我做了这件事"——只有它们该被 Net 层转发出去，否则收一条发一条成回环。
   */
  daily_board_ticked_locally: { progress: number };
  daily_board_claimed_locally: Record<string, never>;

  // ---- 联机（Game/Net）----

  /** 会话状态变了（开房 / 入房 / 离开 / 被结束）。UI 和指令提示读它 */
  net_session_changed: { state: "idle" | "hosting" | "guest" };
  /** 有人进房/出房。RemotePlayersView 靠这两条建/拆模型 */
  net_participant_joined: { playerId: string; name: string };
  net_participant_left: { playerId: string };
  /**
   * 运行时里的"当前世界"整个换掉了（做客进别人家 / 回自己家）。
   * App 收到后给 GameView 换 key 重挂载——场景、控制器、系统全部
   * 对着新世界重建。这是最重的一招，但保证不残留旧世界的任何东西。
   */
  net_world_swapped: Record<string, never>;
  /**
   * 本地刚刚发生了一次**世界突变**（扔/捡东西、摆/收家具、厨房槽位、
   * 储物箱）。由 State 层的公开写入口发出，Multiplayer/session 在联机时转发
   * 给全房。**重放入口（replay*）不发这条**——收到别人的 op 再广播
   * 回去就成回环了。单机时没人订阅，白发一条，无害。
   */
  world_op: { op: import("core").WorldOp };

  // ---- 账户（Features/Auth）----

  /**
   * 登录态翻转（登录成功 / 登出 / token 失效）。由 authBridge 发出——
   * Redux 是 UI 的事，游戏层（存档仓库、云同步引擎）听这条。
   * userId 为 null 表示回到游客。
   */
  auth_changed: { userId: string | null };
  /**
   * 云同步状态（Features/CloudSave/syncController 发，App 的角标和
   * 冲突提示听）。conflict 表示自动推送已停，等玩家处理。
   */
  cloud_sync_status: {
    status: "disabled" | "synced" | "syncing" | "offline" | "conflict" | "sync_off_old_client";
  };

  /**
   * 游戏进行中撞上云端 409（另一台设备在这期间写了云端）。
   *
   * 和启动对账那次冲突走的是同一个弹框，但触发点在半途，所以单独发一条
   * 事件而不是只改状态：**光有状态没人接就等于没发生**——自动推送已经
   * 停了，玩家却还在继续玩，全程不知道这一段进度没上云。
   */
  cloud_conflict_detected: {
    cloudHead: import("core").SaveHead;
    localUpdatedAtUtc: string | null;
  };
};

type Listener<T> = (payload: T) => void;

const listeners = new Map<keyof GameEvents, Set<Listener<never>>>();

/*
 * 开发期探针：`window.__bus.count("building_completed")` 数某个事件挂了
 * 几个监听。查"一次操作被记了两遍"这类问题时，第一件要分清的就是
 * **事件发了两次**还是**监听挂了两个**，而从外面完全看不出来。
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__bus = {
    count: (kind: string) => listeners.get(kind as keyof GameEvents)?.size ?? 0,
    kinds: () => [...listeners.keys()],
  };
}

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
