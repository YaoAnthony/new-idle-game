import { useEffect, useRef, useState } from "react";
import { on } from "../../Game/EventBus";
import type { RoomScene } from "../../Game3D/World/RoomScene";

/**
 * 玩家说话时头顶冒的气泡。
 *
 * 和 InteractBubble 共用 RoomScene 的投影（`getSpeechAnchor`）——各写一份
 * 的话镜头一缩放两个气泡就对不齐，它们本来就该在同一个平面上。
 *
 * 说的话同时也进了消息记录（ChatPanel 那条流），这里只负责"世界里能看见
 * 你在说话"。两边不是重复：一个是历史，一个是当下发生的事。
 */

/** 气泡挂多久。够读完一句短话，又不至于跟着人满屋子飘 */
const HOLD_MS = 3200;

export function SpeechBubble({ scene }: { scene: RoomScene | null }) {
  const [text, setText] = useState<string | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return on("player_said", (payload) => {
      setText(payload.text);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setText(null), HOLD_MS);
    });
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!scene || !text) return;

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const anchor = scene.getSpeechAnchor();
      const node = nodeRef.current;
      if (!node) return;

      // 转到镜头背后时藏起来，而不是让气泡黏在屏幕边上
      if (!anchor) {
        node.style.visibility = "hidden";
        return;
      }
      node.style.visibility = "visible";
      node.style.transform = `translate3d(${anchor.x}px, ${anchor.y}px, 0) translate(-50%, -100%)`;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, text]);

  if (!text) return null;

  return (
    <div
      ref={nodeRef}
      className="pointer-events-none fixed left-0 top-0 z-20 will-change-transform"
    >
      <div className="ui-bubble max-w-[240px] rounded-lg px-2.5 py-1.5 text-[13px] leading-tight text-[#3d2817]">
        {text}
      </div>
      <div className="ui-bubble-tail mx-auto h-0 w-0" />
    </div>
  );
}
