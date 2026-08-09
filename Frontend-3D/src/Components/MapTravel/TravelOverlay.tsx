import { useEffect, useRef, useState } from "react";
import { on } from "../../Game/EventBus";
import { t } from "../../i18n/t";

/**
 * 换箱庭时的加载遮罩（①B）。
 *
 * 实际的换图是同步的（状态切换 + 场景重建加起来百毫秒级），遮罩的
 * 意义一半是盖住拆旧建新那几帧的闪变，一半是**给"去了另一个地方"
 * 一个仪式感**——瞬移到另一张图反而让人怀疑是不是穿模了。
 *
 * 所以有一个最短显示时长：map_scene_ready 来得再快，也至少停
 * MIN_VISIBLE_MS 再揭幕。淡出交给 CSS transition。
 */

const MIN_VISIBLE_MS = 700;

export function TravelOverlay() {
  const [target, setTarget] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const offChanged = on("map_changed", ({ localizationKey }) => {
      if (hideTimer) clearTimeout(hideTimer);
      shownAt.current = Date.now();
      setTarget(localizationKey);
      setLeaving(false);
    });

    const offReady = on("map_scene_ready", () => {
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
      hideTimer = setTimeout(() => {
        setLeaving(true);
        // 等淡出动画走完再卸载
        hideTimer = setTimeout(() => setTarget(null), 450);
      }, wait);
    });

    return () => {
      offChanged();
      offReady();
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  if (target === null) return null;

  return (
    <div
      className={[
        "absolute inset-0 z-50 flex flex-col items-center justify-center",
        "bg-[#241d18] transition-opacity duration-[400ms]",
        leaving ? "opacity-0" : "opacity-100",
      ].join(" ")}
    >
      <div className="text-[15px] font-bold tracking-[0.3em] text-[#e8dcc4]">
        {t(target)}
      </div>
      <div className="mt-3 text-[12px] tracking-[0.2em] text-[#9a8b74]">
        {t("ui.travel.moving")}
      </div>
    </div>
  );
}
