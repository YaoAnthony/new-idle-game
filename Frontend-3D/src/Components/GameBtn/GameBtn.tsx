import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import "./GameBtn.css";

type GameBtnSize = "sm" | "md" | "lg";

/**
 * 分量，不是颜色偏好：mint = 这一屏的主动作（一屏最多一个），
 * cream = 次要，peach = 危险 / 需要停一下的动作。
 */
type GameBtnTone = "cream" | "mint" | "peach";

export type GameBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  size?: GameBtnSize;
  tone?: GameBtnTone;
  selected?: boolean;
  fullWidth?: boolean;
};

export function GameBtn({
  children,
  className = "",
  size = "md",
  tone = "cream",
  selected = false,
  fullWidth = false,
  style,
  ...buttonProps
}: GameBtnProps) {
  const classes = [
    "game-btn",
    `game-btn--${size}`,
    `game-btn--${tone}`,
    selected ? "game-btn--selected" : "",
    fullWidth ? "game-btn--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...buttonProps}
      className={classes}
      style={style as CSSProperties}
    >
      <span className="game-btn__label">{children}</span>
    </button>
  );
}
