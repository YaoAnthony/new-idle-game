import { Rarity, findItemDefinition } from "core";
import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  ConeGeometry,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { on } from "../../Game/EventBus";
import { buildChest, type ChestTier } from "../../Game3D/Visual/recipes/chest";
import { disposeTree } from "../../Game3D/Visual/primitives";
import { t } from "../../i18n/t";
import { ItemIcon } from "../Inventory/slots";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";
import { chainColor, chainEmoji } from "../ActionHub/chainVisuals";

/**
 * 开箱面板：系列任务的节点完成（小箱）/ 整链结项（大箱）时弹出。
 *
 * 面板里嵌一小块 canvas 跑**独立的三维小场景**（定案：面板里的 3D 小窗）：
 * 一个箱子、一盏主光、一盏轮廓光、暖光柱。箱子的档位跟着**抽到的物品
 * 稀有度**走——木/银/金三个不同的设计（recipes/chest.ts），大箱 = 同模型
 * 放大一号 + 抖三下 + 纸屑。
 *
 * 四拍（对照施工图）：
 *   0.00s 从上方落进小窗、砸地轻微下压（治愈系，不要硬冲击）
 *   0.15s squash & stretch 抖动——曲线和快捷栏选中同一条弹性曲线，
 *         小箱两下、大箱三下
 *   0.55s 盖子绕后沿翻开（chest-lid 子组），暖光柱从箱口打上来
 *   0.70s 物品卡从箱口方向落下来，间隔 80ms，落位回弹
 *
 * 事件到达时奖励**早已入包**（Systems 在完成那一刻发的），这里纯演出：
 * 错过、关掉、崩了都不丢东西。多个箱子排队一个个开（节点箱和链箱
 * 常常同一刻到）。
 */

type ChestEvent = {
  size: "node" | "chain";
  title: string;
  chainId: string;
  nodeId?: string;
  iconId: string;
  colorId: string;
  rarity: Rarity;
  items: Array<{ itemId: string; quantity: number }>;
};

/** 稀有度 → 箱子模型档位。高于稀有的档位现在没有模型，先用金箱顶着 */
function tierOf(rarity: Rarity): ChestTier {
  if (rarity === Rarity.Common) return "common";
  if (rarity === Rarity.Uncommon) return "uncommon";
  return "rare";
}

