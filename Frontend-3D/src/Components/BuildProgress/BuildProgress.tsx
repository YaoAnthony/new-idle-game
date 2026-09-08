import { splitDuration } from "core";
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
 * 重渲染。所以：**有几块工地**（会变但很少变）走 state，**位置、进度、
 * 倒计时**（每帧都变）直接写 DOM。倒计时的字只在内容变了才写——
 * 它一分钟才变一次，每帧 textContent 赋值是白白触发排版。
 *
 * ## 2026-09-08 换皮 + 倒计时
 *
 * 原来是一根 7px 的深棕细条，配一行带黑影的小字——那是像素木框时代的
 * 遗物，在现在这套日记本语言里是全屏唯一一块深色 UI。换成白底胶囊 +
 * 琥珀填充 + 奶油标签，和 HUD 的时钟卡同一家。
 *
 * 倒计时是用户要的：一栋楼要建几天，只看百分比不知道"我该什么时候回来"。
 * 天 / 时 / 分三段按有没有省略：不到一天不显示"0天"，不到一小时不显示
 * "0小时"——"还剩 15分"比"还剩 0天 0小时 15分"像句人话。
 */

type Row = { instanceId: string; queued: boolean };

/** 毫秒 → "2天 3小时 15分"；到点了说"马上好" */
function describeRemaining(ms: number): string {
  const { days, hours, minutes } = splitDuration(ms);
  if (days === 0 && hours === 0 && minutes === 0) return t("build.almost_done");
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${t("unit.day")}`);
  if (days > 0 || hours > 0) parts.push(`${hours}${t("unit.hour")}`);
  parts.push(`${minutes}${t("unit.minute")}`);
  return `${t("build.remaining")} ${parts.join(" ")}`;
}

export function BuildProgress({ scene }: { scene: RoomScene | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const fills = useRef(new Map<string, HTMLDivElement>());
  const labels = useRef(new Map<string, HTMLSpanElement>());
  const lastLabel = useRef(new Map<string, string>());

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

        const label = labels.current.get(item.instanceId);
        if (label) {
          const text =
            item.remainingMs === null
              ? t("build.queued")
              : describeRemaining(item.remainingMs);
          if (lastLabel.current.get(item.instanceId) !== text) {
            lastLabel.current.set(item.instanceId, text);
            label.textContent = text;
          }
        }
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
          className="pointer-events-none absolute left-0 top-0 z-20 flex w-[150px] select-none flex-col items-center gap-1"
        >
          {/* 标签：奶油胶囊。在建 = "施工中 · 还剩 …"，排队 = "等着开工" */}
          <div className="flex max-w-full items-center gap-1 rounded-full border-2 border-[#FFE082] bg-[#FFF8E1] px-2.5 py-0.5 text-[11px] font-black leading-[1.4] text-[#5D4037] shadow-[0_3px_0_#FFE082,0_6px_12px_rgb(93_64_55_/_0.14)]">
            {!row.queued && <span className="shrink-0">{t("build.in_progress")}</span>}
            {!row.queued && <span className="shrink-0 text-[#BCAAA4]">·</span>}
            <span
              ref={(node) => {
                if (node) labels.current.set(row.instanceId, node);
                else {
                  labels.current.delete(row.instanceId);
                  lastLabel.current.delete(row.instanceId);
                }
              }}
              className={`whitespace-nowrap ${row.queued ? "text-[#8D6E63]" : "text-[#F57F17]"}`}
            />
          </div>

          {/* 条：白底胶囊 + 琥珀填充；排队是灰的——它不会自己往前走，给个会动的颜色是撒谎 */}
          <div className="h-[10px] w-full overflow-hidden rounded-full border-2 border-[#EEEEEE] bg-white shadow-[0_2px_0_#E0E0E0]">
            <div
              ref={(node) => {
                if (node) fills.current.set(row.instanceId, node);
                else fills.current.delete(row.instanceId);
              }}
              className={[
                "h-full rounded-full transition-[width] duration-150",
                row.queued
                  ? "bg-[#D7CCC8]"
                  : "bg-[linear-gradient(90deg,#FFCA28,#FFA726)] shadow-[inset_0_-2px_0_rgb(0_0_0_/_0.08)]",
              ].join(" ")}
              style={{ width: "0%" }}
            />
          </div>
        </div>
      ))}
    </>
  );
}
