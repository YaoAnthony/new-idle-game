import { theftTuning } from "../economy/index.js";
import { residentIdOf } from "../residents/index.js";
import type { StoryRule, TutorialDefinition } from "../../types/story.js";

/**
 * 剧情编排。**这里是唯一的剧情真相来源——代码里不允许出现剧情分支。**
 *
 * 2026-08-13 清空：旧的"租到出租屋"那条线（搬家独白、苔苔登场、妈妈来电、
 * 苔苔失踪、舒舒初见）整套推倒，换成「魔女在深山收学徒」。文案由作者重写，
 * 这里先留空壳——解释器、信号、效果全部照旧，加剧情就是往下面这个数组里
 * 写数据。
 *
 * 写之前先看 `types/story.ts`：18 种信号、10 种效果、触发条件之间是「与」，
 * `triggers` 数组之间是「或」。
 */
export const storyRules: StoryRule[] = [
  /*
   * ==== 金库失窃 · 五幕（期 3）====
   *
   * 一天一步的节奏靠 day_started + requiresEventStage 的组合——
   * "相对的第二天"只能这么表达（minWorldDayId 是绝对日期，表达不了
   * "建成之后的次日"）。金额住 economy 表（theftTuning），这里零数字。
   */
  {
    // ① 金库建成 → 被盯上。requiresEventUntriggered 防第二座金库重新拉链
    id: "theft_eyed",
    triggers: [
      {
        signal: "building_completed",
        subject: "gold_jar",
        requiresEventUntriggered: "gold_theft",
      },
    ],
    effects: [{ kind: "set_event_stage", eventId: "gold_theft", stageId: "eyed" }],
  },
  {
    // ② 次日清晨 → 偷。扣到底为止（库里不足 8 枚就偷光，adjust_gold 的语义）
    id: "theft_strike",
    triggers: [
      {
        signal: "day_started",
        requiresEventStage: { eventId: "gold_theft", stageId: "eyed" },
      },
    ],
    effects: [
      { kind: "adjust_gold", amount: -theftTuning.amount },
      { kind: "set_event_stage", eventId: "gold_theft", stageId: "robbed" },
      { kind: "show_toast", localizationKey: "toast.gold_stolen", durationMs: 8000 },
    ],
  },
  {
    // ③ 同一天稍后：水獭上门搭话（等面板关掉、迟几秒，spawn_resident 自带这套）
    id: "otter_arrives",
    triggers: [
      {
        signal: "day_started",
        requiresEventStage: { eventId: "gold_theft", stageId: "robbed" },
      },
    ],
    effects: [
      { kind: "spawn_resident", residentId: residentIdOf("otter_trader"), definitionId: "otter_trader", delayMs: 2500, jitterMs: 1500 },
      { kind: "start_dialogue", dialogueId: "otter_first_meet", residentId: residentIdOf("otter_trader"), delayMs: 6000 },
      { kind: "set_event_stage", eventId: "gold_theft", stageId: "chasing" },
    ],
  },
  {
    /*
     * ④ 次日：**水獭把小龙拎回来了**（用户加的一幕）。主角是龙不是钱——
     * 它垂头丧气地站在院子里，玩家第一次看清偷东西的是个什么。
     * 钱不在这一步还：见贼和追赃分开，后者才是收束。
     */
    id: "theft_caught",
    triggers: [
      {
        signal: "day_started",
        requiresEventStage: { eventId: "gold_theft", stageId: "chasing" },
      },
    ],
    effects: [
      { kind: "spawn_resident", residentId: residentIdOf("coin_dragon"), definitionId: "coin_dragon", delayMs: 2500, jitterMs: 1000 },
      { kind: "start_dialogue", dialogueId: "dragon_caught", residentId: residentIdOf("coin_dragon"), delayMs: 5500 },
      { kind: "set_event_stage", eventId: "gold_theft", stageId: "caught" },
    ],
  },
  {
    /*
     * ⑤ 再次日：全额奉还 + 长期合作。解锁挂在这一步——合作是这条链的
     * 落点，前面四幕都是铺垫。净损失 = 0（economy 表同一个数进出），
     * 用例钉死。小龙由 trading 的日同步在下一个清晨送走。
     */
    id: "theft_settled",
    triggers: [
      {
        signal: "day_started",
        requiresEventStage: { eventId: "gold_theft", stageId: "caught" },
      },
    ],
    effects: [
      { kind: "adjust_gold", amount: theftTuning.amount },
      { kind: "set_event_stage", eventId: "gold_theft", stageId: "settled", complete: true },
      { kind: "unlock_feature", featureId: "merchant_trading" },
      { kind: "start_dialogue", dialogueId: "otter_returns", residentId: residentIdOf("otter_trader"), delayMs: 2500 },
    ],
  },
  /*
   * ==== 三位居民的到来（期 4）====
   *
   * **一位居民 = 一条规则**，共享 poolId "resident_arrival"：
   * 每个 day_started 同池只掷一次点（同一天最多来一位），错过攒保底，
   * 来过一位三条一起归零重新等。**现在没有任何门槛**（用户定：纯随机）
   * ——以后要"开了林子那块地精灵才会来"，往那条 trigger 上加一个
   * `requiresFeature: "plot.north_grove"`，代码零改动。
   *
   * 图纸在效果里直接给：他说想住下的同时把图纸递到你手上。
   * 搬入（home 重定向 + resident_moved_in 信号）由 Systems/residents
   * 在房子完工时接手。
   */
  {
    id: "resident_slime_arrives",
    triggers: [{ signal: "day_started", poolId: "resident_arrival" }],
    effects: [
      { kind: "spawn_resident", residentId: residentIdOf("slime_neighbor"), definitionId: "slime_neighbor", delayMs: 2500, jitterMs: 1500 },
      { kind: "start_dialogue", dialogueId: "slime_asks_to_stay", residentId: residentIdOf("slime_neighbor"), delayMs: 5500 },
      { kind: "give_item", itemId: "blueprint_slime_house", quantity: 1 },
    ],
  },
  {
    id: "resident_fox_arrives",
    triggers: [{ signal: "day_started", poolId: "resident_arrival" }],
    effects: [
      { kind: "spawn_resident", residentId: residentIdOf("fox_neighbor"), definitionId: "fox_neighbor", delayMs: 2500, jitterMs: 1500 },
      { kind: "start_dialogue", dialogueId: "fox_asks_to_stay", residentId: residentIdOf("fox_neighbor"), delayMs: 5500 },
      { kind: "give_item", itemId: "blueprint_fox_house", quantity: 1 },
    ],
  },
  {
    id: "resident_spirit_arrives",
    triggers: [{ signal: "day_started", poolId: "resident_arrival" }],
    effects: [
      { kind: "spawn_resident", residentId: residentIdOf("spirit_neighbor"), definitionId: "spirit_neighbor", delayMs: 2500, jitterMs: 1500 },
      { kind: "start_dialogue", dialogueId: "spirit_asks_to_stay", residentId: residentIdOf("spirit_neighbor"), delayMs: 5500 },
      { kind: "give_item", itemId: "blueprint_spirit_house", quantity: 1 },
    ],
  },

  /*
   * 报纸（期 7）。**用送礼当解锁开关，这是全蓝图第一次。**
   *
   * `gift_given` 信号早就在（"递出去了，不分档位"），把它用在最有性格
   * 的角色身上是对的：薇尔想要一台打印机，你把它送过去——这比"造好就
   * 自动解锁"有分量得多。
   *
   * 两条规则分开写而不是一条：**送礼**和**取好名字**是两件事，中间隔着
   * 一个玩家要动手的输入框。合成一条的话，玩家还没取名报纸就开始出了，
   * 报头只能开个洞。
   */
  {
    id: "newspaper_gift_received",
    triggers: [{ signal: "gift_given", subject: "furniture_news_printer" }],
    effects: [
      { kind: "start_dialogue", dialogueId: "reporter_names_the_paper", delayMs: 800 },
    ],
  },
  {
    // 对话最后那个节点的 emitEventId 发这个；名字由面板存进 WorldSave
    id: "newspaper_started",
    triggers: [{ signal: "dialogue_event", subject: "paper_named" }],
    effects: [{ kind: "unlock_feature", featureId: "newspaper" }],
  },

  /*
   * 三位住齐 → 他们来问能不能买你的家具 → 递给你小店的图纸（期 5）。
   *
   * `signalCount: 3` 查的是**不带 subject 的那个键**（`resident_moved_in`），
   * 也就是"搬进来过三位"。这正是期 0 那条"不复用 resident_spawned 数人数"的
   * 注释在讲的事——resident_spawned 会把水獭和石傀儡一起算进去。
   *
   * 这条规则本来写在期 4 的文档里，**故意挪到期 5 才上线**：玩家拿着一张
   * 暂时盖不了的图纸，比晚一天拿到糟糕得多。
   */
  {
    id: "residents_want_furniture",
    triggers: [{ signal: "resident_moved_in", signalCount: 3 }],
    effects: [
      { kind: "start_dialogue", dialogueId: "residents_ask_for_shop", delayMs: 2000 },
      { kind: "give_item", itemId: "blueprint_furniture_shop", quantity: 1 },
      { kind: "unlock_feature", featureId: "furniture_shop" },
    ],
  },

  {
    /*
     * ④' 玩家在初见对话里选了"不用管它" → 龙不会被抓、钱不回来，
     * **但生意照做**（用户 2026-08-24 明确过：拒绝不影响他做生意）。
     * 只在"追回"那条上解锁的话，选了放弃的玩家永远没有销路，
     * 而卖货是主要收入——那是全蓝图唯一能把人锁死的路径。
     */
    id: "theft_waived",
    triggers: [{ signal: "dialogue_event", subject: "theft_waived" }],
    effects: [
      { kind: "set_event_stage", eventId: "gold_theft", stageId: "settled", complete: true },
      { kind: "unlock_feature", featureId: "merchant_trading" },
    ],
  },
];

