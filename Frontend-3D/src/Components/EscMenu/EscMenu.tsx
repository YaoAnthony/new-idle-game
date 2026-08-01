import { findActionDefinition } from "core";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  FaBoxOpen,
  FaCog,
  FaCommentDots,
  FaDoorOpen,
  FaListUl,
  FaTimes,
  FaUser,
} from "react-icons/fa";
import { emit, on } from "../../Game/EventBus";
import { getClock } from "../../Game/State/clock";
import { getNeeds } from "../../Game/State/needs";
import { getRoomStyle } from "../../Game/State/worldRuntime";
import { getActiveAction } from "../../Game/Systems/actions";
import { t } from "../../i18n/t";
import "./EscMenu.css";

/**
 * ESC 侧边菜单。
 *
 * 结构和动画照搬 Oldfrontend 的 `GameEscMenu`：整屏遮罩 → 右侧抽屉 →
 * 单独一层背景做 clip-path 圆形展开 → 内容分区逐条 stagger 上浮。
 * 那套是 framer-motion 官方 sidebar 例子的写法，参数原样保留
 * （spring 260/32、圆心固定在右上角 40px、子项 delay 0.12 / stagger 0.055）。
 *
 * **内容没法照抄**：那边的分区接的是 Redux + 任务/商店/联机 API，
 * 这个项目里不存在。所以外壳一比一，格子换成这边真有的东西——
 * 硬塞几个点不动的按钮，比少几个格子更糟。
 */

const shellVariants: Variants = {
  open: {
    x: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 260, damping: 32, when: "beforeChildren" },
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

/** 背景单独一层：圆形 clip-path 从右上角那个点铺开，抽屉才有"被拉出来"的感觉 */
const backgroundVariants: Variants = {
  open: (height = 1000) => ({
    clipPath: `circle(${Math.max(height, 1000) * 2 + 240}px at calc(100% - 40px) 40px)`,
    transition: { type: "spring", stiffness: 22, restDelta: 2 },
  }),
  closed: {
    clipPath: "circle(30px at calc(100% - 40px) 40px)",
    transition: { delay: 0.08, type: "spring", stiffness: 420, damping: 42 },
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

type Tile = {
  key: string;
  labelKey: string;
  icon: React.ReactNode;
  accent: string;
  run: () => void;
};

const TILES: Tile[] = [
  {
    key: "backpack",
    labelKey: "ui.esc.backpack",
    icon: <FaBoxOpen />,
    accent: "#bba7ff",
    run: () => emit("ui_panel_requested", { panel: "backpack" }),
  },
  {
    key: "actions",
    labelKey: "ui.esc.actions",
    icon: <FaListUl />,
    accent: "#80b7ff",
    run: () => emit("ui_panel_requested", { panel: "actions" }),
  },
  {
    key: "chat",
    labelKey: "ui.esc.chat",
    icon: <FaCommentDots />,
    accent: "#7fe0bd",
    run: () => emit("ui_panel_requested", { panel: "chat" }),
  },
  {
    key: "settings",
    labelKey: "ui.esc.settings",
    icon: <FaCog />,
    accent: "#9fb8d8",
    run: () => emit("ui_panel_requested", { panel: "settings" }),
  },
  {
    key: "title",
    labelKey: "ui.esc.return_title",
    icon: <FaDoorOpen />,
    accent: "#f08f8f",
    run: () => emit("ui_return_to_title", {}),
  },
];

/** 抽屉高度要喂给 clip-path 半径，不量的话圆铺不满 */
function useHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const measure = () => setHeight(ref.current?.offsetHeight ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);

  return height;
}

export function EscMenu() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const height = useHeight(panelRef);
  /**
   * 别的挡视线面板开着的时候，ESC 归它们（关自己）。
   * 不挡一下的话按一次 ESC 会既关掉背包又弹出菜单。
   */
  const blockedRef = useRef(false);

  useEffect(() => on("blocking_panel_changed", ({ open: busy }) => {
    blockedRef.current = busy;
  }), []);

  // 菜单里的读数都是快照，开着的时候跟着这几条事件刷新
  useEffect(() => {
    const offs = [
      on("needs_changed", () => force((n) => n + 1)),
      on("action_changed", () => force((n) => n + 1)),
      on("day_phase_changed", () => force((n) => n + 1)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      if (open) return setOpen(false);
      if (blockedRef.current) return;
      setOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    emit("blocking_panel_changed", { open });
  }, [open]);

  const clock = getClock();
  const needs = getNeeds();
  const active = getActiveAction();
  const activeName = active
    ? findActionDefinition(active.definitionId)?.localizationKey
    : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="esc-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.aside
            ref={panelRef}
            className="esc-panel"
            initial="closed"
            animate="open"
            exit="closed"
            custom={height}
            variants={shellVariants}
            onClick={(event) => event.stopPropagation()}
          >
            <motion.div
              className="esc-panel__background"
              custom={height}
              variants={backgroundVariants}
            />

            <motion.div className="esc-panel__content" variants={contentVariants}>
              <motion.header className="esc-profile" variants={itemVariants}>
                <div className="esc-profile__avatar">
                  <FaUser />
                </div>
                <div className="esc-profile__text">
                  <strong>{t(getRoomStyle().localizationKey)}</strong>
                  <span>
                    {clock.worldDayId} · {t(`clock.phase.${clock.phase}`)}
                  </span>
                </div>
                <button
                  type="button"
                  className="esc-close"
                  onClick={() => setOpen(false)}
                  aria-label={t("ui.close")}
                >
                  <FaTimes />
                </button>
              </motion.header>

              <motion.div className="esc-stats" variants={itemVariants}>
                <div>
                  <span>{t("ui.needs.hunger")}</span>
                  <strong>{Math.round(needs.hunger)}</strong>
                </div>
                <div>
                  <span>{t("ui.needs.fatigue")}</span>
                  <strong>{Math.round(needs.fatigue)}</strong>
                </div>
              </motion.div>

              <motion.div className="esc-current" variants={itemVariants}>
                <div className="esc-section-title">
                  <span>{t("ui.esc.current_action")}</span>
                  <em>{active ? 1 : 0}</em>
                </div>
                <p className="esc-current__body">
                  {activeName ? t(activeName) : t("ui.esc.no_action")}
                </p>
              </motion.div>

              <motion.nav
                className="esc-grid"
                aria-label={t("ui.esc.title")}
                variants={contentVariants}
              >
                {TILES.map((tile) => (
                  <motion.button
                    key={tile.key}
                    type="button"
                    className="esc-tile"
                    style={{ "--tile-accent": tile.accent } as React.CSSProperties}
                    variants={itemVariants}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setOpen(false);
                      tile.run();
                    }}
                  >
                    <span className="esc-tile__icon">{tile.icon}</span>
                    <span>{t(tile.labelKey)}</span>
                  </motion.button>
                ))}
              </motion.nav>

              <motion.footer className="esc-footer" variants={itemVariants}>
                <span>ESC</span>
                <em>{t("ui.esc.close_hint")}</em>
              </motion.footer>
            </motion.div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
