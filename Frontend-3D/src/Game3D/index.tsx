import { matchesAction } from "../Game/Input/bindings";
import { readDebugProbe, toggleDebugMode } from "../Game/State/debugMode";
import {
  ActionCategory,
  constructionProgress,
  tradingTuning,
  ActionPriority,
  CreatureRole,
  DayPhaseId,
  actionDefinitions,
  findActionByCategory,
  findActionPriority,
  findItemDefinition,
  nodeChestScore,
  pickChestFurniture,
  rollChestRarity,
  itemDefinitions,
  economyStages,
  fullBoardIncome,
  dailyBoardDefinition,
  residentDefinitions,
  poolChance,
  storyPools,
  storyRules,
  untradableItemIds,
  type StorySignalKind,
  weatherDefinitions,
  residentIdOf,
} from "core";
import { useEffect, useRef, useState } from "react";
import { ActionHub } from "../Components/ActionHub/ActionHub";
import { t } from "../i18n/t";
import { ChatPanel } from "../Components/Chat/ChatPanel";
import { EscArbiter } from "../Components/PanelStack/EscArbiter";
import { EscMenu } from "../Components/EscMenu/EscMenu";
import {
  isTouchMode,
  setTouchOverride,
  startTouchModeWatch,
} from "../Game/State/touchMode";
import { Joystick } from "../Components/Mobile/Joystick";
import { TouchActions } from "../Components/Mobile/TouchActions";
import { SpeechBubble } from "../Components/Chat/SpeechBubble";
import { ResidentBubbles } from "../Components/Residents/ResidentBubbles";
import { TextPrompt } from "../Components/Residents/TextPrompt";
import { Backpack } from "../Components/Backpack/Backpack";
import { DailyBoardPanel } from "../Components/DailyBoard/DailyBoardPanel";
import { RewardPanel } from "../Components/RewardPanel/RewardPanel";
import { DialoguePanel } from "../Components/Dialogue/DialoguePanel";
import { Hotbar } from "../Components/Hotbar/Hotbar";
import { InteractBubble } from "../Components/InteractBubble/InteractBubble";
import { GameSettingsModal } from "../Components/GameSettings/GameSettingsModal";
import { SleepOverlay } from "../Components/SleepOverlay/SleepOverlay";
import { HudColumn } from "../Components/Hud/HudColumn";
import { HudTopCenter } from "../Components/Hud/HudTopCenter";
import { CoinFlight } from "../Components/NeedsHud/CoinFlight";
import { BuildProgress } from "../Components/BuildProgress/BuildProgress";
import { BuildShopPanel } from "../Components/BuildShopPanel/BuildShopPanel";
import { TradePanel } from "../Components/TradePanel/TradePanel";
import { BuildingPanel } from "../Components/BuildingPanel/BuildingPanel";
import { StationPanel } from "../Components/StationPanel/StationPanel";
import { StoragePanel } from "../Components/StoragePanel/StoragePanel";
import { ShopShelfPanel } from "../Components/ShopShelfPanel/ShopShelfPanel";
import { ConsignPanel } from "../Components/ConsignPanel/ConsignPanel";
import { NewspaperPanel } from "../Components/NewspaperPanel/NewspaperPanel";
import { MailboxPanel } from "../Components/Mailbox/MailboxPanel";
import {
  parseEnum,
  registerCommand,
  runCommand,
  type CommandResult,
} from "../Game/CommandLine/commands";
import { saveNow, startAutosave } from "../Data/Save";
import { emit, on } from "../Game/EventBus";
import {
  debugAdvanceHours,
  debugJumpToPhase,
  formatLocalTime,
  getClock,
  startClock,
} from "../Game/State/clock";
import { findDoorAgent, listDoors } from "../Game/State/doorsRuntime";
import { getHeld } from "../Game/State/heldItem";
import { debugPlaceResident, getResidents, spawnResident } from "../Game/State/residentsRuntime";
import { groundHeightAt as walkGroundHeightAt, isWalkable, withPhasing } from "../Game/State/world/walkable";
import { findRoute as navFindRoute } from "../Game/Systems/navigation";
import {
  debugClearWeather,
  debugForceWeather,
  getWeather,
  startWeather,
} from "../Game/State/weather";
import {
  addItem,
  getBackpack,
  getCounts,
  getHotbar,
  seedInitialInventory,
  setSelectedStack,
  spoilExpiredFood,
} from "../Game/State/inventory";
import { startNeeds, tickNeeds } from "../Game/State/needs";
import {
  debugAddIngredient,
  debugPutInSlot,
  listKitchenSlots,
} from "../Game/Systems/kitchen";
import { setupTestRoom } from "../Game/Systems/testRoom";
import {
  getLastActionEnd,
  startAction,
} from "../Game/Systems/actions";
import {
  getEventProgress,
  getUnlockedFeatures,
  isFeatureUnlocked,
} from "../Game/Systems/events";
import {
  buildCandidatePool,
  ownedCountFn,
} from "../Game/Systems/actionChains";
import {
  fireStoryRuleById,
  getFiredStoryRuleIds,
  getPoolMisses,
  signal,
  startStorySystem,
} from "../Game/Systems/story";
import {
  factsOfToday,
  factsOfYesterday,
  startDayRecord,
} from "../Game/Systems/dayRecord";
import { startAutoLife } from "../Game/Systems/autoLife";
import { listResidents, startResidents } from "../Game/Systems/residents/moveIn";
import {
  buyFromTraveler,
  isTravelerHereToday,
  travelerOfferToday,
  travelerStockToday,
} from "../Game/Systems/trading";
import {
  issueToday,
  latestIssue,
  paperName,
  setPaperName,
  startNewspaper,
} from "../Game/Systems/newspaper";
import {
  budgetToday,
  debugSettleOnce,
  findShop,
  pendingRevenueOf,
  shelfCapacityOf,
  shelfSlotsOf,
  startShopkeeping,
} from "../Game/Systems/shopkeeping";
import {
  boxPendingRevenue,
  boxSlotsOf,
  consignBoxIds,
  previewConsignRevenue,
  settleAllBoxes,
  startConsigning,
} from "../Game/Systems/consigning";
import {
  isOtterHereToday,
  isOtterScheduledOn,
  startTrading,
  syncTraderPresence,
  wantedToday,
} from "../Game/Systems/trading";
import { unlockAudio } from "./Engine/AudioEngine";
import { initAudioSettings } from "./Engine/audioSettings";
import { startParticipantSync } from "../Game/Systems/participantSync";
import {
  allPlots,
  ownedPlotIds,
  resetTerritory,
  unlockPlotById,
  unlockablePlotIds,
  isTerritoryGateBypassed,
  setTerritoryGateBypassed,
} from "../Game/State/territory";
import { pushSystemMessage } from "../Game/State/chatLog";
import {
  findPlacement,
  listBuildings,
  removeBuilding,
  upgradeBuilding,
  upgradeOptions,
} from "../Game/State/buildings";
import {
  FACINGS,
  buildableIds,
  goldInJar,
  moveBuildingToCell,
  parseYardCell,
  placeBuildingAtCell,
  resolveBuilding,
  whyBuild,
  toFacing,
  worldToYardCell,
} from "../Game/State/buildingCommands";
import { findBuilding, findBuildingLevel } from "../Buildings/index";
import {
  depositGoldTo,
  getGold,
  getGoldCapacity,
  refreshJarFills,
  spendGoldFrom,
} from "../Game/State/gold";
import {
  getDebugBuildSeconds,
  jarLevelIds,
  setDebugBuildSeconds,
} from "../Game/State/buildings";
import { farmStageOf, interactWithFarm } from "../Game/Systems/farming";
import { placeHouse, stowHouse } from "../Game/Systems/house";
import { travelTo } from "../Game/Systems/mapTravel";
import { autoWalkTo, initAutoWalk } from "../Game/Systems/autoWalk";
import { destinations } from "../Game/Systems/travelPlan";
import { mapDefinitions } from "../Maps/index";
import { TravelOverlay } from "../Components/MapTravel/TravelOverlay";
import { getCurrentMap, getCurrentMapId } from "../Game/State/worldRuntime";
import { CONSIGN_BOX_SEED, placeFurniture } from "../Game/State/world/furniture";
import { registerNetCommands } from "../Game/Multiplayer/commands";
import {
  registerDailyCommands,
  startDailyRollover,
} from "../Game/Systems/dailyCommands";
import { registerActionCommands } from "../Game/Systems/actionCommands";
import { DiaryPanel } from "../Components/Diary/DiaryPanel";
import { registerChainCommands } from "../Game/Systems/chainCommands";
import { registerResidentCommands } from "../Game/Systems/residents/commands";
import { startTownTrips } from "../Game/Systems/residents/townTrips";
import { startVisitorSystem } from "../Game/Systems/residents/visitors";
import { startTripSystem } from "../Game/Systems/residents/trips";
import { startMailSystem } from "../Game/Systems/mail";
import { startRoutineOverrideWatch } from "../Game/Systems/residents/birthday";
import { startWeatherProps } from "../Game/Systems/residents/activities";
import { startRoutineWatch } from "../Game/Systems/residents/routineWatch";
import { startTalkSystem } from "../Game/Systems/residents/talk";
import { startAffectionSystem } from "../Game/Systems/residents/affection";
import { startPresentSystem } from "../Game/Systems/residents/presents";
import { startFavorSystem } from "../Game/Systems/residents/favors";
import { startSocialSystem } from "../Game/Systems/residents/social";
import { startVisitSystem } from "../Game/Systems/residents/visits";
import { setShopStockProbe } from "../Game/Systems/residents/spots";
import { diagnoseSites } from "../Game/State/skills/build";
import { isRemoteWorldActive } from "../Game/Multiplayer/session";
import { describeSoundscape, startSoundscape } from "./Engine/Soundscape";
import { startMusicDirector } from "./Engine/MusicDirector";
import { startBathSystem } from "../Game/Systems/bath";
import { RoomScene } from "./World/RoomScene";
import { ChestOverlay } from "../Components/ChestOverlay/ChestOverlay";
import { BuildingPlacePanel } from "../Components/BuildingPlacePanel/BuildingPlacePanel";

