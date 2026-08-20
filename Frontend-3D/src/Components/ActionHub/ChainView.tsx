import {
  ActionCategory,
  ActionPriority,
  actionDefinitions,
  actionPriorityDefinitions,
  findActionByCategory,
  wouldCreateCycle,
  type ActionChainNode,
  type ActionChainSave,
} from "core";
import { useEffect, useMemo, useState } from "react";
import { on } from "../../Game/EventBus";
import {
  addChainNode,
  createChain,
  deleteChain,
  deleteChainNode,
  getActionChains,
  isNodeUnlocked,
  updateChainNode,
} from "../../Game/State/actionChains";
import { ChainEditCanvas } from "./ChainEditCanvas";
import {
  startChainNodeAction,
  type StartNodeResult,
} from "../../Game/Systems/actionChains";
import {
  canAfford,
  findSupportingFurniture,
  getActiveAction,
} from "../../Game/Systems/actions";
import { t } from "../../i18n/t";
import { CHAIN_COLORS, CHAIN_ICONS, chainColor, chainEmoji } from "./chainVisuals";

/**
 * 系列任务屏（B 屏里点「系列任务」进来）。同一屏两个标签：
 *
 *   查看 —— 左边链列表（图标+颜色+进度），右边是**技能树**（用户定案：
 *           像技能树那样画出来，"做完 A 解锁 B"要看得见，不是列表）。
 *           点树上的任务，底部详情条给出状态和开始键。
 *           「锁着」和「能做但缺条件」是两种视觉：前者灰+🔒（做完前置
 *           自然解开），后者亮着但开始键给出橙色原因（缺家具/精力/占线，
 *           要玩家去屋里解决）——混成一种玩家就不知道该去点树还是去搬家具。
 *   编辑 —— 同一块画布的编辑模式：拖任务摆位、拖把手连前置、点线删线、
 *           一键整理。
 *
 * 节点内容一张表单管到底（名字/时长/重要级/说明/前置勾选）。
 */

type Props = {
  category: ActionCategory;
  onBack: () => void;
  onClose: () => void;
};

type Sub =
  | { kind: "browse" }
  | { kind: "new_chain" }
  | { kind: "new_node"; chainId: string }
  | { kind: "edit_node"; chainId: string; nodeId: string };

const START_FAIL_TEXT: Record<Exclude<StartNodeResult, "ok">, string> = {
  missing: "这个任务不存在了",
  locked: "前置还没做完",
  completed: "已经做过了",
  busy: "已有进行中的行动",
  no_furniture: "缺少支撑家具",
  tired: "精力不够",
};

