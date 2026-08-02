import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useState } from "react";
import { unlockAudio } from "../../Game3D/Engine/AudioEngine";
import {
  applyAudioSettings,
  loadAudioSettings,
  saveAudioSettings,
  type AudioChannel,
  type StoredAudioSettings,
} from "../../Game3D/Engine/audioSettings";
import { emit, on } from "../../Game/EventBus";
import { isTouchMode } from "../../Game/State/touchMode";
import { t } from "../../i18n/t";

/**
 * 游戏内设置侧边栏。从右侧滑入，动画照搬 Oldfrontend 的 GameEscMenu：
 * 面板整体右滑 + 背景做圆形遮罩从按钮位置展开 + 子项错开浮现。
 *
 * 为什么要有它：设置面板原来只在标题页，进了游戏就没有入口了——
 * 而玩家最想调音量的时刻恰恰是在游戏里听到雨声太吵的时候。
 */

const CHANNELS: Array<{ id: AudioChannel; labelKey: string }> = [
  { id: "master", labelKey: "ui.settings.master" },
  { id: "music", labelKey: "ui.settings.music" },
  { id: "ambience", labelKey: "ui.settings.ambience" },
  { id: "effects", labelKey: "ui.settings.effects" },
];

/** 面板整体：从右边滑进来 */
const shellVariants: Variants = {
  open: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 32,
      when: "beforeChildren",
    },
  },
  closed: {
    x: 470,
    opacity: 0,
    transition: {
      delay: 0.12,
      type: "spring",
      stiffness: 420,
      damping: 42,
      when: "afterChildren",
    },
  },
};

/** 背景：从右上角那个按钮的位置画圆展开 */
const backgroundVariants: Variants = {
  open: (height: number = 1000) => ({
    clipPath: `circle(${Math.max(height, 1000) * 2 + 240}px at calc(100% - 40px) 40px)`,
    transition: { type: "spring", stiffness: 22, restDelta: 2 },
  }),
  closed: {
    clipPath: "circle(30px at calc(100% - 40px) 40px)",
    transition: {
      delay: 0.08,
      type: "spring",
      stiffness: 420,
      damping: 42,
    },
  },
};

const contentVariants: Variants = {
  open: { transition: { delayChildren: 0.12, staggerChildren: 0.055 } },
  closed: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
};

const itemVariants: Variants = {
  open: {
    y: 0,
    opacity: 1,
    transition: {
      y: { type: "spring", stiffness: 900, damping: 34 },
      opacity: { duration: 0.16 },
    },
  },
  closed: {
    y: 28,
    opacity: 0,
    transition: {
      y: { type: "spring", stiffness: 900, damping: 42 },
      opacity: { duration: 0.12 },
    },
  },
};

