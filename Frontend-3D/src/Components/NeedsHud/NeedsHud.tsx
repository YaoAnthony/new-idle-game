import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { getNeeds } from "../../Game/State/needs";

/** 左下角饥饿/疲劳条（全局状态固定屏幕角落，不浮空） */
export function NeedsHud() {
  const [needs, setNeeds] = useState(getNeeds());

  useEffect(() => {
    return on("needs_changed", () => setNeeds(getNeeds()));
  }, []);

  const bar = (label: string, value: number, color: string) => (
    <div className="flex items-center gap-1.5">
      <span className="w-8 text-right text-[11px] text-white/75">{label}</span>
      <div className="h-2.5 w-24 overflow-hidden rounded-full border border-black/40 bg-black/45">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );

  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1 rounded-lg bg-black/35 px-2.5 py-2 backdrop-blur-sm">
      {bar("饱食", needs.hunger, "#e8a33c")}
      {bar("精力", needs.fatigue, "#7cb45f")}
    </div>
  );
}
