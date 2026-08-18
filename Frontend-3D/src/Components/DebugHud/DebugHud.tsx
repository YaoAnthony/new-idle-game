import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { isDebugMode, readDebugProbe } from "../../Game/State/debugMode";
import { HudPanel } from "../Hud/HudPanel";

/**
 * F3 调试面板（第一版：只显示坐标）。住在左上角那一列的最底下，
 * 外壳/宽度/定位全交给 HudColumn + HudPanel，这里只出内容。
 *
 * **不订阅位置事件，10Hz 轮询探针**：坐标每帧都变，走事件总线会把
 * 全 UI 树刷成每帧一次；而调试读数 100ms 一刷肉眼看不出差别。
 * 关掉就返回 null——不占位、不轮询。
 *
 * 数字用 tabular-nums：数值跳动时列不会左右抖。
 */
export function DebugHud() {
  const [enabled, setEnabled] = useState(isDebugMode());
  const [probe, setProbe] = useState(readDebugProbe());

  useEffect(() => on("debug_mode_changed", ({ enabled }) => setEnabled(enabled)), []);

  useEffect(() => {
    if (!enabled) return;
    setProbe(readDebugProbe());
    const timer = window.setInterval(() => setProbe(readDebugProbe()), 100);
    return () => window.clearInterval(timer);
  }, [enabled]);

  if (!enabled) return null;

  const fmt = (v: number | undefined): string =>
    v === undefined ? "—" : (v >= 0 ? " " : "") + v.toFixed(2);

  const row = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wide text-[var(--ink-soft)]">
        {label}
      </span>
      <span className="font-mono text-[12px] tabular-nums text-[var(--ink)]">
        {value}
      </span>
    </div>
  );

  return (
    <HudPanel className="flex flex-col gap-1" dash="#8aa0b8">
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--ink)]">调试</span>
        <span className="text-[10px] text-[var(--ink-soft)]">F3 关</span>
      </div>
      {row("x", fmt(probe?.x))}
      {row("y", fmt(probe?.y))}
      {row("z", fmt(probe?.z))}
      {row("地面", fmt(probe?.groundY))}
      {row("地图", probe?.mapId ?? "—")}
    </HudPanel>
  );
}
