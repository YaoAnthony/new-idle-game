import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { logout } from "../../Features/Auth/authBridge";
import { LoginDialog } from "../../Features/Auth/LoginDialog";
import { unlockAudio } from "../../Game3D/Engine/AudioEngine";
import { applyAudioSettings } from "../../Game3D/Engine/audioSettings";
import type { RootState } from "../../Redux/store";
import { GameBtn } from "../GameBtn";
import {
  type AudioChannel,
  type AudioSettings,
  type TitleScreenConfig,
  type TitleSessionSelection,
} from "./config";
import { TITLE_SCREEN_COPY, type TitleLocale } from "./content";
import "./TitleScreen.css";

type ActiveDialog = "start" | "settings" | null;

type TitleScreenProps = {
  config: TitleScreenConfig;
  /** 游客格子：开新档（有档时组件内先过一道覆盖确认） */
  onSessionSelected?: (selection: TitleSessionSelection) => void;
  /**
   * 已登录时点账户格子：**以账户身份进入小家**。有档继续、没档新开，
   * 判断在 App 那头（要等云对账落定才知道"有没有档"）——这里只负责转告。
   */
  onAccountEnter?: () => void;
  /** 本地存在可继续的存档时才显示"继续游戏"（V0.1 的可选小号入口） */
  canContinue?: boolean;
  onContinue?: () => void;
};

const STANDARD_EASE = [0.16, 1, 0.3, 1] as const;

function readStoredSettings(config: TitleScreenConfig): AudioSettings {
  try {
    const stored = localStorage.getItem(config.persistence.settingsKey);
    if (!stored) return config.audio.defaults;

    return {
      ...config.audio.defaults,
      ...(JSON.parse(stored) as Partial<AudioSettings>),
    };
  } catch {
    return config.audio.defaults;
  }
}

function readStoredLocale(config: TitleScreenConfig): TitleLocale {
  const storedLocale = localStorage.getItem(config.persistence.localeKey);
  const isSupported = config.locales.some(
    (locale) => locale.id === storedLocale,
  );

  return isSupported ? (storedLocale as TitleLocale) : config.defaultLocale;
}

