import type { DialogueDefinition, DialogueNode } from "../../types/dialogue.js";

/**
 * 三位居民的闲聊段（居民系统 03）。
 *
 * 这些都是**线性小段**：一到两个节点、没有选项、不发事件——池子（`Data/residents/talk`）
 * 负责按条件挑入口，这里只是把"段"摊平成注册表能吃的形状。手写 75 段 × 节点的
 * 字面量会有几百行一模一样的骨架，抄漏一个 nextNodeId 就是一段断在半路；
 * 所以由表生成：`[slug, 节点数, 各节点表情]`。
 *
 * 文案键规则：`dlg.<who>_chat_<slug>.n<k>`。要给某段加选项 / 送礼，把它从这张表
 * 挪到 `index.ts` 手写即可——id 不变，池子不用动。
 */
type Row = readonly [slug: string, nodes: number, expressions?: readonly (string | undefined)[]];

const WHO = ["slime", "fox", "spirit"] as const;

/** 三位共用的段落骨架：特殊段两句，一般段一句。表情按段给，不按人给 */
const ROWS: readonly Row[] = [
  ["enough", 1, ["sleepy"]],
  ["saw_exercise", 2, ["surprised"]],
  ["saw_work", 2],
  ["saw_creation", 2, ["happy"]],
  ["saw_rest", 2],
  ["holding_food", 1, ["surprised"]],
  ["gift_memory", 2, ["happy"]],
  ["dragon_memory", 2, ["puzzled"]],
  ["long_time", 2, ["surprised", "happy"]],
  ["new_here", 2, ["shy"]],
  ["dawn", 1],
  ["day", 1],
  ["dusk", 1],
  ["night", 1, ["sleepy"]],
  ["sunny", 1, ["happy"]],
  ["cloudy", 1],
  ["rain", 1],
  ["storm", 1, ["surprised"]],
  ["low_mood", 1, ["sad"]],
  ["high_mood", 1, ["happy"]],
  ["any_1", 1],
  ["any_2", 1],
  ["any_3", 1],
  ["any_4", 1],
  ["any_5", 1],
];

/** 08：你在他屋里时的三段（条件在池子里，这里只是骨架） */
const HOME: readonly Row[] = [["home_1", 1, ["happy"]], ["home_2", 2], ["home_3", 1, ["shy"]]];

/** 只有这一位才有的段 */
const EXTRA: Record<(typeof WHO)[number], readonly Row[]> = {
  slime: [["holding_tomato", 1, ["surprised"]], ["gossip_fox_town", 2, ["puzzled"]], ["gossip_fox_parcel", 1], ...HOME],
  fox: [["slime_around", 1], ["gossip_slime_lamp", 2, ["happy"]], ["gossip_spirit_soup", 1], ...HOME],
  spirit: [["fox_around", 1], ["gossip_slime_sick", 2], ["gossip_fox_town", 1], ...HOME],
};

function chatOf(who: (typeof WHO)[number], row: Row): DialogueDefinition {
  const [slug, count, expressions = []] = row;
  const id = `${who}_chat_${slug}`;
  const nodes: Record<string, DialogueNode> = {};
  for (let i = 1; i <= count; i += 1) {
    const nodeId = `n${i}`;
    const node: DialogueNode = {
      nodeId,
      speaker: "npc",
      localizationKey: `dlg.${id}.${nodeId}`,
    };
    if (i < count) node.nextNodeId = `n${i + 1}`;
    const expression = expressions[i - 1];
    if (expression) node.expression = expression;
    nodes[nodeId] = node;
  }
  return {
    id,
    localizationKey: `dlg.${id}`,
    speakerNameKey: `pet.${who}_neighbor`,
    entryNodeId: "n1",
    nodes,
  };
}

export const residentChatDialogues: DialogueDefinition[] = WHO.flatMap((who) =>
  [...ROWS, ...EXTRA[who]].map((row) => chatOf(who, row)),
);
