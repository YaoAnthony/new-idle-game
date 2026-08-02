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
    /*
     * 触摸端不留在左下角：那整块是摇杆的感应区，两条血条压在上面既挡视线
     * 又抢不到点击（感应区 z 更高）。挪走后由外层的左上角列排它的位置——
     * 第一版写的是固定 top-24，但教程提示条在窄屏上会换行变高，
     * 撞上来只是时间问题，所以改成让 flex 列去算。
     */
    <div
      className={[
        "z-10 flex flex-col gap-1 rounded-lg bg-black/35 px-2.5 py-2 backdrop-blur-sm",
        stacked ? "" : "absolute bottom-4 left-4",
      ].join(" ")}
    >
      {bar(t("ui.needs.hunger"), needs.hunger, "#e8a33c")}
      {bar(t("ui.needs.fatigue"), needs.fatigue, "#7cb45f")}
    </div>
  );
}
