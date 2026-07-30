import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
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
  onSessionSelected?: (selection: TitleSessionSelection) => void;
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
  canContinue = false,
  onContinue,
}: TitleScreenProps) {
  const reduceMotion = useReducedMotion();
  const [locale, setLocale] = useState<TitleLocale>(() =>
    readStoredLocale(config),
  );
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    readStoredSettings(config),
  );
  const [notice, setNotice] = useState<string | null>(null);
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
  }, [audioSettings, config.persistence.settingsKey]);

  useEffect(() => {
    if (!activeLocale) return;

    localStorage.setItem(config.persistence.localeKey, locale);
    document.documentElement.lang = activeLocale.htmlLanguage;
  }, [activeLocale, config.persistence.localeKey, locale]);

  const closeDialog = () => {
    setActiveDialog(null);
    setNotice(null);
  };

  const selectLocale = (nextLocale: TitleLocale) => {
    setLocale(nextLocale);
    setNotice(null);
  };

  const updateVolume = (key: AudioChannel, value: number) => {
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
      startSession();
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
                              {copy[choice.copyKey]}
                            </span>
                          </motion.button>
                        ))}
                      </div>

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
                            onChange={(event) =>
                              setAudioSettings((current) => ({
                                ...current,
                                muted: event.target.checked,
                              }))
                            }
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
