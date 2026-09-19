import type { LocalizationKey, VisualId } from "./base.js";
import type { ItemId } from "./items.js";
import type { UtcTimestamp } from "./time.js";

/**
 * 种植系统的形状（2026-09-17，设计稿 `gpt设计稿/种植系统/01-契约.md`）。
 *
 * ## 田里面按格分
 *
 * 一块田（`farm_plot` 建筑）不是一个整体，是 footprint 里的每一格各一株。
 * 每格有两条**互相独立的轴**：**土**（实土 / 耕地）和**苗**（空 / 长着）。
 * "湿不湿""缺不缺水""长到哪一段"都不是状态，是从时间戳推出来的——
 * 和整个游戏"按绝对时间结算"的基调一致：关掉游戏也照长，回来一算就对。
 *
 * ## 为什么住在建筑的 state 里而不是新开一个存档切片
 *
 * 田本来就是一栋楼，施工、图纸、领地、挪拆、存档、联机刷新全是现成的；
 * 苗跟着田走（田拆了苗也没了）是自然语义。新开切片要多写注册表一项、
 * 迁移一条、服务端合并一处，换来的只是"田和苗分两处存"——没有好处。
 *
 * 这个文件只放形状；数字在 `Data/crops`，规则在 `logic/farming`。
 */

export type CropId = string;

/** 一段造型：进度到 `at`（0~1）起用这个 visual。首项 `at` 必须是 0 */
export type CropStage = { at: number; visual: VisualId };

/**
 * 作物需要什么。今天只有水。
 *
 * 做成列表是用户点名的口子（"未来说不定要撒别的东西"）：撒肥料 = 这里
 * 加一种 kind + 格上多记一个时间戳，判定和造型都不用重排。
 */
export type CropNeed = { kind: "water"; lastsMinutes: number };

export type CropGiant = {
  /** 边长。今天只支持 2 */
  size: 2;
  /** 四格同时成熟那一刻掷一次的概率 */
  chance: number;
  /** 产量相对"四格分开收"的倍数 */
  yieldMultiplier: number;
  visual: VisualId;
};

export type CropDefinition = {
  cropId: CropId;
  /** `crop.<id>`：气泡、图鉴、成就描述用 */
  localizationKey: LocalizationKey;
  seedItemId: ItemId;
  /** 累计**湿润**多少分钟成熟。不湿的时间不算 */
  growMinutes: number;
  /** 升序；进度 ≥ at 的最后一段就是当前造型 */
  stages: readonly CropStage[];
  needs: readonly CropNeed[];
  harvest: {
    itemId: ItemId;
    /** 闭区间，随机 */
    count: readonly [number, number];
    seeds: readonly [number, number];
  };
  /** 不填 = 这种作物不会长巨大款 */
  giant?: CropGiant;
};

// ---- 存档里的样子 ----

/** 湿不湿是算出来的，不进这个枚举 */
export type FarmSoil = "packed" | "tilled";

export type FarmPlant = {
  cropId: CropId;
  sownUtc: UtcTimestamp;
  /** 已经结算进去的湿润生长毫秒 */
  grownMs: number;
  /** `grownMs` 结算到哪一刻。此刻到 min(now, wetUntil) 之间的湿润时间是"活"的部分 */
  settledUtc: UtcTimestamp;
};

export type FarmCell = {
  soil: FarmSoil;
  /** 湿到什么时候。没有 / 过了 = 干 */
  wetUntilUtc?: UtcTimestamp;
  plant?: FarmPlant;
};

export type FarmGiant = {
  cropId: CropId;
  /** 窗口左上格（本地格坐标：col 沿宽、row 沿深） */
  col: number;
  row: number;
  size: 2;
};

/** 一块田。住 `BuildingPlacement.state.farm` */
export type FarmBed = {
  /** 长度 = footprint.width × footprint.height，下标 = row × width + col */
  cells: FarmCell[];
  /** 最多一颗。被它盖住的四格 plant 保留（记 cropId 用），收获时一起清 */
  giant?: FarmGiant;
  /** 掷过巨大判定的窗口 `"col,row"`，不重掷。收获后清掉对应项 */
  giantRolled?: string[];
};

// ---- 给界面和交互看的 ----

/** 一格给界面看的样子。气泡、图鉴、调试指令都只认它 */
export type FarmCellView =
  | { soil: "packed" }
  | {
      soil: "tilled";
      wet: boolean;
      plant?: {
        cropId: CropId;
        progress: number;
        stageIndex: number;
        ripe: boolean;
        needsWater: boolean;
        /** 湿着的话还要多久成熟；干着为 null（不知道你什么时候来浇） */
        remainingMs: number | null;
        giant: boolean;
      };
    };

/** 手上拿的东西里和田有关的那一面 */
export type HeldForFarm =
  | { kind: "hoe" }
  | { kind: "seed"; cropId: CropId }
  | { kind: "can"; charges: number; power: number }
  | null;

export type FarmActionWhy =
  | "packed_no_hoe"
  | "empty_no_seed"
  | "growing"
  | "wet_enough"
  | "needs_water_no_can"
  | "can_empty"
  | "ripe_no_hand";

/** 按 F 会发生什么。`none` 带理由，气泡照它说话 */
export type FarmAction =
  | { kind: "till" }
  | { kind: "sow"; cropId: CropId }
  | { kind: "water" }
  | { kind: "harvest"; giant: boolean }
  | { kind: "none"; why: FarmActionWhy };
