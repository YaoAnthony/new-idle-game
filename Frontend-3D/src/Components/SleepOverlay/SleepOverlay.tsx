import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";

/** 睡觉时的黑屏：缓缓压暗，"呼——"，醒来淡出 */
export function SleepOverlay() {
  const [sleeping, setSleeping] = useState(false);

  useEffect(() => {
    return on("sleep_changed", ({ phase }) => setSleeping(phase === "start"));
  }, []);

  return (
    <div
      className={[
        "pointer-events-none absolute inset-0 z-40 grid place-items-center bg-[#0a0c14] transition-opacity duration-1000",
        sleeping ? "opacity-95" : "opacity-0",
      ].join(" ")}
    >
      {sleeping && (
        <div className="animate-pulse text-[20px] tracking-[0.5em] text-white/50">
          呼——
        </div>
      )}
    </div>
  );
}
