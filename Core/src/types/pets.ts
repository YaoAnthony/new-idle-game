import type {
  LocalizationKey,
  RoomId,
  VisualId,
  WorldPosition,
} from "./base.js";
import type { DialogueId } from "./dialogue.js";
import type { EventId } from "./events.js";
import type { ItemId } from "./items.js";

export type PetId = string;
export type PetDefinitionId = string;

/**
 * 这只生物是来陪你的，还是来干活的。
 *
 * 加这一档而不是给石傀儡另起一套运行时（2026-08-22）：`PetAgent` 已经有
 * 带体型的 A* 寻路、休眠/苏醒、碰撞体、存档、按 F 参与交互竞争——石傀儡
 * 要的全在里面。`petAgent.ts` 文件头写着"实例化不继承，真出现『数字表达
 * 不了的独有行为』再考虑子类"，而**不吃不喝不亲近**恰恰是数字表达得了的：
 * 一个枚举就够，`chooseNextActivity` 少走三支。
 *
 * 真正表达不了的是"干活"（有工作目标、要改世界状态），那一支等施工那期
 * 再说，届时也是往这个类上挂一个 job，不是另起一棵继承树。
 */
export enum CreatureRole {
  /** 会吃会喝会亲近的伙伴。不填就是它 */
  Pet = "pet",
  /** 干活的：不吃不喝不亲近，也没有好感度 */
  Worker = "worker",
  /**
   * 做生意的：不吃不喝不亲近（同 Worker），但**会来会走**，
   * 而且按 F 打开的是交易面板不是对话。
   *
   * 和 Worker 分成两档而不是共用：石傀儡是常驻的、有工位有活干；
   * 商人**间歇在场**，"今天他在不在"是这一档独有的状态，
   * 而"在不在"要影响交互竞争（不在场的不能被 F 选中）。
   * 混一档会在 chooseNextActivity 和 refreshInteractTarget 两处各堆一个 if。
   */
  Merchant = "merchant",
  /**
   * 住在这块地上的邻居（期 4）。
   *
   * 和 Pet 的区别只有一条：他**有自己的房子**——搬入时驻地（home）
   * 重定向到那栋楼门口，晚上就在自家附近转。吃喝亲近照 Pet 走
   * （他们是邻居不是工具），所以 chooseNextActivity 对这一档**不分支**：
   * 行为上 Resident ≡ Pet，这个枚举值的意义在**身份**——
   * `resident_moved_in` 只数这一档，家具小店只把这一档当客人。
   */
  Resident = "resident",
}

export enum AffectionStage {
  Stranger = "stranger",
  FamiliarResident = "familiar_resident",
  LifeCompanion = "life_companion",
  Family = "family",
}

/**
 * 性情侧写：这只生物平时怎么过日子。**全是数据，不在运行时写 if (是猫)**——
 * 加一只新物种时改的是这几个数字，不是行为代码。
 *
 * 不填的字段落到 wisp 们现在的默认值，所以三只小家伙一个字都不用动。
 */
export type PetBehavior = {
  /** 移动速度（米/秒）。大家伙走得慢才有分量感 */
  moveSpeed?: number;
  /**
   * 睡意（0~1）：闲下来时选择打盹而不是溜达的概率。
   * 0 = 从不睡（wisp 的现状），0.8 = 懒到家。
   */
  sleepiness?: number;
  /** 一觉睡多久（秒），[最短, 最长] 之间随机 */
  napSeconds?: [number, number];

  /**
   * 乱走时**离出生点最多走多远**（米）。不填 = 不限。
   *
   * 屋里的宠物用不上这个：房间本身就是围栏。院子是一整块 60×45 的
   * 房间，不给半径的话石傀儡会一路溜达到据点另一头，"他守在门口"这件事
   * 就没了。守着一个位置本来也是"干活的"该有的样子。
   */
  wanderRadius?: number;

  /**
   * 饱食 / 水分每小时掉多少点（满 100）。不填用默认（8 / 12）——
   * 掉到阈值以下它会自己找地上的吃的、去水源喝水。
   * 故意调得很慢：宠物是陪伴不是电子鸡，玩家忘了喂不该是一种惩罚。
   */
  hungerPerHour?: number;
  thirstPerHour?: number;
};

