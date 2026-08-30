import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * 通用浮动气泡：钉在屏幕上某个点旁边、带一枚指向它的小尾巴。
 *
 * ---- 为什么自己写而不是找库 ----
 *
 * 搜过一圈："聊天气泡"库（react-chat-ui 那批）做的是**消息列表**的左右
 * 对话泡，不是"锚在一个点上的浮层"；popover 库（floating-ui）定位能力
 * 过剩、皮又是素的，引进来还得整张剥掉换成日记本语言——而这套语言的
 * 全部就是几行 class。再加上 AGENTS.md 要求离线可玩，能不添依赖就不添。
 *
 * ---- 皮 ----
 *
 * 日记本语言（用户钦定的设计稿）：白纸 + `#EEEEEE` 细边 + 硬投影
 * `0_4px_0_#E0E0E0` + Nunito。尾巴是两层旋转 45° 的方块——外层描边色、
 * 内层白，叠出"带边框的三角"；CSS border 三角画不出描边，SVG 又要对
 * 亚像素缝，两方块是最省事的一条路。
 *
 * ---- 摆位 ----
 *
 * 二段式：先渲染、`useLayoutEffect` 里量自己的真实高宽再定位（绘制前
 * 完成，不闪帧）。优先浮在锚点上方，顶上放不下翻到下方；水平 clamp 在
 * 视口内，**尾巴单独跟着锚点走**（气泡被 clamp 推开后，尾巴仍指着锚点，
 * 只在贴近气泡圆角时收进安全区）。
 *
 * 谁在用：背包手机模式的物品详情。设计上它是通用件——NPC 头顶的对话、
 * 教学提示以后都该走它，别再各画各的框。
 */

/** 尾巴的半宽（方块对角线的一半）。左右 clamp 时留出圆角的安全距离 */
const TAIL = 10;
const EDGE = 8;

export function Bubble({
  anchor,
  width = 248,
  prefer = "above",
  onDismiss,
  children,
}: {
  /** 尾巴指向的屏幕坐标（通常是被点元素的顶边中点） */
  anchor: { x: number; y: number };
  width?: number;
  prefer?: "above" | "below";
  /** 点气泡外面时调。不传就不自动关 */
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{
    left: number;
    top: number;
    below: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const height = node.offsetHeight;

    const left = Math.min(
      Math.max(EDGE, anchor.x - width / 2),
      window.innerWidth - width - EDGE,
    );
    // 上方要装下气泡 + 尾巴 + 一点呼吸
    const fitsAbove = anchor.y - height - TAIL - EDGE > 0;
    const below = prefer === "below" || !fitsAbove;
    const top = below
      ? Math.min(anchor.y + TAIL + 4, window.innerHeight - height - EDGE)
      : anchor.y - height - TAIL - 4;
    setLayout({ left, top, below });
  }, [anchor.x, anchor.y, width, prefer, children]);

  /*
   * 点外面关闭。**capture + 下一帧注册**：打开气泡的那次点击自己还在
   * 冒泡路上，立刻注册会被它顺手关掉——气泡闪一下就没，像坏了。
   */
  useLayoutEffect(() => {
    if (!onDismiss) return;
    const listen = () => {
      const handler = (event: PointerEvent) => {
        if (!ref.current?.contains(event.target as Node)) onDismiss();
      };
      document.addEventListener("pointerdown", handler, true);
      cleanup = () => document.removeEventListener("pointerdown", handler, true);
    };
    let cleanup = () => {};
    const timer = setTimeout(listen, 0);
    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [onDismiss]);

  // 尾巴横向跟锚点，clamp 在气泡的圆角之间
  const tailX = layout
    ? Math.min(Math.max(anchor.x - layout.left, 18), width - 18)
    : width / 2;

  return (
    <div
      ref={ref}
      className="bubble-pop fixed z-[60]"
      style={{
        width,
        left: layout?.left ?? anchor.x - width / 2,
        top: layout?.top ?? anchor.y,
        // 量完再露面：第一帧在错误位置闪一下比晚 0ms 出现糟得多
        visibility: layout ? "visible" : "hidden",
        fontFamily: '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif',
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative rounded-[16px] border-2 border-[#EEEEEE] bg-white p-3 shadow-[0_4px_0_#E0E0E0,0_12px_28px_rgba(0,0,0,0.14)]">
        {children}

        {/* 尾巴：外层描边方块 + 内层白方块，各转 45° */}
        <div
          className="absolute h-[18px] w-[18px] rotate-45 rounded-[3px] border-2 border-[#EEEEEE] bg-white"
          style={
            layout?.below
              ? { top: -10, left: tailX - 9, clipPath: "polygon(0 0, 100% 0, 0 100%)" }
              : { bottom: -10, left: tailX - 9, clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }
          }
        />
        {/* 盖住尾巴和卡片交界处的描边，让两块读成一体 */}
        <div
          className="absolute h-[10px] bg-white"
          style={
            layout?.below
              ? { top: 0, left: tailX - 8, width: 16 }
              : { bottom: 0, left: tailX - 8, width: 16 }
          }
        />
      </div>
    </div>
  );
}
