import type { ComponentPropsWithRef, CSSProperties, ReactNode } from "react";
import "./GameBtn.css";

type GameBtnSize = "sm" | "md" | "lg";

export type GameBtnProps = ComponentPropsWithRef<"button"> & {
  children: ReactNode;
  size?: GameBtnSize;
  selected?: boolean;
  fullWidth?: boolean;
};

export function GameBtn({
  children,
  className = "",
  size = "md",
  selected = false,
  fullWidth = false,
  style,
  ...buttonProps
}: GameBtnProps) {
  const classes = [
    "game-btn",
    `game-btn--${size}`,
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
