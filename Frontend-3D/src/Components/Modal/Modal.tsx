import {
  delay,
  motion,
  MotionConfig,
  useReducedMotion,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 面板外壳：一枚小印章转半圈，再"绽开"成整块面板（用户 2026-08-27 给的稿）。
 *
 * ---- 为什么是这个形式 ----
 *
 * 之前那两版被否掉是同一个病：细线图标 + 「图标／标题／副标题／右上叉」的
 * 头部 + 等距圆角网格——那是 SaaS 后台弹窗的长相，不是游戏里的东西。
 * 这一版的形式语言换成**实体玩具**：
 *
 *   - **同心厚框**：外圈一道窄白边 → 中间一整圈高饱和色 → 里面才是白内胆。
 *     三层套起来才有"这是一件东西"的厚度感，单层描边只有"这是一个 div"。
 *   - **大半径**：从 75 一路收到 40。半径本身是动画的一部分——圆章变方牌。
 *   - **高饱和当底色不当点缀**。中间那圈色是整块的，不是一条边。
 *   - **中间一枚印章**：有性格的图形，不是通用图标。
 *
 * ---- 相位机 ----
 *
 * `idle → entry → spin → expand`，关闭走 `exit`。entry 只是让印章出现，
 * spin 转半圈顺便把半径从 75 收到 50，expand 才把它撑成面板。
 * 三段加起来约 1 秒。
 *
 * **常开的面板要给 `instant`。** 背包一局要开几十次，每次看一秒钟的仪式
 * 会从"有质感"变成"卡"。仪式感留给不常开、值得郑重其事的面板。
 * `prefers-reduced-motion` 也直接走 instant——那是无障碍要求，不是偏好。
 */

export type ModalProps = {
  open: boolean;
  /** 点遮罩或按关闭时调。ESC 由 EscArbiter 统一管，这里不自己听键盘 */
  onClose: () => void;
  children: ReactNode;
  /**
   * 中间那枚印章。绽开时它会放大淡出，所以画面上只在"还没展开"的那半秒
   * 里看得到——它是这块面板的身份标识，不是内容的一部分。
   */
  seal?: ReactNode;
  /** 中间那圈的颜色。默认走桃色主强调 */
  frameColor?: string;
  /** 内胆的颜色 */
  paperColor?: string;
  /**
   * **最外圈那道窄边**的颜色。不给就跟内胆同色（原来的行为）。
   *
   * 分出来是为了让这三层能直接当成一本书的封面：外圈浅绿描边、中间
   * 深绿封面、内胆白纸页。共用一个颜色的话就只有两层，而"书"这个读法
   * 恰恰需要第三层——不然还得在里面再画一圈，那就是双层框。
   */
  edgeColor?: string;
  /**
   * 展开后按这个宽高比收到**内容大小**，而不是撑满整屏。
   *
   * 比例说的是**内胆**（装内容的那块），不是外壳。差别不是抠字眼：
   * 内胆 = 外壳四边各减 `--modal-frame-w`，减常数会改变宽高比
   * （1.37 的外壳减完是 1.44 的内胆）。把比例套在外壳上，内容按自己的
   * 比例贴进内胆时就会剩一条缝，而且只剩在一个方向上——表现为"左右的
   * 边比上下宽三倍"，看着像 padding 没对齐。
   *
   * 不给 = 老行为：四边各留 `--modal-outer`，其余占满。那对"一块面板"
   * 是对的，对"一本书"是错的——书皮只比书页大一圈，铺满整屏的绿就不是
   * 书皮而是背景色了。日记本传书的比例（1040/760），于是绿只剩书页
   * 外面那一圈，两侧露出屋子——书是摆在桌上的，不是糊在镜头上的。
   */
  aspect?: number;
  /**
   * 跳过整段仪式，直接展开。常开的面板（背包、聊天）应该给 true。
   * 缺省 false = 走完整段——那是给"一天打开一次"的面板准备的。
   */
  instant?: boolean;
  /**
   * 铺在外壳**外面**那一层（还在遮罩之内）。给"属于这块面板、但不属于
   * 面板内容"的东西用——日记本的翻页箭头就是：它们该站在书旁边的空地上，
   * 不该踩在书页上抢内容的点击。
   *
   * 这一层默认 `pointer-events: none`，子元素自己开 `pointer-events-auto`。
   * 不然一整块透明层盖住遮罩，点空白处就关不掉面板了。
   */
  overlay?: ReactNode;
  /**
   * 顶上留出这么多像素**不给外壳用**（只在给了 `aspect` 时有意义）。
   *
   * 给"挂在面板上方、但不属于面板"的东西腾地方——日记本顶上那条今日
   * 奖励名额就是。外壳按剩下的那条带子居中，于是整体也跟着小一圈。
   */
  reserveTop?: number;
  /**
   * 收到"装得下的最大尺寸"的百分之多少（只在给了 `aspect` 时有意义）。
   *
   * 1 = 顶满可用空间。给小于 1 的值是为了让面板**故意不占满**——顶满时
   * 它离屏幕边只剩 `--modal-outer` 那一圈，读起来像"糊在镜头上"而不是
   * "摆在屋里的一件东西"。
   */
  fill?: number;
  /**
   * 算完外壳的位置尺寸之后报一次（只在给了 `aspect` 时）。
   *
   * 给"要跟着面板走"的外部元素用——日记本顶上那条名额条据此把自己收到
   * 和书一样宽，不然它会比书还宽一圈，读起来不像挂在书上的东西。
   */
  onLayout?: (box: { width: number; height: number; left: number; top: number }) => void;
  /** 给 aria 用的名字 */
  label?: string;
};

type AnimationPhase = "idle" | "entry" | "spin" | "expand" | "exit";

export function Modal({
  open,
  onClose,
  children,
  seal,
  frameColor = "var(--peach-deep)",
  paperColor = "var(--cream)",
  edgeColor,
  aspect,
  overlay,
  reserveTop = 0,
  fill = 1,
  onLayout,
  instant = false,
  label,
}: ModalProps) {
  const reduceMotion = useReducedMotion();
  const skipCeremony = instant || Boolean(reduceMotion);

  const [phase, setPhase] = useState<AnimationPhase>("idle");
  /**
   * 每次重新打开都换一个 key，把 motion 的相位重新跑一遍。
   *
   * 不换的话第二次打开时 variants 的起点还停在上次的终点，印章不会再转，
   * 面板直接原地出现——"第一次有仪式、之后都没有"是最难查的那种 bug，
   * 因为开发时你总是刚刷新完页面。
   */
  const [runId, setRunId] = useState(0);
  /** 关闭动画还没播完时保持挂载，播完才真的收掉 */
  const [mounted, setMounted] = useState(open);
  const wasOpen = useRef(open);
  const stageRef = useRef<HTMLDivElement>(null);
  /** 给了 aspect 时，外壳和内胆各自的四边 inset（CSS 简写字符串） */
  const [box, setBox] = useState<{ card: string; paper: string } | null>(null);

  /*
   * 把"装得下的最大的那个 aspect 比例的盒子"算出来。
   *
   * 纯 CSS 做不了这件事：`aspect-ratio` 配 `max-width`/`max-height` 时，
   * 被 max 卡住的那一边会直接截断，另一边不跟着收，比例就破了。而
   * `min(100vw…, 100vh…)` 要求这一层正好等于视口——这层是 `inset:0` 的
   * 绝对定位，等不等于视口取决于它挂在谁下面，不能假设。
   *
   * 算出来的是 inset 而不是 width/height：内胆是外壳的**兄弟**（见
   * `.modal-paper` 那段注释），不能靠父子关系继承尺寸；而 translate 居中
   * 会和 variants 里的 scale/rotate 抢 transform。四个数字最省事，
   * 而且 motion 的 layout 动画在两组 inset 之间照样插值。
   */
  useEffect(() => {
    const stage = stageRef.current;
    if (!mounted || !stage || !aspect) {
      setBox(null);
      return;
    }
    const fit = () => {
      const styles = getComputedStyle(stage);
      const outer = parseFloat(styles.getPropertyValue("--modal-outer")) || 0;
      const frameW = parseFloat(styles.getPropertyValue("--modal-frame-w")) || 0;
      const { width: stageW, height: stageH } = stage.getBoundingClientRect();
      const bandTop = outer + reserveTop;
      const bandH = Math.max(0, stageH - bandTop - outer);
      // 先按比例定**内胆**，外壳再往外套一圈——顺序反过来就是上面说的那条缝
      let paperH = Math.max(0, bandH - frameW * 2) * fill;
      let paperW = paperH * aspect;
      const maxPaperW = Math.max(0, stageW - outer * 2 - frameW * 2) * fill;
      if (paperW > maxPaperW) {
        paperW = maxPaperW;
        paperH = paperW / aspect;
      }
      const cardW = paperW + frameW * 2;
      const cardH = paperH + frameW * 2;
      const x = Math.max(0, (stageW - cardW) / 2);
      // 在**留白之下那条带子**里居中，不是整屏居中
      const y = bandTop + Math.max(0, (bandH - cardH) / 2);
      /*
       * **四个值都要写出来，不能用 `inset: Ypx Xpx` 的两值简写。**
       *
       * 两值简写里 bottom = top。没有 `reserveTop` 的时候上下本来就对称，
       * 简写正好；一旦顶上留了白，上下就不等了——写简写等于强行让下边距
       * 等于上边距，外壳被压扁（实测 316 高的书变成 199），书页跟着缩成
       * 封面中间一小块，看着像"绿又变宽了"。
       */
      const inset = (t: number, l: number, w: number, h: number) =>
        `${t}px ${stageW - l - w}px ${stageH - t - h}px ${l}px`;
      setBox({
        card: inset(y, x, cardW, cardH),
        paper: inset(y + frameW, x + frameW, paperW, paperH),
      });
      onLayout?.({ width: cardW, height: cardH, left: x, top: y });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [mounted, aspect, reserveTop, fill, onLayout]);

  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      setMounted(true);
      setRunId((n) => n + 1);
      setPhase("idle");
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
      setPhase("exit");
    }
  }, [open]);

  // idle 只停一帧就走——它是"起始姿势"，不是一个可见状态
  useEffect(() => {
    if (!mounted || phase !== "idle") return;
    return delay(() => setPhase(skipCeremony ? "expand" : "entry"), 0.01);
  }, [mounted, phase, skipCeremony]);

  if (!mounted) return null;

  const expanded = phase === "expand" || phase === "exit";

  return (
    <MotionConfig transition={expanded ? EXPAND_TRANSITION : undefined}>
      <div
        ref={stageRef}
        className="modal-stage"
        data-phase={phase}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onPointerDown={(event) => {
          // 只有点在遮罩本身上才关——点面板内部不该关
          if (event.target === event.currentTarget) onClose();
        }}
        style={
          {
            "--modal-frame": frameColor,
            "--modal-paper": paperColor,
            "--modal-edge": edgeColor ?? paperColor,
          } as React.CSSProperties
        }
      >
        <motion.div
          className="modal-scrim"
          animate={{
            opacity: phase === "exit" ? 0 : 1,
            backdropFilter: expanded ? "blur(5px)" : "blur(0px)",
          }}
          transition={{ duration: 0.25 }}
        />

        <MotionFragment
          initial={false}
          animate={phase}
          key={runId}
          onAnimationComplete={(definition) => {
            if (definition === "entry") setPhase("spin");
            else if (definition === "spin") setPhase("expand");
            else if (definition === "exit") setMounted(false);
          }}
        >
          {/* 外壳：窄白边 + 里面整圈的高饱和色 */}
          {/*
            `inset` 只在展开态给：没展开时外壳是 flex 流里一枚 150×150 的
            `position: relative` 小方章，给它 inset 会把它从居中位置推走。
          */}
          <motion.div
            className="modal-card"
            variants={cardVariants}
            layout
            style={expanded && box ? { inset: box.card } : undefined}
          >
            <motion.div className="modal-frame" variants={frameVariants} layout />
          </motion.div>

          {/* 白内胆。内容装在它里面，绽开那一刻才淡入 */}
          <motion.div
            className="modal-paper"
            variants={paperVariants}
            layout
            key={runId}
            transition={{ layout: { ease: [0.44, 0.07, 0.51, 1], duration: 0.55 } }}
            style={{ borderRadius: 15, ...(expanded && box ? { inset: box.paper } : null) }}
          >
            {/*
              内容绝对定位、脱离 layout 计算。
              直接塞进 modal-paper 的流里的话，它 50×50 那个阶段会被内容
              撑开，layout 动画量的就不是"从小方块长成面板"，而是一段
              被内容尺寸污染过的插值——表现为绽开时先跳一下。
            */}
            <div className="modal-content">{children}</div>
          </motion.div>

          {/*
            **跳过仪式时根本不渲染印章。**
            它的动画是"绽开时放大淡出"，而 instant 路径直接从 idle 跳到
            expand——那一刻印章会以满不透明度出现在面板正中，再花 0.3 秒
            淡掉，看起来像一个盖在内容上的水印。它是转场的一部分，
            没有转场就不该有它。
          */}
          {overlay && <div className="modal-overlay">{overlay}</div>}

          {seal && !skipCeremony && (
            <motion.div
              className="modal-seal"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={
                expanded
                  ? { scale: 2, opacity: 0 }
                  : { scale: [0.8, 1.75, 0.8], opacity: 1 }
              }
              transition={{
                scale: { duration: 0.36, ease: "easeInOut" },
                opacity: {
                  duration: phase === "expand" ? 0.15 : 0.05,
                  delay: phase === "expand" ? 0.3 : 0,
                },
              }}
            >
              {seal}
            </motion.div>
          )}
        </MotionFragment>
      </div>
    </MotionConfig>
  );
}

