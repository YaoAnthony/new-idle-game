import { useEffect, useRef } from "react";
import { on } from "../../Game/EventBus";

/**
 * 金币飞行演出：收银台领钱时，一串金币从收银台的屏幕位置抛进左上角的
 * 金币条（`data-gold-hud` 标记的那根玻璃管）。
 *
 * ---- 纯演出 ----
 *
 * 钱在事件发出**之前**已经入账（`claimRevenue`），这里掉一帧、被关掉、
 * 标签页藏起来，都不丢钱——和开箱演出同一纪律。所以实现选了最省事的
 * 一条路：直接操作 DOM + Web Animations API，不进 React 状态、不重渲染
 * ——一次演出十几个元素，走 setState 每帧刷新纯属自找。
 *
 * ---- 轨迹 ----
 *
 * 三点二次贝塞尔：起点（收银台）→ 控制点（两点中点抬高一截）→ 终点
 * （金币条）。WAAPI 不吃贝塞尔路径，所以按 12 个关键帧采样——肉眼和
 * 真曲线分不出来，而 `offset-path` 那套在这个场景里是杀鸡用牛刀。
 * 每枚错开 60ms 起飞，"哗啦啦"是错峰给的，不是数量给的。
 */

/** 一次最多飞几枚。金额再大也别下金币雨——数量表达的是"有一笔钱"，不是余额 */
const MAX_COINS = 12;
const FLIGHT_MS = 620;
const STAGGER_MS = 60;

function flyOne(
  layer: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  delay: number,
): void {
  const coin = document.createElement("div");
  coin.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "width:16px",
    "height:16px",
    "border-radius:999px",
    // 日记本语言的琥珀：面 FFCA28、沿 FF8F00，一道高光就够读成硬币
    "background:radial-gradient(circle at 35% 30%, #ffe082 0%, #ffca28 45%, #ff8f00 100%)",
    "box-shadow:0 1px 0 #e65100",
    "pointer-events:none",
    "z-index:80",
  ].join(";");
  layer.appendChild(coin);

  // 控制点：中点上方抛一截，抛得高不高跟着距离走
  const midX = (from.x + to.x) / 2;
  const midY = Math.min(from.y, to.y) - Math.hypot(to.x - from.x, to.y - from.y) * 0.25;

  const frames = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    const x =
      (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * midX + t * t * to.x;
    const y =
      (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * midY + t * t * to.y;
    return {
      transform: `translate(${x - 8}px, ${y - 8}px) scale(${1 - t * 0.35})`,
      opacity: t > 0.9 ? 1 - (t - 0.9) * 10 : 1,
    };
  });

  const animation = coin.animate(frames, {
    duration: FLIGHT_MS,
    delay,
    easing: "ease-in",
    fill: "backwards",
  });
  animation.onfinish = () => coin.remove();
}

export function CoinFlight() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      on("coin_fly_requested", ({ amount, x, y }) => {
        const layer = layerRef.current;
        const hud = document.querySelector("[data-gold-hud]");
        if (!layer || !hud) return;

        const rect = hud.getBoundingClientRect();
        const to = { x: rect.right - 18, y: rect.top + rect.height / 2 };
        // 一枚≈一金，多了封顶（见 MAX_COINS 的注释）
        const coins = Math.max(3, Math.min(MAX_COINS, amount));
        for (let i = 0; i < coins; i += 1) {
          // 起点撒一点开，别十二枚叠成一枚
          flyOne(
            layer,
            { x: x + (Math.random() - 0.5) * 26, y: y + (Math.random() - 0.5) * 14 },
            to,
            i * STAGGER_MS,
          );
        }
      }),
    [],
  );

  return <div ref={layerRef} aria-hidden />;
}