export function SettingsDrawer() {
  const [open, setOpen] = useState(false);

  useEffect(
    () => on("ui_panel_requested", ({ panel }) => {
      if (panel === "settings") setOpen(true);
    }),
    [],
  );
  const [settings, setSettings] = useState<StoredAudioSettings>(() =>
    loadAudioSettings(),
  );

  // 改了就立刻作用到音频总线并落盘——没有"确定"按钮，拖着就能听见
  useEffect(() => {
    applyAudioSettings(settings);
    saveAudioSettings(settings);
  }, [settings]);

  // 面板挡视线，剧情系统要据此推迟宠物登场这类过场
  useEffect(() => {
    emit("blocking_panel_changed", { open });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const update = (patch: Partial<StoredAudioSettings>): void => {
    // 拖滑块 / 点开关都是真实手势，正好用来解锁音频上下文
    unlockAudio();
    setSettings((current) => ({ ...current, ...patch }));
  };

  return (
    <>
      <button
        type="button"
        aria-label={t("ui.settings.title")}
        className={`ui-wood-btn absolute right-4 top-4 ${open ? "z-50" : "z-30"} grid h-[38px] w-[38px] place-items-center text-[16px]`}
        onClick={() => {
          unlockAudio();
          setOpen((value) => !value);
        }}
      >
        {/*
          齿轮：用 SVG 而不是 emoji（这个项目不用 emoji 当图标）。

          z **跟着抽屉的开关走**，不常驻顶层：
          - 开着时 z-50，因为它同时是抽屉的**关闭键**（抽屉正文那个 `pt-16`
            就是给它让出来的位置），抽屉在 z-40，不上去就被盖住，只剩
            "点遮罩关闭"这一条不明显的出路
          - 关着时回 z-30，老老实实待在 HUD 那一层。写死 z-50 的话它会
            浮在背包和 ESC 菜单（都是 z-40 的全屏覆盖）上面——那两个界面
            里本来就各有自己的设置入口，多一个悬空齿轮既多余又挡内容
        */}
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
          />
          <path
            fill="currentColor"
            d="m19.4 13-.1-1 1.7-1.3-1.7-3-2 .8-.9-.5-.3-2.1h-3.4l-.3 2.1-.9.5-2-.8-1.7 3L9.5 12l-.1 1-1.7 1.3 1.7 3 2-.8.9.5.3 2.1h3.4l.3-2.1.9-.5 2 .8 1.7-3L19.4 13Zm-1.7 2.6-1.4-.6-2.2 1.3-.2 1.5h-1.8l-.2-1.5-2.2-1.3-1.4.6-.9-1.6 1.2-.9v-2.2l-1.2-.9.9-1.6 1.4.6 2.2-1.3.2-1.5h1.8l.2 1.5 2.2 1.3 1.4-.6.9 1.6-1.2.9v2.2l1.2.9-.9 1.6Z"
            opacity="0.55"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/*
              点空白处关掉。

              z-40 而不是 20：抽屉带全屏遮罩，按仓库既有分层
              （HUD 和侧栏 z-30、全屏覆盖 z-40、拖拽幽灵 z-50）它算全屏覆盖，
              和背包一档。留在 z-20 的话会被 z-30 的快捷栏压住——横屏上
              快捷栏正好横穿抽屉，那排格子浮在设置项上面（实测 667x375）。
            */}
            <motion.div
              className="absolute inset-0 z-40 bg-black/35"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              onClick={() => setOpen(false)}
            />

            <motion.aside
              className="absolute right-0 top-0 z-40 flex h-full w-[min(360px,86vw)] flex-col"
              initial="closed"
              animate="open"
              exit="closed"
              variants={shellVariants}
            >
              <motion.div
                className="absolute inset-0 bg-[#1d1a24]/95 backdrop-blur-sm"
                variants={backgroundVariants}
                custom={
                  typeof window === "undefined" ? 1000 : window.innerHeight
                }
              />

              <motion.div
                className="relative flex h-full flex-col gap-5 overflow-y-auto px-6 pb-6 pt-16"
                variants={contentVariants}
              >
                <motion.h2
                  variants={itemVariants}
                  className="text-[18px] font-bold tracking-[0.2em] text-white/90"
                >
                  {t("ui.settings.title")}
                </motion.h2>

                <motion.section variants={itemVariants} className="flex flex-col gap-3">
                  <h3 className="text-[12px] tracking-widest text-white/45">
                    {t("ui.settings.sound")}
                  </h3>

                  <label className="flex cursor-pointer items-center justify-between text-[13px] text-white/80">
                    <span>{t("ui.settings.mute")}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#e9a83c]"
                      checked={settings.muted}
                      onChange={(event) =>
                        update({ muted: event.target.checked })
                      }
                    />
                  </label>

                  {CHANNELS.map(({ id, labelKey }) => (
                    <label
                      key={id}
                      className="grid grid-cols-[64px_1fr_38px] items-center gap-2 text-[12px] text-white/70"
                    >
                      <span>{t(labelKey)}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        className="accent-[#e9a83c]"
                        value={settings[id]}
                        aria-label={t(labelKey)}
                        // 静音时滑块不可用，避免"拖了没声音"的困惑
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
                </motion.section>

                {/*
                  键位段**只给键盘用户看**：整段列的是 WASD/F/B/G/滚轮/R，
                  手机上一个都按不了，纯占篇幅。而它正好是抽屉在 iPhone SE
                  横屏（375px 高）上撑出那 244px 溢出的主要来源——摘掉之后
                  剩下的内容自己就装得下，不用再靠"往下滑"去够关闭按钮。
                  等触摸端有了自己的操作说明再按同一个位置补回来。
                */}
                {!isTouchMode() && (
                <motion.section variants={itemVariants} className="flex flex-col gap-2">
                  <h3 className="text-[12px] tracking-widest text-white/45">
                    {t("ui.settings.controls")}
                  </h3>
                  {[
                    ["ui.settings.key_move", "WASD"],
                    ["ui.settings.key_interact", "F"],
                    ["ui.settings.key_backpack", "B"],
                    ["ui.settings.key_dump", "G"],
                    ["ui.settings.key_camera", "拖动鼠标左键"],
                    ["ui.settings.key_zoom", "滚轮"],
                    ["ui.settings.key_rotate", "R"],
                  ].map(([labelKey, keys]) => (
                    <div
                      key={labelKey}
                      className="flex items-center justify-between text-[12px] text-white/65"
                    >
                      <span>{t(labelKey)}</span>
                      <span className="rounded border border-white/20 px-2 py-0.5 font-mono text-[11px] text-white/80">
                        {keys}
                      </span>
                    </div>
                  ))}
                </motion.section>
                )}

                <motion.button
                  variants={itemVariants}
                  type="button"
                  className="ui-wood-btn mt-auto py-2 text-[14px] font-bold"
                  onClick={() => setOpen(false)}
                >
                  {t("ui.settings.close")}
                </motion.button>
              </motion.div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
