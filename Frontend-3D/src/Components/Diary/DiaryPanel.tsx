import { motion } from "motion/react";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import BookPlanner, { type BookNavApi } from "../../BookPlanner";
import { TodayRewards } from "./TodayRewards";
import { Modal } from "../Modal/Modal";
import { usePanel } from "../PanelStack/usePanel";

/**
 * 日记本面板（用户设计稿 `gpt设计稿/系列任务Ui/BookPlanner.tsx`）。
 *
 * ---- 这一层只做三件事 ----
 *
 * 1. 右上角第三个角落按钮（齿轮 → 行动 → 日记本）；
 * 2. 接进面板栈，ESC 归 EscArbiter 统一管；
 * 3. **把面板外壳配置成这本书的封面**，再把书页等比缩放塞进封面里。
 *
 * 第 3 条是这一版重做的地方。上一版是 `Modal`（一圈外壳）里装着
 * `BookPlanner`（自带一圈绿封面），屏幕上两圈边框套着，像给书配了个相框。
 * 现在封面直接由外壳画：绽开转场撑开的那个东西**本身就是书的封面**。
 */

/** 书的配色，逐字来自设计稿的 Book Cover Container */
const COVER_EDGE = "#A5D6A7"; // border-[8px] border-[#A5D6A7]
const COVER = "#81C784"; //      bg-[#81C784]

/**
 * 封面**里面**那块地方的设计尺寸。
 *
 * 不是整屏：原稿的 1120×980 里含着封面自己的边和外面那圈绿桌面，
 * 那两样现在都由外壳负责。剩下要缩放的只有内容——奖励条（max-w-800，
 * 连 mb-8 约 150 高）加书页（1000×720）。
 */
const DESIGN_W = 1040;
/*
 * **就是原稿封面的尺寸**（`max-w-[1040px]` × `h-[760px]`）。
 *
 * 不再另加上下留白：留白由书皮自己给——外壳按 COVER_ASPECT 收到这个
 * 比例，中间那圈 `--modal-frame-w` 加上书页 96%/95% 的内缩，合起来就是
 * 封面比书页大出来的那一圈。在这儿再垫一层，绿就又宽了一道。
 */
const DESIGN_H = 760;
/** 书皮的宽高比。外壳照它收，绿因此只比书页宽一圈 */
const COVER_ASPECT = DESIGN_W / DESIGN_H;
/**
 * 书只占"装得下的最大尺寸"的这么多。
 *
 * 顶满（1.0）时书离屏幕边只剩一圈 `--modal-outer`，糊在镜头上；留出这
 * 一档之后它是**摆在屋里的一本书**，背后的屋子还看得见。名额条跟着书的
 * 宽度走，所以这一个数把上下两块一起收。
 */
const COVER_FILL = 0.84;

/**
 * 印章：一本合着的书。绽开转场中间那半秒里出现的就是它。
 *
 * 实心块面，不用线性图标——50px 的圆牌里 2px 的线会碎。
 * 配色跟设计稿：绿封面、白书页、琥珀书签。
 */
function BookSeal() {
  return (
    <svg viewBox="0 0 115 115" width="100%" height="100%" fill="none" aria-hidden>
      <circle cx="57.5" cy="57.5" r="57.5" fill="#FFFFFF" />
      <circle cx="57.5" cy="57.5" r="51" fill={COVER} />
      {/* 书页 */}
      <path d="M33 30 H82 V86 H33 Z" fill="#FFFFFF" />
      {/* 书脊那条深色带 */}
      <path d="M33 30 H43 V86 H33 Z" fill="#388E3C" />
      {/* 封面上的两道压印 */}
      <path d="M51 48 H74 V53 H51 Z" fill={COVER_EDGE} />
      <path d="M51 60 H67 V65 H51 Z" fill={COVER_EDGE} />
      {/* 书签带 */}
      <path d="M72 30 H79 V47 L75.5 43 L72 47 Z" fill="#FFCA28" />
    </svg>
  );
}

