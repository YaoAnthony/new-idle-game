import type { FeatureId, LocalizationKey } from "./base.js";
import type { DialogueId } from "./dialogue.js";
import type { EventId, EventStageId } from "./events.js";
import type { ItemId } from "./items.js";
import type { AffectionStage, ResidentId } from "./residents.js";
import type { WorldDayId } from "./time.js";
import type { WeatherId } from "./weather.js";

/**
 * 剧情编排的数据契约。铁律：剧情内容零硬编码——
 * 触发条件、后果、教程步骤全部是注册表数据，运行时由通用解释器执行。
 *
 * 流转：游戏系统发出信号 → 触发器匹配 → 执行效果 → 可能再发信号。
 */

/** 游戏系统发出的信号种类。新增玩法时在此扩展，而不是在剧情里写 if */
export type StorySignalKind =
  | "game_started"
  | "backpack_opened"
  | "furniture_placed"
  /** 拆开了一个一次性容器（纸箱/奖励箱）。subject 是战利品表 id */
  | "unpacked"
  | "craft_completed"
  | "cook_completed"
  | "dialogue_ended"
  /**
   * 对话节点上的 `emitEventId` 到达。subject 是那个 EventId。
   *
   * 对话本身不写效果——节点只负责"报告我到了这里"，
   * 接什么后果由 storyRules 按 subject 声明。
   */
  | "dialogue_event"
  /**
   * 递出去了。**不分档位**，subject 是 ItemId。
   *
   * 主线推进挂这一条而不是挂 `gift_loved`：第一天送礼那一段的题眼是
   * "你递上的是它连见都没见过的东西"，和好不好吃无关。
   * 挂了档位就会出现"玩家递了它不爱吃的，剧情卡死"——那正是本作
   * 「不制造焦虑」要避免的。
   */
  | "gift_given"
  /**
   * 送礼四档。判定只发信号，各档接什么后果由 storyRules 声明——
   * 「送错不扣好感」是设计定案，所以这四个信号地位平等，
   * disliked / inedible 同样可以接后果（试错本身是了解对方的一部分）。
   */
  | "gift_loved"
  | "gift_liked"
  | "gift_disliked"
  | "gift_inedible"
  /**
   * 谁收到了爱吃的（居民系统 03）。subject 是**收礼那位的 definitionId**。
   * 上面四条的 subject 是物品——"送对了咕噜就记住你"这条规则要的是人不是物，
   * 两条信号同一拍发，各接各的。
   */
  | "resident_gift_loved"
  | "action_started"
  | "action_completed"
  | "sleep_ended"
  | "resident_spawned"
  | "resident_entered"

  /**
   * **新的一天开始了**（世界日翻页，凌晨 4 点）。**不带 subject。**
   *
   * 不把 worldDayId 塞进 subject 是刻意的：`signalCounts` 按
   * `signalCountKey(kind, subject)` 计数并且**进存档**，带上日期就是每天
   * 一个新键，存档会无限涨——而"数到第几天"这件事恰好是不带 subject 的
   * 那个键本来就在做的。规则要判具体日期有 `minWorldDayId`。
   *
   * **离线多天只发一次**（对齐 V0.2「不应一次性自动补播多段剧情」）。
   * 想补算多天产出的系统自己去比 lastObservedWorldDayId，不靠这个信号数次数。
   */
  | "day_started"

  /**
   * **一栋楼真的完工了**。subject 是 **buildingId**（型号），不是 instanceId。
   *
   * 型号才是规则写得出来的东西——instanceId 是运行时生成的，注册表里
   * 没法引用它。要区分"第一座金库"和"第五座金库"用 `signalCount`，
   * 那正是它存在的理由。
   *
   * **排队中的工地不发**：`finishSite` 才发，下单和认领都不发。
   */
  | "building_completed"

  /**
   * **一位居民搬进了他自己的房子**。subject 是物种 definitionId。
   *
   * 不复用 `resident_spawned` 数人数：那个信号连商人、石傀儡一起算，
   * "满三位居民"会提前成立。语义不同就该是两个信号。
   * （发射点在居民那一期才接——搬入这个动作那时才存在。）
   */
  | "resident_moved_in"

  /**
   * **走进了某张图**。subject 是 mapId。
   *
   * 「去过小镇之后才解锁餐厅」用它。判"去过"而不是"开了桥那块地"：
   * 到过镇上的人才见过餐厅长什么样，条件和叙事对得上。
   */
  | "map_entered"

  /**
   * 居民到了一个场所（居民系统 02）。subject 是场所种类（seat / shop / water …）。
   * 04 的"他坐了你做的椅子 +1 好感"、报纸的"咕噜在你店门口站了半天"都接它。
   */
  | "resident_used_spot"
  /** 居民出门（去小镇）/ 回来了。subject 是 definitionId */
  | "resident_away"
  | "resident_returned"
  /** 09：桥头来了访客 / 走了 / 你邀他住下 / 你说下次吧。subject 是 definitionId */
  | "visitor_arrived"
  | "visitor_left"
  | "visitor_invited"
  | "visitor_declined"
  /** 09：定下 / 当面说了一趟多日出门（subject 是 definitionId）。走、回是 resident_away / resident_returned */
  | "trip_planned"
  | "trip_announced"
  /** 10：信到了 / 拆了 / 你写了一封。subject 是 letterId（写的那封是收信人 definitionId） */
  | "letter_received"
  | "letter_opened"
  | "letter_written"
  /**
   * 居民主动打了招呼 / 玩家按 F 和他聊了（居民系统 03）。subject 是 definitionId。
   * 04 的"每天第一次 +1 好感"接它；这期只发。
   */
  | "resident_greeted"
  | "resident_talked"
  /**
   * 谁收到了什么档的礼（居民系统 04）。subject 是 `<definitionId>:<tier>`。
   * 好感规则要的是"这位收了礼"，`gift_*` 的 subject 是物品，接不上人。
   */
  | "resident_gift_received"
  /** 好感跨档了。subject 是 `<definitionId>:<stage>`。专属家具、门牌（07）接它 */
  | "affection_reached"
  /** 他送了你东西（随机赠礼 / 专属家具），领取面板已弹。subject 是 definitionId */
  | "resident_present_given"
  /**
   * 委托（居民系统 05）。subject 都是 favorId。后果全走这里：
   * 好感、奖励、记忆由规则接 `favor_completed`；报纸登 favor_done。
   */
  | "favor_offered"
  | "favor_accepted"
  | "favor_completed"
  | "favor_expired"
  | "favor_declined"
  /**
   * 来访（居民系统 07）。subject 都是 definitionId。
   * 敲了门 / 你开了门他进来坐了一会儿走了 / 你没开（或说了现在不方便）。
   */
  | "resident_knocked"
  | "resident_visited_player"
  | "visit_refused";

