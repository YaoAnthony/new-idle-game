import {
  ActionCategory,
  ActionPriority,
  type ActionDefinition,
  type ActionPriorityDefinition,
} from "../../types/actions.js";
import { FurnitureCapability } from "../../types/furniture.js";

/**
 * 行动注册表。行动是玩家现实中真的要做的事（专注陪伴工具的核心）；
 * 完成后**开一个箱子，抽一件家具**（期 2 起）——那件家具既是布置屋子的
 * 材料，也是拿去卖给水獭换钱的货，两条循环靠它接起来。
 *
 * 能做哪类行动取决于家里有什么家具——这条规则通过
 * `requiredFurnitureCapabilities` 表达，家具那边用同名的 FurnitureCapability 声明，
 * 两边在 Core 里对上。以前这张对照表写在 Frontend 的 actions.ts 里，
 * 联机时服务端读不到，已经挪过来。
 */
export const actionDefinitions = [
  {
    id: "work_study",
    localizationKey: "action.work_study",
    category: ActionCategory.WorkStudy,
    requiredFurnitureCapabilities: [FurnitureCapability.Study],
    durationMinutes: { min: 1, max: 480 },
    fatigueCost: 18,
    // 空 = 开箱（期 2）。原来是「2 木头 + 1 鸡蛋」，不看时长
    rewards: [],
    audioProfileId: "sfx_action_writing",
  },
  {
    id: "exercise",
    localizationKey: "action.exercise",
    category: ActionCategory.Exercise,
    requiredFurnitureCapabilities: [FurnitureCapability.Exercise],
    durationMinutes: { min: 1, max: 240 },
    fatigueCost: 25,
    rewards: [],
  },
  {
    id: "creation",
    localizationKey: "action.creation",
    category: ActionCategory.Creation,
    requiredFurnitureCapabilities: [FurnitureCapability.Creation],
    durationMinutes: { min: 1, max: 300 },
    fatigueCost: 15,
    rewards: [],
    // 画画和写字共用笔尖摩擦的声音——同一支笔在纸上走
    audioProfileId: "sfx_action_writing",
  },
  {
    // 休息是唯一**回**疲劳的行动（fatigueCost 为负），
    // 所以疲劳见底时它永远做得了——不会把玩家锁死
    id: "rest",
    localizationKey: "action.rest",
    category: ActionCategory.Rest,
    requiredFurnitureCapabilities: [FurnitureCapability.Rest],
    durationMinutes: { min: 1, max: 180 },
    fatigueCost: -30,
    /*
     * **休息不掉东西**（期 2）。空数组在别处等于"开箱"，所以要显式关掉
     * ——否则它会成为全游戏最优刷法：不耗精力、上限 180 分、白开箱。
     * 它的回报是上面那个负的 fatigueCost 本身。
     */
    rewards: [],
    noChest: true,
  },
] satisfies ActionDefinition[];

/**
 * 重要级的代价与回报。**两者同向缩放**是刻意的：
 * 重要级是玩家自填的，只给好处的话所有人都会标"重要"，标签就废了。
 * 现在标得越重要拿得越多、也越累，当天能做的件数越少——取舍是真的。
 *
 * 注意"普通"的性价比最高（2 奖励 / 1.0 疲劳），"重要"是想一次多拿时的选择，
 * 不是无脑最优解。
 */
export const actionPriorityDefinitions = [
  {
    id: ActionPriority.Low,
    localizationKey: "action_priority.low",
    fatigueMultiplier: 0.6,
    rewardMultiplier: 1,
  },
  {
    id: ActionPriority.Normal,
    localizationKey: "action_priority.normal",
    fatigueMultiplier: 1,
    rewardMultiplier: 2,
  },
  {
    id: ActionPriority.High,
    localizationKey: "action_priority.high",
    fatigueMultiplier: 1.6,
    rewardMultiplier: 3,
  },
] satisfies ActionPriorityDefinition[];

/**
 * 事后补记的调平衡参数（2026-08-25）。
 *
 * **是注册表数据不是代码里的常量**——调平衡改这一处，逻辑一行不动。
 * 和 `dailyBoardDefinition`、`chestWeightTable` 同一个路子。
 *
 * 下面两个数都是**占位值**（用户 2026-08-25：先能动、玩法过关了再调）。
 * 但占位不等于随手写，两个数各有依据：
 *
 * - `maxPerDay: 5` —— 用户定的。也和精力对得上：精力满 100，一条普通
 *   工作学习耗 18，本来就是"一天大概五件"，补记不该比亲手做的还宽。
 *
 * - `maxMinutesPerDay: 480` —— 一个工作日。件数单独拦不住刷：五条各补
 *   八小时，投入分全落在权重表最高档，比认真坐一天还划算。八小时是
 *   "今天你不可能记出比这更多的事"的自然上限，超出的部分不该再有回报。
 *
 * **注意这两条只管补记，不管计时器那条路。** 计时器现在完全不封顶，
 * 而且短行动的产出效率远高于长行动（`grantChest` 恒开一件，投入分
 * 只改稀有度）——那是一个更根本的失衡，要在平衡那一轮单独修，
 * 不是靠给补记加个额度就能盖住的。
 */
