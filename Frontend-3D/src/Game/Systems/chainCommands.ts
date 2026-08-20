import { ActionCategory, ActionPriority, tidyChainLayout, wouldCreateCycle } from "core";
import { registerCommand, type CommandResult } from "../CommandLine/commands";
import {
  addChainNode,
  createChain,
  deleteChain,
  deleteChainNode,
  getActionChains,
  isNodeUnlocked,
  updateChainNode,
} from "../State/actionChains";
import { getActiveAction } from "./actions";
import { startChainNodeAction, type StartNodeResult } from "./actionChains";

/**
 * `/chain` 命令组：**阶段 2 的验收工具**，也是永久的调试入口。
 *
 * 和 /daily 同一个道理：正式交互在面板上（阶段 3/4），先用命令行把
 * 规则链跑通——建链、加环、连前置（含环检测）、发起、完成、开箱，
 * 每一步都能单独敲。UI 出问题时靠它区分"逻辑坏了还是没画出来"。
 */

const USAGE = [
  "/chain                       —— 链一览",
  "/chain new <分类> <标题>      —— 建链（分类: exercise/work/creation/rest）",
  "/chain node <链#> <分钟> <名字> —— 加一环（默认接在上一环后面）",
  "/chain root <链#> <分钟> <名字> —— 加一环（不接前置，当起点）",
  "/chain link <链#> <前置#> <环#> —— 连前置（成环会被拒）",
  "/chain show <链#>             —— 看整棵树（锁定/可做/已完成）",
  "/chain start <链#> <环#>      —— 发起这一环的行动",
  "/chain tidy <链#>             —— 一键整理布局",
  "/chain rm <链#> [环#]         —— 删环（下游自动接上）或整条链",
].join("\n");

const CATEGORY_ALIAS: Record<string, ActionCategory> = {
  exercise: ActionCategory.Exercise,
  work: ActionCategory.WorkStudy,
  work_study: ActionCategory.WorkStudy,
  creation: ActionCategory.Creation,
  rest: ActionCategory.Rest,
};

const START_FAIL: Record<Exclude<StartNodeResult, "ok">, string> = {
  missing: "找不到这一环（被删了？）",
  locked: "前置还没做完，这一环还锁着",
  completed: "这一环已经做过了（一次性）",
  busy: "已经有进行中的行动了，同一时刻只能做一件事",
  no_furniture: "该分类的支撑家具还没摆，先去摆一件",
  tired: "精力不够，先休息",
};