export type PetDefinition = {
  id: PetDefinitionId;
  /** 物种名（图鉴上的名字），不是玩家叫它的名字 */
  localizationKey: LocalizationKey;
  /** 初见时给的默认昵称。玩家改过之后存进 PetSave.nickname */
  defaultNicknameKey: LocalizationKey;
  /** 造型由表现层的 VisualRegistry 解析：先程序化，以后换精模只改那一张表 */
  visualId: VisualId;
  species: string;

  /** 陪你的还是干活的。不填 = `CreatureRole.Pet`，老定义零改动 */
  role?: CreatureRole;

  behavior?: PetBehavior;

  /**
   * 碰撞半径（米）。不填 = 不挡路（wisp 那种能穿过去的小团子）。
   *
   * 填了就是**真实的障碍**：玩家撞上会被挡住，放家具会避开它。
   * 巨型生物没有碰撞的话，玩家第一次从它身体里穿过去，
   * "这是个活物"的错觉就当场碎了。
   */
  collisionRadius?: number;

  /**
   * F 交互该打开哪段对话。**这里是唯一权威**——原来 RoomScene 的 F 键
   * 处理直接写死了 `moss_wisp_first_meet` / `moss_wisp_casual` 两个
   * 字面量 id，加舒舒就要么在同一处 if 上再叠一层，要么复制一份
   * 几乎一样的处理逻辑。两条路都是"每加一只宠物就要回去改交互代码"，
   * 而对话选哪一段本来就是这只宠物的内容，不是交互系统的逻辑。
   */
  dialogues?: {
    firstMeet?: DialogueId;
    casual?: DialogueId;
  };

  /**
   * "已经认识"这件事挂在哪个事件的哪个阶段上（约定：到 "gifted" 才算数）。
   * F 交互用它在 firstMeet / casual 之间选——不填就永远打开 firstMeet，
   * 适合那种没有"初见剧情"、见面就唠家常的宠物。
   */
  bondEventId?: EventId;
};

// ---- 喜好与送礼 ----

/**
 * 送礼判定的四档，沿用 `整体架构.md` 的措辞：爱吃 / 能吃 / 不喜欢 / 不能吃。
 *
 * **送错不扣好感**（定案）——本作不做功亏一篑的判定，试错本身是了解它的过程。
 * 四档的差别全部体现在**反应**上，后果由 storyRules 声明，判定只发信号。
 */
export enum GiftTier {
  /** 爱吃：眼睛发亮，留下记忆条目，推进剧情 */
  Loved = "loved",
  /** 能吃：收下、道谢，反应平淡 */
  Liked = "liked",
  /** 不喜欢：闻一闻就放下，东西还在你手上 */
  Disliked = "disliked",
  /** 不能吃：明确摇头，可能顺带解释为什么 */
  Inedible = "inedible",
}

/**
 * 一只宠物的完整喜好表（定案：每只都写全，不做 tag 通用打底）。
 *
 * 代价是每加一样新食物都要回头补所有宠物的表——现在三只还好，
 * 物种多了会累。`fallback` 就是那张安全网：漏填不会崩，只落到默认档。
 * 以后表维护不动了可以换成「按 tag 通用打底 + 个体只写例外」，
 * `resolveGiftTier` 的签名不用变。
 */
export type PetTaste = {
  loved: ItemId[];
  liked: ItemId[];
  disliked: ItemId[];
  inedible: ItemId[];
  /**
   * 表里没列到的**食物**落哪一档。
   * 非食物（木板、锤子、家具）不走这里——那类东西结构上就不能吃，
   * 见 `resolveGiftTier`。
   */
  fallback: GiftTier.Liked | GiftTier.Disliked;
};

export type PetSave = {
  petId: PetId;
  definitionId: PetDefinitionId;
  roomId: RoomId;
  position: WorldPosition;
  affectionStage: AffectionStage;
  growth: number;
  needs: Record<string, number>;
  /** 玩家改过的昵称。没改过就是 undefined，显示 defaultNicknameKey */
  nickname?: string;
  /**
   * 上次收礼是哪个世界日。每天一次的节流靠它，
   * 存**日**而不是时间戳——玩家改设备时区不会凭空多出或少掉一次机会。
   */
  lastGiftWorldDayId?: string;

  /**
   * 存盘那一刻在不在睡觉。不存的话读档后大猫总是站着醒来——
   * 它明明一天睡 20 个小时，每次进游戏都精神抖擞反而出戏。
   * 纯新增可选字段：老存档读出来 undefined → 醒着。
   */
  sleeping?: boolean;

  /**
   * 驻地：乱走的圆心（配 `PetBehavior.wanderRadius`）。
   *
   * **必须进存档**，不能读档时拿当时站的位置顶上：那样每存读一次，驻地
   * 就朝它当时溜达到的地方挪一次，挪几回就漂到据点另一头去了。
   * 老存档没有 → 用读档时的位置兜底（不限半径的物种本来也不在乎）。
   */
  home?: { x: number; z: number };

  /**
   * 身上装了哪些零件（石傀儡这类 `CreatureRole.Worker` 才有意义）。
   *
   * 存**数组**不存 `headAttached: boolean`：傀儡以后缺胳膊少腿是迟早的事，
   * 一个布尔到时候要么改名要么再加一个，而数组加一项就完了。
   * 老存档没有 → `undefined`，按"零件齐全"算（现有四只宠物本来就没零件
   * 这回事，不能因为加了这个字段就集体瘫痪）。
   */
  attachedParts?: string[];

  /**
   * 心情（0~100）。所有物种统一的档案属性：由吃喝睡是否被照顾到推着走，
   * 送对了礼物也会涨。表现层和对话条件以后读它。
   * 老存档没有 → 取默认 70。
   */
  mood?: number;
};
