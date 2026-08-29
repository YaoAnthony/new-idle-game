import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { unlockAudio } from "../../Game3D/Engine/AudioEngine";
import {
  applyAudioSettings,
  loadAudioSettings,
  saveAudioSettings,
  type AudioChannel,
  type StoredAudioSettings,
} from "../../Game3D/Engine/audioSettings";
import {
  currentAlbumLabel,
  currentTrackLabel,
  cycleMusicMode,
  getMusicMode,
} from "../../Game3D/Engine/MusicDirector";
import { on } from "../../Game/EventBus";
import { listCommands } from "../../Game/CommandLine/commands";
import {
  INPUT_ACTION_GROUPS,
  bindingFromKeyboardEvent,
  getBindings,
  resetBindings,
  setBindings,
  subscribeBindings,
  type InputAction,
  type InputBindingsState,
} from "../../Game/Input/bindings";
import { debugJumpToPhase } from "../../Game/State/clock";
import {
  debugClearWeather,
  debugForceWeather,
  getWeather,
} from "../../Game/State/weather";
import { t } from "../../i18n/t";
import { Modal } from "../Modal/Modal";
import { usePanel } from "../PanelStack/usePanel";
import {
  LANGUAGE_CHOICES,
  MUSIC_MODE_LABELS,
  QUICK_PHASES,
  SETTINGS_TABS,
  WEATHER_CHOICES,
  type SettingsTabId,
} from "./tabs";

/**
 * 游戏内设置面板。**照抄 Oldfrontend 的 GameSettingsModal**：
 * 全屏弹窗 + 顶部五个标签页（世界 / 声音 / 界面 / 控制 / 调试）。
 *
 * 替换掉了原来的右侧抽屉——抽屉只装得下音量和一份只读键位表，而这个面板
 * 要放的东西（天气九宫格、键位重绑定、指令表）在 360px 宽里排不开。
 *
 * 纪律：**每一格都接着真东西**。老设计里那几项（智能 NPC、睡眠跳过、
 * 字体缩放、物理调试）对应的系统这边还没有，直接不摆——一个拨了没反应的
 * 开关比少一个开关糟得多，玩家会以为是坏了。
 */

const CHANNELS: Array<{ id: AudioChannel; labelKey: string }> = [
  { id: "master", labelKey: "ui.settings.master" },
  { id: "music", labelKey: "ui.settings.music" },
  { id: "ambience", labelKey: "ui.settings.ambience" },
  { id: "effects", labelKey: "ui.settings.effects" },
];

const LOCALE_KEY = "idle-home:locale";

