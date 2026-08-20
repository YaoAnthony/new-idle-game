import {
  tidyChainLayout,
  wouldCreateCycle,
  type ActionChainNode,
  type ActionChainSave,
} from "core";
import { useRef, useState } from "react";
import { isNodeUnlocked, updateChainNode } from "../../Game/State/actionChains";
import { t } from "../../i18n/t";
import { chainColor } from "./chainVisuals";

/**
 * 技能树画布，两个模式共用一套渲染和手势：
 *
 *   view —— 查看页的主体（用户定案：像技能树那样，做完 A 解锁 B 要
 *           **画成树**，不是列表）。只能看和选：点任务选中（详情条在
 *           外面）、拖空白平移、滚轮/双指缩放。三种状态三种长相：
 *           ✅完成=绿、▶可做=亮+链色粗描边、🔒锁定=灰。
 *   edit —— 编辑：拖任务摆位置、拖右缘把手连前置、点线删线、一键整理。
 *
 * 全部用 **Pointer Events** 写：鼠标和触屏走同一套代码。手机上就是
 * 直接拖（定案："手机拖拽连线才是最好拖准的"），不做降级方案——
 * 该做的是把可点面积做大：任务卡 56px 高、连线把手 44px 命中区、
 * 线有一条 16px 宽的隐形陪跑线接收点击。
 *
 * 环检测是**实时**的：把手悬在目标上那一刻就用 Core 的 wouldCreateCycle
 * 判，会成环立刻标红，松手直接拒绝——错误反馈离动作越近越有用，
 * 攒到保存时才报错等于让玩家白拖一趟。
 *
 * 位置/连线的每次改动**当场写回存档结构**（updateChainNode 发
 * action_chains_changed，查看页跟着重画）。没有"保存"按钮：画布上
 * 看到的就是存下的。
 */

type Props = {
  chain: ActionChainSave;
  mode: "view" | "edit";
  /** edit：点按任务打开编辑表单 */
  onEditNode?: (nodeId: string) => void;
  /** view：点按任务选中（详情条由外面渲染） */
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
};

const NODE_W = 150;
const NODE_H = 56;

