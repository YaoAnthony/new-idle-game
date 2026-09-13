import { findActionDefinition } from "core";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  FaBars,
  FaBookOpen,
  FaBoxOpen,
  FaCog,
  FaDoorOpen,
  FaTrophy,
  FaUser,
} from "react-icons/fa";
import { emit, on } from "../../Game/EventBus";
import { openPanel } from "../../Redux/features/uiSlice";
import { store } from "../../Redux/store";
import { getClock } from "../../Game/State/clock";
import { getNeeds } from "../../Game/State/needs";
import { getRoomStyle } from "../../Game/State/worldRuntime";
import { getActiveAction } from "../../Game/Systems/actions";
import { isTouchMode } from "../../Game/State/touchMode";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";
import "./EscMenu.css";

/**
 * ESC 侧边菜单。
 *
 * 结构和动画照搬 Oldfrontend 的 `GameEscMenu`：整屏遮罩 → 右侧抽屉 →
 * 单独一层背景做 clip-path 展开 → 内容分区逐条 stagger 上浮。
 * 那套是 framer-motion 官方 sidebar 例子的写法，参数原样保留
 * （spring 260/32、子项 delay 0.12 / stagger 0.055）；展开的形状从圆换成了
 * 右上角开关钮的圆角方块。
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

type Corner = {
  /** 开关钮中心离容器顶边 / 右边的距离——抽屉贴着容器右上角，所以也就是离抽屉右上角 */
  top: number;
  right: number;
  /** 钮的半边长 */
  half: number;
  /** 圆角 ÷ 半边长。放大时保持不变 */
  roundness: number;
  /** 展开到的半边长 */
  reach: number;
};

const FALLBACK_CORNER: Corner = { top: 40, right: 40, half: 26, roundness: 16 / 26, reach: 2240 };

/**
 * 以钮中心为心、半边长 `size` 的圆角方块。上、右两边一放大就是负数（伸出抽屉外，
 * 看不见）；下、左两边写成 `100% - x`，这样不用量抽屉自己的宽高——开之前它还不存在。
 */
function cornerSquare(c: Corner, size: number): string {
  return `inset(${c.top - size}px ${c.right - size}px calc(100% - ${c.top + size}px) calc(100% - ${c.right + size}px) round ${size * c.roundness}px)`;
}

/**
 * 背景单独一层：从右上角开关钮**本身的形状**铺开，抽屉才有"从钮里被拉出来"的感觉。
 *
 * 原来是 `circle()`，圆心写死在右上角 40px。钮换成圆角方块之后，一个圆从方块底下
 * 冒出来就对不上了（2026-09-13，用户定）。现在起点就是钮的外框，半边长和圆角按同一个
 * 比例一起长，中间每一帧都是"放大了的那颗钮"；圆角要是固定 16px，一放大就成了
 * 直角方块在擦屏。
 *
 * 用 clip-path 而不是给一块小方 div 做 scale：放大几十倍时浏览器按原尺寸栅格化，
 * 圆角边缘会糊成一大片。
 */