export function GameSettingsModal() {
  // 挡屏面板，开关挂在全局面板栈上
  const [open, setOpen] = usePanel("settings");
  const [tab, setTab] = useState<SettingsTabId>("world");
  const [settings, setSettings] = useState<StoredAudioSettings>(() =>
    loadAudioSettings(),
  );
  const [bindings, setLocalBindings] = useState<InputBindingsState>(() =>
    getBindings(),
  );
  /** 正在等玩家按键的那个动作；null = 没在改键 */
  const [capturing, setCapturing] = useState<InputAction | null>(null);
  const [musicMode, setMusicMode] = useState(() => getMusicMode());
  const [weatherId, setWeatherId] = useState(() => getWeather().id);
  const [locale, setLocale] = useState(
    () => localStorage.getItem(LOCALE_KEY) ?? "zh",
  );
  /** 改完键位/语言要重启或重进才全生效的提示 */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(
    () =>
      on("ui_panel_requested", ({ panel }) => {
        if (panel === "settings") setOpen(true);
      }),
    [setOpen],
  );

  // 改了就立刻作用到音频总线并落盘——没有"确定"按钮，拖着就能听见
  useEffect(() => {
    applyAudioSettings(settings);
    saveAudioSettings(settings);
  }, [settings]);

  useEffect(() => subscribeBindings(setLocalBindings), []);

  /*
   * Esc 的两层语义还在，只是分工换了：**改键时**由下面那个 capture 阶段的
   * 监听吃掉（它 stopPropagation，事件根本到不了 window 的冒泡阶段，也就到不了
   * EscArbiter），取消这次改键；**没在改键时**事件正常走到 EscArbiter，
   * 由它弹栈关面板。玩家的手感不变：第一下取消改键，第二下才关面板。
   */

  /**
   * 改键捕获。**capture 阶段 + preventDefault**：不抢在冒泡前面的话，
   * 玩家为了绑定按下的那个键会被游戏当成一次真操作先执行一遍
   * （想把"扔东西"改到 B，结果背包先开了）。
   */
  useEffect(() => {
    if (!capturing) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setCapturing(null);
        return;
      }
      const binding = bindingFromKeyboardEvent(event);
      if (!binding) {
        setNotice(t("ui.settings.key_not_allowed"));
        return;
      }
      setBindings({ ...getBindings(), [capturing]: binding });
      setCapturing(null);
      setNotice(null);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [capturing]);

  const commands = useMemo(() => (open ? listCommands() : []), [open]);

  const update = (patch: Partial<StoredAudioSettings>): void => {
    // 拖滑块 / 点开关都是真实手势，正好用来解锁音频上下文
    unlockAudio();
    setSettings((current) => ({ ...current, ...patch }));
  };

  const chooseWeather = (id: string): void => {
    if (id === "auto") {
      debugClearWeather();
    } else {
      debugForceWeather(id);
    }
    setWeatherId(getWeather().id);
  };

  const chooseLocale = (id: string): void => {
    localStorage.setItem(LOCALE_KEY, id);
    setLocale(id);
    // i18n 词典目前只在启动时读一次，不重进看不到变化——说清楚而不是假装生效
    setNotice(t("ui.settings.language_restart"));
  };

  return (
    <>
      {/* 用户提供的图标（自带木框描边），hover 放大、按下缩小 */}
      <motion.button
        type="button"
        aria-label={t("ui.settings.title")}
        className={`hud-icon-btn hud-corner-btn hud-corner-btn--outer ${open ? "z-50" : "z-30"}`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          unlockAudio();
          setOpen((value) => !value);
        }}
      >
        <img src="/icons/button/setting.png" alt="" />
      </motion.button>

      {/*
        外壳交给 `Modal`，和行动 / 每日任务 / 背包同一套。原来这块是**第三套
        设计语言**——棕木羊皮纸（#f0dfad 底、深木描边、方角），和奶油手账、
        深色玻璃并存。三套语言同时活着才是"丑"的根因，比任何单屏的精修
        都要紧。48 处硬编码棕色已经按角色映射到统一色板。
        
        `instant`：设置是随手开关的东西，不该每次看一遍绽开仪式。
      */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        frameColor="#4a6b7c"
        paperColor="#fdfbf7"
        label={t("ui.settings.title")}
        instant
      >
        <div className="flex h-full flex-col overflow-hidden text-[#2b3b36]">
              <header className="flex items-center justify-between border-b-2 border-[#e2ddd3] px-5 py-3">
                <h2 className="m-0 text-[clamp(16px,2.6vw,20px)] font-black">
                  {t("ui.settings.title")}
                </h2>
                <button
                  type="button"
                  /* size-11 = 44px 触摸下限。原来 32×32，手指点不准 */
                  className="grid size-11 place-items-center border-2 border-[#e2ddd3] bg-[#eae4d8] text-[#2b3b36] transition-colors hover:bg-[#eae4d8]"
                  aria-label={t("ui.settings.close")}
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </header>

              <nav
                className="flex flex-wrap gap-1.5 border-b-2 border-[#e2ddd3] bg-[#f4efe6] p-2"
                aria-label={t("ui.settings.title")}
              >
                {SETTINGS_TABS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={tab === entry.id}
                    className={[
                      // min-h-11 = 44px 触摸下限。原来 32 高，五个页签排一行更难点
                      "min-h-11 cursor-pointer border-2 border-[#e2ddd3] px-3 text-[13px] font-extrabold transition-colors",
                      tab === entry.id
                        ? "bg-[#4a6b7c] text-[#fdfbf7]"
                        : "bg-[#fdfbf7] text-[#6b7a75] hover:bg-[#eae4d8]",
                    ].join(" ")}
                    onClick={() => setTab(entry.id)}
                  >
                    {t(entry.labelKey)}
                  </button>
                ))}
              </nav>

              {/*
                **min-h-0 缺一不可。** flex 子项的 min-height 默认是 auto，
                所以光有 flex-1 + overflow-y-auto 它照样不肯缩到内容高度以下：
                面板设了 max-h 和 overflow-hidden，多出来的部分被裁掉——
                在 375 高的基准机上，「世界」页天气那一行整排被切在屏幕外
                （实测 bottom=396），三种天气一个都点不到，而且没有滚动条
                提示还有东西。加上 min-h-0 它才真的开始滚。
              */}
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px]">
                {tab === "world" && (
                  <div className="flex flex-col gap-5">
                    <section>
                      <SectionTitle>{t("ui.settings.time")}</SectionTitle>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {QUICK_PHASES.map((entry) => (
                          <button
                            key={entry.phase}
                            type="button"
                            className="flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-1 border-2 border-[#e2ddd3] bg-[#f4efe6] font-extrabold transition-colors hover:bg-[#eae4d8]"
                            onClick={() => debugJumpToPhase(entry.phase)}
                          >
                            <span aria-hidden="true">{entry.icon}</span>
                            <span>{t(entry.labelKey)}</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section>
                      <SectionTitle>{t("ui.settings.weather")}</SectionTitle>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {WEATHER_CHOICES.map((choice) => {
                          const active =
                            choice.id === "auto"
                              ? false
                              : weatherId === choice.id;
                          return (
                            <button
                              key={choice.id}
                              type="button"
                              aria-pressed={active}
                              className={[
                                "flex cursor-pointer flex-col items-start gap-0.5 border-2 border-[#e2ddd3] p-2 text-left transition-colors",
                                active
                                  ? "bg-[#4a6b7c] text-[#fdfbf7]"
                                  : "bg-[#f4efe6] hover:bg-[#eae4d8]",
                              ].join(" ")}
                              onClick={() => chooseWeather(choice.id)}
                            >
                              <span className="font-extrabold">
                                <span aria-hidden="true">{choice.icon}</span>{" "}
                                {choice.id === "auto"
                                  ? t("ui.settings.weather_auto")
                                  : t(`weather.${choice.id}`)}
                              </span>
                              <span className="text-[11px] text-[#6b7a75]">
                                {t(choice.descKey)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                )}

                {tab === "audio" && (
                  <div className="flex flex-col gap-5">
                    <section className="flex flex-col gap-2">
                      <SectionTitle>{t("ui.settings.sound")}</SectionTitle>
                      <label className="flex cursor-pointer items-center justify-between font-bold">
                        <span>{t("ui.settings.mute")}</span>
                        <input
                          type="checkbox"
                          className="size-4 accent-[#e2ddd3]"
                          checked={settings.muted}
                          onChange={(event) =>
                            update({ muted: event.target.checked })
                          }
                        />
                      </label>

                      {CHANNELS.map(({ id, labelKey }) => (
                        <label
                          key={id}
                          className="grid grid-cols-[86px_1fr_44px] items-center gap-2"
                        >
                          <span>{t(labelKey)}</span>
                          <input
                            type="range"
                            className="pixel-range"
                            min={0}
                            max={100}
                            step={1}
                            value={settings[id]}
                            aria-label={t(labelKey)}
                            disabled={settings.muted && id !== "master"}
                            onChange={(event) =>
                              update({ [id]: Number(event.target.value) })
                            }
                          />
                          <output className="text-right tabular-nums">
                            {settings[id]}
                          </output>
                        </label>
                      ))}
                    </section>

                    <section className="flex flex-col gap-2">
                      <SectionTitle>{t("ui.settings.music_now")}</SectionTitle>
                      <p className="m-0 text-[12px] text-[#6b7a75]">
                        {currentTrackLabel() ??
                          t("ui.settings.music_none")}
                        {currentAlbumLabel() ? ` · ${currentAlbumLabel()}` : ""}
                      </p>
                      <button
                        type="button"
                        className="w-fit cursor-pointer border-2 border-[#e2ddd3] bg-[#f4efe6] px-3 py-1.5 font-extrabold transition-colors hover:bg-[#eae4d8]"
                        onClick={() => setMusicMode(cycleMusicMode())}
                      >
                        {t("ui.settings.music_mode")}：
                        {t(MUSIC_MODE_LABELS[musicMode] ?? musicMode)}
                      </button>
                    </section>
                  </div>
                )}

                {tab === "interface" && (
                  <section className="flex flex-col gap-2">
                    <SectionTitle>{t("ui.settings.language")}</SectionTitle>
                    {LANGUAGE_CHOICES.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        aria-pressed={locale === choice.id}
                        className={[
                          "flex cursor-pointer items-center gap-3 border-2 border-[#e2ddd3] p-2.5 text-left transition-colors",
                          locale === choice.id
                            ? "bg-[#4a6b7c] text-[#fdfbf7]"
                            : "bg-[#f4efe6] hover:bg-[#eae4d8]",
                        ].join(" ")}
                        onClick={() => chooseLocale(choice.id)}
                      >
                        <span
                          className="grid size-8 shrink-0 place-items-center border-2 border-[#e2ddd3] bg-[#fdfbf7] font-black"
                          aria-hidden="true"
                        >
                          {choice.icon}
                        </span>
                        <span className="flex flex-col">
                          <span className="font-extrabold">
                            {t(choice.titleKey)}
                          </span>
                          <span className="text-[11px] text-[#6b7a75]">
                            {t(choice.subtitleKey)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </section>
                )}

                {tab === "controls" && (
                  <div className="flex flex-col gap-5">
                    <p className="m-0 text-[12px] text-[#6b7a75]">
                      {t("ui.settings.rebind_hint")}
                    </p>

                    {INPUT_ACTION_GROUPS.map((group) => (
                      <section key={group.titleKey}>
                        <SectionTitle>{t(group.titleKey)}</SectionTitle>
                        <div className="flex flex-col gap-1">
                          {group.actions.map((action) => (
                            <div
                              key={action}
                              className="flex items-center justify-between gap-3 border-b border-[rgb(85_58_39_/_0.24)] py-1.5"
                            >
                              <span className="font-bold">
                                {t(`ui.settings.action_${action}`)}
                              </span>
                              <button
                                type="button"
                                className={[
                                  "min-w-[104px] cursor-pointer border-2 border-[#8a9a94] px-2 py-1 font-mono text-[12px] font-extrabold transition-colors",
                                  capturing === action
                                    ? "animate-pulse bg-[#4a6b7c]"
                                    : "bg-[#f4efe6] hover:bg-[#eae4d8]",
                                ].join(" ")}
                                onClick={() => setCapturing(action)}
                              >
                                {capturing === action
                                  ? t("ui.settings.press_a_key")
                                  : bindings[action].labels.join(" / ")}
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}

                    <button
                      type="button"
                      className="w-fit cursor-pointer border-2 border-[#e2ddd3] bg-[#f4efe6] px-3 py-1.5 font-extrabold transition-colors hover:bg-[#eae4d8]"
                      onClick={() => {
                        resetBindings();
                        setNotice(null);
                      }}
                    >
                      {t("ui.settings.reset_keys")}
                    </button>
                  </div>
                )}

                {tab === "debug" && (
                  <section className="flex flex-col gap-2">
                    <SectionTitle>{t("ui.settings.commands")}</SectionTitle>
                    <p className="m-0 text-[12px] text-[#6b7a75]">
                      {t("ui.settings.commands_hint")}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {commands.map((command) => (
                        <div
                          key={command.name}
                          className="border-b border-[rgb(85_58_39_/_0.24)] pb-1.5"
                        >
                          <code className="font-mono text-[12px] font-extrabold">
                            {command.usage}
                          </code>
                          <p className="m-0 text-[11px] text-[#6b7a75]">
                            {command.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {notice ? (
                <p
                  className="m-0 border-t-2 border-[#e2ddd3] bg-[#eae4d8] px-5 py-2 text-[12px] font-extrabold"
                  role="status"
                >
                  {notice}
                </p>
              ) : null}
        </div>
      </Modal>
    </>
  );
}

/*
 * 分区标题（时间 / 天气 / 语言）。
 *
 * 用 #6b7a75 不用 #e2ddd3：后者是**描边色**，当文字色使就是浅底上的
 * 更浅字，几乎读不出来。色号映射时把原来的深棕 #8a6239 连同一批边框
 * 一起换成了描边色——单看色号"角色对得上"，放回上下文才发现它这儿
 * 承担的是文字不是边。
 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-0 text-[12px] font-black tracking-widest text-[#6b7a75]">
      {children}
    </h3>
  );
}
