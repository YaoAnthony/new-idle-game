import {
  DayPhaseId,
  WeatherKind,
  findItemDefinition,
  petDefinitions,
  itemDefinitions,
  type StorySignalKind,
} from "core";
import { useEffect, useRef, useState } from "react";
import { ActionHub } from "../Components/ActionHub/ActionHub";
import { t } from "../i18n/t";
import { ChatPanel } from "../Components/Chat/ChatPanel";
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
import { DailyBoardHud } from "../Components/DailyBoard/DailyBoardHud";
import { DailyBoardPanel } from "../Components/DailyBoard/DailyBoardPanel";
import { RewardPanel } from "../Components/RewardPanel/RewardPanel";
import { DialoguePanel } from "../Components/Dialogue/DialoguePanel";
import { HeldItem } from "../Components/HeldItem/HeldItem";
import { Hotbar } from "../Components/Hotbar/Hotbar";
import { InteractBubble } from "../Components/InteractBubble/InteractBubble";
import { NeedsHud } from "../Components/NeedsHud/NeedsHud";
import { SettingsDrawer } from "../Components/SettingsDrawer/SettingsDrawer";
import { SleepOverlay } from "../Components/SleepOverlay/SleepOverlay";
import { StoryToast } from "../Components/StoryToast/StoryToast";
import { StationPanel } from "../Components/StationPanel/StationPanel";
import { StoragePanel } from "../Components/StoragePanel/StoragePanel";
import { WorldClock } from "../Components/WorldClock/WorldClock";
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
import { registerNetCommands } from "../Game/Net/commands";
import {
  registerDailyCommands,
  startDailyRollover,
} from "../Game/Systems/dailyCommands";
import { isRemoteWorldActive } from "../Game/Net/session";
import { describeSoundscape, startSoundscape } from "./Engine/Soundscape";
import { RoomScene } from "./World/RoomScene";

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

const WEATHERS = [
  WeatherKind.Sunny,
  WeatherKind.Cloudy,
  WeatherKind.Rain,
  WeatherKind.Wind,
  WeatherKind.Storm,
] as const;

type GameViewProps = {
  /** 存档已经灌进运行时：跳过开局行李/摆设，也不重播开场剧情 */
  loadedFromSave?: boolean;
};

export function GameView({ loadedFromSave = false }: GameViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<RoomScene | null>(null);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 读档进来时行李和屋里的东西都已经在存档里了，再铺一遍会凭空多出物品
    if (!loadedFromSave) seedInitialInventory();

    // 时钟必须最先起：天气要读世界日，剧情与行动要读时间
    const stopClock = startClock();
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
    // 每日任务跨天：两边的重置本身是惰性的，这条只负责当场刷 UI
    const stopDailyRollover = startDailyRollover();
    const stopAutosave = startAutosave();

    const scene = new RoomScene(container, { seedFurniture: !loadedFromSave });
    setScene(scene);

    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    const ok = (message: string): CommandResult => ({ ok: true, message });
    const fail = (message: string): CommandResult => ({ ok: false, message });

    const unregister = [
      // 联机：/host /join /leave /who（M1 的入口形态，见 Net/commands）
      ...registerNetCommands(),
      // 每日任务：正式交互在机器面板上，命令行是验收工具兼调试入口
      ...registerDailyCommands(),
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
        usage: "weather <sunny|cloudy|rain|wind|storm|auto>",
        description: "按住某种天气（auto 恢复自然天气）",
        arguments: [
          { name: "天气", suggest: () => asSuggestions([...WEATHERS, "auto"]) },
        ],
        handler: (args) => {
          if (args[0] === "auto") {
            debugClearWeather();
            return ok(`已恢复自然天气：${getWeather().id}`);
          }

          const weather = parseEnum(args[0], WEATHERS, "天气");
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
          scene.setOutlineEnabled(value === "on");
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
          scene.rotate(value === "cw" ? 1 : -1);
          return ok(`相机已旋转 45°，当前朝向 ${Math.round(scene.rig.azimuthDegrees)}°`);
        },
      }),
      registerCommand({
        name: "zoomfit",
        usage: "zoomfit",
        description: "缩到最远，一眼看全整个房间",
        handler: () => {
          scene.zoomToFit();
          return ok("已缩到最远");
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
          scene.debugTeleport(x, z);
          return ok(`传送到 (${x}, ${z})`);
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

    // 供自动化验证读取，不参与玩法
    (window as unknown as { __scene?: RoomScene }).__scene = scene;
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
      window.removeEventListener("resize", onResize);
      for (const remove of unregister) remove();
      // 离开前先把当前进度写下去，再摘掉自动存档
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);

      void saveNow().then(stopAutosave);
      offSpoil();
      stopStory();
      stopParticipantSync();
      stopDailyRollover();
      stopSoundscape();
      stopNeeds();
      stopWeather();
      stopClock();
      scene.dispose();
      setScene(null);
      delete (window as unknown as { __scene?: RoomScene }).__scene;
    };
  }, [loadedFromSave]);

  return (
    <>
      <div
        ref={containerRef}
        className="game-canvas absolute inset-0 overflow-hidden"
      />
      {/* 快捷栏只管选中；"使用"（吃 / 进布置模式）统一走 F，见 RoomScene */}
      <Hotbar />
      <HeldItem />
      <InteractBubble scene={scene} />
      {/* 家具从背包也能直接进布置模式了——原来只有快捷栏能进，
          得先把家具拖到快捷栏才摆得了，白绕一步 */}
      <Backpack />
      <StationPanel />
      <DailyBoardPanel />
      <DailyBoardHud />
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
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col items-start gap-2 [&>*]:pointer-events-auto">
        <WorldClock />
        <NeedsHud stacked />
      </div>
      <SettingsDrawer />
      <SleepOverlay />
      <RewardPanel />
      <StoryToast />
      {/* 消息面板挂在游戏里而不是 App 里：消息记录属于**这个世界**，
          标题界面上还没有世界，开个输入框对着空气打字没有意义 */}
      <ChatPanel />
      <SpeechBubble scene={scene} />
      <EscMenu />
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