export type StorySignal = {
  kind: StorySignalKind;
  /** 附带信息：furnitureId / recipeId / dialogueId / itemId 等 */
  subject?: string;
};

/**
 * 触发条件：信号种类匹配 + 一组可选的附加条件，**全部满足**才算命中。
 *
 * 条件是"与"不是"或"：要"或"就写成两条 trigger（`triggers` 之间是或）。
 * 这样每个字段只有一种读法，不需要在数据里表达布尔表达式——
 * 一旦开始表达 and/or 嵌套，注册表就变成了一门要调试的语言。
 */
export type StoryTrigger = {
  signal: StorySignalKind;
  /** 不填表示任意 subject 都匹配 */
  subject?: string;

  /** 该事件必须尚未触发过（一次性剧情用） */
  requiresEventUntriggered?: EventId;
  /** 该事件必须已处于某阶段 */
  requiresEventStage?: { eventId: EventId; stageId: EventStageId };

  /**
   * 这个信号（**连同上面的 subject 一起算**）累计发生过多少次才算数。
   *
   * 「前两个任务做完之后妈妈会打电话」就靠它。没有这个字段的话只能拿
   * N 个链式事件硬凑——写三次任务就得造三个事件 id，而且改成"三个任务"
   * 要重排整条链。
   *
   * 计数进存档：关掉游戏再打开，做过的任务不该白做。
   */
  signalCount?: number;

  /**
   * 世界日不早于这一天（V0.2 的「最早可触发的 WorldDayId」）。
   *
   * 注意它**只是让事件"可以触发"**，不是自动触发——现实日期到了但玩家
   * 没进游戏、没做那个交互，事件仍然停在原地（V0.2 明写：不应一次性
   * 自动补播多段剧情）。
   */
  minWorldDayId?: WorldDayId;

  /** 当时的天气。「某一天暴雨时门口有敲门声」用它 */
  weatherIs?: WeatherId;

  /**
   * 身上得有这些东西。修理类交互的前置——**光有条件不够，
   * 要真的消耗掉得配 `consume_item` 效果**，两者分开是因为
   * "看得见但做不了"和"做了并扣掉"是两件事：条件决定选项显不显示，
   * 效果决定代价。
   */
  requiresItem?: { itemId: ItemId; quantity: number };

  /**
   * **这个进度键必须已解锁。**
   *
   * 地块用 `plotFeatureId(plotId)` 拼（`plot.east_grove`），店铺开张、
   * 桥修好这类也都是同一个池子里的键——`unlock_feature` 效果写进去的
   * 就是它，进度只增不减。
   *
   * 有了它，「开了林子那块地之后才会来的邻居」是一行数据。没有它就只能
   * 在代码里写 if，而那正是这套注册表存在的理由。
   *
   * 不校验它指向的键存不存在：FeatureId 是自由字符串、没有注册表，
   * 地块的键还是函数拼出来的。硬要校验就得先造一张"所有合法 feature"
   * 的表，而那张表会跟着每个新玩法漏更新——比不校验更坏。
   */
  requiresFeature?: FeatureId;

  /**
   * 这位的好感至少到了这一档（居民系统 04）。随机赠礼"伙伴档起"靠它。
   * 判的是**档位**不是分数：分数是隐藏的，规则不该知道数字。
   */
  requiresAffection?: { residentId: ResidentId; stage: `${AffectionStage}` };

  /**
   * 命中概率（0~1，不填 = 必中）。
   *
   * 「某一天暴雨时」这种没法用确定条件表达的桥段用它。**每次信号
   * 独立掷点**，不做保底——保底要存"已经错过几次"，而这类事件本来就
   * 该是撞见的，不是攒出来的。**要保底的场合用 `poolId`**，别把这个
   * 字段改成两用。
   */
  chance?: number;

  /**
   * **把这条规则放进一个抽签池。**
   *
   * 和 `chance` 是两种东西，不要混用（audit 会拦）：
   *
   * - `chance` 是**撞见的**——每次信号独立掷点，错过就错过。
   * - 池是**迟早会来的**——同一个 poolId 的规则共享一次掷点和一份
   *   "错过了几次"的计数，每错过一次命中率往上抬，命中后归零。
   *
   * 共享 poolId **就是共享节奏**：三位邻居写同一个池，于是（a）一次
   * 派发只掷一次点，同一天最多来一位；（b）有人来了，三条的命中率一起
   * 回到底；（c）加第四位邻居 = 加一条规则、写同一个 poolId，参数
   * 一个字不用改。
   *
   * 池的参数（起始概率、每次抬多少、封顶）在 `Data/story` 的
   * `storyPools`——写在规则上会让同池的三条各抄一遍同样的数，迟早走散。
   */
  poolId?: string;
};

