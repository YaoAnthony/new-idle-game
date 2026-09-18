import { t } from "./t";

/**
 * 带参数的文案（2026-09-17）。`t()` 只查表；参数替换在这里，写法和
 * 各处手写的 `.replace("{owner}", …)` 一样，只是收成一个函数。
 * 键写 `{name}`，参数表给 `{ name: "值" }`。
 */
export function tf(key: string, params?: Record<string, string | number>): string {
  let text = t(key);
  if (!params) return text;
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}

/**
 * 一段时长写成人话："1 小时 20 分" / "45 分钟" / "不到 1 分钟"。
 * 向上取整到分钟：气泡上写"还要 0 分钟"而田还没熟，玩家会以为坏了。
 */
export function formatDuration(ms: number): string {
  const minutes = Math.ceil(Math.max(0, ms) / 60_000);
  if (minutes < 1) return t("time.under_minute");
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return tf("time.minutes", { m: rest });
  if (rest === 0) return tf("time.hours", { h: hours });
  return tf("time.hours_minutes", { h: hours, m: rest });
}
