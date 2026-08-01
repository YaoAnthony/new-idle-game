import {
  DayPhaseId,
  WeatherKind,
  findItemDefinition,
  type StorySignalKind,
} from "core";
import { useEffect, useRef, useState } from "react";
import { ActionHub } from "../Components/ActionHub/ActionHub";
import { Backpack } from "../Components/Backpack/Backpack";
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
import { TutorialGuide } from "../Components/TutorialGuide/TutorialGuide";
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
import { getHeld } from "../Game/State/heldItem";
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 读档进来时行李和屋里的东西都已经在存档里了，再铺一遍会凭空多出物品
    if (!loadedFromSave) seedInitialInventory();

    // 时钟必须最先起：天气要读世界日，剧情与行动要读时间
    const stopClock = startClock();
    const stopWeather = startWeather();
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

    const stopStory = startStorySystem(!loadedFromSave);
    const stopAutosave = startAutosave();

    const scene = new RoomScene(container, { seedFurniture: !loadedFromSave });
    setScene(scene);

    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    const ok = (message: string): CommandResult => ({ ok: true, message });

    const unregister = [
      registerCommand({
        name: "time",
        usage: "time <dawn|day|dusk|night>",
        description: "把世界时钟拨到某个时段（光照/天空/音景一起跟着变）",
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
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" />
      {/* 快捷栏只管选中；"使用"（吃 / 进布置模式）统一走 F，见 RoomScene */}
      <Hotbar />
      <HeldItem />
      <InteractBubble scene={scene} />
      {/* 家具从背包也能直接进布置模式了——原来只有快捷栏能进，
          得先把家具拖到快捷栏才摆得了，白绕一步 */}
      <Backpack />
      <StationPanel />
      <StoragePanel />
      <DialoguePanel />
      <ActionHub />
      <NeedsHud />
      <WorldClock />
      <SettingsDrawer />
      <TutorialGuide />
      <SleepOverlay />
      <RewardPanel />
      <StoryToast />
    </>
  );
}