/** 事件后果。所有剧情效果都必须表达成这些声明之一 */
export type StoryEffect =
  | { kind: "set_event_stage"; eventId: EventId; stageId: EventStageId; complete?: boolean }
  | { kind: "set_affection"; residentId: ResidentId; stage: AffectionStage }
  | { kind: "unlock_feature"; featureId: FeatureId }
  | { kind: "give_item"; itemId: ItemId; quantity: number }
  /**
   * 扣掉背包里的东西。修理、交付、以物易物都要它。
   *
   * 和 `requiresItem` 条件成对使用：条件保证扣得动，效果负责扣。
   * 只写效果不写条件的话，材料不够时会扣成负数或者静默少扣。
   */
  | { kind: "consume_item"; itemId: ItemId; quantity: number }
  | {
      kind: "spawn_resident";
      residentId: ResidentId;
      definitionId: string;
      /**
       * 延迟登场。**不要设成 0**——第一天流程里宠物是"制作完之后突然出现"的
       * 突发事件，如果制作那一刻就蹦出来，玩家还盯着工作台面板，
       * 整个过场都被挡住、也没有"突然"可言。
       * 解释器还会额外等到挡视线的面板关掉才开始计时。
       */
      delayMs?: number;
      /** 在 delayMs 基础上再随机加 0~这个毫秒数，避免每次都卡同一秒 */
      jitterMs?: number;
    }
  | { kind: "start_dialogue"; dialogueId: DialogueId; residentId?: ResidentId; delayMs?: number }
  | { kind: "show_toast"; localizationKey: LocalizationKey; durationMs?: number }
  /**
   * 把睡着的宠物叫醒。**戳醒舒舒**这类"对话推进到某一步、活物要跟着变"
   * 的场合用它——对话节点只管报告"戳到了"（emitEventId），
   * 真正让它睁眼是这条效果，睡/醒终归是宠物自己的状态，不该让对话
   * 系统直接伸手去改运行时的宠物对象。
   */
  | { kind: "resident_wake"; residentId: ResidentId }
  /** 让宠物躺下睡着。舒舒送礼收尾那句"说着说着又睡着了"就是它 */
  | { kind: "resident_sleep"; residentId: ResidentId }
  /**
   * **加减金币。** 正数入库、负数从库里扣。
   *
   * 偷窃那一段的语义要求它**不是全有或全无**：龙要偷 5 枚而库里只有 3，
   * 就偷走 3——`spendGoldFrom` 不够时整笔失败，那是"买东西"的语义
   * （钱不够就不该扣），不是"被偷"的语义，所以执行侧走"扣到底为止"
   * 的那条路（`takeGoldUpTo`）。
   *
   * 入库照常走溢出规则（满了多的丢掉并明话提示）——剧情给的钱和任务
   * 给的钱没有分别，不该为它开一条绕过容量的后门。
   *
   * 做客时不执行：那是主人家的金库。
   */
  | { kind: "adjust_gold"; amount: number }
  /**
   * 往一位居民的记忆里加一条（居民系统 03）。**记忆唯一的写入口。**
   *
   * 送礼爱吃档 → `gift_loved` 信号 → 一条规则 → 这个效果；委托完成（05）同理。
   * 对话、技能都不直接 push——否则"他为什么记得这件事"要翻三处代码才说得清。
   * 重复加同一条是 no-op。做客时不执行（那是房主的邻居）。
   */
  | { kind: "add_memory"; residentId: ResidentId; memoryId: string }
  /**
   * 加好感（居民系统 04）。**好感唯一的加分口。** `source` 是经济表 `affectionTuning.gains` 的键，
   * 执行时查表加分、按日节流（同一来源一天一次）、跨档发 `affection_reached`。
   * 改"聊天给几分"改的是表，不是代码。做客时不执行（好感是房主和邻居的关系）。
   */
  | { kind: "adjust_affection"; residentId: ResidentId; source: string }
  /**
   * 他走过来送你东西。`itemId` 不填 = 从他的 `presents` 里确定性挑一件（随机赠礼）；
   * 填了就是那一件（专属家具）。走过来 → 一段对话 → 领取面板。
   */
  | { kind: "resident_present"; residentId: ResidentId; itemId?: ItemId; dialogueId: DialogueId }
  /** 打开一个单行输入：改他叫你的昵称 / 改他的口头禅。对话选项报告了，规则接这个 */
  | { kind: "prompt_text"; residentId: ResidentId; target: "nickname" | "catchphrase" }
  /** 经领取面板给东西（委托奖励，05）。和 give_item 的分别：这个有仪式感，那个是静默入包 */
  | { kind: "grant_items"; localizationKey: LocalizationKey; items: ReadonlyArray<{ itemId: ItemId; quantity: number }> }
  /** 玩家在对话里拒绝了一件委托（05）：直接过期，不进 cooldown 惩罚。对话选项报告，规则接 */
  | { kind: "favor_decline"; favorId: string }
  /** 门外的他进屋（07）：开门、进来看看、坐你的椅子、说几句、临走送东西。对话选项报告，规则接 */
  | { kind: "visit_admit"; residentId: ResidentId }
  /** 你说现在不方便（07）：他回作息，今天不再来 */
  | { kind: "visit_refuse"; residentId: ResidentId }
  /**
   * 把一件东西摆到他门口（07）。`itemId` 不填 = 他最近一次收到的、爱吃档的家具
   * （送礼那一拍记的运行时账）；填了就是那一件（委托 find 做完把要的那件摆出来）。
   */
  | { kind: "porch_place"; residentId: ResidentId; itemId?: ItemId }
  /** 他门上挂一块写你名字的牌（07，家人档那天） */
  | { kind: "porch_nameplate"; residentId: ResidentId }
  /** 从他的 presents 里确定性挑一件经领取面板给你（07 来访临走那一下；不走过来） */
  | { kind: "grant_present"; residentId: ResidentId }
  /**
   * 把一件东西摆进他屋里（08）。`itemId` 同 porch_place 的规矩（不填 = 最近一次爱吃档的家具）。
   * 执行时判：房子有室内 → 进屋（满了最早的挪到门口，门口也满了进箱）；没有室内 → 退回 porch_place。
   * 所以送礼 / 委托的规则只写这一个效果，不用各写两条。
   */
  | { kind: "interior_place"; residentId: ResidentId; itemId?: ItemId }
  /**
   * 桥头来一位访客（09）：从"有房子、还没住下、图纸不在你手上、领地放得下一栋"的候选里
   * 确定性抽一位，以 `visiting` 状态在访客入口登场。没有候选就什么都不发生（池的 miss 照攒）。
   */
  | { kind: "spawn_visitor" }
  /** 把某个抽签池的连续错过次数归零（09：你拒了访客，保底重新累） */
  | { kind: "reset_pool"; poolId: string }
  /** 你邀了访客（09）：发 visitor_invited；图纸另由 grant_items 给。访客傍晚照样走，房子建好那天回来 */
  | { kind: "visitor_invited"; residentId: ResidentId }
  /** 定一趟多日出门（09）：明天走，走之前必须当面说 */
  | { kind: "plan_trip"; residentId: ResidentId; tripId: string }
  /** 出门回来那段对话说完，把带回来的礼物经领取面板给你（09） */
  | { kind: "grant_trip_gift"; residentId: ResidentId }
  /** 寄一封表里的信（10）。剧情信 / 明信片 / 指令都走它；信箱满了不寄 */
  | { kind: "send_letter"; letterId: string; fromResidentId?: string; attach?: { itemId: ItemId; quantity: number } }
  /** 这位居民今天自发写一封（10）：从他的信件表里按条件 + 权重抽，every-days 节流、once 不重寄 */
  | { kind: "send_resident_letter"; residentId: ResidentId };

export type StoryRuleId = string;

/** 一条剧情规则：什么时候发生、发生什么 */
export type StoryRule = {
  id: StoryRuleId;
  /** 任一触发器匹配即执行 */
  triggers: StoryTrigger[];
  effects: StoryEffect[];
  /** 只执行一次（默认 true） */
  once?: boolean;
};

/** 教程步骤：显示什么文案、被哪个信号标记为完成 */
export type TutorialStep = {
  stepId: string;
  localizationKey: LocalizationKey;
  completedBy: StoryTrigger;
};

export type TutorialDefinition = {
  id: string;
  steps: TutorialStep[];
  /** 全部完成后的收尾文案 */
  completedLocalizationKey: LocalizationKey;
};