/**
 * 今日奖励名额条自己的设计宽度（原稿 `max-w-[800px]`）。
 *
 * **不跟着书一起缩放**：书按内胆的短边等比缩，横屏上约 0.35；名额条要是
 * 也缩到 0.35，那行 18px 的 "TODAY'S REWARDS" 就剩 6px。它是挂在书**上方**
 * 的一块牌子，按屏宽单独算自己的大小。
 *
 * 摆位试过三种：嵌在封面的排版流里（读成印在书皮上的图案）、骑在封面外沿
 * （像被屏幕边裁了）、放进封面内侧顶端（占掉三分之一的高）。现在这版是
 * **挂在书外面的顶上，并且让书为它让出高度**（`reserveTop`）——它不属于书，
 * 书也不用被它挤。
 */
const BAR_DESIGN_W = 800;
/**
 * 还不知道书有多宽时的兜底宽度（占屏宽）。
 *
 * 正常情况下牌子跟着**书的宽度**走（`Modal` 的 `onLayout` 报回来），
 * 这样它读起来是挂在书上的东西；按屏宽算的话它会比书宽一圈，看着像
 * 两个不相干的东西上下摞着。只有第一帧还没量到书时用这个数。
 */
const BAR_FALLBACK_RATIO = 0.5;
/** 牌子占书宽的比例。居中挂在书上沿 */
const BAR_OF_COVER = 0.5;
/** 牌子离屏幕顶的距离 / 牌子和书之间的空档 */
const BAR_TOP = 12;
const BAR_GAP = 16;

/**
 * 翻页箭头。**站在书旁边的空地上，不踩在书页上。**
 *
 * 为什么在这儿而不在书里：书是高度受限的（书页 500×720 的竖比例塞进
 * 横屏内胆），左右本来就空着近百像素；而画在书页上的热区会压住左页勾选框
 * 和右页删除键——书页容器自带 stacking context，里面标多高的 z 都出不去。
 *
 * 还有一个好处：它不跟着书那个约 0.42 的缩放走，44px 就是真的 44px。
 */
function NavArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const isLeft = side === "left";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isLeft ? "Previous Page" : "Next Page"}
      /* 外面那层是 pointer-events:none，这儿要自己开回来 */
      className={`pointer-events-auto absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-[#81C784] text-white shadow-[0_4px_0_#4CAF50] transition-all hover:bg-[#66BB6A] active:translate-y-[calc(-50%+4px)] active:shadow-none ${
        isLeft ? "left-3" : "right-3"
      }`}
    >
      {isLeft ? (
        <ChevronLeft className="h-6 w-6" strokeWidth={3.5} />
      ) : (
        <ChevronRight className="h-6 w-6" strokeWidth={3.5} />
      )}
    </button>
  );
}

