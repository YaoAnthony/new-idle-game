import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { t } from "../../i18n/t";
import { getNeeds } from "../../Game/State/needs";

type Props = {
  /** 由外层的"左上角列"托管定位（触摸端）。见 Game3D/index.tsx */
  stacked?: boolean;
};

/** 饥饿/疲劳条。桌面在左下角，触摸端进左上角那一列（全局状态固定屏幕角落，不浮空） */
export function NeedsHud({ stacked = false }: Props) {
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
      <div className="h-[9px] w-24 overflow-hidden rounded-full bg-[var(--cream-3)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );

  return (
    /*
     * 桌面端也进左上角那一列了（原来在左下角）。挪动的理由有两个：
     * 左下角整块是聊天记录的地盘，两者重叠时血条被文字压住（实测截图里
     * "饥饿"那条正好垫在消息底下）；触摸端那儿还是摇杆的感应区。
     * 全局状态该待在同一个角落，分两处摆本来就没道理。
     */
    <div
      className={[
        "z-10 flex flex-col gap-1.5 rounded-[18px] border-[3px] border-[var(--line-deep)] bg-[var(--cream)]/95 px-3 py-2 shadow-[var(--soft-shadow)] backdrop-blur-sm",
        stacked ? "" : "absolute bottom-4 left-4",
      ].join(" ")}
    >
      {bar(t("ui.needs.hunger"), "🍙", needs.hunger, "#f4b942")}
      {bar(t("ui.needs.fatigue"), "🌿", needs.fatigue, "#63c0a8")}
    </div>
  );
}