const backgroundVariants: Variants = {
  open: (corner: Corner) => ({
    clipPath: cornerSquare(corner, corner.reach),
    transition: { type: "spring", stiffness: 22, restDelta: 2 },
  }),
  closed: (corner: Corner) => ({
    clipPath: cornerSquare(corner, corner.half),
    transition: { delay: 0.08, type: "spring", stiffness: 420, damping: 42 },
  }),
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

/*
 * 2026-09-08 只剩「背包」「回到标题」两格；「行动」随旧行动面板删了（入口改走日记本），
 * 「消息」有回车键开。「设置」那天也摘了，2026-09-12 加回来：右上角的齿轮早让位给了
 * ESC 开关，摘掉之后游戏里就没有任何地方能调音量（用户："我的 esc 里面没有设置界面，
 * 调不了音量"）。设置面板本身一直在，只差这一格。
 *
 * 开面板直接 dispatch 到面板栈（Redux ui.panelStack），不再绕总线：菜单和
 * 面板同在 React 层，"请求开面板"就是"把它推进栈"，各面板的 `usePanel` 会
 * 自己看见。原来那条 `ui_panel_requested` 事件是同一层内的函数调用穿马甲，
 * 2026-09-13 随总线的通知/命令拆分一起删了。
 */
const TILES: Tile[] = [
  {
    key: "backpack",
    labelKey: "ui.esc.backpack",
    icon: <FaBoxOpen />,
    accent: "#bba7ff",
    run: () => store.dispatch(openPanel("backpack")),
  },
  // 2026-09-12：成就 / 攻略查询器从这里进（用户定 ESC 是入口）
  {
    key: "achievements",
    labelKey: "ui.esc.achievements",
    icon: <FaTrophy />,
    accent: "#ffd166",
    run: () => store.dispatch(openPanel("achievements")),
  },
  {
    key: "guideBook",
    labelKey: "ui.esc.guide_book",
    icon: <FaBookOpen />,
    accent: "#9ad3a1",
    run: () => store.dispatch(openPanel("guideBook")),
  },
  {
    key: "settings",
    labelKey: "ui.esc.settings",
    icon: <FaCog />,
    accent: "#9fc4e8",
    run: () => store.dispatch(openPanel("settings")),
  },
  {
    key: "title",
    labelKey: "ui.esc.return_title",
    icon: <FaDoorOpen />,
    accent: "#f08f8f",
    run: () => emit("ui_return_to_title", {}),
  },
];

function measureCorner(button: HTMLElement): Corner {
  const box = button.offsetParent as HTMLElement | null;
  const width = box?.clientWidth ?? window.innerWidth;
  const height = box?.clientHeight ?? window.innerHeight;
  // offset* 是布局值，不吃 hover 时的 scale(1.1)
  const half = button.offsetWidth / 2;
  const radius = parseFloat(getComputedStyle(button).borderTopLeftRadius) || 0;
  const roundness = Math.min(radius / half, 1);
  /*
   * 罩满抽屉不能只让半边长 ≥ 最远角的距离：圆角会把方块的角削掉。
   * 半边长 s、圆角比 k 的圆角方块，能完整装下的正方形半边是 s·(1 − k + k/√2)，
   * 反过来除一下。容器宽高是抽屉的上界，拿它算只会多不会少。
   */
  const cover = Math.max(width, height) / (1 - roundness + roundness / Math.SQRT2);
  return {
    top: button.offsetTop + button.offsetHeight / 2,
    right: width - (button.offsetLeft + half),
    half,
    roundness,
    // 后一项是原来圆半径的算法：spring 冲向远超需要的目标，前半程才够快，手感不变
    reach: Math.max(cover, Math.max(height, 1000) * 2 + 240),
  };
}

/**
 * 开关钮的位置和形状。钮一直挂着，挂载时就能量；尺寸跟 vmin 走，resize 时重量。
 *
 * 原来这里是 `useHeight(panelRef)`，挂载时量抽屉高度——可抽屉那时还没渲染，
 * 量出来是 0，一直靠 `Math.max(height, 1000)` 兜底。
 */
function useCorner(ref: React.RefObject<HTMLElement | null>): Corner {
  const [corner, setCorner] = useState(FALLBACK_CORNER);

  useLayoutEffect(() => {
    const measure = () => {
      if (ref.current) setCorner(measureCorner(ref.current));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);

  return corner;
}

export function EscMenu() {
  /*
   * 侧边栏自己也是面板栈里的一层。
   *
   * 这里原来还有一个 `blockedRef`：靠听 `blocking_panel_changed` 攒一个
   * "现在有没有别的面板开着"的布尔，用来决定 ESC 该不该归自己。它是全场
   * 九块面板往同一个布尔里喊出来的结果，最后一个说话的人覆盖前面所有人
   * ——实测"ESC 菜单里点背包"之后这个布尔就是错的，于是下一次 ESC 既关了
   * 背包又把菜单弹了出来。栈本身就回答了"谁在最上面"，不需要再攒第二份。
   */
  const [open, setOpen] = usePanel("escMenu");
  const [, force] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const corner = useCorner(buttonRef);

  // 菜单里的读数都是快照，开着的时候跟着这几条事件刷新
  useEffect(() => {
    const offs = [
      on("needs_changed", () => force((n) => n + 1)),
      on("action_changed", () => force((n) => n + 1)),
      on("day_phase_changed", () => force((n) => n + 1)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  /*
   * ESC 的处理搬去 [EscArbiter] 了——全场只剩那一个监听。
   *
   * 这里原来是"我开着就关自己，没开就看 blockedRef 决定要不要打开"。问题不在
   * 这段逻辑本身，而在于它是九个 ESC 监听里的一个：同一次按键被每块面板各处理
   * 一遍，谁先谁后取决于挂载顺序。裁判只留一个之后，这块面板只管画自己。
   */

  const clock = getClock();
  const needs = getNeeds();
  const active = getActiveAction();
  const activeName = active
    ? findActionDefinition(active.definitionId)?.localizationKey
    : null;

  return (
    <>
      {/*
        右上角最外侧那个钮：**这个抽屉的开关**（2026-09-08 接上）。
        
        在这之前它不存在——抽屉只有 ESC 键能开，于是触摸端根本进不来
        （没有 ESC 键），而"回到标题""聊天记录"这些只有这里有。
        原来占着这个位置的是设置钮（开一个居中 Modal），位置让给了抽屉
        本身；设置那格后来也从抽屉里摘了（2026-09-08，用户定）。

        位置选它不是随手排的：抽屉的展开动画原来是一个 clip-path 圆，圆心
        写死在右上角 40px 处——那个圆本来就是从这个钮底下铺开的，只是一直
        没人站在那儿。现在展开的起点直接量这颗钮（见 backgroundVariants）。

        `motion.button` 的 hover/tap 缩放和日记本钮同一套；颜色用蓝灰，
        因为它是系统功能，不该和日记本（绿）抢眼。
      */}
      <motion.button
        ref={buttonRef}
        type="button"
        aria-label={t("ui.esc.title")}
        className={`hud-corner-btn hud-corner-tile hud-corner-btn--outer grid place-items-center ${open ? "z-50" : "z-10"}`}
        style={
          {
            "--tile-face": "#78909C",
            "--tile-rim": "#CFD8DC",
            "--tile-edge": "#546E7A",
          } as CSSProperties
        }
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(!open)}
      >
        <FaBars className="h-1/2 w-1/2" />
      </motion.button>

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
            className="esc-panel"
            initial="closed"
            animate="open"
            exit="closed"
            variants={shellVariants}
            onClick={(event) => event.stopPropagation()}
          >
            <motion.div
              className="esc-panel__background"
              custom={corner}
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

              {/*
                "ESC 关闭菜单"在手机上没有意义——没有 ESC 键，而关闭走的是
                右上角那颗开关钮。它还正好是这个面板在 iPhone SE 横屏上多出来的
                那 21px，摘掉就不用滑了。
              */}
              {!isTouchMode() && (
                <motion.footer className="esc-footer" variants={itemVariants}>
                  <span>ESC</span>
                  <em>{t("ui.esc.close_hint")}</em>
                </motion.footer>
              )}
            </motion.div>
          </motion.aside>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