export function DiaryPanel() {
  const [open, setOpen] = usePanel("diary");
  const navApi = useRef<BookNavApi | null>(null);
  const [nav, setNav] = useState({ canPrev: false, canNext: false });
  /** 外壳（书皮）实测的宽度和上沿。牌子照它收、并且贴着它的上边摆 */
  const [cardBox, setCardBox] = useState({ width: 0, top: 0 });
  /**
   * 牌子**没缩放时**的自然高度。乘上 barScale 才是它真占掉的高度。
   *
   * 量自然高度而不是量屏幕上的高度：`ResizeObserver` 报的 `contentRect`
   * 不含 transform，而 `getBoundingClientRect()` 含——后者得等 React 把新的
   * barScale 刷进 DOM 才读得准，中间隔着一帧，缩放和测量会互相追着跑。
   */
  const [barNaturalHeight, setBarNaturalHeight] = useState(0);
  const [scale, setScale] = useState(0);

  /*
   * 等比缩放，**量的是封面里那块地方，不是窗口**。
   *
   * 上一版按 `window.innerWidth/Height` 算，那会儿书还自带封面所以对得上；
   * 现在封面是外壳，内容区比窗口小了一圈边（`--modal-outer` +
   * `--modal-frame-w`，而且这两个还按屏高分档）。照窗口算会算大，书页
   * 顶到封面内沿上。用 ResizeObserver 量真实盒子，就不用在 JS 里把 CSS
   * 那几个常量再抄一遍——抄一遍就得跟着 CSS 一起改，迟早对不上。
   *
   * 顺带一个好处：绽开那 550ms 里内胆是从 50×50 长到满屏的，观察器一路
   * 跟着报，缩放比因此跟着长——书页是**随封面一起绽开**的，不是等封面
   * 停了再"啪"地出现在终态尺寸上。初值取 0 就是为了别在那之前闪一帧全尺寸。
   *
   * 为什么用 transform 而不是改版式：比例、圆角、投影、字重原样保留，
   * "设计稿长什么样"和"设备上长什么样"因此是同一件东西。代价是
   * 667×375 上缩放比约 0.35，28px 的标题落到 10px 上下。要在手机上读得
   * 舒服得给小屏做一版真正的版式，那是设计决定，不是缩放能解决的。
   */
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / DESIGN_W, height / DESIGN_H));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const barRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      setBarNaturalHeight(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setBarNaturalHeight(entry.contentRect.height),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /*
   * **±2px 以内不认。**
   *
   * 这两个量是互相咬着的：牌子越宽越高 → 让出的 `reserveTop` 越多 →
   * 书越窄 → 牌子跟着窄。每轮的变化量约 -0.25 倍（书的比例 × 牌子的高宽比），
   * 是收敛的，但不设死区就会在最后一两个像素上来回抖，每帧都重排一次。
   */
  const handleLayout = useCallback(
    (box: { width: number; top: number }) =>
      setCardBox((prev) =>
        Math.abs(prev.width - box.width) < 2 && Math.abs(prev.top - box.top) < 2
          ? prev
          : { width: box.width, top: box.top },
      ),
    [],
  );

  const barWidth =
    cardBox.width > 0
      ? cardBox.width * BAR_OF_COVER
      : Math.min(BAR_DESIGN_W, window.innerWidth * BAR_FALLBACK_RATIO);
  const barScale = barWidth / BAR_DESIGN_W;
  const barHeight = barNaturalHeight * barScale;
  /*
   * 牌子**贴着书的上沿**摆，不是挂在屏幕顶上。
   *
   * `fill` 让书故意不占满，于是书在自己那条带子里居中、上下各空出一截；
   * 牌子要是钉在屏幕顶，中间就空出一大条，两块东西看着不相干。跟着
   * `cardBox.top` 走，它俩才读成一件东西——同宽、贴着、一起居中。
   */
  const barTop = Math.max(BAR_TOP, cardBox.top - BAR_GAP - barHeight);
  /* 书要让开的高度：牌子本体 + 上下两道空档。书因此整体小一圈 */
  const reserveTop = barHeight > 0 ? BAR_TOP + barHeight + BAR_GAP : 0;

  return (
    <>
      {/*
        右上角第三个按钮。几何交给 `.hud-corner-btn--inner-2`（按同一套
        `--hud-btn` / `--hud-gap` 变量算），长相跟设计稿走：绿底白书。
      */}
      <motion.button
        type="button"
        aria-label="日记本"
        className="hud-corner-btn hud-corner-btn--inner-2 z-10 grid place-items-center"
        style={{
          borderRadius: 16,
          background: "#66BB6A",
          border: `3px solid ${COVER_EDGE}`,
          boxShadow: "0 4px 0 #4CAF50",
          color: "#fff",
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen((value) => !value)}
      >
        <BookOpen className="h-1/2 w-1/2" strokeWidth={2.5} />
      </motion.button>

      {/*
        打开走 **Pokopia 那套绽开转场**（`Modal`）：一枚书本印章转半圈，
        再撑成整块面板。不写成 `{open && <Modal/>}`——那样一关就卸载，
        exit 动画没机会播；挂不挂载由 Modal 按相位自己决定。

        三层颜色**就是书的三层**：`edgeColor` 是那道 8px 的浅绿描边，
        `frameColor` 和 `paperColor` 同取封面绿——两层同色是故意的，
        它们合起来才是"一整块封面"，分开配色就又变成两圈框了。

        `aspect` 让外壳**收到书的大小**而不是撑满屏：书皮只比书页大一圈，
        铺满整屏的绿就不是书皮而是背景色了。
      */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        seal={<BookSeal />}
        edgeColor={COVER_EDGE}
        frameColor={COVER}
        paperColor={COVER}
        aspect={COVER_ASPECT}
        fill={COVER_FILL}
        reserveTop={reserveTop}
        onLayout={handleLayout}
        overlay={
          <>
            {/*
              今日奖励名额**独立一层，挂在书外面的顶上**。

              它讲的不是书里哪一页的事，是"今天还剩几个有奖励的名额"——
              翻到上周三那页它照样报今天。所以它既不属于某一页，也不属于
              封面。占掉的高度回填给 `reserveTop`，外壳照剩下的地方收，
              于是加了这条之后书本身也跟着小了一圈。
            */}
            <div
              className="pointer-events-none absolute inset-x-0 flex justify-center"
              style={{ top: barTop }}
            >
              {/* 外层把缩放后的占位做实：transform 不改布局盒 */}
              <div style={{ width: BAR_DESIGN_W * barScale, height: barHeight }}>
                <div
                  ref={barRef}
                  style={{
                    width: BAR_DESIGN_W,
                    transform: `scale(${barScale})`,
                    transformOrigin: "top left",
                    fontFamily: '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif',
                  }}
                >
                  <TodayRewards />
                </div>
              </div>
            </div>

            {/* 箭头跟着书走：书让开了顶上那条，箭头也得让 */}
            <div className="absolute inset-x-0 bottom-0" style={{ top: reserveTop }}>
              {nav.canPrev && (
                <NavArrow side="left" onClick={() => navApi.current?.prev()} />
              )}
              {nav.canNext && (
                <NavArrow side="right" onClick={() => navApi.current?.next()} />
              )}
            </div>
          </>
        }
        label="日记本"
      >
        {/*
          两个坑，踩过了：
          1. `transform` 不改布局盒——用 grid 居中一个定尺盒子，在小屏里
             它先溢出再缩小，居中算的是溢出前的位置，内容被甩到右下角。
             改成绝对定位 + translate(-50%,-50%)。
          2. 原稿根节点是 `min-h-screen`，在这个盒子里等于视口高度而不是
             设计高度，内容按 375 居中。下面那条 CSS 把它拧回 100%。

          顺带一个好处：这个盒子在布局上**恒为 1040×900**（只有 transform
          在缩放），所以里面那本翻页书永远量得到确定的父容器尺寸——
          不会重蹈"在 50×50 的内胆里挂载、把每页算成 0×0"那一次。
        */}
        <style>{`.diary-stage .min-h-screen { min-height: 100% !important; }`}</style>


        {/*
          量的是内胆里那块地方（`contentRect`），缩放比照它算。
          里面再套一个 `relative h-full` 当定位参照。
        */}
        {/*
          `overflow-hidden` 是必须的：`.modal-content` 本身是 `overflow: auto`，
          而 page-flip 翻页时会把翻起来的那一页画到容器外面（还有页角的卷边），
          于是每翻一次就闪出一条横滚动条和一条竖滚动条。在这一层截住，
          外面那层就永远看不到溢出。书页本来也不该跑到书皮外面去。
        */}
        <div ref={measureRef} className="absolute inset-0 overflow-hidden">
          <div className="relative h-full w-full">
            <div
              className="diary-stage absolute left-1/2 top-1/2"
              style={{
                /* 字体只套在这棵子树上，不改全局 */
                fontFamily: '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif',
                width: DESIGN_W,
                height: DESIGN_H,
                transform: `translate(-50%, -50%) scale(${scale})`,
                transformOrigin: "center",
              }}
            >
              <BookPlanner
                navApi={navApi}
                onNavChange={setNav}
                /* 按下播放键就合上书，把屏幕让给专注模式的倒计时卡 */
                onEnterFocus={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      </Modal>

    </>
  );
}