/**
 * 用 Fragment 当 motion 组件：variants 能往下传给每个子元素，但**不产生
 * 一层 DOM**。多包一层 div 的话，`.modal-card` 和 `.modal-paper` 就不再是
 * 同一个定位上下文里的兄弟，那套 `inset` 的同心几何整个失效。
 */
const MotionFragment = motion.create(Fragment);

/** ==============   相位与曲线   ================ */

const baseValues = { scale: 1, opacity: 1, rotate: 0 };

const SPIN_TRANSITION: Transition = {
  ease: "linear",
  duration: 0.33,
  rotate: { inherit: true, ease: [0.57, 0.44, 0.66, 1.17] },
};

const EXPAND_TRANSITION: Transition = {
  type: "spring",
  duration: 0.55,
  bounce: 0.05,
  borderRadius: { inherit: true, ease: "linear" },
  scale: { inherit: true, ease: "backOut" },
  // 展开时不要再插值旋转：spin 已经把角度停在 0，再动一下会看到面板歪一下
  rotate: { type: false },
};

const cardVariants: Record<AnimationPhase, TargetAndTransition> = {
  idle: { scale: 0.4, borderRadius: 75, opacity: 0 },
  entry: {
    ...baseValues,
    borderRadius: 75,
    transition: { opacity: { duration: 0.08 }, duration: 0.13 },
  },
  spin: {
    ...baseValues,
    borderRadius: 50,
    rotate: [-180, 0],
    transition: SPIN_TRANSITION,
  },
  expand: { ...baseValues, borderRadius: 40, transition: EXPAND_TRANSITION },
  exit: { opacity: 0, scale: 0.9, borderRadius: 40 },
};

const frameVariants: Record<AnimationPhase, TargetAndTransition> = {
  idle: { borderRadius: 70 },
  entry: { borderRadius: 70 },
  spin: { borderRadius: 45, transition: SPIN_TRANSITION },
  expand: { borderRadius: 35, transition: EXPAND_TRANSITION },
  exit: { borderRadius: 35 },
};

const paperHidden = { opacity: 0, scale: 1 };

const paperVariants: Record<AnimationPhase, TargetAndTransition> = {
  idle: paperHidden,
  entry: paperHidden,
  spin: paperHidden,
  expand: {
    opacity: 1,
    scale: 1,
    transition: { opacity: { duration: 0.1, ease: "linear" } },
  },
  exit: { scale: 0.8, opacity: 0 },
};
