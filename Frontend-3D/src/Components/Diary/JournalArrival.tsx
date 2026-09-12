import { useEffect, useRef, useState, type RefObject } from "react";
import { on } from "../../Game/EventBus";
import { signal } from "../../Game/Systems/story";
import { SparkField } from "../Effects/sparks";
import { bumpStat } from "../../Game/State/stats";

/**
 * 日记本飞进右上角的 DOM 段（开场二，2026-09-12）。
 *
 * 3D 段（Game3D/World/JournalFlight）把书飞到画面正中央就停了，发
 * `journal_flight_handoff` 带着它的屏幕位置和像素高度。这里在**同一个位置、
 * 同一个大小**放一张同图的 <img>，接着"嗖"到右上角那颗按钮上：0.55 s，
 * 先慢后快再收（smootherstep），身后拖一条星光尾迹（Effects/sparks），
 * 落地那一拍在按钮上炸一圈，同时发剧情信号 `journal_taken`——功能解锁、
 * 按钮弹出、教程弹出全由 storyRules 接，这里不认识"日记本功能"。
 *
 * 为什么信号在 DOM 段落地时发而不是 3D 段结束时发：按钮出现和"书到了"
 * 得是同一瞬间，早半秒按钮就先冒出来等着书，读起来像两件事。
 *
 * 图和 3D 书的尺寸对齐：3D 段报的是书长边的像素高；图标里的书占整张图
 * 约 74%，所以图要放大到 size / 0.74，两边交接那一帧才不像换了一本书。
 */
const IMG_OVER_BOOK = 1 / 0.74;
const DURATION = 0.55;

type Geometry = { x: number; y: number; size: number };

export function JournalArrival({ target }: { target: RefObject<HTMLElement | null> }) {
  const [flight, setFlight] = useState<Geometry | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => on("journal_flight_handoff", (geometry) => setFlight(geometry)), []);

  useEffect(() => {
    if (!flight) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const button = target.current;
    if (!img || !canvas || !button) {
      // 没地方可飞（按钮没挂上）：别卡住剧情，直接当作到了
      bumpStat("journal_taken");
      signal("journal_taken", "journal");
      setFlight(null);
      return;
    }
    const field = new SparkField(canvas);
    /*
     * 终点 = 按钮中心。此刻按钮还缩在 0.001（键没开），getBoundingClientRect 含 transform，
     * 宽高都是 0——中心点照样准（缩放绕中心），尺寸得用 offsetWidth（布局宽，不含 transform）。
     */
    const rect = button.getBoundingClientRect();
    const end = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: button.offsetWidth * 0.78 };
    const start = { x: flight.x, y: flight.y, size: flight.size * IMG_OVER_BOOK };
    // 尾迹往身后撒：方向是从终点指回起点
    const back = Math.atan2(start.y - end.y, start.x - end.x);
    const t0 = performance.now();
    let last = t0;
    let landed = false;
    let budget = 0;
    let raf = 0;

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / 1000 / DURATION);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const a = t * t * t * (t * (t * 6 - 15) + 10);
      const x = start.x + (end.x - start.x) * a;
      const y = start.y + (end.y - start.y) * a;
      const size = start.size + (end.size - start.size) * a;
      img.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      img.style.width = `${size}px`;

      if (!landed) {
        budget += 160 * dt;
        for (; budget >= 1; budget -= 1) field.emit(x, y, 1, { dir: back, spread: 1.1, speed: 40 });
        if (t >= 1) {
          landed = true;
          img.style.opacity = "0";
          field.burst(end.x, end.y, 22, 150);
          bumpStat("journal_taken");
          signal("journal_taken", "journal");
        }
      }
      const alive = field.render(now);
      if (!landed || alive > 0) raf = requestAnimationFrame(frame);
      else setFlight(null);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [flight, target]);

  if (!flight) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <img
        ref={imgRef}
        src="/icons/journal.png"
        alt=""
        className="absolute left-0 top-0 drop-shadow-[0_6px_10px_rgba(40,30,50,0.45)]"
        style={{
          transform: `translate(${flight.x}px, ${flight.y}px) translate(-50%, -50%)`,
          width: flight.size * IMG_OVER_BOOK,
        }}
        draggable={false}
      />
    </div>
  );
}
