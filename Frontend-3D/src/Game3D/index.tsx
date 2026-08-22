import { matchesAction } from "../Game/Input/bindings";
import { readDebugProbe, toggleDebugMode } from "../Game/State/debugMode";
import {
  DayPhaseId,
  findItemDefinition,
  itemDefinitions,
  petDefinitions,
  type StorySignalKind,
  weatherDefinitions,
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
import { FocusVignette } from "../Components/ActionHub/FocusCard";
import { StationPanel } from "../Components/StationPanel/StationPanel";
import { StoragePanel } from "../Components/StoragePanel/StoragePanel";
import {
  parseEnum,
  registerCommand,
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
import { debugPlacePet, spawnPet } from "../Game/State/petsRuntime";
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
  getEventProgress,
  getUnlockedFeatures,
} from "../Game/Systems/events";
import {
  getFiredStoryRuleIds,
  signal,
  startStorySystem,
} from "../Game/Systems/story";
import { unlockAudio } from "./Engine/AudioEngine";
import { initAudioSettings } from "./Engine/audioSettings";
import { startParticipantSync } from "../Game/Systems/participantSync";
import {
  allPlots,
  ownedPlotIds,
  resetTerritory,
  unlockPlotById,
  unlockablePlotIds,
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
import { findBuildingLevel } from "../Buildings/index";
import {
  depositGoldTo,
  getGold,
  getGoldCapacity,
  refreshJarFills,
  spendGoldFrom,
} from "../Game/State/gold";
import { jarLevelIds } from "../Game/State/buildings";
import { farmStageOf, interactWithFarm } from "../Game/Systems/farming";
import { placeHouse, stowHouse } from "../Game/Systems/house";
import { travelTo } from "../Game/Systems/mapTravel";
import { autoWalkTo, initAutoWalk } from "../Game/Systems/autoWalk";
import { destinations } from "../Game/Systems/travelPlan";
import { mapDefinitions } from "../Maps/index";
import { TravelOverlay } from "../Components/MapTravel/TravelOverlay";
import { getCurrentMapId } from "../Game/State/worldRuntime";
import { registerNetCommands } from "../Game/Multiplayer/commands";
import {
  registerDailyCommands,
  startDailyRollover,
} from "../Game/Systems/dailyCommands";
import { registerChainCommands } from "../Game/Systems/chainCommands";
import { isRemoteWorldActive } from "../Game/Multiplayer/session";
import { describeSoundscape, startSoundscape } from "./Engine/Soundscape";
import { startMusicDirector } from "./Engine/MusicDirector";
import { startBathSystem } from "../Game/Systems/bath";
import { RoomScene } from "./World/RoomScene";
import { ChestOverlay } from "../Components/ChestOverlay/ChestOverlay";

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
  "pet_spawned",
  "pet_entered",
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
      ...registerDailyCommands(),
      ...registerChainCommands(),
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
        description: "把世界时钟往前推若干小时，用来看跨天与天气重掷",
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
        name: "pet",
        arguments: [
          {
            name: "物种",
            suggest: () =>
              asSuggestions(petDefinitions.map((pet) => pet.id)),
          },
        ],
        usage: "pet <物种id>",
        description: "召一只生物到屋子中间（调试用，跳过登场过场）",
        handler: (args) => {
          const definition = petDefinitions.find((pet) => pet.id === args[0]);
          if (!definition) return fail(`没有这种生物：${args[0] ?? "(空)"}`);


          const petId = `pet-${definition.id}`;
          spawnPet(petId, definition.id);
          // 门口挤不下大家伙，直接放到屋子中部空地
          debugPlacePet(petId, 0, 4);
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
        usage: "build <buildingId> <gx> <gy> [facing]",
        description: "在领地里盖一栋。坐标是**院子格号**，给的是占地左上角",
        handler: (args) => {
          const spot = parseYardCell(args[1], args[2]);
          if (!spot) return fail("用法：build <型号> <格X> <格Y> [朝向]");
          const facing = toFacing(parseEnum(args[3] ?? "north", FACINGS, "朝向"));
          const result = placeBuildingAtCell(args[0] ?? "", spot, facing);
          if (result.ok !== false) return ok(`盖好了：${result.instanceId}`);
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
        description: "拆一栋。**非空不给拆**——屋里有家具 / 罐里有钱就拒绝",
        handler: (args) => {
          // `=== false` 收窄：tsconfig 没开 strict，真值收窄在判别式联合上不生效
          const target = resolveBuilding(args[0] ?? "");
          if (target.ok === false) return fail(target.message);
          const result = removeBuilding(target.instanceId, {
            gold: goldInJar(target.instanceId),
          });
          if (result.ok !== false) return ok("拆了");
          const { furniture, gold } = result.detail;
          if (gold) return fail(`罐里还有 ${gold} 金币，先取出来`);
          return fail(`屋里还有 ${furniture} 件家具，先收进背包`);
        },
      }),
      registerCommand({
        name: "buildings",
        usage: "buildings",
        description: "列出领地上的建筑：等级、位置（格号 + 世界坐标）、能升到哪几级",
        handler: () => {
          const list = listBuildings();
          if (list.length === 0) return ok("领地上还没有建筑");
          return ok(
            list
              .map((placement) => {
                const level = findBuildingLevel(placement.buildingId, placement.levelId);
                const cell = worldToYardCell(placement);
                const next = upgradeOptions(placement.instanceId);
                // 格号和世界坐标**都打**：调试时不用心算
                return `${placement.instanceId} ${t(level?.localizationKey ?? "")}(${placement.levelId}) 格(${cell.x},${cell.y}) 世界(${placement.x},${placement.z}) ${next.length ? "可升→" + next.join("/") : "满级"}`;
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
        description: "看/加/花金币。**罐就是钱包**——没罐就全额溢出",
        handler: (args) => {
          const action = args[0] ?? "show";
          if (action === "show") {
            return ok(`${getGold()} / ${getGoldCapacity()}（罐 ${jarLevelIds().length} 只）`);
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
        name: "territory",
        arguments: [
          { name: "动作", suggest: () => asSuggestions(["list", "unlock", "reset"]) },
          { name: "地块", suggest: () => asSuggestions(unlockablePlotIds()) },
        ],
        usage: "territory [list|unlock <id>|reset]",
        description: "领地：看格盘 / 开一块地 / 回到开局（正式驱动接上前的调试入口）",
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
            return ok(lines.join(" · "));
          }

          if (action === "reset") {
            resetTerritory();
            return ok(`回到开局：${ownedPlotIds().join(", ")}`);
          }

          if (action !== "unlock") return fail("用法：territory [list|unlock <id>|reset]");

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
      stopParticipantSync();
      stopBath();
      stopDailyRollover();
      stopMusic();
      stopSoundscape();
      stopNeeds();
      stopWeather();
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
      {/* 家具从背包也能直接进布置模式了——原来只有快捷栏能进，
          得先把家具拖到快捷栏才摆得了，白绕一步 */}
      <Backpack />
      <StationPanel />
      <DailyBoardPanel />
      <StoragePanel />
      <DialoguePanel />
      <ActionHub />
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
      <HudTopCenter />
      <FocusVignette />
      {/* 消息面板挂在游戏里而不是 App 里：消息记录属于**这个世界**，
          标题界面上还没有世界，开个输入框对着空气打字没有意义 */}
      <ChatPanel />
      <SpeechBubble scene={scene} />
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