export const actionLogTuning = {
  /** 一天最多**补记**几件（补记 = 没在游戏里做，事后写上去） */
  maxPerDay: 5,
  /** 一天补记的总分钟上限 */
  maxMinutesPerDay: 480,
  /**
   * 一天最多几件**有奖励**。
   *
   * 和上面那个是两码事：`maxPerDay` 拦的是"没做也能写"，这个拦的是
   * "做多少都给"。超过之后照常完成、照常记进 dayFacts、照常消耗精力，
   * 只是不开箱——**做事本身不该被封顶，奖励才该**。
   *
   * 比补记额度松（10 > 5）：认真用计时器做完一件要花掉那么多真实时间，
   * 那份代价本来就挡住了刷；补记一句话就是一条，得管得更紧。
   */
  rewardedPerDay: 10,
};

/**
 * 标题 → 分类的关键词表（2026-08-29，日记本自动分类）。
 *
 * 日记本左页写计划时不选分类（写日记的人不想先填表格），后台按标题
 * 自动归类。**表序就是优先级**：从上往下第一个命中的赢——
 * `work_study` 的「作业」排在 `creation` 的「写作」前面，"写作业"才不会
 * 被劈成"写作 + 业"归进创作。谁都没命中就落到 `defaultActionCategory`。
 *
 * 模式是正则源字符串（编译在 `logic/classifyAction`），加词条只动这张表。
 * 用户原话"未来这一块肯定要改的"——这版就是能跑通的最朴素方案，
 * 换成真正的文本分析时只换 logic 那头，表还能当训练词典用。
 */
export const actionCategoryKeywords: Array<{
  category: ActionCategory;
  patterns: string[];
}> = [
  {
    category: ActionCategory.Rest,
    patterns: [
      "睡",
      "午休",
      "小憩",
      "休息",
      "冥想",
      "放松",
      "发呆",
      "泡澡",
      "nap",
      "sleep",
      "rest",
      "meditat",
      "relax",
    ],
  },
  {
    category: ActionCategory.Exercise,
    patterns: [
      "跑",
      "健身",
      "锻炼",
      "运动",
      "球",
      "游泳",
      "骑行",
      "骑车",
      "瑜伽",
      "散步",
      "走路",
      "拉伸",
      "俯卧撑",
      "深蹲",
      "撸铁",
      "爬山",
      "跳绳",
      "gym",
      "run",
      "workout",
      "jog",
      "swim",
      "yoga",
      "fitness",
      "hike",
    ],
  },
  {
    // 排在 creation 前面：作业/报告/论文这些"写"字辈是学习不是创作
    category: ActionCategory.WorkStudy,
    patterns: [
      "作业",
      "学习",
      "复习",
      "预习",
      "背单词",
      "工作",
      "上班",
      "报告",
      "周报",
      "论文",
      "代码",
      "编程",
      "会议",
      "阅读",
      "读书",
      "刷题",
      "考试",
      "study",
      "work",
      "homework",
      "code",
      "coding",
      "meeting",
      "read",
      "exam",
    ],
  },
  {
    category: ActionCategory.Creation,
    patterns: [
      "写作",
      "写小说",
      "写歌",
      "画",
      "绘",
      "设计",
      "作曲",
      "编曲",
      "剪辑",
      "拍摄",
      "创作",
      "博客",
      "手工",
      "织",
      "draw",
      "paint",
      "design",
      "compose",
      "craft",
      "blog",
      "film",
    ],
  },
];

/** 关键词全没命中时的落点。写日记的人写的大多是"把 X 做完"——按干活算 */
export const defaultActionCategory = ActionCategory.WorkStudy;

export function findActionDefinition(
  id: string,
): ActionDefinition | undefined {
  return actionDefinitions.find((action) => action.id === id);
}

export function findActionByCategory(
  category: ActionCategory,
): ActionDefinition | undefined {
  return actionDefinitions.find((action) => action.category === category);
}

export function findActionPriority(
  id: ActionPriority,
): ActionPriorityDefinition | undefined {
  return actionPriorityDefinitions.find((entry) => entry.id === id);
}
