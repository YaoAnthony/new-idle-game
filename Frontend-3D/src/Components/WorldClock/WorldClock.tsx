import { DayPhaseId, findWeatherDefinition } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { formatLocalTime, getClock } from "../../Game/State/clock";
import { getWeather } from "../../Game/State/weather";
import { t } from "../../i18n/t";
import { HudPanel } from "../Hud/HudPanel";

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

/**
 * 时段的色调。和窗外天空同一个方向，让 HUD 和画面呼应。
 *
 * 整体降了饱和度：面板底色从半透明黑换成奶油白之后，原来那几个
 * 为深色底调的亮色（#9fd0f0 这种）在浅底上直接糊掉，读不出数字。
 * 现在每档都取"能在奶油底上站住"的深度。
 */
const PHASE_TINT: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "#f2907a",
  [DayPhaseId.Day]: "#5aa7d8",
  [DayPhaseId.Dusk]: "#e8834f",
  [DayPhaseId.Night]: "#8d84c9",
};

/** 时段的小图标。一眼认时段比读"白天/夜晚"两个字快 */
const PHASE_EMOJI: Record<DayPhaseId, string> = {
  [DayPhaseId.Dawn]: "🌅",
  [DayPhaseId.Day]: "☀️",
  [DayPhaseId.Dusk]: "🌇",
  [DayPhaseId.Night]: "🌙",
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

  // 当天进度条：从 rollover 起算（现在是 00:00，见 Core/Data/time）
  const dayPercent = Math.round(clock.dayProgress * 100);

  return (
    /*
     * 定位交给 Game3D 的左上角列（见那里的注释），这里只管长相。
     *
     * `ui-dash` 就是那圈贴着框内侧的虚线（定义在 index.css）。虚线颜色跟着
     * 时段走——凌晨是桃色、白天是天蓝、夜里是藕紫，所以用内联的 --dash
     * 覆盖默认值，而不是给每个时段写一个 class。
     */
    <HudPanel dash={tint} className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span
          className="text-[26px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: tint }}
        >
          {formatLocalTime(clock)}
        </span>
        {/*
          时段做成小药丸而不是裸文字：它和时间数字挨着，同为文字时
          两者会读成一句话（"13:04白天"），加个底就分得开了。
        */}
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{ backgroundColor: `${tint}26`, color: tint }}
        >
          {PHASE_EMOJI[clock.phase]} {t(PHASE_LABEL[clock.phase])}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-soft)]">
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
      <div className="h-[6px] w-full overflow-hidden rounded-full bg-[var(--cream-3)]">
        <div
          className="h-full rounded-full transition-[width] duration-1000"
          style={{ width: `${dayPercent}%`, backgroundColor: tint }}
        />
      </div>
    </HudPanel>
  );
}
