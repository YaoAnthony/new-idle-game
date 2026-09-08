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
import { HouseMark } from "../Brand";
import { SaveSlotsPanel } from "../SaveSlots";
import type { SaveSlotId } from "../../Data/Save/slots";
import {
  type AudioChannel,
  type AudioSettings,
  type TitleScreenConfig,
} from "./config";
import { TITLE_SCREEN_COPY, type TitleLocale } from "./content";
import "./TitleScreen.css";

type ActiveDialog = "start" | "settings" | null;

type TitleScreenProps = {
  config: TitleScreenConfig;
  /** 存档页：进这个槽里已经有的那个家 */
  onEnterSlot?: (slot: SaveSlotId) => void;
  /** 存档页：在这个空槽开新档（走捏脸） */
  onCreateInSlot?: (slot: SaveSlotId) => void;
  /** 上次玩的那个槽里有档时才显示"继续游戏"（不用进存档页的快捷入口） */
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
  onEnterSlot,
  onCreateInSlot,
  canContinue = false,
  onContinue,
}: TitleScreenProps) {
  const reduceMotion = useReducedMotion();
  const [locale, setLocale] = useState<TitleLocale>(() =>
    readStoredLocale(config),
  );
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  /** 开始弹窗里的两个页面：存档页 / 登录表单 */
  const [startView, setStartView] = useState<"slots" | "login">("slots");
  const account = useSelector((state: RootState) => state.user);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    readStoredSettings(config),
  );
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
    setStartView("slots");
  };

  const selectLocale = (nextLocale: TitleLocale) => {
    setLocale(nextLocale);
  };

  const updateVolume = (key: AudioChannel, value: number) => {
    // 拖滑块是真实手势，正好用来解锁音频上下文（浏览器要求）
    unlockAudio();
    setAudioSettings((current) => ({ ...current, [key]: value }));
  };

  if (!activeLocale) return null;

  return (
    <section
      className="title-stage relative z-[1] grid h-[100dvh] min-h-0 place-items-center overflow-hidden max-sm:place-items-start"
      aria-label={copy.titleAlt}
    >
      <div
        className="title-locale absolute right-[clamp(14px,2.5vw,30px)] top-[clamp(14px,2.5vw,28px)] z-[2] max-sm:right-3 max-sm:top-3"
        role="group"
        aria-label={copy.localeLabel}
      >
        {config.locales.map((localeOption) => {
          const isActive = localeOption.id === locale;

          return (
            <button
              type="button"
              key={localeOption.id}
              className="title-locale-option"
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
          {/*
            原来这里是两张像素风 PNG（title-zh / title-ja）。整块界面换成
            日记本那套柔和语言之后，那张招牌是全屏唯一的硬像素边缘，
            比任何一处都先跳出来——用户 2026-09-07 拍板"扔掉，自己搞一个"。
            现在是**排版 + 一枚自绘小房子**：字随语言换（copy.titleAlt），
            不用再为每种语言备一张图。
          */}
          <motion.div
            key={locale}
            className="title-mark w-[min(720px,86vw)] select-none"
            initial={reduceMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <span className="title-mark__badge" aria-hidden="true">
              <HouseMark />
            </span>
            <h1 className="title-wordmark">{copy.titleAlt}</h1>
          </motion.div>
        </AnimatePresence>

        <div className="title-screen-actions mt-[clamp(10px,1.8dvh,20px)] grid w-[min(290px,76vw)] gap-2.5 max-sm:w-[min(260px,80vw)] [@media(max-height:620px)]:mt-1 [@media(max-height:620px)]:gap-1.5">
          {canContinue ? (
            <GameBtn
              className="title-screen-continue-button"
              size="lg"
              tone="mint"
              fullWidth
              onClick={() => onContinue?.()}
            >
              {copy.continueGame}
            </GameBtn>
          ) : null}
          <GameBtn
            className="title-screen-primary-button"
            size={canContinue ? "md" : "lg"}
            /* 有档可继续时主动作是"继续"，"开始游戏"退成次要——
               一屏只该有一个 mint */
            tone={canContinue ? "cream" : "mint"}
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
              className="fixed inset-0 z-10 bg-[rgb(93_64_55_/_0.42)] backdrop-blur-[2px]"
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
                <DialogPanel
                  className={[
                    "title-screen-dialog-panel soft-panel ui-scroll max-h-[calc(100dvh-40px)] w-full overflow-y-auto outline-none",
                    /* 存档页绿封面、设置桃色：两个弹窗一眼分得开，不用读标题 */
                    activeDialog === "settings" ? "soft-panel--peach" : "",
                  ].join(" ")}
                >
                  <div className="soft-panel__paper">
                  {activeDialog === "start" ? (
                    <div className="title-screen-start-content relative flex flex-col items-center p-[clamp(16px,3.2vw,28px)]">
                      <DialogTitle className="soft-title m-0 pr-10 text-center text-[clamp(17px,3vw,22px)] leading-tight">
                        {startView === "login" ? copy.loginDialogTitle : copy.slotsTitle}
                      </DialogTitle>

                      <button
                        type="button"
                        className="soft-close absolute right-3 top-3 z-[2]"
                        aria-label={copy.back}
                        onClick={closeDialog}
                      >
                        <XMarkIcon className="size-5" aria-hidden="true" />
                      </button>

                      {startView === "login" ? (
                        <div className="flex w-full max-w-[380px] flex-col items-center gap-3 pt-4">
                          <LoginDialog onDone={() => setStartView("slots")} />
                          <button
                            type="button"
                            className="cursor-pointer border-0 bg-transparent text-xs font-bold text-[#8d6e63] underline"
                            onClick={() => setStartView("slots")}
                          >
                            {copy.back}
                          </button>
                        </div>
                      ) : (
                        <SaveSlotsPanel
                          copy={copy}
                          loggedIn={account.status === "authed"}
                          onEnter={(slot) => {
                            onEnterSlot?.(slot);
                            closeDialog();
                          }}
                          onCreate={(slot) => {
                            onCreateInSlot?.(slot);
                            closeDialog();
                          }}
                          onLogin={() => setStartView("login")}
                        />
                      )}

                      {startView === "slots" && account.status === "authed" ? (
                        <p className="m-0 mt-3 text-xs font-bold text-[#8d6e63]">
                          {copy.loggedInAs}：{account.user?.email}
                          <button
                            type="button"
                            className="ml-2 cursor-pointer border-0 bg-transparent text-xs font-bold text-[#4db6ac] underline"
                            onClick={() => logout()}
                          >
                            {copy.logout}
                          </button>
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="title-screen-settings-content flex flex-col items-center p-[clamp(16px,3.2vw,28px)]">
                      <DialogTitle className="title-screen-settings-title soft-title m-0 text-center text-[clamp(22px,4.4vw,30px)] leading-tight">
                        {copy.settingsTitle}
                      </DialogTitle>

                      <div className="title-screen-settings-sound mt-[18px] w-full">
                        <h2 className="mb-2.5 mt-0 text-[17px] font-black text-[#795548]">
                          {copy.soundTitle}
                        </h2>

                        <label className="mb-2 flex min-h-[38px] cursor-pointer items-center justify-between gap-3.5 text-sm font-extrabold text-[#5d4037]">
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
                            className="soft-switch peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#4db6ac]"
                            aria-hidden="true"
                          />
                        </label>

                        <div className="grid gap-2">
                          {config.audio.channels.map(({ id, copyKey }) => {
                            const label = copy[copyKey];

                            return (
                              <label
                                className="title-screen-volume-row grid min-h-[34px] grid-cols-[minmax(88px,1fr)_minmax(130px,2fr)_44px] items-center gap-2.5 text-[13px] font-bold text-[#5d4037] max-sm:grid-cols-[84px_minmax(96px,1fr)_38px] max-sm:gap-[7px]"
                                key={id}
                              >
                                <span>{label}</span>
                                <input
                                  className="soft-range"
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
                                <output className="text-right text-[#8d6e63]">
                                  {audioSettings[id]}
                                  {config.audio.range.unit}
                                </output>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="title-screen-settings-controls mt-[18px] w-full">
                        <h2 className="mb-2.5 mt-0 text-[17px] font-black text-[#795548]">
                          {copy.controlsTitle}
                        </h2>
                        <dl className="title-screen-controls-list mb-[22px] grid gap-1.5">
                          {config.controls.map((control) => (
                            <div
                              className="title-screen-control-row grid min-h-[34px] grid-cols-[1fr_auto] items-center gap-4 border-b-2 border-dashed border-[rgb(255_224_130_/_0.75)] pb-1.5"
                              key={control.id}
                            >
                              <dt className="text-[13px] font-extrabold text-[#5d4037]">
                                {copy[control.copyKey]}
                              </dt>
                              <dd className="soft-key m-0 font-mono text-xs">
                                {control.binding}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <GameBtn
                        className="title-screen-settings-done"
                        size="sm"
                        tone="mint"
                        onClick={closeDialog}
                      >
                        {copy.done}
                      </GameBtn>
                    </div>
                  )}
                  </div>
                </DialogPanel>
              </motion.div>
            </div>
          </Dialog>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