/** /signal 的可选值。和 Core 的 StorySignalKind 一一对应 */
const STORY_SIGNALS = [
  "game_started",
  "backpack_opened",
  "furniture_placed",
  "craft_completed",
  "cook_completed",
  "dialogue_ended",
  "dialogue_event",
  "gift_given",
  "gift_loved",
  "gift_liked",
  "gift_disliked",
  "gift_inedible",
  "action_started",
  "action_completed",
  "sleep_ended",
  "resident_spawned",
  "resident_entered",
  "day_started",
  "building_completed",
  "resident_moved_in",
  "map_entered",
] as const satisfies readonly StorySignalKind[];

/**
 * 枚举 → 补全候选。
 *
 * 命令的参数候选**一律现算**，不写字面量清单：`/give` 的候选就是
 * `itemDefinitions` 里的全部 id，抄一份进命令定义的话，新加的物品补不出来、
 * 删掉的还留在提示里，而这种走散没人会发现。
 */
function asSuggestions(values: readonly string[]): { value: string }[] {
  return values.map((value) => ({ value }));
}

const PHASES = [
  DayPhaseId.Dawn,
  DayPhaseId.Day,
  DayPhaseId.Dusk,
  DayPhaseId.Night,
] as const;

/**
 * /weather 的候选**从 Core 注册表现算**，不写字面量——加一种天气这里
 * 自动有，删一种也不会留在提示里。原来是一张手抄的 WeatherKind 清单，
 * 加 fog 那天差点第六次漏掉它。
 */
const WEATHER_IDS = weatherDefinitions.map((w) => w.id);

/**
 * /overview 的方位选项：**镜头站在哪一边**（不是"朝哪边看"）。
 *
 * 相机的 yaw 是它相对目标的方位角，yaw=0 时相机在正南、往北看。
 * 写成"镜头在南边"而不是"看向北边"是因为截图时脑子里想的是
 * "我要从南边拍这排店"——按看的方向命名每次都要在心里反一次。
 */
const OVERVIEW_YAW: Record<string, number> = {
  s: 0,
  sw: 45,
  w: 90,
  nw: 135,
  n: 180,
  ne: 225,
  e: 270,
  se: 315,
};

type GameViewProps = {
  /** 存档已经灌进运行时：跳过开局行李/摆设，也不重播开场剧情 */
  loadedFromSave?: boolean;
};

