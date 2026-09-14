import type {
  AutoBehaviorDefinition,
  OutingWeatherRule,
} from "../../types/autoLife.js";
import { DayPhaseId } from "../../types/time.js";
import { WeatherKind } from "../../types/weather.js";

/**
 * 出门看天气（专注模式 01·乙）。**每种天气都得有一格**——类型是
 * `Record<WeatherKind, …>`，加了新天气不来填这里编译就过不去。
 *
 * - 雨：背包里有伞才出、出的时候撑着；没伞不出。用户说的是"尽量不出门"：
 *   出门本来只有 5%，再给没伞的留一丝"冒雨跑一趟"，挂一小时机也看不到
 *   一次，只会让人以为规则坏了。
 * - 暴风雨：有伞也不出。风大，伞撑不住。
 * - 雾：出。看不远，但不湿人。
 */
const outingWeather: Record<WeatherKind, OutingWeatherRule> = {
  [WeatherKind.Sunny]: "go",
  [WeatherKind.Cloudy]: "go",
  [WeatherKind.Wind]: "go",
  [WeatherKind.Fog]: "go",
  [WeatherKind.Rain]: "umbrella",
  [WeatherKind.Storm]: "stay",
};

/** 哪些时段会出门。夜里不出——黑灯瞎火在院子里站着不是"溜达" */
const outingPhases: readonly DayPhaseId[] = [
  DayPhaseId.Dawn,
  DayPhaseId.Day,
  DayPhaseId.Dusk,
];

/**
 * 自动生活的调平衡表。**改行为节奏只动这张表，不动 logic 里的算法。**
 *
 * 节奏的总原则（声音是本体推出来的）：**行为要长而稳**。音景频繁切换
 * 是噪音不是白噪音，所以有 `minWorkSeconds` 这道粘性——刚回到桌前
 * 不到这个时长，谁都别想再把角色拽起来。
 *
 * 2026-09-13 扩表（专注模式 01·乙）：饭点、小睡、出门、雨天看伞。这一批
 * 数字是第一版占位，用户原话"到时候我们可以改改"——改这里就行。
 */
export const autoLifeTuning = {
  /**
   * 工作中每隔多久评估一次"要不要起身"。
   *
   * 20 秒不是响应速度（饿了 20 秒内一定有反应），是**演出的最小节拍**：
   * 更密的话状态一波动角色就坐立不安，画面看着像有虫子。
   */
  replanSeconds: 20,

  /** 饱食低于这个数就去吃饭，不看钟点 */
  hungerThreshold: 40,

  /**
   * 饭点：游戏钟落在这几段里，饱食低于 `mealHungerThreshold` 也去吃。
   *
   * 这是"过日子"和"饿了才吃"的差别。游戏钟就是玩家那边的真实时间
   * （real_time 时间策略），所以角色是跟着人一起吃午饭、晚饭。
   * 分钟数从当天 00:00 算，左闭右开。
   */
  mealWindows: [
    { fromMinute: 11 * 60 + 30, toMinute: 13 * 60 },
    { fromMinute: 17 * 60 + 30, toMinute: 19 * 60 },
  ],
  /**
   * 饭点里饱食低于这个才吃。85 而不是 100：一顿回 30 上下，刚吃过的
   * 不会在同一个饭点里一口接一口
   */
  mealHungerThreshold: 85,

  /**
   * 背包里能吃的少于这个数就**饿着也不吃**。
   *
   * 自动模式动的是真库存（用户拍板），这道保险丝拦住"挂一晚上机
   * 把家吃空"——最后几份食物留给玩家自己决定怎么用。
   */
  minEdibleCount: 2,

  /** 精力低于这个数、家里有空床，就去躺一会儿 */
  napFatigueThreshold: 40,
  /**
   * 一次小睡回多少精力。**回得少是刻意的**：配上 30 分钟冷却，一小时
   * 最多 +20，睡一整觉是回满——专注不能变成回精力的路子
   */
  napRestore: 10,

  /**
   * 每次评估时出门的概率。和溜达**共用一个骰子、切两段**：
   * [0, outingChance) 出门，[outingChance, outingChance + strollChance) 溜达。
   *
   * 这一拍出不了门（夜里、下雨没伞、门锁着、冷却中）时，出门那一段落进
   * 溜达——"出不去，就在屋里转转"。两个各掷一次骰子的话，出不去的那 5%
   * 就凭空消失了，下雨天角色反而更钉在椅子上。
   */
  outingChance: 0.05,
  outingPhases,
  outingWeather,
  /** 雨天出门要查的那件东西 */
  umbrellaItemId: "umbrella",
  /** 出门在院子里走几处、每处站多久（剧本在场景里，数在这里） */
  outingPoints: 2,
  outingPointSeconds: 8,

  /**
   * 每次评估时起身溜达的概率（出门那一段之后的一段）。
   *
   * 溜达没有任何数值效果，纯粹是"活人不会钉在椅子上"的演出，
   * 也是脚步声这路白噪音的来源。概率低是刻意的：主旋律是干活。
   */
  strollChance: 0.08,
  /** 溜达在屋里走几处、每处站多久 */
  strollPoints: 2,
  strollPointSeconds: 6,

  /** 刚回到工位之后至少坐这么久才允许下一次起身（粘性） */
  minWorkSeconds: 90,
};

/**
 * 行为表：每步到位后停多久、多久内不再排、等到位最多等多久、进行中响什么。
 *
 * `soundscape` 全部留空——**音效素材和接线归用户**（2026-08-29 分工），
 * 位置在这儿，往里填 AudioEngine 的 profileId 就生效。
 */
export const autoBehaviors: AutoBehaviorDefinition[] = [
  {
    kind: "work",
    // work 的 dwell 没有意义（一直坐到下一次评估），置 0 只为形状统一
    dwellSeconds: 0,
    cooldownSeconds: 0,
    arriveTimeoutSeconds: 30,
    soundscape: [],
  },
  {
    kind: "eat",
    // 走到厨房后"做饭+吃"的演出时长。够长才装得下炉火声起落
    dwellSeconds: 25,
    // 吃完一顿之后多久不再考虑吃（哪怕还饿）——防止库存不够回饱食时抽搐
    cooldownSeconds: 300,
    arriveTimeoutSeconds: 30,
    soundscape: [],
  },
  {
    kind: "nap",
    // 躺多久。一分半：看得出"睡了一会儿"，又不至于一段专注大半躺在床上
    dwellSeconds: 90,
    cooldownSeconds: 1800,
    arriveTimeoutSeconds: 30,
    soundscape: [],
  },
  {
    kind: "outing",
    /*
     * 出门那一圈（开门、院子里几处各站一会儿、回屋关门）**全在场景的剧本里**，
     * 关好门才报到位；这里的停留只是进门喘口气再回工位。
     */
    dwellSeconds: 2,
    cooldownSeconds: 600,
    // 一整圈要一分多钟，按 30 秒兜底会把人截在院子里
    arriveTimeoutSeconds: 150,
    soundscape: [],
  },
  {
    kind: "stroll",
    // 屋里几处各站一会儿也在剧本里，走完直接回去
    dwellSeconds: 0,
    cooldownSeconds: 120,
    arriveTimeoutSeconds: 60,
    soundscape: [],
  },
];

export function findAutoBehavior(
  kind: AutoBehaviorDefinition["kind"],
): AutoBehaviorDefinition | undefined {
  return autoBehaviors.find((entry) => entry.kind === kind);
}