export function registerChainCommands(): Array<() => void> {
  const ok = (message: string): CommandResult => ({ ok: true, message });
  const fail = (message: string): CommandResult => ({ ok: false, message });

  const chainAt = (raw: string | undefined) => {
    const index = Number.parseInt(raw ?? "", 10) - 1;
    const chains = getActionChains();
    return Number.isInteger(index) && index >= 0 && index < chains.length
      ? chains[index]
      : undefined;
  };

  return [
    registerCommand({
      name: "chain",
      usage: "chain [new|node|root|link|show|start|tidy|rm] …",
      description: "系列任务：建链、加环、连前置、发起、看树",
      handler: (args) => {
        const sub = (args[0] ?? "").toLowerCase();

        if (!sub) {
          const chains = getActionChains();
          if (chains.length === 0) return ok(`还没有系列任务。\n${USAGE}`);
          return ok(
            chains
              .map((c, i) => {
                const done = c.nodes.filter((n) => n.completedAtUtc).length;
                const state = c.completedAtUtc ? "✅已结项" : `${done}/${c.nodes.length}`;
                return `${i + 1}. [${c.category}] ${c.title} ${state}`;
              })
              .join("\n"),
          );
        }

        if (sub === "new") {
          const category = CATEGORY_ALIAS[(args[1] ?? "").toLowerCase()];
          const title = args.slice(2).join(" ").trim();
          if (!category || !title) return fail("用法：/chain new work 期末冲刺");
          const chain = createChain({
            category,
            title,
            iconId: "flag",
            colorId: "sky",
          });
          return ok(`建好了：${chain.title}（#${getActionChains().length}，分类 ${category}）`);
        }

        const chain = chainAt(args[1]);
        if (!chain) return fail(`要带链的序号（看 /chain）。\n${USAGE}`);
        const chainIndex = getActionChains().indexOf(chain) + 1;

        if (sub === "node" || sub === "root") {
          const minutes = Number.parseInt(args[2] ?? "", 10);
          const name = args.slice(3).join(" ").trim();
          if (!Number.isFinite(minutes) || minutes <= 0 || !name) {
            return fail(`用法：/chain ${sub} ${chainIndex} 30 读完第一章`);
          }
          const last = chain.nodes[chain.nodes.length - 1];
          const node = addChainNode(chain.chainId, {
            customName: name,
            durationMinutes: minutes,
            priority: ActionPriority.Normal,
            requires: sub === "node" && last ? [last.nodeId] : [],
            position: { x: chain.nodes.length * 220, y: 0 },
          });
          if (!node) return fail("加不进去（链没了？）");
          const suffix =
            sub === "node" && last ? `，接在「${last.customName}」后面` : "（起点）";
          return ok(`第 ${chain.nodes.length} 环：${name}（${minutes} 分钟）${suffix}`);
        }

        if (sub === "link") {
          const from = chain.nodes[Number.parseInt(args[2] ?? "", 10) - 1];
          const to = chain.nodes[Number.parseInt(args[3] ?? "", 10) - 1];
          if (!from || !to) return fail(`用法：/chain link ${chainIndex} 1 3（环号看 /chain show）`);
          if (to.requires.includes(from.nodeId)) return ok("本来就连着");
          if (wouldCreateCycle(chain.nodes, from.nodeId, to.nodeId)) {
            return fail(`不行：「${from.customName}」→「${to.customName}」会成环`);
          }
          updateChainNode(
            { chainId: chain.chainId, nodeId: to.nodeId },
            { requires: [...to.requires, from.nodeId] },
          );
          return ok(`连上了：做完「${from.customName}」才解锁「${to.customName}」`);
        }

        if (sub === "show") {
          if (chain.nodes.length === 0) return ok(`${chain.title}：还没有环。/chain node ${chainIndex} 30 第一件事`);
          const nameOf = new Map(chain.nodes.map((n) => [n.nodeId, n.customName]));
          return ok(
            [
              `${chain.title}${chain.completedAtUtc ? "（已结项）" : ""}`,
              ...chain.nodes.map((n, i) => {
                const mark = n.completedAtUtc
                  ? "✅"
                  : isNodeUnlocked(chain, n)
                    ? "▶️"
                    : "🔒";
                const deps =
                  n.requires.length > 0
                    ? ` ⟵ ${n.requires.map((id) => nameOf.get(id) ?? "?").join(" + ")}`
                    : "";
                return `  ${mark} ${i + 1}. ${n.customName}（${n.durationMinutes} 分钟）${deps}`;
              }),
            ].join("\n"),
          );
        }

        if (sub === "start") {
          const node = chain.nodes[Number.parseInt(args[2] ?? "", 10) - 1];
          if (!node) return fail(`用法：/chain start ${chainIndex} 2`);
          const result = startChainNodeAction({ chainId: chain.chainId, nodeId: node.nodeId });
          if (result !== "ok") return fail(START_FAIL[result]);
          return ok(`开始了：${node.customName}（${node.durationMinutes} 分钟）`);
        }

        if (sub === "tidy") {
          const layout = tidyChainLayout(chain.nodes);
          for (const node of chain.nodes) {
            const position = layout.get(node.nodeId);
            if (position) {
              updateChainNode({ chainId: chain.chainId, nodeId: node.nodeId }, { position });
            }
          }
          return ok("整理好了");
        }

        if (sub === "rm") {
          if (args[2] !== undefined) {
            const node = chain.nodes[Number.parseInt(args[2], 10) - 1];
            if (!node) return fail(`环号不对（看 /chain show ${chainIndex}）`);
            if (getActiveAction()?.chainRef?.nodeId === node.nodeId) {
              return fail("这一环正在进行中，先取消行动再删");
            }
            deleteChainNode({ chainId: chain.chainId, nodeId: node.nodeId });
            return ok(`删了「${node.customName}」，下游已自动接上`);
          }
          if (getActiveAction()?.chainRef?.chainId === chain.chainId) {
            return fail("这条链有环正在进行中，先取消行动再删");
          }
          const count = chain.nodes.length;
          deleteChain(chain.chainId);
          return ok(`删了整条「${chain.title}」（连同 ${count} 环）`);
        }

        return fail(USAGE);
      },
    }),
  ];
}
