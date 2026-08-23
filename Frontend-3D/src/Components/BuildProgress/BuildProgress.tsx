import { useEffect, useRef, useState } from "react";

import type { RoomScene } from "../../Game3D/World/RoomScene";
import { t } from "../../i18n/t";

/**
 * 工地头顶的进度条。贴在建筑上方的世界坐标，随镜头实时跟随。
 *
 * 和交互气泡走**同一条管线**（世界坐标 → NDC → 容器内像素 → transform
 * 定位，rAF 每帧拉一次），因为它们是同一类东西：贴在世界物体上的一小块
 * UI。那条管线已经验证过，不另造轮子。
 *
 * ## 每帧动的是 style，不是 React state
 *
 * 位置和百分比每帧都变，走 setState 的话一块工地就能让整棵 UI 树每帧
 * 重渲染。所以：**有几块工地**（会变但很少变）走 state，**位置和进度**
 * （每帧都变）直接写 DOM。气泡那边也是这么分的。
 */

type Row = { instanceId: string; queued: boolean };

export function BuildProgress({ scene }: { scene: RoomScene | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const fills = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!scene) {
      setRows([]);
      return;
    }

    let frame = 0;
    let lastKey = "";

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const list = scene.getBuildingProgress();

      // "有哪几块、排没排队"变了才惊动 React
      const key = list.map((item) => `${item.instanceId}:${item.queued}`).join("|");
      if (key !== lastKey) {
        lastKey = key;
        setRows(list.map(({ instanceId, queued }) => ({ instanceId, queued })));
      }

      for (const item of list) {
        const node = nodes.current.get(item.instanceId);
        if (node) {
          node.style.transform = `translate3d(${item.x}px, ${item.y}px, 0) translate(-50%, -100%)`;
        }
        const fill = fills.current.get(item.instanceId);
        if (fill) fill.style.width = `${Math.round(item.progress * 100)}%`;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene]);

  if (rows.length === 0) return null;

  return (
    <>
      {rows.map((row) => (
        <div
          key={row.instanceId}
          ref={(node) => {
            if (node) nodes.current.set(row.instanceId, node);
            else nodes.current.delete(row.instanceId);
          }}
          className="pointer-events-none absolute left-0 top-0 z-20 w-[104px] select-none"
        >
          <div className="mb-0.5 text-center text-[10px] font-semibold text-[#f4e6c0] [text-shadow:0_1px_2px_rgb(0_0_0_/_0.8)]">
            {t(row.queued ? "build.queued" : "build.in_progress")}
          </div>
          <div className="h-[7px] w-full overflow-hidden rounded-full border border-[#3a2a18] bg-[#2b2118]/80">
            <div
              ref={(node) => {
                if (node) fills.current.set(row.instanceId, node);
                else fills.current.delete(row.instanceId);
              }}
              className={[
                "h-full rounded-full transition-[width] duration-150",
                // 排队中是灰的：它**不会自己往前走**，给个会动的颜色是撒谎
                row.queued ? "bg-[#8a8175]" : "bg-[#e9a83c]",
              ].join(" ")}
              style={{ width: "0%" }}
            />
          </div>
        </div>
      ))}
    </>
  );
}