/** 正在进行的手势。一次只有一个（第二根手指来了就升级成捏合缩放） */
type Gesture =
  | { kind: "none" }
  | { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
  | {
      kind: "node";
      nodeId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      moved: boolean;
    }
  | { kind: "link"; fromId: string; x: number; y: number; overId: string | null }
  | {
      kind: "pinch";
      d0: number;
      zoom0: number;
      cx: number;
      cy: number;
      panX0: number;
      panY0: number;
    };

export function ChainEditCanvas({
  chain,
  mode,
  onEditNode,
  onSelectNode,
  selectedNodeId,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [gesture, setGesture] = useState<Gesture>({ kind: "none" });
  // 活跃指针表：两根手指同时按下时从平移升级为捏合
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const editing = mode === "edit";
  const color = chainColor(chain.colorId);
  const nodes = chain.nodes;
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));

  /** 屏幕坐标 → 画布坐标（考虑平移和缩放） */
  const toCanvas = (clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  /** 这个画布点落在哪个任务上（连线松手时用） */
  const nodeAt = (x: number, y: number): ActionChainNode | undefined =>
    nodes.find(
      (n) =>
        x >= n.position.x &&
        x <= n.position.x + NODE_W &&
        y >= n.position.y &&
        y <= n.position.y + NODE_H,
    );

  // ---- 手势 ----

  const onPointerDown = (e: React.PointerEvent) => {
    // capture 拿不到就算了（合成事件、个别内核会抛）——手势照常走
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch { /* 无所谓 */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      // 第二根手指：无论正在干什么都升级成捏合缩放
      const [a, b] = [...pointers.current.values()];
      setGesture({
        kind: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        zoom0: zoom,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        panX0: pan.x,
        panY0: pan.y,
      });
      return;
    }

    const target = e.target as HTMLElement;
    const handleId = target.closest("[data-handle]")?.getAttribute("data-handle");
    if (handleId && editing) {
      const p = toCanvas(e.clientX, e.clientY);
      setGesture({ kind: "link", fromId: handleId, x: p.x, y: p.y, overId: null });
      return;
    }

    const nodeId = target.closest("[data-node]")?.getAttribute("data-node");
    if (nodeId) {
      const node = byId.get(nodeId)!;
      setGesture({
        kind: "node",
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        origX: node.position.x,
        origY: node.position.y,
        moved: false,
      });
      return;
    }

    setGesture({
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (gesture.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clampZoom((gesture.zoom0 * d) / gesture.d0);
      // 缩放围着两指中点进行：把中点在画布上的位置保持不动
      const k = next / gesture.zoom0;
      const rect = viewportRef.current!.getBoundingClientRect();
      const mx = gesture.cx - rect.left;
      const my = gesture.cy - rect.top;
      setZoom(next);
      setPan({
        x: mx - (mx - gesture.panX0) * k,
        y: my - (my - gesture.panY0) * k,
      });
      return;
    }

    if (gesture.kind === "pan") {
      setPan({
        x: gesture.panX + (e.clientX - gesture.startX),
        y: gesture.panY + (e.clientY - gesture.startY),
      });
      return;
    }

    if (gesture.kind === "node") {
      const dx = (e.clientX - gesture.startX) / zoom;
      const dy = (e.clientY - gesture.startY) / zoom;
      const moved = gesture.moved || Math.hypot(dx * zoom, dy * zoom) > 6;
      setGesture({ ...gesture, moved });
      if (moved && editing) {
        // 拖的过程直接写位置：位置不是危险数据，没必要攒到松手
        updateChainNode(
          { chainId: chain.chainId, nodeId: gesture.nodeId },
          { position: { x: Math.round(gesture.origX + dx), y: Math.round(gesture.origY + dy) } },
        );
      }
      return;
    }

    if (gesture.kind === "link") {
      const p = toCanvas(e.clientX, e.clientY);
      const over = nodeAt(p.x, p.y);
      setGesture({
        ...gesture,
        x: p.x,
        y: p.y,
        overId: over && over.nodeId !== gesture.fromId ? over.nodeId : null,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);

    if (gesture.kind === "node" && !gesture.moved) {
      // 没拖动就是点按：编辑模式开表单，查看模式选中
      if (editing) onEditNode?.(gesture.nodeId);
      else onSelectNode?.(gesture.nodeId);
    }

    if (gesture.kind === "link" && gesture.overId && editing) {
      const to = byId.get(gesture.overId);
      if (
        to &&
        !to.requires.includes(gesture.fromId) &&
        to.completedAtUtc === undefined &&
        !wouldCreateCycle(nodes, gesture.fromId, gesture.overId)
      ) {
        updateChainNode(
          { chainId: chain.chainId, nodeId: to.nodeId },
          { requires: [...to.requires, gesture.fromId] },
        );
      }
      // 成环/指向已完成的任务：什么都不写。拖的过程已经标过红了
    }

    if (pointers.current.size === 0) setGesture({ kind: "none" });
  };

  const onWheel = (e: React.WheelEvent) => {
    const next = clampZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    const rect = viewportRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const k = next / zoom;
    setZoom(next);
    setPan({ x: mx - (mx - pan.x) * k, y: my - (my - pan.y) * k });
  };

  const tidy = () => {
    const layout = tidyChainLayout(nodes);
    for (const node of nodes) {
      const position = layout.get(node.nodeId);
      if (position) {
        updateChainNode({ chainId: chain.chainId, nodeId: node.nodeId }, { position });
      }
    }
    setPan({ x: 40, y: 40 });
    setZoom(1);
  };

  // 连线拖拽中：这条待定边会不会成环（实时红/绿反馈）
  const linkBad =
    gesture.kind === "link" && gesture.overId !== null
      ? byId.get(gesture.overId)?.completedAtUtc !== undefined ||
        wouldCreateCycle(nodes, gesture.fromId, gesture.overId)
      : false;

  return (
    <div className="flex h-full flex-col">
      <div
        ref={viewportRef}
        className="ui-paper relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* 连线层。overflow visible：线可以画到 svg 元素框外 */}
          <svg className="absolute left-0 top-0 overflow-visible" width={1} height={1}>
            {nodes.flatMap((to) =>
              to.requires.map((fromId) => {
                const from = byId.get(fromId);
                if (!from) return null;
                // 查看模式：走完的路线是实线链色，没走到的是灰虚线——
                // 一眼看出"树推进到哪了"
                const walked = from.completedAtUtc !== undefined;
                return (
                  <Edge
                    key={`${fromId}->${to.nodeId}`}
                    from={from}
                    to={to}
                    color={editing ? color : walked ? color : "#c9bda4"}
                    dashed={!editing && !walked}
                    deletable={editing}
                    onDelete={() =>
                      updateChainNode(
                        { chainId: chain.chainId, nodeId: to.nodeId },
                        { requires: to.requires.filter((id) => id !== fromId) },
                      )
                    }
                  />
                );
              }),
            )}
            {gesture.kind === "link" && (
              <path
                d={pendingPath(byId.get(gesture.fromId)!, gesture.x, gesture.y)}
                fill="none"
                stroke={linkBad ? "#c94a3a" : "#7aa35a"}
                strokeWidth={3}
                strokeDasharray="6 5"
              />
            )}
          </svg>

          {nodes.map((node) => {
            const isLinkTarget = gesture.kind === "link" && gesture.overId === node.nodeId;
            const done = node.completedAtUtc !== undefined;
            const unlocked = done || isNodeUnlocked(chain, node);
            const selected = !editing && selectedNodeId === node.nodeId;

            // 查看模式的三种状态三种长相；编辑模式保持原来的中性配色
            let look: string;
            if (isLinkTarget) {
              look = linkBad ? "border-[#c94a3a] bg-[#fdf6e2]" : "border-[#7aa35a] bg-[#fdf6e2]";
            } else if (editing) {
              look = done ? "border-[#cfe0c0] bg-[#f2f7ea]" : "border-[#dcc89a] bg-[#fdf6e2]";
            } else if (done) {
              look = "border-[#8fbb72] bg-[#eef7e2]";
            } else if (unlocked) {
              look = "bg-[#fdf6e2]"; // 描边用链色，走内联样式
            } else {
              look = "border-[#cfc7b8] bg-[#ece6d9] opacity-75";
            }

            return (
              <div
                key={node.nodeId}
                data-node={node.nodeId}
                className={[
                  "absolute flex select-none items-center gap-1.5 rounded-lg border-2 px-2",
                  look,
                ].join(" ")}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: NODE_W,
                  height: NODE_H,
                  cursor: editing ? "grab" : "pointer",
                  ...(!editing && unlocked && !done ? { borderColor: color } : {}),
                  ...(selected
                    ? { boxShadow: `0 0 0 3px ${color}55`, borderColor: "#b8894a" }
                    : {}),
                }}
              >
                <span className="shrink-0 text-[13px]">
                  {done ? "✅" : !editing && !unlocked ? "🔒" : "🌱"}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={[
                      "block truncate text-[12px] font-bold",
                      !editing && !unlocked && !done ? "text-[#6f6a62]" : "text-[#4a3b2a]",
                    ].join(" ")}
                  >
                    {node.customName}
                  </span>
                  <span className="block text-[10px] text-[#9a8360]">
                    {node.durationMinutes} {t("ui.action.minutes")}
                  </span>
                </span>
                {/*
                  连线把手（仅编辑模式）：视觉 20px，命中区拉到 44px（负 margin 外扩）。
                  已完成的任务照样能当别人的前置，所以把手不藏
                */}
                {editing && (
                  <span
                    data-handle={node.nodeId}
                    className="grid shrink-0 place-items-center"
                    style={{ width: 44, height: 44, margin: "-12px -14px -12px -8px", cursor: "crosshair" }}
                  >
                    <span
                      className="grid h-5 w-5 place-items-center rounded-full text-[10px] text-white"
                      style={{ backgroundColor: color }}
                    >
                      →
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 空画布提示 */}
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-[#9a8360]">
            {t("ui.chain.no_nodes")}
          </div>
        )}
      </div>

      {/* 工具行 */}
      <div className="mt-2 flex shrink-0 items-center justify-between">
        <span className="text-[11px] text-[#9a8360]">
          {editing ? t("ui.chain.edit_hint") : t("ui.chain.view_hint")}
        </span>
        {editing && (
          <button
            type="button"
            className="ui-wood-btn px-4 py-1.5 text-[13px] font-bold"
            onClick={tidy}
          >
            ✨ {t("ui.chain.tidy")}
          </button>
        )}
      </div>
    </div>
  );
}

function clampZoom(value: number): number {
  return Math.max(0.45, Math.min(2.2, value));
}

/** 从 from 右缘中点到 to 左缘中点的贝塞尔 */
function edgePath(from: ActionChainNode, to: ActionChainNode): string {
  const x1 = from.position.x + NODE_W;
  const y1 = from.position.y + NODE_H / 2;
  const x2 = to.position.x;
  const y2 = to.position.y + NODE_H / 2;
  const dx = Math.max(36, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function pendingPath(from: ActionChainNode, x: number, y: number): string {
  const x1 = from.position.x + NODE_W;
  const y1 = from.position.y + NODE_H / 2;
  const dx = Math.max(36, Math.abs(x - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x - dx} ${y}, ${x} ${y}`;
}

/**
 * 一条前置线。编辑模式带一条 16px 宽的隐形陪跑线接收点击（点线删线，
 * 两击确认）；查看模式只是展示——走过的实线、没走到的灰虚线。
 */
function Edge({
  from,
  to,
  color,
  dashed,
  deletable,
  onDelete,
}: {
  from: ActionChainNode;
  to: ActionChainNode;
  color: string;
  dashed: boolean;
  deletable: boolean;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const d = edgePath(from, to);
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={armed ? "#c94a3a" : color}
        strokeWidth={armed ? 4 : 2.5}
        strokeDasharray={dashed ? "5 5" : undefined}
      />
      {deletable && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          style={{ cursor: "pointer", pointerEvents: "stroke" }}
          onPointerDown={(e) => {
            // 别让画布把这次按下当成平移
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            // 两击确认：第一击变红示意，第二击才删
            if (armed) onDelete();
            else {
              setArmed(true);
              setTimeout(() => setArmed(false), 1600);
            }
          }}
        />
      )}
      {armed && (
        <text
          x={(from.position.x + NODE_W + to.position.x) / 2}
          y={(from.position.y + to.position.y + NODE_H) / 2 - 8}
          textAnchor="middle"
          fontSize={11}
          fill="#c94a3a"
          fontWeight="bold"
          style={{ pointerEvents: "none" }}
        >
          {t("ui.chain.tap_again_delete")}
        </text>
      )}
    </g>
  );
}
