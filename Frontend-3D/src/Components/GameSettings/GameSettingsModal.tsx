import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  const reduceMotion = useReducedMotion();
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

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute inset-0 z-40 grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.14 }}
            onClick={() => setOpen(false)}
          >
            <motion.section
              className="pixel-panel flex max-h-[min(680px,92dvh)] w-[min(760px,94vw)] flex-col overflow-hidden bg-[#f0dfad] text-[#3a281d]"
              role="dialog"
              aria-label={t("ui.settings.title")}
              initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex items-center justify-between border-b-2 border-[#8a6239] px-5 py-3">
                <h2 className="m-0 text-[clamp(16px,2.6vw,20px)] font-black">
                  {t("ui.settings.title")}
                </h2>
                <button
                  type="button"
                  className="grid size-8 place-items-center border-2 border-[#5b3c29] bg-[#dfc485] text-[#513321] transition-colors hover:bg-[#eed79d]"
                  aria-label={t("ui.settings.close")}
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </header>

              <nav
                className="flex flex-wrap gap-1.5 border-b-2 border-[#8a6239] bg-[#e5cc93] p-2"
                aria-label={t("ui.settings.title")}
              >
                {SETTINGS_TABS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={tab === entry.id}
                    className={[
                      "min-h-8 cursor-pointer border-2 border-[#7a5235] px-3 text-[13px] font-extrabold transition-colors",
                      tab === entry.id
                        ? "bg-[#d9ad68] text-[#2c2119]"
                        : "bg-[#f0dfad] text-[#6b4c33] hover:bg-[#eed79d]",
                    ].join(" ")}
                    onClick={() => setTab(entry.id)}
                  >
                    {t(entry.labelKey)}
                  </button>
                ))}
              </nav>

              <div className="flex-1 overflow-y-auto px-5 py-4 text-[13px]">
                {tab === "world" && (
                  <div className="flex flex-col gap-5">
                    <section>
                      <SectionTitle>{t("ui.settings.time")}</SectionTitle>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {QUICK_PHASES.map((entry) => (
                          <button
                            key={entry.phase}
                            type="button"
                            className="flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-1 border-2 border-[#7a5235] bg-[#e5cc93] font-extrabold transition-colors hover:bg-[#eed79d]"
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
                                "flex cursor-pointer flex-col items-start gap-0.5 border-2 border-[#7a5235] p-2 text-left transition-colors",
                                active
                                  ? "bg-[#d9ad68]"
                                  : "bg-[#e5cc93] hover:bg-[#eed79d]",
                              ].join(" ")}
                              onClick={() => chooseWeather(choice.id)}
                            >
                              <span className="font-extrabold">
                                <span aria-hidden="true">{choice.icon}</span>{" "}
                                {choice.id === "auto"
                                  ? t("ui.settings.weather_auto")
                                  : t(`weather.${choice.id}`)}
                              </span>
                              <span className="text-[11px] text-[#6b4c33]">
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
                          className="size-4 accent-[#8d5d34]"
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
                      <p className="m-0 text-[12px] text-[#6b4c33]">
                        {currentTrackLabel() ??
                          t("ui.settings.music_none")}
                        {currentAlbumLabel() ? ` · ${currentAlbumLabel()}` : ""}
                      </p>
                      <button
                        type="button"
                        className="w-fit cursor-pointer border-2 border-[#7a5235] bg-[#e5cc93] px-3 py-1.5 font-extrabold transition-colors hover:bg-[#eed79d]"
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
                          "flex cursor-pointer items-center gap-3 border-2 border-[#7a5235] p-2.5 text-left transition-colors",
                          locale === choice.id
                            ? "bg-[#d9ad68]"
                            : "bg-[#e5cc93] hover:bg-[#eed79d]",
                        ].join(" ")}
                        onClick={() => chooseLocale(choice.id)}
                      >
                        <span
                          className="grid size-8 shrink-0 place-items-center border-2 border-[#7a5235] bg-[#f0dfad] font-black"
                          aria-hidden="true"
                        >
                          {choice.icon}
                        </span>
                        <span className="flex flex-col">
                          <span className="font-extrabold">
                            {t(choice.titleKey)}
                          </span>
                          <span className="text-[11px] text-[#6b4c33]">
                            {t(choice.subtitleKey)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </section>
                )}

                {tab === "controls" && (
                  <div className="flex flex-col gap-5">
                    <p className="m-0 text-[12px] text-[#6b4c33]">
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
                                  "min-w-[104px] cursor-pointer border-2 border-[#65452f] px-2 py-1 font-mono text-[12px] font-extrabold transition-colors",
                                  capturing === action
                                    ? "animate-pulse bg-[#d9ad68]"
                                    : "bg-[#e5cc93] hover:bg-[#eed79d]",
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
                      className="w-fit cursor-pointer border-2 border-[#7a5235] bg-[#e5cc93] px-3 py-1.5 font-extrabold transition-colors hover:bg-[#eed79d]"
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
                    <p className="m-0 text-[12px] text-[#6b4c33]">
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
                          <p className="m-0 text-[11px] text-[#6b4c33]">
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
                  className="m-0 border-t-2 border-[#8a6239] bg-[#e3c98e] px-5 py-2 text-[12px] font-extrabold"
                  role="status"
                >
                  {notice}
                </p>
              ) : null}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-0 text-[12px] font-black tracking-widest text-[#8a6239]">
      {children}
    </h3>
  );
}
