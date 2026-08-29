import type { CSSProperties, ReactNode } from "react";

/**
 * 左上角那一列里每一块的**统一外壳**（V0.13）。
 *
 * 在此之前时钟、需求条、白噪音台各画各的框：三处重复同一串
 * `border-[3px] border-[var(--line-deep)] bg-[var(--cream)]/95 shadow backdrop-blur`，
 * 而宽度**谁都没声明**——时钟被里面那条 `w-32` 的日进度撑开、
 * 需求条被 `w-24` 的血条撑开、白噪音台自己写死 236px。三个宽度，
 * 一列里三种参差。
 *
 * 现在宽度只有一处：CSS 变量 `--hud-panel-w`（见 index.css）。
 * 里面的内容一律用 `w-full` / `flex-1` 铺满，**不许再有决定宽度的固定值**
 * ——那正是参差的来源。
 *
 * 皮肤复用 `.ui-bar`（外壳）+ `.ui-dash`（内侧虚线），和快捷栏同源。
 */
export function HudPanel({
  /** 虚线颜色。时钟按时段染色（凌晨桃、白天蓝、夜里紫），别的用默认桃色 */
  dash,
  /**
   * `paper` = 日记本语言的白卡（2026-08-29 起的新皮）。
   * 缺省还是奶油皮——换皮是分批的（专注时看得见的先换），
   * 时钟和需求条还穿着旧的，全换完这个开关和旧皮一起拆。
   */
  skin,
  className = "",
  children,
}: {
  dash?: string;
  skin?: "paper";
  className?: string;
  children: ReactNode;
}) {
  const shell = skin === "paper" ? "paper-card" : "ui-bar ui-dash";
  return (
    <div
      // relative 是 .ui-dash 那圈虚线要的定位锚点——它自己不设 position
      // （设了会顶掉别处的 absolute，见 index.css 里那段注释）
      className={`hud-panel ${shell} relative ${className}`}
      style={dash ? ({ "--dash": dash } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