export function ChainView({ category, onBack, onClose }: Props) {
  const [, force] = useState(0);
  const [tab, setTab] = useState<"view" | "edit">("view");
  const [sub, setSub] = useState<Sub>({ kind: "browse" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 查看页树上点中的任务（详情条读它）。跟着链走，换链就清掉 */
  const [pickedNodeId, setPickedNodeId] = useState<string | null>(null);

  useEffect(
    () => on("action_chains_changed", () => force((n) => n + 1)),
    [],
  );

  const chains = getActionChains().filter((c) => c.category === category);
  const active = chains.filter((c) => !c.completedAtUtc);
  const archived = chains.filter((c) => c.completedAtUtc);
  const selected =
    chains.find((c) => c.chainId === selectedId) ?? active[0] ?? chains[0];

  const definition = actionDefinitions.find((d) => d.category === category);
  const title = definition ? t(definition.localizationKey) : "";

  if (sub.kind === "new_chain") {
    return (
      <ChainForm
        category={category}
        onClose={onClose}
        onCancel={() => setSub({ kind: "browse" })}
        onCreated={(chainId) => {
          setSelectedId(chainId);
          setSub({ kind: "browse" });
        }}
      />
    );
  }

  if (sub.kind === "new_node" && selected) {
    return (
      <NodeForm
        chain={selected}
        onClose={onClose}
        onDone={() => setSub({ kind: "browse" })}
      />
    );
  }

  if (sub.kind === "edit_node") {
    const chain = chains.find((c) => c.chainId === sub.chainId);
    const node = chain?.nodes.find((n) => n.nodeId === sub.nodeId);
    if (chain && node) {
      return (
        <NodeForm
          chain={chain}
          editNode={node}
          onClose={onClose}
          onDone={() => setSub({ kind: "browse" })}
        />
      );
    }
  }

  return (
    <Shell
      title={`${title} · ${t("ui.chain.title")}`}
      onBack={onBack}
      onClose={onClose}
    >
      {/* 标签切换 */}
      <div className="mb-3 flex shrink-0 justify-center gap-2">
        {(["view", "edit"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={[
              "ui-chip px-6 py-1.5 text-[14px] font-bold",
              tab === key ? "ui-chip--on" : "",
            ].join(" ")}
            onClick={() => setTab(key)}
          >
            {key === "view" ? t("ui.chain.tab_view") : t("ui.chain.tab_edit")}
          </button>
        ))}
      </div>

      {tab === "edit" ? (
        selected ? (
          /* 标题行和查看页同一条（添加任务/删除链）：编辑页正是加任务的
             地方，按钮只在查看页有是漏配（用户抓的） */
          <div className="flex min-h-0 flex-1 flex-col">
            <ChainHeader
              chain={selected}
              onAddNode={() => setSub({ kind: "new_node", chainId: selected.chainId })}
            />
            <div className="mt-2 min-h-0 flex-1">
              <ChainEditCanvas
                key={selected.chainId}
                chain={selected}
                mode="edit"
                onEditNode={(nodeId) =>
                  setSub({ kind: "edit_node", chainId: selected.chainId, nodeId })
                }
              />
            </div>
          </div>
        ) : (
          <EmptyChains onNew={() => setSub({ kind: "new_chain" })} />
        )
      ) : chains.length === 0 ? (
        <EmptyChains onNew={() => setSub({ kind: "new_chain" })} />
      ) : (
        <div className="flex min-h-0 flex-1 gap-3">
          {/* 左：链列表 */}
          <div className="ui-paper ui-scroll w-[230px] shrink-0 overflow-y-auto p-2.5">
            <button
              type="button"
              className="ui-green-btn mb-2 w-full py-1.5 text-[13px] font-bold"
              onClick={() => setSub({ kind: "new_chain" })}
            >
              ＋ {t("ui.chain.new")}
            </button>

            {active.map((chain) => (
              <ChainRow
                key={chain.chainId}
                chain={chain}
                selected={chain.chainId === selected?.chainId}
                onPick={() => {
                  setSelectedId(chain.chainId);
                  setPickedNodeId(null);
                }}
              />
            ))}

            {archived.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer select-none text-[12px] font-bold text-[#8a6a45]">
                  ✅ {t("ui.chain.archived")}（{archived.length}）
                </summary>
                {archived.map((chain) => (
                  <ChainRow
                    key={chain.chainId}
                    chain={chain}
                    selected={chain.chainId === selected?.chainId}
                    onPick={() => {
                      setSelectedId(chain.chainId);
                      setPickedNodeId(null);
                    }}
                  />
                ))}
              </details>
            )}
          </div>

          {/* 右：技能树 + 底部详情条 */}
          <div className="flex min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                <ChainHeader
                  chain={selected}
                  onAddNode={() => setSub({ kind: "new_node", chainId: selected.chainId })}
                />
                <div className="mt-2 min-h-0 flex-1">
                  <ChainEditCanvas
                    key={selected.chainId}
                    chain={selected}
                    mode="view"
                    selectedNodeId={pickedNodeId}
                    onSelectNode={setPickedNodeId}
                  />
                </div>
                <PickedNodeBar chain={selected} nodeId={pickedNodeId} />
              </>
            ) : (
              <div className="ui-paper grid h-full place-items-center text-[13px] text-[#9a8360]">
                {t("ui.chain.pick_one")}
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

/** 面板外壳（沿用行动面板的木框+牌匾，宽度取大一号给树留地方） */
function Shell({
  title,
  onBack,
  onClose,
  children,
}: {
  title: string;
  onBack: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    /* 尺寸和 ActionHub 的 Panel 完全一致：链屏是行动面板的一层，切进切出不跳 */
    <div
      className="ui-action-panel relative flex flex-col px-6 pb-5 pt-9"
      style={{
        width: "min(1120px, 92vw)",
        height: "min(calc(100dvh - 56px), 640px)",
      }}
    >
      <div className="ui-plaque absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 px-8 py-2">
        <span className="whitespace-nowrap text-[18px] font-bold tracking-[0.2em] text-[#5c3a1d]">
          {title}
        </span>
      </div>
      <button
        type="button"
        className="ui-wood-btn absolute left-5 top-5 grid h-9 w-9 place-items-center text-[16px]"
        aria-label="返回"
        onClick={onBack}
      >
        ←
      </button>
      <button
        type="button"
        className="ui-wood-btn absolute right-5 top-5 grid h-9 w-9 place-items-center text-[16px]"
        aria-label="关闭"
        onClick={onClose}
      >
        ✕
      </button>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function EmptyChains({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="text-[18px] font-bold text-[#7d6242]">
        {t("ui.chain.empty_title")}
      </div>
      <div className="mt-1 text-[13px] text-[#9a8360]">
        {t("ui.chain.empty_hint")}
      </div>
      <button
        type="button"
        className="ui-green-btn mt-4 px-6 py-2 text-[14px] font-bold"
        onClick={onNew}
      >
        ＋ {t("ui.chain.new")}
      </button>
    </div>
  );
}

/** 左列的一行：色点图标 + 名字 + 进度 */
function ChainRow({
  chain,
  selected,
  onPick,
}: {
  chain: ActionChainSave;
  selected: boolean;
  onPick: () => void;
}) {
  const done = chain.nodes.filter((n) => n.completedAtUtc).length;
  return (
    <button
      type="button"
      className={[
        "mb-1.5 flex w-full items-center gap-2 rounded-lg border-2 px-2 py-2 text-left",
        selected
          ? "border-[#b8894a] bg-[#fdf0d0]"
          : "border-[#dcc89a] bg-[#fdf6e2]",
      ].join(" ")}
      onClick={onPick}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px]"
        style={{ backgroundColor: chainColor(chain.colorId) }}
      >
        {chainEmoji(chain.iconId)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-[#4a3b2a]">
          {chain.title}
        </span>
        <span className="block text-[11px] text-[#9a8360]">
          {done}/{chain.nodes.length}
        </span>
      </span>
      {/* 环形进度：conic-gradient 画，个位数节点没必要上 SVG */}
      <span
        className="h-5 w-5 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${chainColor(chain.colorId)} ${
            chain.nodes.length === 0 ? 0 : (done / chain.nodes.length) * 360
          }deg, #e8dcc0 0deg)`,
        }}
      />
    </button>
  );
}

/** 树上方的标题行：链名 + 添加任务 + 删除链（两击确认） */
function ChainHeader({
  chain,
  onAddNode,
}: {
  chain: ActionChainSave;
  onAddNode: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#4a3b2a]">
        {chainEmoji(chain.iconId)} {chain.title}
        {chain.completedAtUtc && (
          <span className="ml-2 text-[12px] font-normal text-[#7aa35a]">
            ✅ {t("ui.chain.done_suffix")}
          </span>
        )}
        {chain.description && (
          <span className="ml-2 text-[12px] font-normal text-[#9a8360]">
            {chain.description}
          </span>
        )}
      </span>
      {!chain.completedAtUtc && (
        <button
          type="button"
          className="ui-green-btn shrink-0 px-3 py-1 text-[12px] font-bold"
          onClick={onAddNode}
        >
          ＋ {t("ui.chain.add_node")}
        </button>
      )}
      {/* 删除走两击确认，第一击把后果（几个任务）亮出来 */}
      <button
        type="button"
        className={[
          "shrink-0 px-2.5 py-1 text-[12px] font-bold",
          confirmDelete ? "ui-chip ui-chip--strong" : "ui-wood-btn",
        ].join(" ")}
        onClick={() => {
          if (!confirmDelete) {
            setConfirmDelete(true);
            return;
          }
          deleteChain(chain.chainId);
        }}
        onBlur={() => setConfirmDelete(false)}
      >
        {confirmDelete
          ? t("ui.chain.delete_confirm").replace("{n}", String(chain.nodes.length))
          : "🗑"}
      </button>
    </div>
  );
}

/** 树下方的详情条：树上点中的那个任务，NodeRow 原样复用 */
function PickedNodeBar({
  chain,
  nodeId,
}: {
  chain: ActionChainSave;
  nodeId: string | null;
}) {
  const nameOf = useMemo(
    () => new Map(chain.nodes.map((n) => [n.nodeId, n.customName])),
    [chain],
  );
  const node = chain.nodes.find((n) => n.nodeId === nodeId);
  if (!node) {
    return (
      <div className="mt-1 shrink-0 py-2 text-center text-[12px] text-[#9a8360]">
        {t("ui.chain.pick_node_hint")}
      </div>
    );
  }
  const state = node.completedAtUtc
    ? "completed"
    : isNodeUnlocked(chain, node)
      ? "available"
      : "locked";
  return (
    <div className="mt-2 shrink-0">
      <NodeRow chain={chain} node={node} nameOf={nameOf} state={state} />
    </div>
  );
}

/**
 * 一行环。三种态各有长相：
 * - available：亮卡 + 开始键；缺家具/精力/占线时开始键换成橙色原因
 * - locked：灰卡 + 🔒 + **完整名字照给**（设计定案：锁定不打码，
 *   玩家要看得见后面有什么才有奔头）+ 差哪几个前置
 * - completed：淡卡 + ✅
 */
function NodeRow({
  chain,
  node,
  nameOf,
  state,
}: {
  chain: ActionChainSave;
  node: ActionChainNode;
  nameOf: Map<string, string>;
  state: "available" | "locked" | "completed";
}) {
  const [, force] = useState(0);
  const priority = actionPriorityDefinitions.find((p) => p.id === node.priority);
  const definition = findActionByCategory(chain.category);

  // 解锁但开始不了的三种现实阻碍（和「锁定」视觉分开）
  let blocker: string | null = null;
  if (state === "available") {
    if (getActiveAction()) blocker = START_FAIL_TEXT.busy;
    else if (findSupportingFurniture(chain.category) === null)
      blocker = START_FAIL_TEXT.no_furniture;
    else if (definition && !canAfford(definition, node.priority))
      blocker = START_FAIL_TEXT.tired;
  }

  const missing = node.requires.filter((id) => {
    const done = chain.nodes.find((n) => n.nodeId === id)?.completedAtUtc;
    return done === undefined;
  });

  return (
    <div
      className={[
        "flex items-center gap-2 rounded-lg border-2 px-2.5 py-2",
        state === "available" && "border-[#dcc89a] bg-[#fdf6e2]",
        state === "locked" && "border-[#cfc7b8] bg-[#efe9dc] opacity-80",
        state === "completed" && "border-[#cfe0c0] bg-[#f2f7ea] opacity-75",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="shrink-0 text-[14px]">
        {state === "locked" ? "🔒" : state === "completed" ? "✅" : "🌱"}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={[
            "block truncate text-[13px] font-bold",
            state === "locked" ? "text-[#6f6a62]" : "text-[#4a3b2a]",
          ].join(" ")}
        >
          {node.customName}
        </span>
        <span className="block truncate text-[11px] text-[#9a8360]">
          🕐 {node.durationMinutes} {t("ui.action.minutes")}
          {priority && node.priority !== ActionPriority.Normal && (
            <> · {node.priority === ActionPriority.Low ? "🍃" : "⭐"} {t(priority.localizationKey)}</>
          )}
          {state === "locked" && missing.length > 0 && (
            <>
              {" "}
              · {t("ui.chain.needs")}{" "}
              {missing.map((id) => nameOf.get(id) ?? "?").join("、")}
            </>
          )}
          {node.note && <> · {node.note}</>}
        </span>
      </span>

      {state === "available" &&
        (blocker ? (
          <span className="shrink-0 rounded-md border border-[#e0a25f] bg-[#fbead2] px-2 py-1 text-[11px] font-bold text-[#b06a1f]">
            ⚠ {blocker}
          </span>
        ) : (
          <button
            type="button"
            className="ui-green-btn shrink-0 px-4 py-1 text-[13px] font-bold"
            onClick={() => {
              startChainNodeAction({ chainId: chain.chainId, nodeId: node.nodeId });
              force((n) => n + 1);
            }}
          >
            {t("ui.action.start")}
          </button>
        ))}
    </div>
  );
}

/** 建链表单：标题 / 说明 / 图标 / 颜色 */
function ChainForm({
  category,
  onClose,
  onCancel,
  onCreated,
}: {
  category: ActionCategory;
  onClose: () => void;
  onCancel: () => void;
  onCreated: (chainId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [iconId, setIconId] = useState(CHAIN_ICONS[0].id);
  const [colorId, setColorId] = useState(CHAIN_COLORS[0].id);

  return (
    <Shell title={t("ui.chain.new")} onBack={onCancel} onClose={onClose}>
      <div className="ui-scroll mx-auto flex h-full w-full max-w-[560px] flex-col gap-3 overflow-y-auto">
        <div>
          <div className="mb-1 text-[14px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.chain.form_title")}
          </div>
          <input
            className="ui-input w-full px-3 py-2 text-[14px] outline-none"
            placeholder={t("ui.chain.form_title_placeholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-1 text-[14px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.chain.form_desc")}
            <span className="ml-1 text-[11px] font-normal text-[#9a8360]">
              {t("ui.chain.optional")}
            </span>
          </div>
          <input
            className="ui-input w-full px-3 py-2 text-[14px] outline-none"
            placeholder={t("ui.chain.form_desc_placeholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex gap-6">
          <div>
            <div className="mb-1 text-[14px] font-bold text-[#5c3a1d]">
              🌿 {t("ui.chain.form_icon")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CHAIN_ICONS.map((icon) => (
                <button
                  key={icon.id}
                  type="button"
                  className={[
                    "grid h-9 w-9 place-items-center rounded-lg border-2 text-[16px]",
                    iconId === icon.id
                      ? "border-[#b8894a] bg-[#fdf0d0]"
                      : "border-[#dcc89a] bg-[#fdf6e2]",
                  ].join(" ")}
                  onClick={() => setIconId(icon.id)}
                >
                  {icon.emoji}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[14px] font-bold text-[#5c3a1d]">
              🌿 {t("ui.chain.form_color")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CHAIN_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  aria-label={color.id}
                  className={[
                    "h-9 w-9 rounded-full border-2",
                    colorId === color.id ? "border-[#5c3a1d]" : "border-transparent",
                  ].join(" ")}
                  style={{ backgroundColor: color.hex }}
                  onClick={() => setColorId(color.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between">
          <button
            type="button"
            className="ui-chip px-7 py-2 text-[14px] font-bold"
            onClick={onCancel}
          >
            {t("ui.action.cancel")}
          </button>
          <button
            type="button"
            className="ui-green-btn px-8 py-2 text-[15px] font-bold"
            disabled={title.trim().length === 0}
            onClick={() => {
              const chain = createChain({
                category,
                title: title.trim(),
                description: description.trim() || undefined,
                iconId,
                colorId,
              });
              onCreated(chain.chainId);
            }}
          >
            {t("ui.chain.create")}
          </button>
        </div>
      </div>
    </Shell>
  );
}

/**
 * 节点表单：名字/时长/重要级/说明 + 前置勾选。**建和改共用同一张**
 * （设计定案：一个表单管所有节点内容）——editNode 有值就是编辑模式，
 * 带初值、可删环；前置勾选里会成环的候选直接禁灰（实时反馈，
 * 不让玩家勾完保存才被拒）。
 */
function NodeForm({
  chain,
  editNode,
  onClose,
  onDone,
}: {
  chain: ActionChainSave;
  editNode?: ActionChainNode;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(editNode?.customName ?? "");
  const [minutes, setMinutes] = useState(editNode?.durationMinutes ?? 25);
  const [priority, setPriority] = useState<ActionPriority>(
    editNode?.priority ?? ActionPriority.Normal,
  );
  const [note, setNote] = useState(editNode?.note ?? "");
  const [requires, setRequires] = useState<string[]>(
    editNode
      ? editNode.requires
      : // 默认接在最后一环后面——最常见的用法是"顺着往下写"
        chain.nodes.length > 0
          ? [chain.nodes[chain.nodes.length - 1].nodeId]
          : [],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const definition = actionDefinitions.find((d) => d.category === chain.category);
  const clampMinutes = (value: number): number => {
    const min = definition?.durationMinutes.min ?? 1;
    const max = definition?.durationMinutes.max ?? 480;
    return Math.max(min, Math.min(max, value));
  };

  return (
    <Shell
      title={`${chain.title} · ${editNode ? t("ui.chain.edit_node") : t("ui.chain.add_node")}`}
      onBack={onDone}
      onClose={onClose}
    >
      <div className="ui-scroll mx-auto flex h-full w-full max-w-[600px] flex-col gap-3 overflow-y-auto">
        <div>
          <div className="mb-1 text-[14px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.action.what")}
          </div>
          <input
            className="ui-input w-full px-3 py-2 text-[14px] outline-none"
            placeholder={t("ui.action.what_placeholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-1 text-[14px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.action.how_long")}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="ui-wood-btn h-9 w-10 text-[18px] leading-none"
              onClick={() => setMinutes((v) => clampMinutes(v - 5))}
            >
              −
            </button>
            <div className="ui-input min-w-[120px] px-4 py-1.5 text-center">
              <span className="text-[20px] font-bold text-[#4a3b2a]">{minutes}</span>
              <span className="ml-1 text-[12px] text-[#7d6242]">
                {t("ui.action.minutes")}
              </span>
            </div>
            <button
              type="button"
              className="ui-wood-btn h-9 w-10 text-[18px] leading-none"
              onClick={() => setMinutes((v) => clampMinutes(v + 5))}
            >
              ＋
            </button>
            {[15, 25, 45, 60].map((preset) => (
              <button
                key={preset}
                type="button"
                className={[
                  "ui-chip px-2.5 py-1 text-[12px]",
                  minutes === preset ? "ui-chip--on" : "",
                ].join(" ")}
                onClick={() => setMinutes(clampMinutes(preset))}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[14px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.action.priority")}
          </div>
          <div className="flex gap-2">
            {actionPriorityDefinitions.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={[
                  "ui-chip flex-1 py-1.5 text-[13px]",
                  priority === entry.id
                    ? entry.id === ActionPriority.High
                      ? "ui-chip--strong"
                      : "ui-chip--on"
                    : "",
                ].join(" ")}
                onClick={() => setPriority(entry.id)}
              >
                {entry.id === ActionPriority.Low ? "🍃" : "⭐"}{" "}
                <span className="font-bold">{t(entry.localizationKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[14px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.chain.form_note")}
            <span className="ml-1 text-[11px] font-normal text-[#9a8360]">
              {t("ui.chain.optional")}
            </span>
          </div>
          <input
            className="ui-input w-full px-3 py-2 text-[14px] outline-none"
            placeholder={t("ui.chain.form_note_placeholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {chain.nodes.length > 0 && (
          <div>
            <div className="mb-1 text-[14px] font-bold text-[#5c3a1d]">
              🌿 {t("ui.chain.form_requires")}
              <span className="ml-1 text-[11px] font-normal text-[#9a8360]">
                {t("ui.chain.form_requires_hint")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {chain.nodes
                .filter((node) => node.nodeId !== editNode?.nodeId)
                .map((node) => {
                  const checked = requires.includes(node.nodeId);
                  // 编辑模式下勾这个会不会成环（新建的环还不在图里，怎么勾都不会）
                  const cyclic =
                    !checked &&
                    editNode !== undefined &&
                    wouldCreateCycle(chain.nodes, node.nodeId, editNode.nodeId);
                  return (
                    <button
                      key={node.nodeId}
                      type="button"
                      disabled={cyclic}
                      title={cyclic ? t("ui.chain.would_cycle") : undefined}
                      className={[
                        "ui-chip max-w-[180px] truncate px-2.5 py-1 text-[12px]",
                        checked ? "ui-chip--on" : "",
                        cyclic ? "opacity-40" : "",
                      ].join(" ")}
                      onClick={() =>
                        setRequires((prev) =>
                          checked
                            ? prev.filter((id) => id !== node.nodeId)
                            : [...prev, node.nodeId],
                        )
                      }
                    >
                      {checked ? "✓ " : cyclic ? "⛔ " : ""}
                      {node.customName}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            className="ui-chip px-7 py-2 text-[14px] font-bold"
            onClick={onDone}
          >
            {t("ui.action.cancel")}
          </button>

          {editNode && !editNode.completedAtUtc && (
            <button
              type="button"
              className={[
                "px-4 py-2 text-[13px] font-bold",
                confirmDelete ? "ui-chip ui-chip--strong" : "ui-wood-btn",
              ].join(" ")}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                deleteChainNode({ chainId: chain.chainId, nodeId: editNode.nodeId });
                onDone();
              }}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete
                ? t("ui.chain.delete_node_confirm")
                : `🗑 ${t("ui.chain.delete_node")}`}
            </button>
          )}

          <button
            type="button"
            className="ui-green-btn px-8 py-2 text-[15px] font-bold"
            disabled={name.trim().length === 0}
            onClick={() => {
              if (editNode) {
                updateChainNode(
                  { chainId: chain.chainId, nodeId: editNode.nodeId },
                  {
                    customName: name.trim(),
                    durationMinutes: minutes,
                    priority,
                    note: note.trim() || undefined,
                    requires,
                  },
                );
              } else {
                addChainNode(chain.chainId, {
                  customName: name.trim(),
                  durationMinutes: minutes,
                  priority,
                  note: note.trim() || undefined,
                  requires,
                  position: { x: chain.nodes.length * 220, y: 0 },
                });
              }
              onDone();
            }}
          >
            {t("ui.chain.save_node")}
          </button>
        </div>
      </div>
    </Shell>
  );
}