export function GameView({ loadedFromSave = false }: GameViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<RoomScene | null>(null);
  /**
   * 场景的另一个引用，给**命令行闭包**用（①B）。命令在大 effect 里
   * 注册一次，场景却会随换图销毁重建——闭包抓 useState 的值就会攥着
   * 一具已 dispose 的旧场景。ref 永远指向现任。
   */
  const sceneRef = useRef<RoomScene | null>(null);
  /** 换图计数。map_changed +1 → 场景 effect 拆旧建新 */
  const [mapEpoch, setMapEpoch] = useState(0);
  const [touchMode, setTouchMode] = useState(isTouchMode());

  /**
   * 触摸模式是会变的：平板插上妙控键盘那一刻 `pointer` 就从 coarse 变 fine，
   * 不跟着变的话摇杆会一直杵在那儿。手动覆盖（调试命令）也走这条事件。
   */
  useEffect(() => {
    const stop = startTouchModeWatch();
    const off = on("touch_mode_changed", ({ touch }) => setTouchMode(touch));
    return () => {
      stop();
      off();
    };
  }, []);

  /**
   * F3 调试模式（2026-08-18）。挂在 window 上而不是场景里：调试面板是
   * HUD 的事，场景换图重建时它不该跟着断一下；也不排除输入框——F3
   * 不是能打进去的字，浏览器默认是"页内查找"，抢过来正合适。
   * 走 bindings 注册表：可改键、设置里能看见。
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!matchesAction(event, "debugMode")) return;
      event.preventDefault();
      toggleDebugMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 读档进来时行李和屋里的东西都已经在存档里了，再铺一遍会凭空多出物品
    if (!loadedFromSave) seedInitialInventory();

    // 时钟必须最先起：天气要读世界日，剧情与行动要读时间
    const stopClock = startClock();
    // 昨日事实（报纸素材）：翻页时把新的一天开出来、记下天气
    const stopDayRecord = startDayRecord();
    // 自动生活：专注开始就接管日程（脑子；身体在 RoomScene 的驱动器里）
    const stopAutoLife = startAutoLife();
    initAutoWalk();
    /*
     * 做客（世界是房主的）时不跑天气重掷：天气属于世界，重掷是**改世界**。
     * 房客这边自己重掷会和房主各演各的天——房主的天气变化经 world:refresh
     * 推过来。时钟照跑：它是纯 UTC 推导，不改任何东西。
     */
    const stopWeather = isRemoteWorldActive() ? () => {} : startWeather();
    // 饱食/精力的自然衰减。首次 tick 就是"离线补算"
    const stopNeeds = startNeeds();

    // 跨天让过期食物变得不新鲜（只降品质，不删除）
    const offSpoil = on("world_day_changed", ({ worldDayId }) => {
      const spoiled = spoilExpiredFood(worldDayId);
      if (spoiled > 0) {
        emit("story_toast", {
          localizationKey: "ui.food_spoiled",
          durationMs: 2600,
        });
      }
    });
    // 音量偏好在标题页设过，进游戏要真的作用到总线上
    initAudioSettings();
    const stopSoundscape = startSoundscape();
    // BGM：进世界就起（音频解锁前它自己会等），离开世界停
    const stopMusic = startMusicDirector();

    /**
     * 浏览器要求首次用户交互之后才能出声。这里挂一次性监听，
     * 玩家第一次点击/按键就解锁，之后音景会自己补播。
     */
    const onFirstGesture = (): void => unlockAudio();
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("keydown", onFirstGesture, { once: true });

    // 剧情规则同理：firedStoryRuleIds 记在世界上，做客时不该往房主的
    // 世界里记自己触发的剧情（也不该在别人家触发自己的开场戏）
    const stopStory = isRemoteWorldActive()
      ? () => {}
      : startStorySystem(!loadedFromSave);
    // 水獭的班表同步（期 3）。做客时不跑：商人是世界的，归房主管
    const stopTrading = isRemoteWorldActive() ? () => {} : startTrading();
    // 居民搬入（期 4）：房子完工 → 驻地重定向 + resident_moved_in
    const stopResidents = isRemoteWorldActive() ? () => {} : startResidents();
    // 出门在外的居民该回来了没（居民系统 02）。做客时是房主的事
    const stopTownTrips = isRemoteWorldActive() ? () => {} : startTownTrips();
    const stopRoutineWatch = isRemoteWorldActive() ? () => {} : startRoutineWatch();
    // 桥头访客到点走人、多日出门的当面说 / 推迟 / 出发（09）。做客时是房主的事
    const stopVisitors = isRemoteWorldActive() ? () => {} : startVisitorSystem();
    const stopTrips = isRemoteWorldActive() ? () => {} : startTripSystem();
    // 信箱（10）：明信片第二天到、早上处理你写的信。做客时是房主的事
    const stopMail = isRemoteWorldActive() ? () => {} : startMailSystem();
    // 生日 / 节日的旗子一变，作息表换了，正在做的作息打断重下（11）
    const stopOverrideWatch = isRemoteWorldActive() ? () => {} : startRoutineOverrideWatch();
    // 雨天的伞（12）：天气一变按性格发。做客时木偶从关键帧读
    const stopWeatherProps = isRemoteWorldActive() ? () => {} : startWeatherProps();
    // 对话接线（03）：转身面向玩家、天气 / 落地翻成反应。做客时也挂：房客按 F 也要他转身——不，木偶不转（系统里判）
    const stopTalk = startTalkSystem();
    // 好感 / 心情的日结 + 他送你东西的领取（04）。做客时里面各自不动
    const stopAffection = startAffectionSystem();
    const stopPresents = startPresentSystem();
    // 委托（05）：每天早上提不提、过期收掉。做客时里面 no-op
    const stopFavors = startFavorSystem();
    // 居民之间的双人对话节拍（06）。做客时没人发起（技能不在木偶上跑）
    const stopSocial = startSocialSystem();
    // 来访（07）：每天抽来访者、接敲门、你出屋他先回去
    const stopVisits = startVisitSystem();
    // 店门口"有货多站一会"：货架就是店铺的储物库存，只认前几格
    setShopStockProbe((instanceId) => shelfSlotsOf(instanceId).some((slot) => slot !== null));
    // 家具小店的隔夜结算（期 5）。做客时不跑：别人的店别人结
    const stopShopkeeping = isRemoteWorldActive() ? () => {} : startShopkeeping();
    // 寄售箱的隔夜结算。和小店同理：做客时不跑，别人的箱子别人结
    const stopConsigning = isRemoteWorldActive() ? () => {} : startConsigning();
    // 报纸出刊（期 7）。做客时不跑：报纸是房主家的私事
    const stopNewspaper = isRemoteWorldActive() ? () => {} : startNewspaper();
    // 把手上拿的东西 / 坐姿汇进 participants 的 appearance 层。
    // 那是给渲染和（将来的）网络读的投影，见 Systems/participantSync
    const stopParticipantSync = startParticipantSync();
    // 浴缸：起身自动放水（听 posture 事件），涨落本身由场景每帧 tickBath
    const stopBath = startBathSystem();
    // 每日任务跨天：两边的重置本身是惰性的，这条只负责当场刷 UI
    const stopDailyRollover = startDailyRollover();
    const stopAutosave = startAutosave();

    /*
     * 场景本体**不在这个 effect 里建**（①B 拆走）：换图要拆旧建新，
     * 而这里的系统（时钟/天气/需求/自动存档）是跨图常驻的，跟着场景
     * 一起重启会把"离线补算"这类只该发生一次的事再跑一遍。
     * 场景的生命周期见下面按 mapEpoch 走的那个 effect。
     */
    const ok = (message: string): CommandResult => ({ ok: true, message });
    const fail = (message: string): CommandResult => ({ ok: false, message });

    const unregister = [
      // 联机：/host /join /leave /who（M1 的入口形态，见 Multiplayer/commands）
      ...registerNetCommands(),
      // 每日任务：正式交互在机器面板上，命令行是验收工具兼调试入口
      ...registerActionCommands(),
      ...registerDailyCommands(),
      ...registerChainCommands(),
      ...registerResidentCommands(),
      registerCommand({
        name: "time",
        usage: "time <dawn|day|dusk|night>",
        description: "把世界时钟拨到某个时段（光照/天空/音景一起跟着变）",
        arguments: [{ name: "时段", suggest: () => asSuggestions(PHASES) }],
        handler: (args) => {
          const phase = parseEnum(args[0], PHASES, "时段");
          // 拨的是时钟偏移而不是"当前时段"这个结果——
          // 于是调试和正式路径走同一套推导
          if (!debugJumpToPhase(phase)) {
            return { ok: false, message: `拨不到 ${phase}` };
          }
          const clock = getClock();
          return ok(
            `已拨到 ${phase}（世界日 ${clock.worldDayId} 本地 ${formatLocalTime(clock)}）`,
          );
        },
      }),
      registerCommand({
        name: "advance",
        usage: "advance <小时数>",
        description:
          "把世界时钟往前推若干小时，看跨天、天气重掷、离线补算（拨一天就是 24）",
        handler: (args) => {
          const hours = Number(args[0]);
          if (!Number.isFinite(hours)) {
            return { ok: false, message: "小时数得是个数字" };
          }
          debugAdvanceHours(hours);
          // 饱食/精力平时每分钟才结算一次，拨完时钟立刻补一次才看得到效果
          tickNeeds();
          const clock = getClock();
          return ok(
            `已前推 ${hours} 小时 → 世界日 ${clock.worldDayId} 本地 ${formatLocalTime(clock)} ${clock.phase}`,
          );
        },
      }),
      registerCommand({
        name: "weather",
        usage: "weather <天气id|auto>",
        description: "按住某种天气（auto 恢复自然天气）",
        arguments: [
          { name: "天气", suggest: () => asSuggestions([...WEATHER_IDS, "auto"]) },
        ],
        handler: (args) => {
          if (args[0] === "auto") {
            debugClearWeather();
            return ok(`已恢复自然天气：${getWeather().id}`);
          }

          const weather = parseEnum(args[0], WEATHER_IDS, "天气");
          // 写一条 debug 覆盖，而不是直接改结果
          debugForceWeather(weather);
          return ok(`天气已按住为 ${weather}`);
        },
      }),
      registerCommand({
        name: "sound",
        usage: "sound",
        description: "打印音景状态：解锁了吗、在播什么、该播什么",
        handler: () => ok(JSON.stringify(describeSoundscape(), null, 1)),
      }),
      registerCommand({
        name: "outline",
        arguments: [{ name: "开关", suggest: () => asSuggestions(["on", "off"]) }],
        usage: "outline <on|off>",
        description: "开关浅色描边",
        handler: (args) => {
          const value = parseEnum(args[0], ["on", "off"] as const, "描边");
          sceneRef.current?.setOutlineEnabled(value === "on");
          return ok(`描边已${value === "on" ? "开启" : "关闭"}`);
        },
      }),
      registerCommand({
        name: "rotate",
        arguments: [{ name: "方向", suggest: () => asSuggestions(["cw", "ccw"]) }],
        usage: "rotate <cw|ccw>",
        description: "相机档位旋转（也可以按 Q / E）",
        handler: (args) => {
          const value = parseEnum(args[0], ["cw", "ccw"] as const, "方向");
          const current = sceneRef.current;
          if (!current) return fail("场景还没就绪");
          current.rotate(value === "cw" ? 1 : -1);
          return ok(`相机已旋转 45°，当前朝向 ${Math.round(current.rig.azimuthDegrees)}°`);
        },
      }),
      registerCommand({
        name: "zoomfit",
        usage: "zoomfit",
        description: "缩到最远，一眼看全整个房间",
        handler: () => {
          sceneRef.current?.zoomToFit();
          return ok("已缩到最远");
        },
      }),
      registerCommand({
        name: "overview",
        arguments: [
          { name: "秒数" },
          {
            name: "俯角",
            suggest: () => asSuggestions(["40", "55", "70", "85"]),
          },
          {
            name: "方位",
            suggest: () =>
              asSuggestions(Object.keys(OVERVIEW_YAW)),
          },
          { name: "here", suggest: () => asSuggestions(["here"]) },
          { name: "半径" },
        ],
        usage: "overview [秒数] [俯角] [方位] [here [半径]]",
        description: "升空俯瞰整张箱庭，看几秒自动落回。加 here 只看脚下这一片（默认半径 18）",
        handler: (args) => {
          const scene = sceneRef.current;
          if (!scene) return fail("场景还没就绪");

          const seconds = args[0] ? Number(args[0]) : 8;
          if (!Number.isFinite(seconds) || seconds <= 0) {
            return fail("秒数要是个正数，比如 overview 10");
          }
          const pitch = args[1] ? Number(args[1]) : undefined;
          if (args[1] && !Number.isFinite(pitch)) return fail("俯角要是个数字（度）");

          let yaw: number | undefined;
          if (args[2]) {
            const key = args[2].toLowerCase();
            if (!(key in OVERVIEW_YAW)) {
              return fail(`方位只认：${Object.keys(OVERVIEW_YAW).join(" / ")}`);
            }
            yaw = OVERVIEW_YAW[key];
          }

          // here：绕着玩家脚下这一片看，不框整张图（整张图现在含山，半径 159 米什么都看不清）
          let around: { x: number; z: number; radius: number } | undefined;
          if (args[3] === "here") {
            const r = args[4] ? Number(args[4]) : 18;
            if (!Number.isFinite(r) || r <= 0) return fail("半径要是个正数");
            const me = readDebugProbe();
            if (!me) return fail("场景还没就绪");
            around = { x: me.x, z: me.z, radius: r };
          }
          const shot = scene.enterOverview(seconds, { pitch, yaw, around });
          return ok(
            `升空 ${seconds} 秒：中心 (${shot.center.x.toFixed(0)}, ${shot.center.z.toFixed(0)})，` +
              `框住半径 ${shot.radius.toFixed(0)}。到点自动落回`,
          );
        },
      }),
      registerCommand({
        name: "kitchen",
        arguments: [
          {
            name: "槽位序号",
            suggest: () =>
              listKitchenSlots().map((ref, index) => ({
                value: String(index),
                description: ref.content
                  ? `${ref.slotId}（装着 ${ref.content.itemId}）`
                  : `${ref.slotId}（空）`,
              })),
          },
          {
            name: "厨具或食材",
            // 能放进槽位的和能下锅的都列出来，两类都是合法参数
            suggest: () =>
              itemDefinitions
                .filter((item) => item.cookware || item.servingWare || item.ingredient)
                .map((item) => ({
                  value: item.id,
                  description: t(item.localizationKey),
                })),
          },
        ],
        usage: "kitchen [槽位序号 [itemId]]",
        description:
          "不带参数：列出所有灶眼/槽位和里面装的东西；带序号：往那个槽位放一口锅（默认 wok），方便直接测火候",
        handler: (args) => {
          const slots = listKitchenSlots();
          if (slots.length === 0) {
            return { ok: false, message: "屋里还没有带槽位的厨具家具（先摆一个橱柜）" };
          }

          if (args.length === 0) {
            const lines = slots.map((ref, index) => {
              const held = ref.content
                ? `${ref.content.itemId}${
                    ref.content.container?.items.length
                      ? `（内含 ${ref.content.container.items
                          .map((item) => `${item.itemId}×${item.quantity}`)
                          .join("、")}，加热 ${Math.round(
                          ref.content.container.heatSeconds,
                        )}s）`
                      : "（空锅）"
                  }`
                : "空";
              return ` ${index}  ${ref.instanceId} / ${ref.slotId}  →  ${held}`;
            });
            return ok(`共 ${slots.length} 个槽位：\n${lines.join("\n")}`);
          }

          const index = Number(args[0]);
          const ref = slots[index];
          if (!ref) {
            return { ok: false, message: `没有序号 ${args[0]} 的槽位（0~${slots.length - 1}）` };
          }
          const itemId = args[1] ?? "wok";
          const definition = findItemDefinition(itemId);
          if (!definition) {
            return { ok: false, message: `没有这个物品：${itemId}` };
          }

          // 不是厨具就当投料：槽位里已经有锅时往锅里加，方便直接验火候/灶火/声音
          if (!definition.cookware) {
            if (!ref.content) {
              return { ok: false, message: `${ref.slotId} 上没有锅，先放一口` };
            }
            if (!debugAddIngredient(ref, itemId)) {
              return { ok: false, message: `${itemId} 投不进去` };
            }
            return ok(`已往 ${ref.instanceId} / ${ref.slotId} 的锅里投了 ${itemId}`);
          }

          if (ref.content) {
            return { ok: false, message: `${ref.slotId} 已经放着 ${ref.content.itemId} 了` };
          }
          if (!debugPutInSlot(ref, itemId)) {
            return { ok: false, message: `${itemId} 放不进这个槽位` };
          }
          return ok(`已把 ${itemId} 放到 ${ref.instanceId} / ${ref.slotId}`);
        },
      }),
      registerCommand({
        name: "spawn",
        arguments: [
          {
            name: "物种",
            suggest: () =>
              asSuggestions(residentDefinitions.map((resident) => resident.id)),
          },
        ],
        usage: "spawn <物种id>",
        description: "召一只生物到屋子中间（调试用，跳过登场过场）",
        handler: (args) => {
          const definition = residentDefinitions.find((resident) => resident.id === args[0]);
          if (!definition) return fail(`没有这种生物：${args[0] ?? "(空)"}`);


          const residentId = residentIdOf(definition.id);
          spawnResident(residentId, definition.id);
          // 门口挤不下大家伙，直接放到屋子中部空地
          debugPlaceResident(residentId, 0, 4);
          return ok(`${definition.id} 来了`);
        },
      }),
      registerCommand({
        name: "build",
        arguments: [
          { name: "型号", suggest: () => asSuggestions(buildableIds()) },
          { name: "格X" },
          { name: "格Y" },
          { name: "朝向", suggest: () => asSuggestions(["north", "east", "south", "west"]) },
        ],
        usage: "build <buildingId> <gx> <gy> [facing] [site]",
        description:
          "在领地里盖一栋。坐标是**院子格号**（占地左上角）。末尾加 site = 落工地等石傀儡来建，不加 = 当场成品",
        handler: (args) => {
          const spot = parseYardCell(args[1], args[2]);
          if (!spot) return fail("用法：build <型号> <格X> <格Y> [朝向] [site]");
          /*
           * `site` 可以出现在第 4 或第 5 位——朝向是可选的。用"末尾是不是
           * site"来判，比要求玩家把朝向补齐友好。
           *
           * 这个开关是查"石傀儡不来建造"时补的：`/build` 一直走当场成品
           * 那条路（不传 asSite），所以**根本造不出工地**，整条施工链在
           * 调试台上摸不到。真游戏走选址面板是落工地的。
           */
          const asSite = args.includes("site");
          const facingArg = args[3] === "site" ? "north" : (args[3] ?? "north");
          const facing = toFacing(parseEnum(facingArg, FACINGS, "朝向"));
          // 家是地图自带的，不是盖出来的（04 文档）；型号还在，只是这个口不开
          if (args[0] === "house") return fail("家已经有了");
          const result = placeBuildingAtCell(args[0] ?? "", spot, facing, { asSite });
          if (result.ok !== false) {
            return ok(
              asSite
                ? `工地落好了：${result.instanceId}（等石傀儡来建）`
                : `盖好了：${result.instanceId}`,
            );
          }
          return fail(whyBuild(result.reason));
        },
      }),
      registerCommand({
        name: "movebuilding",
        arguments: [
          { name: "实例或型号", suggest: () => asSuggestions(listBuildings().map((b) => b.instanceId)) },
          { name: "格X" },
          { name: "格Y" },
          { name: "朝向", suggest: () => asSuggestions(["north", "east", "south", "west"]) },
        ],
        usage: "movebuilding <instanceId|型号> <gx> <gy> [facing]",
        description: "挪一栋。校验时排除自己——不然原地微调会判成压到自己",
        handler: (args) => {
          // `=== false` 收窄：tsconfig 没开 strict，真值收窄在判别式联合上不生效
          const target = resolveBuilding(args[0] ?? "");
          if (target.ok === false) return fail(target.message);
          const spot = parseYardCell(args[1], args[2]);
          if (!spot) return fail("用法：movebuilding <实例> <格X> <格Y> [朝向]");
          const facing = args[3] ? toFacing(parseEnum(args[3], FACINGS, "朝向")) : undefined;
          const result = moveBuildingToCell(target.instanceId, spot, facing);
          if (result.ok !== false) return ok("挪好了");
          return fail(whyBuild(result.reason));
        },
      }),
      registerCommand({
        name: "upgradebuilding",
        arguments: [
          { name: "实例或型号", suggest: () => asSuggestions(listBuildings().map((b) => b.instanceId)) },
          { name: "目标等级" },
        ],
        usage: "upgradebuilding <instanceId|型号> [levelId]",
        description: "升级。**分叉时不替你选**——不给目标就把选项列出来停下",
        handler: (args) => {
          // `=== false` 收窄：tsconfig 没开 strict，真值收窄在判别式联合上不生效
          const target = resolveBuilding(args[0] ?? "");
          if (target.ok === false) return fail(target.message);

          const options = upgradeOptions(target.instanceId);
          if (options.length === 0) return fail("已满级");
          /*
           * 分叉时必须让玩家选（B7）。悄悄挑第一个的后果是房子变成了他
           * 没挑的那一栋，而升级是单向的——回退要谈材料返还，那是经济
           * 系统的事。
           */
          if (!args[1] && options.length > 1) {
            return ok(`可以升到：${options.join(" / ")}——用 upgradebuilding ${args[0]} <等级> 选一个`);
          }

          const result = upgradeBuilding(target.instanceId, args[1]);
          if (result.ok !== false) {
            const placement = findPlacement(target.instanceId)!;
            const level = findBuildingLevel(placement.buildingId, placement.levelId);
            return ok(`升到了 ${t(level?.localizationKey ?? "")}（${placement.levelId}）`);
          }
          const why: Record<string, string> = {
            max_level: "已满级",
            unknown_target: "没有这个等级",
            not_a_successor: "不能跳级——只能从当前等级往下一级升",
            missing_materials: "材料不够",
            requires_unmet: "前置条件没满足",
            not_empty: `屋里还有 ${result.itemCount} 件家具，先收进背包再升级`,
          };
          return fail(why[result.reason] ?? "升不了");
        },
      }),
      registerCommand({
        name: "removebuilding",
        arguments: [
          { name: "实例或型号", suggest: () => asSuggestions(listBuildings().map((b) => b.instanceId)) },
        ],
        usage: "removebuilding <instanceId|型号>",
        description: "拆一栋。**非空不给拆**——屋里有家具 / 金库里有钱就拒绝",
        handler: (args) => {
          // `=== false` 收窄：tsconfig 没开 strict，真值收窄在判别式联合上不生效
          const target = resolveBuilding(args[0] ?? "");
          if (target.ok === false) return fail(target.message);
          const result = removeBuilding(target.instanceId, {
            gold: goldInJar(target.instanceId),
          });
          if (result.ok !== false) return ok("拆了");
          const { furniture, gold } = result.detail;
          if (gold) return fail(`金库里还有 ${gold} 金币，先取出来`);
          return fail(`屋里还有 ${furniture} 件家具，先收进背包`);
        },
      }),
      registerCommand({
        name: "buildspeed",
        usage: "buildspeed [秒|off]",
        description:
          "统一工期（调试）。dev 里默认 2 秒方便测试；off 恢复型号表里的真工期；不带参数看当前值",
        handler: (args) => {
          const arg = args[0];
          if (!arg) {
            const now = getDebugBuildSeconds();
            return ok(
              now === null
                ? "当前用型号表里的真工期（木墙 3 秒、小屋 20 秒…）"
                : `当前统一工期 ${now} 秒（/buildspeed off 恢复真工期）`,
            );
          }
          if (arg === "off") {
            setDebugBuildSeconds(null);
            return ok("恢复型号表里的真工期");
          }
          const seconds = Number(arg);
          if (!Number.isFinite(seconds) || seconds <= 0) {
            return fail("秒数要是个正数，或者填 off");
          }
          setDebugBuildSeconds(seconds);
          /*
           * **只影响之后认领的工地**：已经在建的那块，完工时刻在认领
           * 那一刻就写死了（`claimSite`），这正是"关掉游戏一天回来，
           * 排队的工地不会自己建好"那条规矩的支点，不该为调试破例。
           */
          return ok(`统一工期 ${seconds} 秒（对**之后**认领的工地生效）`);
        },
      }),
      registerCommand({
        name: "golem",
        usage: "golem",
        description:
          "石傀儡为什么不去建：他的状态 + 每块工地逐条报原因（有人建了 / 够得着 / 排不出路）",
        handler: () => {
          const golem = getResidents().find((resident) => resident.role === CreatureRole.Worker);
          if (!golem) return fail("场上没有工人");
          return ok(
            JSON.stringify(
              {
                /*
                 * 三样先摆出来：**沉睡**（零件不全就永远不醒）、**状态**
                 * （work 说明他正在建）、**位置**。石傀儡不动的原因里，
                 * "他压根没启动"和"他去不了"是完全不同的两件事，
                 * 而从画面上看都是一尊站着的石像。
                 */
                沉睡: golem.dormant,
                状态: golem.state,
                位置: `${golem.x.toFixed(1)}, ${golem.z.toFixed(1)}`,
                ...(() => {
                  const d = diagnoseSites(golem);
                  return { 手上的活: d.errand, 工地: d.sites };
                })(),
              },
              null,
              1,
            ),
          );
        },
      }),
      registerCommand({
        name: "buildings",
        usage: "buildings",
        description:
          "列出领地上的建筑：等级、位置（格号 + 世界坐标）、能升到哪几级；**工地额外标出谁在建、建到几成**",
        handler: () => {
          const list = listBuildings();
          if (list.length === 0) return ok("领地上还没有建筑");
          const now = getClock().sample.nowUtc;
          return ok(
            list
              .map((placement) => {
                const level = findBuildingLevel(placement.buildingId, placement.levelId);
                const cell = worldToYardCell(placement);
                const next = upgradeOptions(placement.instanceId);
                /*
                 * **施工状态要打出来。** 这一栏是查"石傀儡不来建造"时补的：
                 * 在此之前这条指令对工地一个字都不提——有没有工地、谁认领了、
                 * 建到几成，全看不见，只能从"楼有没有变出来"倒推。
                 * 而那恰恰是这类问题最需要分清的三件事。
                 */
                const site = placement.construction;
                const state = site
                  ? site.workerId
                    ? `施工中 ${(constructionProgress(placement, now) * 100).toFixed(0)}%（${site.workerId}）`
                    : "工地·排队中（没人认领）"
                  : next.length
                    ? "可升→" + next.join("/")
                    : "满级";
                // 格号和世界坐标**都打**：调试时不用心算
                return `${placement.instanceId} ${t(level?.localizationKey ?? "")}(${placement.levelId}) 格(${cell.x},${cell.y}) 世界(${placement.x},${placement.z}) ${state}`;
              })
              .join(" · "),
          );
        },
      }),
      registerCommand({
        name: "gold",
        arguments: [
          { name: "动作", suggest: () => asSuggestions(["show", "add", "spend"]) },
          { name: "数量" },
        ],
        usage: "gold [show|add <n>|spend <n>]",
        description: "看/加/花金币。**金库就是钱包**——没库就全额溢出",
        handler: (args) => {
          const action = args[0] ?? "show";
          if (action === "show") {
            return ok(`${getGold()} / ${getGoldCapacity()}（金库 ${jarLevelIds().length} 座）`);
          }
          const amount = Number(args[1]);
          if (!Number.isFinite(amount) || amount <= 0) return fail("用法：gold add <数量>");

          if (action === "add") {
            const r = depositGoldTo(amount);
            return ok(
              r.overflowed > 0
                ? `进账 ${r.accepted}，溢出 ${r.overflowed}（${getGold()} / ${getGoldCapacity()}）`
                : `进账 ${r.accepted}（${getGold()} / ${getGoldCapacity()}）`,
            );
          }
          if (action === "spend") {
            const r = spendGoldFrom(amount);
            if (r.ok !== false) return ok(`花了 ${amount}（${getGold()} / ${getGoldCapacity()}）`);
            return fail(`还差 ${r.short} 金币`);
          }
          return fail("用法：gold [show|add <n>|spend <n>]");
        },
      }),
      registerCommand({
        name: "farm",
        arguments: [
          { name: "实例或型号", suggest: () => asSuggestions(listBuildings().filter((b) => b.buildingId === "farm_plot").map((b) => b.instanceId)) },
        ],
        usage: "farm <instanceId|farm_plot>",
        description: "对一块田按 F（播种/浇水/收获，做什么由地里的状态定）",
        handler: (args) => {
          const target = resolveBuilding(args[0] ?? "farm_plot");
          if (target.ok === false) return fail(target.message);
          const stage = farmStageOf(target.instanceId);
          const result = interactWithFarm(target.instanceId);
          if (result.ok !== false) return ok(`${stage} → ${result.did}`);
          return fail(
            result.reason === "not_a_farm"
              ? "那不是一块田"
              : `现在没什么可做的（${stage}）——长着呢，或者手上没种子`,
          );
        },
      }),
      registerCommand({
        name: "site",
        arguments: [
          { name: "模式", suggest: () => asSuggestions(["build", "move", "upgrade"]) },
          { name: "型号或实例", suggest: () => asSuggestions([...buildableIds(), ...listBuildings().map((b) => b.instanceId)]) },
          { name: "目标等级" },
        ],
        usage: "site <build|move|upgrade> <型号|实例> [levelId]",
        description: "进入选址：虚影跟鼠标 → 点一下选定 → 按确认才动工",
        handler: (args) => {
          const mode = parseEnum(args[0] ?? "build", ["build", "move", "upgrade"] as const, "模式");
          const scene = sceneRef.current;
          if (!scene) return fail("场景还没就绪");

          if (mode === "build") {
            const buildingId = args[1] ?? "";
            if (!findBuilding(buildingId)) return fail(`没有这种建筑：${buildingId}`);
            return scene.beginBuildingSiting({ mode, buildingId })
              ? ok("选个位置——点一下选定，再按确认")
              : fail("进不了选址");
          }

          const target = resolveBuilding(args[1] ?? "");
          if (target.ok === false) return fail(target.message);
          const placement = findPlacement(target.instanceId)!;

          if (mode === "move") {
            return scene.beginBuildingSiting({
              mode,
              buildingId: placement.buildingId,
              levelId: placement.levelId,
              instanceId: target.instanceId,
            })
              ? ok("挪到哪儿？虚影默认在原位——原地合法就直接确认")
              : fail("进不了选址");
          }

          // 升级：**必须先选目标等级**（分叉时不替玩家选）
          const options = upgradeOptions(target.instanceId);
          if (options.length === 0) return fail("已满级");
          const levelId = args[2] ?? (options.length === 1 ? options[0] : undefined);
          if (!levelId) return ok(`先挑一级：${options.join(" / ")}`);
          if (!options.includes(levelId)) return fail(`${levelId} 不是当前等级的后继`);

          return scene.beginBuildingSiting({
            mode,
            buildingId: placement.buildingId,
            levelId,
            instanceId: target.instanceId,
          })
            ? ok("升级后的占地会变——虚影默认在原位，压到东西就挪一挪")
            : fail("进不了选址");
        },
      }),
      registerCommand({
        name: "territory",
        arguments: [
          {
            name: "动作",
            suggest: () => asSuggestions(["list", "unlock", "reset", "free"]),
          },
          { name: "地块", suggest: () => asSuggestions(unlockablePlotIds()) },
        ],
        usage: "territory [list|unlock <id>|reset|free [on|off]]",
        description:
          "领地：看格盘 / 开一块地 / 回到开局 / 临时停掉区块限制（调试）",
        handler: (args) => {
          const action = args[0] ?? "list";

          if (action === "list") {
            if (allPlots().length === 0) return fail("这张图没有领地");
            const owned = new Set(ownedPlotIds());
            const open = new Set(unlockablePlotIds());
            const lines = allPlots().map((plot) => {
              const state = owned.has(plot.plotId)
                ? "已开"
                : open.has(plot.plotId)
                  ? "可开"
                  : "锁定";
              const { minX, maxX, minZ, maxZ } = plot.rect;
              return `${plot.plotId} ${state}  x ${minX}..${maxX} / z ${minZ}..${maxZ}`;
            });
            /*
             * 旁路开着的话**必须在这儿说出来**。
             *
             * 一个看不见的调试开关是陷阱：格盘照旧报"锁定"（那是真的，
             * 旁路不改拥有关系），而人却能走过去——不提示的话，下次看到
             * 这一幕的人会以为领地系统坏了，然后去查一个根本没坏的东西。
             */
            const banner = isTerritoryGateBypassed()
              ? "⚠ 区块限制已临时停用（/territory free off 恢复）\n"
              : "";
            return ok(banner + lines.join(" · "));
          }

          if (action === "reset") {
            resetTerritory();
            return ok(`回到开局：${ownedPlotIds().join(", ")}`);
          }

          /*
           * `free`：**临时把区块限制整个停掉**，用来通测地图。
           *
           * 不带参数是切换，也可以写死 on / off。三条性质在
           * `State/territory` 的注释里：只活在运行时（刷新即恢复）、
           * 不改「拥有」只跳过判定、做客时拒绝。
           */
          if (action === "free") {
            if (isRemoteWorldActive()) {
              return fail(
                "做客时不能开：领地判定同时管着家具能摆在哪，带着它在别人家摆东西会把调试开关的后果写进房主的存档",
              );
            }
            const raw = (args[1] ?? "").toLowerCase();
            const next =
              raw === "on" ? true : raw === "off" ? false : !isTerritoryGateBypassed();
            if (raw && raw !== "on" && raw !== "off") {
              return fail("用法：territory free [on|off]（不带参数是切换）");
            }
            setTerritoryGateBypassed(next);
            return ok(
              next
                ? "区块限制已停：整张图随便走、随便建。围栏还画在真实边界上，好让你看得出越了哪条线。**刷新页面就恢复，不进存档。**"
                : "区块限制恢复了。",
            );
          }

          if (action !== "unlock") {
            return fail("用法：territory [list|unlock <id>|reset|free [on|off]]");
          }

          const plotId = args[1];
          if (!plotId) return fail(`用法：territory unlock <id>，现在可开：${unlockablePlotIds().join(", ") || "（没有）"}`);

          const result = unlockPlotById(plotId);
          if (result.ok !== false) return ok(`开了 ${plotId}，现在拥有：${ownedPlotIds().join(", ")}`);
          /*
           * 逐条说清楚为什么不行。和 /house 同一条路数——拒绝要说得出
           * 理由，将来正式的扩展驱动（圣水买地、剧情）报的就是这几句。
           */
          const why: Record<string, string> = {
            no_territory: "这张图没有领地",
            unknown: `没有这块地：${plotId}`,
            owned: `${plotId} 已经是你的了`,
            not_adjacent: `${plotId} 和你现在的地不相邻——只能从已开的地往外扩`,
            busy: "做客期间不能动别人家的地",
          };
          return fail(why[result.reason] ?? "开不了");
        },
      }),
      registerCommand({
        name: "house",
        arguments: [
          { name: "动作", suggest: () => asSuggestions(["stow", "place"]) },
        ],
        usage: "house <stow|place>",
        description: "收起 / 放下据点的房子（规矩在 Systems/house，这里只是入口）",
        handler: (args) => {
          const action = parseEnum(args[0], ["stow", "place"] as const, "动作");
          const result = action === "stow" ? stowHouse() : placeHouse();
          // `=== false` 收窄：同 /goto，tsconfig 没开 strict，
          // 真值收窄在判别式联合上不生效
          if (result.ok !== false) {
            return ok(action === "stow" ? "房子收起来了" : "房子放回去了");
          }
          /*
           * 逐条说清楚为什么不行。**这是"房子不是家具"落到玩家面前的
           * 第一层**：家具右键就收走，房子会当面拒绝你，并且说得出理由。
           * 将来接工人 NPC 时，这些理由就是他站在门口要说的话。
           */
          const why: Record<string, string> = {
            busy: "现在动不了房子",
            no_house: "这张图没有房子可收",
            already:
              action === "stow" ? "房子已经收起来了" : "房子本来就立着",
            player_inside: "你还在屋里——先走出去，房子不能从你脚底下抽走",
          };
          return fail(why[result.reason] ?? "收不了");
        },
      }),
      registerCommand({
        name: "tp",
        arguments: [{ name: "x" }, { name: "z" }],
        usage: "tp <x> <z>",
        description: "把角色传送到世界坐标（调试用）",
        handler: (args) => {
          const x = Number(args[0]);
          const z = Number(args[1]);
          if (!Number.isFinite(x) || !Number.isFinite(z)) {
            return fail("用法：tp <x> <z>");
          }
          sceneRef.current?.debugTeleport(x, z);
          return ok(`传送到 (${x}, ${z})`);
        },
      }),
      registerCommand({
        name: "goto",
        arguments: [
          {
            name: "地图",
            suggest: () =>
              mapDefinitions.map((definition) => ({
                value: definition.mapId,
                description: t(definition.localizationKey),
              })),
          },
        ],
        usage: "goto <mapId>",
        description: "去另一张箱庭地图（阶段②的传送门就绪前的调试入口）",
        handler: (args) => {
          const result = travelTo(args[0] ?? "");
          // `=== false` 收窄：tsconfig 没开 strict，真值收窄在判别式联合上不生效
          if (result.ok !== false) return ok(`出发去 ${args[0]}`);
          switch (result.reason) {
            case "already_there":
              return fail("已经在这张地图了");
            case "in_session":
              return fail(t("ui.travel.in_session"));
            default:
              return fail(`没有这张地图：${args[0] ?? "(空)"}`);
          }
        },
      }),
      registerCommand({
        name: "go",
        arguments: [
          {
            name: "地方",
            suggest: () =>
              destinations().map((place) => ({
                value: place.label,
                description: place.mapId,
              })),
          },
        ],
        usage: "go <地方>",
        description: "自动走过去（会跨地图一路走到底，按 WASD 随时接管）",
        handler: (args) => {
          const query = args.join(" ");
          if (!query) return fail("用法：go <地方>，比如 go 书店");
          const result = autoWalkTo(query);
          if (result.ok !== false) {
            return ok(
              result.legs > 1
                ? `出发去${result.label}（要过 ${result.legs - 1} 道门）`
                : `出发去${result.label}`,
            );
          }
          return fail(
            result.reason === "unknown_place"
              ? `没听说过这个地方：${query}`
              : `找不到去${query}的路`,
          );
        },
      }),
      registerCommand({
        name: "door",
        arguments: [
          { name: "操作", suggest: () => asSuggestions(["list", "lock", "unlock"]) },
          {
            name: "哪扇门",
            suggest: () => asSuggestions(listDoors().map((door) => door.refId)),
          },
        ],
        usage: "door <list|lock|unlock> [refId]",
        description: "查看/锁定门。锁玩法（钥匙、剧情锁门）接上前的调试口",
        handler: (args) => {
          const action = parseEnum(
            args[0] ?? "list",
            ["list", "lock", "unlock"] as const,
            "操作",
          );
          if (action === "list") {
            const lines = listDoors().map(
              (door) =>
                `${door.refId} [${door.definition.id}] ` +
                `${door.open ? "开" : "关"}${door.locked ? "·锁" : ""}`,
            );
            return ok(lines.length ? lines.join("\n") : "屋里没有门");
          }
          const door = args[1] ? findDoorAgent(args[1]) : undefined;
          if (!door) return fail(`没有这扇门：${args[1] ?? "(未指定)"}`);
          if (action === "lock") door.lock();
          else door.unlock();
          return ok(`${door.refId} 已${action === "lock" ? "上锁" : "解锁"}`);
        },
      }),
      registerCommand({
        name: "touch",
        arguments: [
          { name: "开关", suggest: () => asSuggestions(["on", "off", "auto"]) },
        ],
        usage: "touch <on|off|auto>",
        description: "强制开关触摸操作（摇杆+按钮），auto 交还给设备判定",
        handler: (args) => {
          const value = parseEnum(args[0], ["on", "off", "auto"] as const, "开关");
          setTouchOverride(value === "auto" ? null : value === "on");
          return ok(`触摸操作已设为 ${value}`);
        },
      }),
      registerCommand({
        name: "state",
        usage: "state",
        description: "打印当前场景状态",
        handler: () => ok(JSON.stringify(scene.getDebugState(), null, 1)),
      }),
      registerCommand({
        name: "signal",
        usage: "signal <信号名> [subject]",
        description: "手动发一个剧情信号，用来验证 storyRules 的触发条件",
        handler: (args) => {
          const kind = parseEnum(args[0], STORY_SIGNALS, "信号");
          signal(kind, args[1]);
          return ok(`已发出信号 ${kind}${args[1] ? ` (${args[1]})` : ""}`);
        },
      }),
      registerCommand({
        name: "act",
        usage: "act <分类> <秒> [low|normal|high] [名字]",
        description: "起一条**独立**行动（不走链）。秒数很短时能当场看到开箱",
        arguments: [
          {
            name: "分类",
            suggest: () =>
              asSuggestions(actionDefinitions.map((a) => a.category)),
          },
          { name: "秒" },
          {
            name: "重要级",
            suggest: () => asSuggestions(["low", "normal", "high"]),
          },
          { name: "名字" },
        ],
        handler: (args) => {
          const category = args[0] as ActionCategory;
          const definition = findActionByCategory(category);
          if (!definition) {
            return fail(
              `没有这个分类：${args[0]}（可选 ${actionDefinitions.map((a) => a.category).join(" / ")}）`,
            );
          }
          const seconds = Number(args[1]);
          if (!Number.isFinite(seconds) || seconds <= 0) {
            return fail("用法：act <分类> <秒> [low|normal|high] [名字]");
          }
          const priority = parseEnum(
            args[2] ?? "normal",
            ["low", "normal", "high"] as const,
            "重要级",
          ) as ActionPriority;
          const name = args.slice(3).join(" ") || `调试·${definition.id}`;

          // 家具门槛 2026-08-28 取消（见 `findSupportingFurniture` 的注释）
          const started = startAction(definition.id, name, seconds, priority);
          if (!started) return fail("起不来：已经有行动在跑，或者精力不够");
          return ok(
            `开始「${name}」：${definition.id} / ${priority} / ${seconds} 秒`,
          );
        },
      }),
      registerCommand({
        name: "lastact",
        usage: "lastact",
        description: "打印上一条行动的结算结果（开出了什么、有没有陪伴）",
        handler: () => {
          const end = getLastActionEnd();
          if (!end) return fail("还没有结算过的行动");
          return ok(
            JSON.stringify(
              {
                名字: end.action.customName,
                分类: end.action.category,
                重要级: end.action.priority,
                时长分钟: Math.round(end.action.durationMs / 60000),
                完成: end.completed,
                开出: end.rewards,
                陪伴: end.residentCompanion,
              },
              null,
              1,
            ),
          );
        },
      }),
      registerCommand({
        name: "chest",
        usage: "chest <分钟> [low|normal|high] [次数]",
        description: "模拟行动开箱：按时长×重要级算投入分，抽给定次数看分布",
        arguments: [
          { name: "分钟" },
          {
            name: "重要级",
            suggest: () => asSuggestions(["low", "normal", "high"]),
          },
          { name: "次数" },
        ],
        handler: (args) => {
          const minutes = Number(args[0]);
          if (!Number.isFinite(minutes) || minutes <= 0) {
            return fail("用法：chest <分钟> [low|normal|high] [次数]");
          }
          const priority = parseEnum(
            args[1] ?? "normal",
            ["low", "normal", "high"] as const,
            "重要级",
          ) as ActionPriority;
          const times = Math.max(1, Math.min(500, Number(args[2] ?? 1) || 1));

          const multiplier = findActionPriority(priority)?.rewardMultiplier ?? 1;
          const score = nodeChestScore(minutes) * multiplier;

          /*
           * **只掷点、不入包**：这条命令是用来看分布的，抽 200 次
           * 真发 200 件家具会把背包塞爆，而且污染 ownedCount（开箱
           * 优先抽没有的，背包被塞满之后分布就不是真的了）。
           */
          const pool = buildCandidatePool();
          const owned = ownedCountFn();
          const tally: Record<string, number> = {};
          const sample: string[] = [];
          for (let i = 0; i < times; i += 1) {
            const rarity = rollChestRarity(score, Math.random);
            const picked = pickChestFurniture(rarity, pool, owned, Math.random);
            const key = picked?.rarity ?? "（池子空了）";
            tally[key] = (tally[key] ?? 0) + 1;
            if (sample.length < 5 && picked) sample.push(picked.itemId);
          }
          return ok(
            JSON.stringify(
              {
                时长分钟: minutes,
                重要级: priority,
                投入分: Number(score.toFixed(2)),
                抽了几次: times,
                档位分布: tally,
                前几件: sample,
              },
              null,
              1,
            ),
          );
        },
      }),
      registerCommand({
        name: "price",
        usage: "price [物品id]",
        description: "查物品的价钱；不给 id 就按价钱从高到低列全表",
        arguments: [
          {
            name: "物品",
            suggest: () => asSuggestions(itemDefinitions.map((item) => item.id)),
          },
        ],
        handler: (args) => {
          const id = args[0];
          if (id) {
            const item = findItemDefinition(id);
            if (!item) return fail(`没有这件物品：${id}`);
            if (item.value === undefined) {
              const why = item.blueprint
                ? "图纸（商店发的凭证，不可倒卖）"
                : untradableItemIds.has(item.id)
                  ? "在不可交易名单里"
                  : "场景道具（进不了背包）";
              return ok(`${id}：不可交易（${why}）`);
            }
            return ok(`${id}：${item.value} 金币（${item.category} / ${item.rarity}）`);
          }
          const priced = itemDefinitions
            .filter((item) => item.value !== undefined)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .map((item) => `${String(item.value).padStart(3)}  ${item.id}`);
          return ok([`${priced.length} 件有价（从贵到便宜）`, ...priced].join("\n"));
        },
      }),
      registerCommand({
        name: "economy",
        usage: "economy",
        description: "打印收支总表：每个阶段一天进多少、出多少、余多少",
        handler: () =>
          ok(
            JSON.stringify(
              economyStages.map((stage) => {
                const board = fullBoardIncome(stage, dailyBoardDefinition.taskCount);
                return {
                  阶段: stage.label,
                  打满一块板: board,
                  卖货日均: stage.income.typicalSellPerDay,
                  必需开销: stage.spending.essentialPerDay,
                  可选开销: stage.spending.optionalPerDay,
                  余: board + stage.income.typicalSellPerDay
                    - stage.spending.essentialPerDay
                    - stage.spending.optionalPerDay,
                  够不够吃饭: board >= stage.spending.essentialPerDay ? "够" : "**不够**",
                };
              }),
              null,
              1,
            ),
          ),
      }),
      registerCommand({
        name: "hold",
        usage: "hold <itemId> [数量]",
        description:
          "把某物品放进当前选中的快捷格并拿在手上（验证浇水/播种这类看手持的交互）",
        arguments: [
          { name: "物品", suggest: () => asSuggestions(itemDefinitions.map((i) => i.id)) },
        ],
        handler: (args) => {
          const itemId = args[0] ?? "";
          if (!findItemDefinition(itemId)) return fail(`没有这种物品：${itemId}`);
          const count = Math.max(1, Number(args[1] ?? 1) || 1);
          /*
           * 直接改写选中格，不走 addItem：addItem 会挑"第一个空格"，
           * 而手持读的是**选中格**——期 6 实测时种子被发进了别的格，
           * 播种和范围浇水全测不了，这条指令就是那次补的。
           */
          setSelectedStack({ itemId, count });
          return ok(`手上现在是 ${itemId} ×${count}`);
        },
      }),
      registerCommand({
        name: "news",
        usage: "news [open|issue|name <报名>]",
        description:
          "报纸（期 7）：不带参数看最新一期的摘要，open 打开版面，issue 立刻出一期，name 改报名",
        handler: (args) => {
          if (args[0] === "name") {
            const wanted = args.slice(1).join(" ").trim();
            if (!wanted) return fail("要叫什么？");
            setPaperName(wanted);
            return ok(`报名改成「${paperName()}${"晨报"}」`);
          }
          if (args[0] === "open") {
            emit("newspaper_open_requested", {});
            return ok("打开报纸");
          }
          if (args[0] === "issue") {
            const issued = issueToday();
            if (!issued) {
              /*
               * 出不了刊有两个原因，**分开报**：还没解锁 vs 今天已经出过。
               * 合成一句"出不了"会让人去翻剧情，而实际上只是今天看过了。
               */
              return ok(
                isFeatureUnlocked("newspaper")
                  ? "今天这一期已经出过了（一天只出一版）"
                  : "报纸还没开张——把打印机送给薇尔",
              );
            }
            return ok(`第 ${issued.number} 期出刊`);
          }
          const latest = latestIssue();
          if (!latest) return ok("还没出过报纸");
          return ok(
            JSON.stringify(
              {
                报名: paperName() || "(还没取)",
                期号: latest.number,
                出刊日: latest.worldDayId,
                报道: latest.aboutDayId,
                隔了几天: latest.spanDays,
                头条: latest.headline,
                邻居动态: latest.neighbors.length,
                今日想要: latest.wanted,
              },
              null,
              1,
            ),
          );
        },
      }),
      registerCommand({
        name: "traveler",
        usage: "traveler [buy <itemId>]",
        description:
          "旅行商人小鱼人（期 6）：不带参数看班表和摊上剩什么，buy 买一件",
        handler: (args) => {
          if (args[0] === "buy") {
            const result = buyFromTraveler(args[1] ?? "");
            if (result.ok !== false) return ok(`买了 ${args[1]}，花了 ${result.gold}`);
            const why: Record<string, string> = {
              not_here: "他今天没出摊",
              not_stocked: "摊上没有这件（买光了？）",
              cant_afford: "钱不够",
              no_value: "这件没有标价",
            };
            return fail(why[result.reason] ?? result.reason);
          }
          const clock = getClock();
          return ok(
            JSON.stringify(
              {
                今天: clock.worldDayId,
                出摊: isTravelerHereToday(),
                /*
                 * 把"本趟原本摆什么"和"现在还剩什么"分开打：只看剩下的
                 * 分不出"他没来"和"被买光了"，而那是两件事。
                 */
                本趟货单: travelerOfferToday(),
                现在还剩: travelerStockToday(),
                周期: `每 ${tradingTuning.travelerVisitEveryDays} 天`,
              },
              null,
              1,
            ),
          );
        },
      }),
      registerCommand({
        name: "shop",
        usage: "shop [open|settle]",
        description:
          "家具小店（期 5）：不带参数看货架和客源，open 开上架面板，settle 立刻结算一天",
        handler: (args) => {
          const instanceId = findShop();
          if (!instanceId) return fail("还没盖家具小店（/give blueprint_furniture_shop）");

          if (args[0] === "open") {
            /*
             * 真游戏的入口是"对着店按 F → 管理面板 → 摆货上架"。这条指令
             * 直接发同一个事件，省掉走过去那段——**验的是同一块面板**，
             * 因为面板只认这个事件，不认调用方是谁。
             */
            emit("shelf_open_requested", { instanceId });
            return ok("开了上架面板");
          }

          if (args[0] === "settle") {
            const sold = debugSettleOnce();
            if (sold.length === 0) {
              /*
               * 卖不出去有三个互不相同的原因，**说得出是哪一个**——
               * 一句"没卖出去"会让人先去翻货架。拒绝要给理由是这套建筑
               * 系统一开始就立的规矩（见 BuildingPanel 的 whyBuild）。
               *
               * "金库满"不再是原因之一：结算进的是收银台抽屉（goldDrawer），
               * 金库满不满是领取那一刻的事。剩下的第三个原因只有价钱。
               */
              return ok(
                shelfSlotsOf(instanceId).filter(Boolean).length === 0
                  ? "货架是空的"
                  : listResidents().length === 0
                    ? "一位居民都没有，没人来买"
                    : `架上最便宜的一件也超过今天客人的总预算 ${budgetToday()}`,
              );
            }
            return ok(
              sold
                .map((entry) => `${entry.itemId} → ${entry.customerId} ${entry.price}`)
                .join(" · "),
            );
          }

          return ok(
            JSON.stringify(
              {
                店: instanceId,
                抽屉: pendingRevenueOf(instanceId),
                货位: `${shelfSlotsOf(instanceId).filter(Boolean).length}/${shelfCapacityOf(instanceId)}`,
                /*
                 * 货架和客源一起打出来：卖不出去只有两种原因（架上没货 /
                 * 没有客人），分开看得两条指令来回切。
                 */
                货架: shelfSlotsOf(instanceId)
                  .map((slot, index) =>
                    slot ? `${index}:${slot.itemId}×${slot.count}` : null,
                  )
                  .filter(Boolean),
                今日客源: listResidents(),
              },
              null,
              1,
            ),
          );
        },
      }),
      registerCommand({
        name: "consign",
        usage: "consign [open|settle|spawn]",
        description:
          "寄售箱：不带参数看箱格和抽屉，open 开面板，settle 立刻结算一次，spawn 在门口旁边补一只（老档用）",
        handler: (args) => {
          if (args[0] === "spawn") {
            /*
             * 老档读档不跑 seedInitialFurniture，门口那只是新档才有的。
             * 这里按同一个坐标（CONSIGN_BOX_SEED）补一只——和新档一模一样，
             * 两处别各写一份位置。
             */
            const check = placeFurniture(
              CONSIGN_BOX_SEED.furnitureId,
              CONSIGN_BOX_SEED.gridPosition,
              CONSIGN_BOX_SEED.facing,
              getCurrentMap().outdoorRoomId,
            );
            return check.ok
              ? ok("门口旁边摆了一只寄售箱")
              : fail(`摆不下：${JSON.stringify(check)}——那格被占了？先清开`);
          }

          const boxes = consignBoxIds();
          if (boxes.length === 0) {
            return fail("场上没有寄售箱（/consign spawn 补一只，或 /give furniture_consign_box）");
          }

          if (args[0] === "open") {
            // 真游戏的入口是对着箱子按 F。这条直接发同一个事件——验的是同一块面板
            emit("consign_open_requested", { instanceId: boxes[0] });
            return ok("开了寄售箱面板");
          }

          if (args[0] === "settle") {
            const sold = settleAllBoxes();
            return ok(
              sold.length === 0
                ? "箱子是空的，什么也没卖"
                : sold.map((s) => `${s.itemId}×${s.count} @${s.unitPrice}`).join(" · "),
            );
          }

          return ok(
            JSON.stringify(
              boxes.map((id) => ({
                箱: id,
                箱格: boxSlotsOf(id)
                  .map((slot, index) => (slot ? `${index}:${slot.itemId}×${slot.count}` : null))
                  .filter(Boolean),
                明早到账: previewConsignRevenue(id),
                抽屉: boxPendingRevenue(id),
              })),
              null,
              1,
            ),
          );
        },
      }),
      registerCommand({
        name: "otter",
        usage: "otter",
        description: "水獭的班表：今天在不在、这回想要什么、未来七天哪天来",
        handler: () => {
          const today = getClock().worldDayId;
          const next = [];
          for (let i = 0; i < 7; i += 1) {
            const date = new Date(`${today}T00:00:00Z`);
            date.setUTCDate(date.getUTCDate() + i);
            const dayId = date.toISOString().slice(0, 10);
            next.push(`${dayId} ${isOtterScheduledOn(dayId) ? "来" : "—"}`);
          }
          return ok(
            JSON.stringify(
              {
                今天在吗: isOtterHereToday(),
                这回想要: [...wantedToday()],
                未来七天: next,
              },
              null,
              1,
            ),
          );
        },
      }),
      registerCommand({
        name: "trade",
        usage: "trade [peddler]",
        description:
          "直接打开交易面板（调试；正式入口是对着在场的商人按 F）。peddler = 小鱼人那一版",
        handler: (args) => {
          syncTraderPresence();
          /*
           * 默认开水獭那一版；`/trade peddler` 开稀客的。
           * 面板本身按 merchantId 参数化，这里只是把 id 递进去。
           */
          emit("trade_open_requested", {
            merchantId:
              args[0] === "peddler" ? "traveling_peddler" : "otter_trader",
          });
          return ok("交易面板已打开");
        },
      }),
      registerCommand({
        name: "day",
        usage: "day",
        description: "手动发一次 day_started 剧情信号（不用等凌晨 4 点）",
        handler: () => {
          signal("day_started");
          return ok("已发出 day_started");
        },
      }),
      registerCommand({
        name: "rule",
        usage: "rule <ruleId>",
        description: "跳过所有条件直接点火一条剧情规则（具名加入居民等调试用）",
        arguments: [
          {
            name: "规则",
            // 候选就是注册表本身，加一条规则这里自动就有
            suggest: () => asSuggestions(storyRules.map((rule) => rule.id)),
          },
        ],
        handler: (args) => {
          const ruleId = args[0];
          if (!ruleId) return fail("用法：rule <ruleId>");
          const outcome = fireStoryRuleById(ruleId);
          if (outcome === "unknown") return fail(`没有这条规则：${ruleId}`);
          if (outcome === "already_fired") {
            return fail(`规则 ${ruleId} 已经触发过（once），不重放`);
          }
          return ok(`已点火 ${ruleId}`);
        },
      }),
      registerCommand({
        name: "pool",
        usage: "pool",
        description: "打印各抽签池的错过次数和当前命中率（保底看这里）",
        handler: () => {
          const misses = getPoolMisses();
          return ok(
            JSON.stringify(
              storyPools.map((pool) => ({
                poolId: pool.poolId,
                misses: misses[pool.poolId] ?? 0,
                chance: poolChance(pool, misses[pool.poolId] ?? 0),
              })),
              null,
              1,
            ),
          );
        },
      }),
      registerCommand({
        name: "facts",
        usage: "facts",
        description: "打印昨日事实记录（报纸素材）：今天在写的 + 昨天定稿的",
        handler: () =>
          ok(
            JSON.stringify(
              { today: factsOfToday(), yesterday: factsOfYesterday() },
              null,
              1,
            ),
          ),
      }),
      registerCommand({
        name: "story",
        usage: "story",
        description: "打印剧情进度：已触发的规则、事件阶段、解锁的功能",
        handler: () =>
          ok(
            JSON.stringify(
              {
                firedRules: getFiredStoryRuleIds(),
                events: getEventProgress(),
                features: getUnlockedFeatures(),
              },
              null,
              1,
            ),
          ),
      }),
      registerCommand({
        name: "give",
        usage: "give <itemId> [数量]",
        description: "调试发放物品",
        arguments: [
          {
            name: "物品",
            // 候选就是注册表本身。加一件物品，这里自动就有了
            suggest: () =>
              itemDefinitions.map((item) => ({
                value: item.id,
                description: t(item.localizationKey),
              })),
          },
          { name: "数量" },
        ],
        handler: (args) => {
          const itemId = args[0] ?? "";
          if (!findItemDefinition(itemId)) {
            return { ok: false, message: `未知物品：${itemId}` };
          }
          const quantity = Math.max(1, Number(args[1] ?? 1) || 1);
          addItem(itemId, quantity);
          return ok(`已发放 ${itemId} ×${quantity}`);
        },
      }),
      registerCommand({
        name: "testroom",
        usage: "testroom",
        description:
          "测试房间：清掉纸箱杂物，把每件家具各摆一件（互不重叠），并备齐测试库存",
        handler: () => {
          const report = setupTestRoom();
          const lines = [`已摆好 ${report.placed.length} 件家具`];

          if (report.skipped.length > 0) {
            lines.push(
              `放不下（${report.skipped.length}）：${report.skipped.join(", ")}`,
            );
          }
          lines.push(`空地 ${report.walkableCells} 格`);
          // 连通区域大于 1 = 有家具把某块地圈死了，角色走不进去
          lines.push(
            report.walkableRegions === 1
              ? "全屋连通，没有走不到的角落"
              : `⚠ 空地被切成 ${report.walkableRegions} 块，有走不进去的角落`,
          );

          return ok(lines.join("\n"));
        },
      }),
    ];

    // 厨房状态（锅里装着什么、煮到几分、手上端着什么）是纯数据，
    // 光看画面验证不了品质这类字段，所以开一个只读窗口
    (
      window as unknown as {
        __kitchen?: {
          slots: typeof listKitchenSlots;
          held: typeof getHeld;
          counts: typeof getCounts;
          hotbar: typeof getHotbar;
          backpack: typeof getBackpack;
        };
      }
    ).__kitchen = {
      slots: listKitchenSlots,
      held: getHeld,
      counts: getCounts,
      hotbar: getHotbar,
      backpack: getBackpack,
    };

    return () => {
      for (const remove of unregister) remove();
      // 离开前先把当前进度写下去，再摘掉自动存档
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);

      void saveNow().then(stopAutosave);
      offSpoil();
      stopStory();
      stopTrading();
      stopResidents();
      stopTownTrips();
      stopVisitors();
      stopTrips();
      stopMail();
      stopOverrideWatch();
      stopWeatherProps();
      stopRoutineWatch();
      stopTalk();
      stopAffection();
      stopPresents();
      stopFavors();
      stopSocial();
      stopVisits();
      stopShopkeeping();
      stopConsigning();
      stopNewspaper();
      stopParticipantSync();
      stopBath();
      stopDailyRollover();
      stopMusic();
      stopSoundscape();
      stopNeeds();
      stopWeather();
      stopDayRecord();
      stopAutoLife();
      stopClock();
    };
  }, [loadedFromSave]);

  // 换图：状态层切完发 map_changed，这里只负责把场景纪元 +1
  useEffect(() => on("map_changed", () => setMapEpoch((epoch) => epoch + 1)), []);

  /*
   * 自动跑腿失败要说人话。**"领地还没扩展到那边"和"找不到路"是两件事**：
   * 前者是玩法（决策 T1：领地外不能走），后者才是问题。都报同一句的话，
   * 玩家会把设计当成 bug——而这个游戏里"走不过去"恰恰是最常见的一句。
   */
  /*
   * 建筑变了要重算罐的液面：升级/拆罐改的是容量不是余额，而液面是
   * 两者之比。不重算的话升完级液面还贴在罐口上，看起来像白升了。
   */
  useEffect(() => {
    /*
     * **挂载时先算一次**：读档（`restored`）发生在 GameView 挂载之前，
     * 那一次事件没人听得到，罐里的 fill 会停在存档写下的那个值。
     * 存档里存的是升级**之前**的比例，于是一读档液面就贴在罐口上。
     */
    refreshJarFills();
    return on("world_changed", ({ reason }) => {
      if (reason === "buildings" || reason === "restored") refreshJarFills();
    });
  }, []);

  useEffect(
    () =>
      on("auto_walk_ended", ({ label, reason, hint }) => {
        if (reason !== "failed") return;
        pushSystemMessage(
          hint === "territory"
            ? `去不了${label}——领地还没扩展到那边`
            : `找不到去${label}的路`,
        );
      }),
    [],
  );

  /**
   * 场景的生命周期（①B 从大 effect 拆出来）。跟着 mapEpoch 走：
   * 换图 = 拆掉整个 RoomScene 重建——门、宠物寻路、镜头边界全在
   * 构造函数里按**当前**房间几何初始化，复用旧场景等于让它们全体
   * 攥着上一张图的闭包（审计里 setOutdoorPass 捕获旧 halfW 就是例子）。
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 开局摆设只属于世界的第一次落地，不属于每张图的第一次进入
    const scene = new RoomScene(container, {
      seedFurniture: !loadedFromSave && mapEpoch === 0,
    });
    sceneRef.current = scene;
    setScene(scene);
    // 供自动化验证读取，不参与玩法
    (window as unknown as { __scene?: RoomScene }).__scene = scene;

    /*
     * 供自动化验证**驱动命令行**，和 `__scene` 同一个路数、同一条纪律：
     * 只读/只驱动，不参与玩法，DEV 才挂。
     *
     * 为什么需要它：命令行的唯一入口是聊天面板，验收脚本要走
     * "聚焦输入框 → 逐字打字 → 回车 → 从 DOM 里捞回显"四步，
     * 每一步都可能因为面板动画、输入法、滚动位置而失手——而那些失手
     * 看起来会像"命令坏了"。直接调 runCommand 验的是命令本身。
     * 人手玩的那条路仍然只有聊天面板，这里不新增任何玩家可达的入口。
     */
    if (import.meta.env.DEV) {
      (
        window as unknown as { __run?: (input: string) => CommandResult }
      ).__run = runCommand;
      /*
       * 通行判定的探针口（模型即碰撞·期 B 验收时加的）。
       *
       * 为什么不让验收脚本自己 import：dev server 里动态 import
       * `/src/...` 拿到的是**另一份模块实例**——它的 outdoorPass /
       * structureBlocker 没人注册，室外一律答 false，测出来全是假阳性
       * （连不带 ?t= 的裸 import 都踩了一遍）。probe 必须拿到**游戏正在
       * 用的那一份单例**，唯一可靠的通道就是从这里塞出去。
       */
      (window as unknown as { __walk?: unknown }).__walk = {
        isWalkable,
        withPhasing,
        groundHeightAt: walkGroundHeightAt,
        findRoute: navFindRoute,
      };
    }

    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    // 加载遮罩听它揭幕
    emit("map_scene_ready", { mapId: getCurrentMapId() });

    return () => {
      window.removeEventListener("resize", onResize);
      scene.dispose();
      sceneRef.current = null;
      setScene(null);
      delete (window as unknown as { __scene?: RoomScene }).__scene;
      delete (window as unknown as { __run?: unknown }).__run;
      delete (window as unknown as { __walk?: unknown }).__walk;
    };
  }, [loadedFromSave, mapEpoch]);

  return (
    <>
      <div
        ref={containerRef}
        className="game-canvas absolute inset-0 overflow-hidden"
      />
      {/* 快捷栏只管选中；"使用"（吃 / 进布置模式）统一走 F，见 RoomScene */}
      <Hotbar />
      <InteractBubble scene={scene} />
      <BuildProgress scene={scene} />
      {/* 家具从背包也能直接进布置模式了——原来只有快捷栏能进，
          得先把家具拖到快捷栏才摆得了，白绕一步 */}
      <Backpack />
      <BuildShopPanel />
      <TradePanel />
      <BuildingPanel />
      <StationPanel />
      <DailyBoardPanel />
      <StoragePanel />
      <ShopShelfPanel />
      <ConsignPanel />
      <NewspaperPanel />
      <MailboxPanel />
      <DialoguePanel />
      <ActionHub />
      <DiaryPanel />
      {/*
        左上角这一列：时钟在上、需求条在下，交给同一个 flex 列排。
        两者的高度都会变（时钟的天气行文案长短不一、需求条的条目数会随
        解锁增加），各自写死 top 迟早撞上——让布局去算，比调魔数稳。

        教程提示条（TutorialGuide）已删除。它常驻左上角挡视线，而它教的
        那几步玩家看一次就会了，留着的价值撑不起那块面积。Core 的
        tutorialDefinition 保留：story_signal 那套还给别的系统用。

        桌面端时钟从右上角搬到这里：右上角要留给"行动"和设置两个圆钮，
        三样东西挤一角谁都不舒服，而左上角腾出来了。
      */}
      <HudColumn touchMode={touchMode} />
      <GameSettingsModal />
      <SleepOverlay />
      <RewardPanel />
      <ChestOverlay />
      {/* 建筑选址的确认条（B17）。没在选址时它自己 null */}
      <BuildingPlacePanel />
      <HudTopCenter />
      {/* 金币飞行演出层（收银台领钱）。纯演出，钱在事件前已入账 */}
      <CoinFlight />
      {/* 消息面板挂在游戏里而不是 App 里：消息记录属于**这个世界**，
          标题界面上还没有世界，开个输入框对着空气打字没有意义 */}
      <ChatPanel />
      <SpeechBubble scene={scene} />
      {/* 居民头顶的招呼气泡 + 表情（居民系统 03） */}
      <ResidentBubbles scene={scene} />
      {/* "别这么叫我 / 换个口头禅"的单行输入（居民系统 04） */}
      <TextPrompt />
      {/* 换图加载遮罩：盖住拆旧建新的几帧，也给"去了另一个地方"一点仪式感 */}
      <TravelOverlay />
      <EscMenu />
      {/* ESC 的唯一裁判：按面板栈退最上面那一层，栈空了才开侧边栏。
          面板自己不再各挂一个 ESC 监听 */}
      <EscArbiter />
      {/*
        触摸操作只在触摸设备上出现（判据见 State/touchMode）。
        桌面上挂着一个摇杆纯属碍事，而且它的感应区会吃掉左下角的点击。
      */}
      {touchMode && scene && (
        <>
          <Joystick onMove={(x, z) => scene.setMoveInput(x, z)} />
          <TouchActions />
        </>
      )}
    </>
  );
}