/** 和快捷栏选中同一条弹性曲线 cubic-bezier(0.34,1.56,0.64,1) 的近似标量版 */
function overshoot(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = x - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

const CONFETTI_COLORS = ["#e8b733", "#5fc7ce", "#c96a86", "#7aa35a", "#9a6fb8"];

export function ChestOverlay() {
  const [queue, setQueue] = useState<ChestEvent[]>([]);
  const [revealed, setRevealed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = queue[0] ?? null;

  useEffect(
    () =>
      on("action_chest_ready", (event) => {
        setQueue((prev) => [...prev, event as ChestEvent]);
      }),
    [],
  );

  const dismiss = () => {
    setQueue((prev) => prev.slice(1));
    setRevealed(false);
  };

  // 挡屏面板，ESC 走全局仲裁（弹栈 = 收下这个箱子）
  useMirroredPanel("chest", current !== null, dismiss);

  // ---- 3D 小窗 + 四拍时间线 ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!current || !canvas) return;

    const scene = new Scene();
    const camera = new PerspectiveCamera(34, 300 / 230, 0.1, 20);
    camera.position.set(0, 1.2, 3.5);
    camera.lookAt(0, 0.5, 0);

    scene.add(new AmbientLight(0xfff2dd, 0.85));
    const key = new DirectionalLight(0xffffff, 1.25);
    key.position.set(1.6, 2.4, 2.2);
    scene.add(key);
    const rim = new DirectionalLight(0x9ec9ff, 0.5);
    rim.position.set(-1.8, 1.2, -1.6);
    scene.add(rim);

    const chest = buildChest(tierOf(current.rarity));
    const big = current.size === "chain";
    const baseScale = big ? 1.15 : 0.92;
    chest.rotation.y = 0.5;
    scene.add(chest);
    const lid = chest.getObjectByName("chest-lid") ?? new Object3D();

    // 暖光柱：从箱口打上来的半透明圆锥，盖开了才亮
    const beam = new Mesh(
      new ConeGeometry(0.55, 1.7, 20, 1, true),
      new MeshBasicMaterial({
        color: 0xffe2a0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    beam.position.set(0, 1.5, 0);
    chest.add(beam);

    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(300, 230, false);

    const shakes = big ? 3 : 2;
    let raf = 0;
    let didReveal = false;
    const startedAt = performance.now();

    const tick = () => {
      const seconds = (performance.now() - startedAt) / 1000;

      // 第一拍：落下 + 触地下压
      if (seconds < 0.15) {
        const k = seconds / 0.15;
        chest.position.y = (1 - k * k) * 1.7;
        chest.scale.setScalar(baseScale);
      } else if (seconds < 0.55) {
        // 第二拍：squash & stretch 抖动（衰减的弹性摆）
        chest.position.y = 0;
        const k = (seconds - 0.15) / 0.4;
        const wave = Math.sin(k * Math.PI * shakes) * (1 - k) * 0.16;
        chest.scale.set(
          baseScale * (1 + wave),
          baseScale * (1 - wave * 1.4),
          baseScale * (1 + wave),
        );
      } else {
        // 第三拍：开盖 + 光柱
        chest.position.y = 0;
        chest.scale.setScalar(baseScale);
        const k = Math.min(1, (seconds - 0.55) / 0.35);
        lid.rotation.x = -overshoot(k) * 1.75;
        (beam.material as MeshBasicMaterial).opacity = Math.min(0.5, k * 0.5);
        // 第四拍：物品卡出场（React 那边接手）
        if (seconds >= 0.7 && !didReveal) {
          didReveal = true;
          setRevealed(true);
        }
      }

      // 常态微漂浮，收尾治愈一点
      chest.rotation.y = 0.5 + Math.sin(seconds * 0.8) * 0.05;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      disposeTree(chest);
      beam.geometry.dispose();
      (beam.material as MeshBasicMaterial).dispose();
      renderer.dispose();
    };
  }, [current]);

  if (!current) return null;

  const accent = chainColor(current.colorId);
  const big = current.size === "chain";

  return (
    /* z-50：要压过行动面板（z-40）——完成的瞬间玩家可能正开着别的面板 */
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/55"
      onClick={revealed ? dismiss : undefined}
    >
      {/* 大箱撒纸屑 */}
      {big && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 26 }, (_, i) => (
            <span
              key={i}
              className="chest-confetti"
              style={{
                left: `${(i * 37) % 100}%`,
                backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDuration: `${2.2 + (i % 5) * 0.35}s`,
                animationDelay: `${0.55 + (i % 7) * 0.12}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="ui-dialogue relative w-[min(430px,90vw)] rounded-[26px] px-6 pb-5 pt-5 text-center">
        {/* 标题：小箱=节点名字；大箱=链名 + 它的图标和颜色 */}
        <div className="flex items-center justify-center gap-2">
          {big && (
            <span
              className="grid h-8 w-8 place-items-center rounded-full text-[15px]"
              style={{ backgroundColor: accent }}
            >
              {chainEmoji(current.iconId)}
            </span>
          )}
          <span className="text-[19px] font-bold tracking-wide text-[#4a3b2a]">
            {current.title}
          </span>
        </div>
        <div className="mt-0.5 text-[12px] text-[#8a6a45]">
          {big ? t("ui.chest.chain_done") : t("ui.chest.node_done")}
        </div>

        {/* 3D 小窗 */}
        <canvas
          ref={canvasRef}
          className="mx-auto mt-1"
          style={{ width: 300, height: 230 }}
        />

        {/* 物品卡：80ms 间隔飞出，复用背包的图标格 */}
        <div className="mt-1 flex min-h-[86px] flex-wrap items-start justify-center gap-2.5">
          {revealed &&
            current.items.map((item, index) => {
              const definition = findItemDefinition(item.itemId);
              const rare =
                definition && definition.rarity !== Rarity.Common && definition.rarity !== Rarity.Uncommon;
              return (
                <div
                  key={`${item.itemId}-${index}`}
                  className={[
                    "chest-card-fly flex w-[86px] flex-col items-center",
                    rare ? "chest-card--rare" : "",
                  ].join(" ")}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <div className="ui-slot grid h-[56px] w-[56px] place-items-center">
                    <ItemIcon itemId={item.itemId} size={44} />
                  </div>
                  <span className="mt-1 max-w-full truncate text-[12px] font-bold text-[#4a3b2a]">
                    {definition ? t(definition.localizationKey) : item.itemId}
                    {item.quantity > 1 && ` ×${item.quantity}`}
                  </span>
                  {definition && (
                    <span className="text-[10px] text-[#8a6a45]">
                      {t(`ui.rarity.${definition.rarity}`)}
                    </span>
                  )}
                </div>
              );
            })}
        </div>

        <div className="mt-2 text-[12px] text-[#9a8360]">
          {revealed ? t("ui.chest.tap_close") : "…"}
        </div>
      </div>
    </div>
  );
}
