import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (activeDialog === null) {
      startButtonRef.current?.focus({ preventScroll: true });
    }
  }, [activeDialog]);

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

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

    event.preventDefault();
    const order = [startButtonRef.current, settingsButtonRef.current].filter(
      (button): button is HTMLButtonElement => button !== null,
    );
    if (order.length === 0) return;

    const index = order.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (index + step + order.length) % order.length;
    order[next].focus({ preventScroll: true });
  };

  if (!activeLocale) return null;

  return (
    <section
      className="relative z-[1] h-[100dvh] min-h-0 overflow-hidden text-[#f8edc8]"
      aria-label={copy.titleAlt}
    >
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(115% 92% at 50% 40%, transparent 50%, rgb(12 8 5 / 0.46) 100%), linear-gradient(to top, rgb(12 8 5 / 0.5), transparent 24%)",
        }}
        aria-hidden="true"
      />

      <motion.div
        className="title-screen-hero absolute left-1/2 top-[clamp(28px,7dvh,72px)] z-[2] w-[min(560px,76vw)] -translate-x-1/2 max-sm:top-[7dvh] max-sm:w-[88vw] [@media(max-height:620px)]:top-4 [@media(max-height:620px)]:w-[min(420px,60vw)]"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.7, ease: STANDARD_EASE }
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={locale}
            className="block w-full select-none object-contain [filter:drop-shadow(0_6px_0_rgb(24_14_9_/_0.5))] [image-rendering:pixelated]"
            src={activeLocale.titleImage}
            alt={copy.titleAlt}
            draggable={false}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: [0, -6, 0] }
            }
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    opacity: { duration: 0.18 },
                    y: {
                      duration: 5.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                    },
                  }
            }
          />
        </AnimatePresence>
      </motion.div>

      <motion.nav
        className="title-menu absolute bottom-[clamp(44px,11dvh,104px)] left-1/2 z-[2] grid w-[min(264px,72vw)] -translate-x-1/2 gap-3 [@media(max-height:620px)]:bottom-6 [@media(max-height:620px)]:gap-2"
        aria-label={copy.titleAlt}
        onKeyDown={handleMenuKeyDown}
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.7, delay: 0.12, ease: STANDARD_EASE }
        }
      >
        <GameBtn
          ref={startButtonRef}
          size="lg"
          fullWidth
          onClick={() => setActiveDialog("start")}
        >
          {copy.start}
        </GameBtn>
        <GameBtn
          ref={settingsButtonRef}
          size="md"
          fullWidth
          onClick={() => setActiveDialog("settings")}
        >
          {copy.settings}
        </GameBtn>
      </motion.nav>

      <p
        className="pointer-events-none absolute bottom-2.5 left-3 z-[2] m-0 text-[12px] tracking-wider text-[rgb(248_237_200_/_0.5)]"
        aria-hidden="true"
      >
        ver 0.1
      </p>

      <div
        className="title-screen-locale absolute bottom-2.5 right-3 z-[2] flex gap-1.5"
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
                "title-locale-tab",
                isActive ? "title-locale-tab--active" : "",
              ].join(" ")}
              aria-pressed={isActive}
              onClick={() => selectLocale(localeOption.id)}
            >
              {localeOption.buttonLabel}
            </button>
          );
        })}
      </div>

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
                    ? "title-screen-start-frame w-[min(640px,94vw)]"
                    : "w-[min(560px,92vw)]"
                }
                initial={
                  reduceMotion ? false : { opacity: 0, y: 10, scale: 0.97 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 10, scale: 0.97 }
                }
                transition={{
                  duration: reduceMotion ? 0 : 0.2,
                  ease: STANDARD_EASE,
                }}
              >
                <DialogPanel className="title-screen-dialog-panel pixel-panel max-h-[calc(100dvh-40px)] w-full overflow-y-auto text-[#3a281d] outline-none [filter:drop-shadow(0_14px_0_rgb(11_14_11_/_0.35))]">
                  {activeDialog === "start" ? (
                    <div className="title-screen-start-content relative flex flex-col items-center pb-1 pt-2">
                      <DialogTitle className="m-0 mb-4 text-center text-[24px] font-normal leading-tight tracking-wide text-[#4a3122]">
                        {copy.startDialogTitle}
                      </DialogTitle>

                      <button
                        type="button"
                        className="title-screen-close absolute -right-2 -top-2 z-[2] grid size-9 place-items-center border-[3px] border-[#5b3c29] bg-[#dfc485] text-[#513321] transition-colors hover:bg-[#eed79d] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#8d5d34]"
                        aria-label={copy.back}
                        onClick={closeDialog}
                      >
                        <XMarkIcon className="size-6" aria-hidden="true" />
                      </button>

                      <div className="title-screen-start-options grid w-full grid-cols-2 gap-[clamp(12px,2.4vw,22px)]">
                        {config.startChoices.map((choice) => (
                          <motion.button
                            type="button"
                            className="session-choice group relative flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center gap-2 px-[clamp(8px,2vw,18px)] pb-[clamp(12px,2vw,18px)] pt-[clamp(12px,2vw,18px)] text-[#3b2519] outline-none"
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
                              className="session-choice-icon min-h-0 w-[min(74%,180px)] flex-1 object-contain [image-rendering:pixelated] [filter:drop-shadow(0_3px_0_rgb(69_42_24_/_0.18))]"
                              src={choice.icon}
                              alt=""
                              draggable={false}
                            />
                            <span className="relative z-[1] text-[clamp(16px,2.4vw,24px)] leading-none tracking-wide">
                              {copy[choice.copyKey]}
                            </span>
                          </motion.button>
                        ))}
                      </div>

                      <AnimatePresence initial={false}>
                        {notice ? (
                          <motion.p
                            className="mb-0 mt-4 border-2 border-[#7a5235] bg-[#e3c98e] px-3 py-1.5 text-[12px] leading-normal text-[#4b3324]"
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
                    <div className="title-screen-settings-content flex flex-col items-center pt-1">
                      <DialogTitle className="title-screen-settings-title m-0 text-center text-[24px] font-normal leading-tight tracking-[3px] text-[#4a3122]">
                        {copy.settingsTitle}
                      </DialogTitle>

                      <div className="title-screen-settings-sound mt-4 w-full">
                        <h2 className="pixel-section-title">
                          {copy.soundTitle}
                        </h2>

                        <label className="mb-2 flex min-h-[38px] cursor-pointer items-center justify-between gap-3.5 text-[12px] text-[#513927]">
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

                        <div className="grid gap-2.5">
                          {config.audio.channels.map(({ id, copyKey }) => {
                            const label = copy[copyKey];

                            return (
                              <label
                                className="title-screen-volume-row grid min-h-[34px] grid-cols-[minmax(88px,1fr)_minmax(130px,2fr)_44px] items-center gap-2.5 text-[12px] text-[#563c2a] max-sm:grid-cols-[84px_minmax(96px,1fr)_38px] max-sm:gap-[7px]"
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
                                <output className="text-right text-[12px]">
                                  {audioSettings[id]}
                                  {config.audio.range.unit}
                                </output>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="title-screen-settings-controls mt-4 w-full">
                        <h2 className="pixel-section-title">
                          {copy.controlsTitle}
                        </h2>
                        <dl className="title-screen-controls-list mb-5 grid gap-1.5">
                          {config.controls.map((control) => (
                            <div
                              className="title-screen-control-row grid min-h-[34px] grid-cols-[1fr_auto] items-center gap-4 border-b-2 border-dashed border-[rgb(85_58_39_/_0.28)] pb-1.5"
                              key={control.id}
                            >
                              <dt className="text-[12px]">
                                {copy[control.copyKey]}
                              </dt>
                              <dd className="pixel-keycap m-0">
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
