import { useEffect, useRef, useState } from "react";
import type { RoomScene } from "../../Game3D/World/RoomScene";
import { t } from "../../i18n/t";

/**
 * 家具交互气泡。附着在家具上方的世界坐标，随镜头移动/旋转/缩放实时跟随。
 *
 * 内容完全来自物品的 `placement.interactHint`（Core 注册表）——
 * 加一件带提示的家具只需填数据，这里一行不用改。
 *
 * 每帧从场景拉取投影后的屏幕坐标，用 transform 定位（不触发重排）。
 */

/**
 * 动作 → 按键标签。V0.2 要求键位可重映射，
 * 接入 InputMap 后这张表改成查当前绑定即可。
 */
const ACTION_KEY: Record<string, string> = {
  interact: "F",
  sleep: "F",
  pickup: "右键",
};

type BubbleState = {
  instanceId: string;
  localizationKey: string;
  action?: string;
  x: number;
  y: number;
};

export function InteractBubble({ scene }: { scene: RoomScene | null }) {
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scene) {
      setBubble(null);
      return;
    }

    let frame = 0;
    let lastKey = "";

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const next = scene.getHintBubble();

      // 位置每帧都要更新（跟随镜头），但只有内容变了才触发 React 重渲染
      const key = next ? `${next.instanceId}:${next.localizationKey}` : "";
      if (key !== lastKey) {
        lastKey = key;
        setBubble(next);
      }

      const node = nodeRef.current;
      if (node && next) {
        node.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) translate(-50%, -100%)`;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene]);

  if (!bubble) return null;

  const keyLabel = bubble.action ? ACTION_KEY[bubble.action] : null;

  return (
    <div
      ref={nodeRef}
      className="pointer-events-none fixed left-0 top-0 z-20 will-change-transform"
    >
      <div className="ui-bubble flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5">
        {keyLabel && (
          <span className="grid min-w-[22px] place-items-center rounded border-2 border-[#6b4426] bg-[#f2d98c] px-1 text-[12px] font-bold leading-tight text-[#4a3020]">
            {keyLabel}
          </span>
        )}
        <span className="text-[13px] leading-tight text-[#3d2817]">
          {t(bubble.localizationKey)}
        </span>
      </div>
      {/* 小尖角，指向家具 */}
      <div className="ui-bubble-tail mx-auto h-0 w-0" />
    </div>
  );
}
