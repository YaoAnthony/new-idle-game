import { bumpStat } from "../State/stats";
import { getActiveAction } from "./actions";
import { activeLoops } from "../../Game3D/Engine/AudioEngine";

/**
 * 白噪音计时（2026-09-12，成就 noise_lover 的记账点）。
 *
 * "白噪音开着"没有一个现成的事件：混音台是几条循环音轨（AudioEngine 的 loop），
 * 专注时自动生活把它们放起来、玩家在 NoiseMixer 里调音量。所以这里按墙钟每分钟
 * 看一眼：**有行动在专注 + 有循环在响** 就记一分钟到统计表 `noise_minutes`。
 *
 * 用真实分钟不用游戏分钟：成就写的是"使用白噪音 10 分钟"，玩家的感受是真实时间。
 * 不精确到秒也没关系，成就门槛是 10。
 */
const TICK_MS = 60_000;

export function startNoiseClock(): () => void {
  const timer = setInterval(() => {
    if (!getActiveAction()) return;
    if (activeLoops().length === 0) return;
    bumpStat("noise_minutes");
  }, TICK_MS);
  return () => clearInterval(timer);
}
