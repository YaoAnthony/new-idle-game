import { findExpression } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { getResidents } from "../../Game/State/residentsRuntime";
import { talkText } from "../../Game/Systems/residents/talk";
import type { RoomScene } from "../../Game3D/World/RoomScene";
import { t } from "../../i18n/t";

/**
 * 居民头顶的气泡（居民系统 03）：招呼的一句话 + 表情小图标。
 *
 * 数据只有两处：`ResidentAgent.speech`（`speak` 动词写的）和 `.expression`
 * （`showExpression` 写的）。这里每帧读一遍谁在说 / 谁在做表情，位置从
 * `RoomScene.getResidentAnchor` 投影——和玩家的 SpeechBubble 同一套投影，
 * 镜头缩放时两种气泡才对得齐。
 *
 * 手机横屏 667×375 上气泡宽度封 180，两行截断（`line-clamp-2`）。
 * 表情图标先用 emoji（`expr.*` 文案），美术图到了换 `<img>`，这里不改结构。
 */
type Shown = {
  residentId: string;
  x: number;
  y: number;
  text: string | null;
  icon: string | null;
};

export function ResidentBubbles({ scene }: { scene: RoomScene | null }) {
  const [shown, setShown] = useState<Shown[]>([]);
  // 有人开口 / 做表情时立刻起一轮；没人说话时帧循环自己会停下来
  const [, poke] = useState(0);

  useEffect(() => {
    return on("resident_changed", ({ reason }) => {
      if (reason === "speak" || reason === "expression") poke((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    if (!scene) return;
    let frame = 0;
    let idleFrames = 0;
    const tick = () => {
      const next: Shown[] = [];
      for (const resident of getResidents()) {
        const speech = resident.speech;
        const expression = resident.expression;
        if (!speech && !expression) continue;
        const anchor = scene.getResidentAnchor(resident.residentId);
        if (!anchor) continue;
        next.push({
          residentId: resident.residentId,
          x: anchor.x,
          y: anchor.y,
          text: speech ? talkText(resident.definitionId, speech.localizationKey) : null,
          icon: expression ? t(findExpression(expression.id)?.iconKey ?? "") || null : null,
        });
      }
      setShown(next);
      // 连续几十帧没人说话就停掉循环；下一次 resident_changed 会再起
      idleFrames = next.length === 0 ? idleFrames + 1 : 0;
      if (idleFrames < 30) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  if (shown.length === 0) return null;

  return (
    <>
      {shown.map((bubble) => (
        <div
          key={bubble.residentId}
          className="pointer-events-none fixed left-0 top-0 z-20 will-change-transform"
          style={{ transform: `translate3d(${bubble.x}px, ${bubble.y}px, 0) translate(-50%, -100%)` }}
        >
          <div className="ui-bubble flex max-w-[180px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] leading-tight text-[#3d2817]">
            {bubble.icon && (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fff6dc] text-[14px] leading-none">
                {bubble.icon}
              </span>
            )}
            {bubble.text && <span className="line-clamp-2">{bubble.text}</span>}
          </div>
          <div className="ui-bubble-tail mx-auto h-0 w-0" />
        </div>
      ))}
    </>
  );
}
