/**
 * 今日进度条：**一格一格**的分段条（顶部 HUD 和机器面板共用这一份）。
 *
 * ---- 为什么从"一排小圆点"改成"带槽的分段条"（用户 2026-08-25）----
 *
 * 原来两处各画一排 `rounded-full` 的小圆点，独立浮在背景上。问题是
 * **它不告诉你总共有几格**：五颗散着的点，读起来像"已经做了五件事"，
 * 而不是"今天一共五格、亮了三格"。玩家的原话是"我都不知道最多几件事情"。
 *
 * 分段条把空格子也画出来（浅奶油块 + 深一档的缝），一眼就能数出上限。
 * 这就是进度条相对于计数器的全部价值——**没做的那部分也要占位置**。
 *
 * ---- 为什么格子是定宽而不是 flex-1 ----
 *
 * 定宽的话，条的**总长随格数变**：以后上限从 5 调到 6，条子长出一截，
 * 单格大小不变。用 flex-1 撑满固定宽度则相反——格数越多每格越细，
 * 上限变了玩家反而更难数清楚，正好和这次改动的目的拧着。
 *
 * ---- 为什么抽成组件 ----
 *
 * HUD、面板、以及将来「记一笔」输入框旁边都要显示同一件事。三处各写
 * 一遍的话，改一次配色就会走散成三种进度条——这在这个项目里已经发生过
 * （机器胸前那排装饰豆写死了 4 颗，上限一改就和 HUD 对不上）。
 */

/** 尺寸档。hud 要窄（挤在一枚药丸里），panel 可以宽松一点 */
const SIZES = {
  hud: { segment: "h-[9px] w-[15px]", pad: "p-[2px]", gap: "gap-[3px]" },
  panel: { segment: "h-[11px] w-[18px]", pad: "p-[2.5px]", gap: "gap-[3px]" },
} as const;

export type DailyProgressBarProps = {
  progress: number;
  goal: number;
  /**
   * 刚刚亮起来的那一格（0-based），播一次弹跳。null = 不播。
   *
   * 由调用方持有：HUD 要比较"上一次渲染时的进度"才知道该弹哪一格
   * （联机重放可能一次跳好几格），那份状态不属于这个纯展示组件。
   */
  popIndex?: number | null;
  size?: keyof typeof SIZES;
};

export function DailyProgressBar({
  progress,
  goal,
  popIndex = null,
  size = "panel",
}: DailyProgressBarProps) {
  const style = SIZES[size];
  const full = progress >= goal;

  return (
    <span
      className={`inline-flex items-center rounded-full border-2 border-[var(--line-deep)] bg-[var(--line)] ${style.pad} ${style.gap}`}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={goal}
    >
      {Array.from({ length: goal }, (_, index) => {
        const filled = index < progress;
        return (
          <span
            key={index}
            className={[
              "rounded-[3px] transition-colors duration-300",
              style.segment,
              filled
                ? /*
                   * 满格换成牌匾那个深棕（#7a5a1d），不是换成奶黄。
                   *
                   * 因为满格时 HUD 那枚药丸**自己已经变奶黄了**——格子再用
                   * 奶黄就是黄底上的黄块，整条读不出来。深棕在奶油底
                   * （面板）和奶黄底（HUD）上都站得住，而且和牌匾字、
                   * 机器满格的表演是同一个色号。
                   */
                  full
                  ? "bg-[#7a5a1d]"
                  : "bg-[var(--peach-deep)]"
                : "bg-[var(--cream)]",
              index === popIndex ? "daily-seg--pop" : "",
            ].join(" ")}
          />
        );
      })}
    </span>
  );
}