export function TitleScreen({
  config,
  onSessionSelected,
  onAccountEnter,
  canContinue = false,
  onContinue,
}: TitleScreenProps) {
  const reduceMotion = useReducedMotion();
  const [locale, setLocale] = useState<TitleLocale>(() =>
    readStoredLocale(config),
  );
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  /** 开始弹窗里的两个页面：选择格子 / 登录表单 */
  const [startView, setStartView] = useState<"choices" | "login">("choices");
  const account = useSelector((state: RootState) => state.user);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    readStoredSettings(config),
  );
  const [notice, setNotice] = useState<string | null>(null);
  /** "开新档会覆盖进度"的二次确认：第一次点是警告，第二次才真开 */
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);
  const copy = TITLE_SCREEN_COPY[locale];

  const activeLocale = useMemo(
    () =>
      config.locales.find((item) => item.id === locale) ??
      config.locales.find((item) => item.id === config.defaultLocale) ??
      config.locales[0],
    [config, locale],
  );

  useEffect(() => {
    localStorage.setItem(
      config.persistence.settingsKey,
      JSON.stringify(audioSettings),
    );

    /**
     * 光写存储不够——还得真的作用到音频总线上，否则拖滑块没反应。
     * 在标题页就应用是刻意的：这里能一边拖一边听（标题页有音乐）。
     */
    applyAudioSettings(audioSettings);
  }, [audioSettings, config.persistence.settingsKey]);

  useEffect(() => {
    if (!activeLocale) return;

    localStorage.setItem(config.persistence.localeKey, locale);
    document.documentElement.lang = activeLocale.htmlLanguage;
  }, [activeLocale, config.persistence.localeKey, locale]);

  /*
   * 这里原来会 preloadEssentialAudio() 预热底噪和雨声。删掉了：
   * 标题页跑得**太早**——存档还没灌进运行时，getRoomStyle() 还是默认的
   * 森林小屋，于是海边存档在这一页白下一条 5 MB 的森林底噪，
   * 真正要用的海浪声一个字节都没预热。
   *
   * 预热挪到了标题页之后的加载页（App 的 loading 阶段 →
   * Game3D/Engine/worldPreload），那时候才知道这是哪个世界。
   */

  const closeDialog = () => {
    setActiveDialog(null);
    setNotice(null);
    setStartView("choices");
    // 确认态不跨弹窗保留：关了再开，第一次点依然要先看到警告
    setConfirmingNewGame(false);
  };

  const selectLocale = (nextLocale: TitleLocale) => {
    setLocale(nextLocale);
    setNotice(null);
  };

  const updateVolume = (key: AudioChannel, value: number) => {
    // 拖滑块是真实手势，正好用来解锁音频上下文（浏览器要求）
    unlockAudio();
    setAudioSettings((current) => ({ ...current, [key]: value }));
  };

  const startSession = () => {
    localStorage.setItem(
      config.persistence.sessionModeKey,
      config.session.mode,
    );
    onSessionSelected?.(config.session);
    closeDialog();
  };

  const selectStartChoice = (
    choice: TitleScreenConfig["startChoices"][number],
  ) => {
    if (choice.action === "start_session") {
      /*
       * 这条路的终点是捏脸 + 新档。本地已有进度时**必须拦一手**：
       * 一次误点就是"世界被空档顶掉"，登录态下 120 秒内还会同步出去
       * 把云端也顶掉——实测真的有人这么丢过一分钟的家具。
       * 二次确认沿用 notice 条，不新开弹窗。
       */
      if (canContinue && !confirmingNewGame) {
        setConfirmingNewGame(true);
        setNotice(copy.newGameOverwrite);
        return;
      }
      startSession();
      return;
    }

    if (choice.action === "open_login") {
      /*
       * 已登录时这个格子的职责是**"以账户身份进入小家"**，不是开新档——
       * 接错到 startSession 的后果见上面那段注释（实测踩过：进了捏脸页，
       * 存档被顶）。有没有档、该继续还是该新开，由 App 那头对账后判断。
       */
      if (account.status === "authed") {
        onAccountEnter?.();
        closeDialog();
        return;
      }
      setNotice(null);
      setStartView("login");
      return;
    }

    setNotice(copy[choice.noticeCopyKey]);
  };

  if (!activeLocale) return null;

  return (
    <section
      className="relative z-[1] grid h-[100dvh] min-h-0 place-items-center overflow-hidden text-[#f8edc8] max-sm:place-items-start"
      aria-label={copy.titleAlt}
    >
      <div
        className="title-screen-locale absolute right-[clamp(14px,2.5vw,30px)] top-[clamp(14px,2.5vw,28px)] z-[2] inline-grid grid-flow-col gap-0.5 border-2 border-[#342218] bg-[rgb(39_29_21_/_0.88)] p-[3px] shadow-[0_4px_0_rgb(15_18_14_/_0.3)] max-sm:right-3 max-sm:top-3"
        role="group"
        aria-label={copy.localeLabel}
      >
        {config.locales.map((localeOption) => {
          const isActive = localeOption.id === locale;

          return (
            <button
              type="button"
              key={localeOption.id}
              className={[
                "title-screen-locale-option min-h-8 min-w-[68px] cursor-pointer border-0 px-3 text-[13px] font-bold tracking-normal transition-colors hover:bg-[#59402b] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#fff0ad] max-sm:min-h-[30px] max-sm:min-w-[58px] max-sm:px-2 max-sm:text-xs",
                isActive
                  ? "bg-[#d9ad68] text-[#2c2119]"
                  : "bg-transparent text-[#eadbb5]",
              ].join(" ")}
              aria-pressed={isActive}
              onClick={() => selectLocale(localeOption.id)}
            >
              {localeOption.buttonLabel}
            </button>
          );
        })}
      </div>

      <motion.div
        className="title-screen-content flex min-h-[min(700px,92dvh)] w-[min(760px,86vw)] flex-col items-center justify-center px-5 pb-[30px] pt-[clamp(54px,8dvh,92px)] max-sm:min-h-[100dvh] max-sm:pt-[72px] [@media(max-height:620px)]:min-h-[100dvh] [@media(max-height:620px)]:pt-[54px]"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.62, ease: STANDARD_EASE }
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={locale}
            className="title-screen-title block max-h-[33dvh] w-[min(720px,82vw)] select-none object-contain [filter:drop-shadow(0_6px_0_rgb(36_21_13_/_0.55))] [image-rendering:pixelated] max-sm:max-h-[29dvh] max-sm:w-[92vw] [@media(max-height:620px)]:max-h-[27dvh]"
            src={activeLocale.titleImage}
            alt={copy.titleAlt}
            draggable={false}
            initial={reduceMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          />
        </AnimatePresence>

        <div className="title-screen-actions mt-[clamp(10px,1.8dvh,20px)] grid w-[min(290px,76vw)] gap-2.5 max-sm:w-[min(260px,80vw)] [@media(max-height:620px)]:mt-1 [@media(max-height:620px)]:gap-1.5">
          {canContinue ? (
            <GameBtn
              className="title-screen-continue-button"
              size="lg"
              fullWidth
              onClick={() => onContinue?.()}
            >
              {copy.continueGame}
            </GameBtn>
          ) : null}
          <GameBtn
            className="title-screen-primary-button"
            size={canContinue ? "md" : "lg"}
            fullWidth
            onClick={() => setActiveDialog("start")}
          >
            {copy.start}
          </GameBtn>
          <GameBtn
            className="title-screen-secondary-button"
            size="md"
            fullWidth
            onClick={() => setActiveDialog("settings")}
          >
            {copy.settings}
          </GameBtn>
        </div>
      </motion.div>

      <AnimatePresence>
        {activeDialog ? (
          <Dialog
            static
            open
            onClose={closeDialog}
            className="relative z-10"
          >
            <motion.div
              className="fixed inset-0 z-10 bg-[rgb(9_14_12_/_0.72)] backdrop-blur-[2px]"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.15 }}
              aria-hidden="true"
            />

            <div className="title-screen-dialog-layer fixed inset-0 z-20 grid place-items-center overflow-y-auto p-5">
              <motion.div
                className={
                  activeDialog === "start"
                    ? "title-screen-start-frame w-[min(700px,94vw)]"
                    : "w-[min(590px,92vw)]"
                }
                initial={
                  reduceMotion ? false : { opacity: 0, y: 8, scale: 0.99 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 8, scale: 0.99 }
                }
                transition={{
                  duration: reduceMotion ? 0 : 0.18,
                  ease: STANDARD_EASE,
                }}
              >
                <DialogPanel className="title-screen-dialog-panel pixel-panel max-h-[calc(100dvh-40px)] w-full overflow-y-auto bg-[#f0dfad] text-[#3a281d] outline-none shadow-[0_16px_34px_rgb(11_14_11_/_0.44)]">
                  {activeDialog === "start" ? (
                    <div className="title-screen-start-content relative flex flex-col items-center p-[clamp(18px,4vw,32px)]">
                      <DialogTitle className="sr-only">
                        {copy.startDialogTitle}
                      </DialogTitle>

                      <button
                        type="button"
                        className="title-screen-close absolute right-3 top-3 z-[2] grid size-9 place-items-center border-2 border-[#5b3c29] bg-[#dfc485] text-[#513321] transition-colors hover:bg-[#eed79d] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#8d5d34]"
                        aria-label={copy.back}
                        onClick={closeDialog}
                      >
                        <XMarkIcon className="size-6" aria-hidden="true" />
                      </button>

                      {startView === "login" ? (
                        <div className="flex w-full max-w-[380px] flex-col items-center gap-3 pt-7">
                          <h2 className="m-0 text-[clamp(18px,3vw,24px)] font-black text-[#352219]">
                            {copy.loginDialogTitle}
                          </h2>
                          <LoginDialog onDone={() => setStartView("choices")} />
                          <button
                            type="button"
                            className="cursor-pointer border-0 bg-transparent text-xs font-bold text-[#6b4c33] underline"
                            onClick={() => setStartView("choices")}
                          >
                            {copy.back}
                          </button>
                        </div>
                      ) : (
                      <div className="title-screen-start-options grid w-full grid-cols-2 gap-[clamp(10px,2.4vw,22px)] pt-7">
                        {config.startChoices.map((choice) => (
                          <motion.button
                            type="button"
                            className="session-choice group relative flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center gap-2 px-[clamp(8px,2vw,18px)] pb-[clamp(12px,2vw,20px)] pt-[clamp(14px,2vw,22px)] text-[#3b2519] outline-none"
                            key={choice.id}
                            onClick={() => selectStartChoice(choice)}
                            whileHover={
                              reduceMotion ? undefined : { y: -3, scale: 1.01 }
                            }
                            whileTap={
                              reduceMotion ? undefined : { y: 1, scale: 0.99 }
                            }
                            transition={{ duration: 0.12 }}
                          >
                            <img
                              className="session-choice-icon min-h-0 w-[min(78%,190px)] flex-1 object-contain [image-rendering:pixelated] [filter:drop-shadow(0_3px_0_rgb(69_42_24_/_0.18))]"
                              src={choice.icon}
                              alt=""
                              draggable={false}
                            />
                            <span className="relative z-[1] text-[clamp(15px,2.2vw,20px)] font-black leading-none">
                              {choice.action === "open_login" && account.status === "authed"
                                ? account.user?.email
                                : copy[choice.copyKey]}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                      )}

                      {startView === "choices" && account.status === "authed" ? (
                        <p className="m-0 mt-3 text-xs font-bold text-[#6b4c33]">
                          {copy.loggedInAs}：{account.user?.email}
                          <button
                            type="button"
                            className="ml-2 cursor-pointer border-0 bg-transparent text-xs font-bold text-[#8d5d34] underline"
                            onClick={() => logout()}
                          >
                            {copy.logout}
                          </button>
                        </p>
                      ) : null}

                      <AnimatePresence initial={false}>
                        {notice ? (
                          <motion.p
                            className="mb-0 mt-3 border-2 border-[#7a5235] bg-[#e3c98e] px-3 py-1 text-xs font-extrabold leading-normal text-[#4b3324]"
                            role="status"
                            initial={
                              reduceMotion ? false : { opacity: 0, y: -4 }
                            }
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.15 }}
                          >
                            {notice}
                          </motion.p>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="title-screen-settings-content flex flex-col items-center p-[clamp(18px,4vw,32px)]">
                      <DialogTitle className="title-screen-settings-title m-0 text-center text-[clamp(24px,5vw,32px)] font-black leading-tight text-[#352219]">
                        {copy.settingsTitle}
                      </DialogTitle>

                      <div className="title-screen-settings-sound mt-[18px] w-full">
                        <h2 className="mb-2.5 mt-0 text-[17px] font-black text-[#4d3324]">
                          {copy.soundTitle}
                        </h2>

                        <label className="mb-2 flex min-h-[38px] cursor-pointer items-center justify-between gap-3.5 text-sm font-extrabold text-[#513927]">
                          <span>{copy.muteAll}</span>
                          <input
                            className="peer sr-only"
                            type="checkbox"
                            checked={audioSettings.muted}
                            onChange={(event) => {
                              // 取消静音可能是玩家的第一个手势，顺便解锁音频
                              unlockAudio();
                              const { checked } = event.target;
                              setAudioSettings((current) => ({
                                ...current,
                                muted: checked,
                              }));
                            }}
                          />
                          <span
                            className="pixel-switch peer-checked:bg-[#608052] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#8d5d34]"
                            aria-hidden="true"
                          />
                        </label>

                        <div className="grid gap-2">
                          {config.audio.channels.map(({ id, copyKey }) => {
                            const label = copy[copyKey];

                            return (
                              <label
                                className="title-screen-volume-row grid min-h-[34px] grid-cols-[minmax(88px,1fr)_minmax(130px,2fr)_44px] items-center gap-2.5 text-[13px] font-bold text-[#563c2a] max-sm:grid-cols-[84px_minmax(96px,1fr)_38px] max-sm:gap-[7px]"
                                key={id}
                              >
                                <span>{label}</span>
                                <input
                                  className="pixel-range"
                                  type="range"
                                  min={config.audio.range.min}
                                  max={config.audio.range.max}
                                  step={config.audio.range.step}
                                  value={audioSettings[id]}
                                  aria-label={label}
                                  onChange={(event) =>
                                    updateVolume(id, Number(event.target.value))
                                  }
                                />
                                <output className="text-right">
                                  {audioSettings[id]}
                                  {config.audio.range.unit}
                                </output>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="title-screen-settings-controls mt-[18px] w-full">
                        <h2 className="mb-2.5 mt-0 text-[17px] font-black text-[#4d3324]">
                          {copy.controlsTitle}
                        </h2>
                        <dl className="title-screen-controls-list mb-[22px] grid gap-1.5">
                          {config.controls.map((control) => (
                            <div
                              className="title-screen-control-row grid min-h-[34px] grid-cols-[1fr_auto] items-center gap-4 border-b border-[rgb(85_58_39_/_0.24)] pb-1.5"
                              key={control.id}
                            >
                              <dt className="text-[13px] font-extrabold">
                                {copy[control.copyKey]}
                              </dt>
                              <dd className="m-0 border-2 border-[#65452f] bg-[#e5cc93] px-2 py-1 font-mono text-xs font-extrabold text-[#3e2b20]">
                                {control.binding}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <GameBtn
                        className="title-screen-settings-done"
                        size="sm"
                        onClick={closeDialog}
                      >
                        {copy.done}
                      </GameBtn>
                    </div>
                  )}
                </DialogPanel>
              </motion.div>
            </div>
          </Dialog>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