/**
 * 抽签池的调平衡表。**改节奏只动这张表。**
 *
 * 命中率 = min(max, base + step × 连续错过次数)，命中后错过次数归零。
 * base 0.12 / step 0.08 下期望等待大约 4 天——够玩家感觉到"过几天会
 * 有人来"，又不会某天早上一开门站着三位。
 *
 * `max: 1` 表示抬到头是**必中**：邻居是卡进度的（播报员没来，报纸就
 * 出不来），不能真的无限等下去——这正是 `StoryTrigger.chance` 那条
 * "不做保底"的注释所不适用的场合，所以池是独立的机制不是 chance 的
 * 变体。数字是初值。
 */
export type StoryPoolDefinition = {
  poolId: string;
  /** 起始命中率 */
  base: number;
  /** 每连续错过一次加多少 */
  step: number;
  /** 封顶。不填 = 1（迟早必中） */
  max?: number;
};

export const storyPools: StoryPoolDefinition[] = [
  { poolId: "resident_arrival", base: 0.12, step: 0.08, max: 1 },
];

export function findStoryPool(
  poolId: string,
): StoryPoolDefinition | undefined {
  return storyPools.find((pool) => pool.poolId === poolId);
}

/**
 * 教程。同样清空——旧的六步（拆箱→摆工作台→制作→送礼→行动→睡觉）
 * 是按出租屋那套叙事写的。
 *
 * 注意它**现在没有任何 UI 消费方**：常驻左上角的 TutorialGuide 早就删了
 * （它挡视线，而教的那几步看一次就会）。留着这份定义是因为 `story_signal`
 * 那套还给别的系统用，重写教程时直接往 steps 里填。
 */
export const tutorialDefinition: TutorialDefinition = {
  id: "day_one",
  completedLocalizationKey: "tutorial.completed",
  steps: [],
};
