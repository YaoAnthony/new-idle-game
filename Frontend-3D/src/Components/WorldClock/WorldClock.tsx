import { DayPhaseId, findWeatherDefinition } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { formatLocalTime, getClock } from "../../Game/State/clock";
import { getWeather } from "../../Game/State/weather";
import { t } from "../../i18n/t";

/**
 * 世界时钟 HUD：日期、时刻、时段、天气。
 *
 * 时间在本作里是**真实时间**（不加速、不暂停），所以这块面板同时也是
 * 一句提醒——屋里过的就是你现实里过的这一天。
 *
 * 每 10 秒刷一次就够（时钟本身 5 秒采样），跨时段/换天气时另有事件补刷。
 */

const PHASE_LABEL: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "clock.phase.dawn",
  [DayPhaseId.Day]: "clock.phase.day",
  [DayPhaseId.Dusk]: "clock.phase.dusk",
  [DayPhaseId.Night]: "clock.phase.night",
};

/** 时段的色调。和窗外天空同一个方向，让 HUD 和画面呼应 */
const PHASE_TINT: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "#ffc9a0",
  [DayPhaseId.Day]: "#9fd0f0",
  [DayPhaseId.Dusk]: "#ff9a5e",
  [DayPhaseId.Night]: "#8f9dd0",
};

export function WorldClock() {
  const [, setFrame] = useState(0);
  const redraw = () => setFrame((value) => value + 1);

  useEffect(() => {
    const timer = setInterval(redraw, 10_000);
    const offs = [
      on("day_phase_changed", redraw),
      on("world_day_changed", redraw),
      on("weather_changed", redraw),
    ];

    return () => {
      clearInterval(timer);
      for (const off of offs) off();
    };
  }, []);

  const clock = getClock();
  const weather = getWeather();
  const tint = PHASE_TINT[clock.phase];

  // 当天进度条：从凌晨 4 点的 rollover 起算
  const dayPercent = Math.round(clock.dayProgress * 100);

  return (
    <div className="pointer-events-none absolute right-3 top-14 z-10 flex flex-col gap-1 rounded-lg bg-black/35 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-baseline gap-2">
        <span
          className="text-[20px] font-bold leading-none tabular-nums"
          style={{ color: tint }}
        >
          {formatLocalTime(clock)}
        </span>
        <span className="text-[11px] text-white/70">
          {t(PHASE_LABEL[clock.phase])}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-white/60">
        <span className="tabular-nums">{clock.worldDayId}</span>
        <span aria-hidden>·</span>
        <span>
          {t(
            findWeatherDefinition(weather.id)?.localizationKey ??
              "weather.sunny",
          )}
        </span>
      </div>

      {/* 一天的进度。看一眼就知道今天过了多少 */}
      <div className="mt-0.5 h-1 w-28 overflow-hidden rounded-full bg-black/45">
        <div
          className="h-full rounded-full transition-[width] duration-1000"
          style={{ width: `${dayPercent}%`, backgroundColor: tint }}
        />
      </div>
    </div>
  );
}
