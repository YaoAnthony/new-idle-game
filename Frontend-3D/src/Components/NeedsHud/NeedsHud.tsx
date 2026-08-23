import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { t } from "../../i18n/t";
import { getNeeds } from "../../Game/State/needs";
import { HudPanel } from "../Hud/HudPanel";

/**
 * 饥饿/疲劳条。定位和外壳都由左上角那一列托管（见 Hud/HudColumn），
 * 这里只出内容。
 *
 * 原来有个 `stacked` 开关，false 时自己 `absolute bottom-4 left-4`——
 * 那是"桌面在左下角、触摸端进列"的旧分法。两端都进列之后没人再传 false，
 * 留着只是让人以为还有第二种摆法。
 */
export function NeedsHud() {
  const [needs, setNeeds] = useState(getNeeds());

  useEffect(() => {
    return on("needs_changed", () => setNeeds(getNeeds()));
  }, []);

  const bar = (label: string, emoji: string, value: number, color: string) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[13px] leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="w-8 text-right text-[11px] text-[var(--ink-soft)]">
        {label}
      </span>
      <div className="h-[9px] flex-1 overflow-hidden rounded-full bg-[var(--cream-3)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );

  return (
    <HudPanel className="flex flex-col gap-1.5">
      {bar(t("ui.needs.hunger"), "🍙", needs.hunger, "#f4b942")}
      {bar(t("ui.needs.fatigue"), "🌿", needs.fatigue, "#63c0a8")}
    </HudPanel>
  );
}
