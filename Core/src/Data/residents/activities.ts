import { hashSeed, seededRandom } from "../dailyTasks/index.js";
import type { ResidentActionStep, SpotKind } from "../../types/residents.js";

/**
 * 活动表（居民系统 12）：他在场所**做事**——看书、喝东西、打水、看水、在工作台敲敲打打、哼歌、伸展、打盹。
 * 每种活动 = 场所条件 + 动词序列（**不引入新动词**，只组合已有的）+ 手持道具 + 时长 + 爱好；性格的爱好决定挑哪些
 * （权重 × 3）。到达场所后由 `pickActivity` 确定性抽一个——02 的场所表从此只管"怎么认出这种场所"。
 * 道具是 VisualId（表现层查配方挂在手上），不进存档：读档重新决策就有了。
 */
export type HobbyId = "nature" | "fitness" | "education" | "craft" | "music" | "relax";
export const hobbyDefinitions: readonly HobbyId[] = ["nature", "fitness", "education", "craft", "music", "relax"];

/** 动词模板：秒数是区间，到时按种子定 */
export type ActivityStep =
  | { verb: "sit"; seconds: readonly [number, number] }
  | { verb: "stand"; flavor: string; seconds: readonly [number, number]; faceSpot?: boolean }
  | { verb: "sleep"; seconds: readonly [number, number] }
  | { verb: "gesture"; gestureId: string }
  | { verb: "speak"; localizationKey: string; seconds: number };

export type ActivityDefinition = {
  id: string;
  /** 在哪种场所做；"any" = 哪儿都行（到了任何场所都能作为备选） */
  spot: SpotKind | "any";
  hobby: HobbyId;
  /** 手里拿的（VisualId）；null = 空手 */
  prop: string | null;
  steps: readonly ActivityStep[];
  weight?: number;
  /** 只在这些天气做 */
  weather?: readonly string[];
  /** 场所得空着（玩家没在用）——工作台 */
  requiresSpotIdle?: boolean;
};

export const activityDefinitions: readonly ActivityDefinition[] = [
  { id: "read", spot: "seat", hobby: "education", prop: "prop_book", steps: [{ verb: "sit", seconds: [40, 90] }], weight: 2 },
  { id: "sip", spot: "seat", hobby: "relax", prop: "prop_cup", steps: [{ verb: "sit", seconds: [30, 60] }], weight: 2 },
  { id: "draw_water", spot: "water", hobby: "nature", prop: "prop_bucket", steps: [{ verb: "stand", flavor: "drawing", seconds: [6, 8], faceSpot: true }, { verb: "stand", flavor: "resting", seconds: [20, 40], faceSpot: true }] },
  { id: "watch_water", spot: "shore", hobby: "nature", prop: null, steps: [{ verb: "stand", flavor: "gazing", seconds: [30, 80], faceSpot: true }] },
  { id: "tinker", spot: "workbench", hobby: "craft", prop: "prop_hammer", steps: [{ verb: "stand", flavor: "tinkering", seconds: [20, 40], faceSpot: true }], requiresSpotIdle: true },
  { id: "browse", spot: "shop", hobby: "relax", prop: null, steps: [{ verb: "stand", flavor: "browsing", seconds: [40, 80], faceSpot: true }] },
  { id: "hum", spot: "any", hobby: "music", prop: null, steps: [{ verb: "speak", localizationKey: "talk.common.hum", seconds: 4 }, { verb: "stand", flavor: "humming", seconds: [10, 20] }] },
  { id: "stretch", spot: "any", hobby: "fitness", prop: null, steps: [{ verb: "gesture", gestureId: "stretch" }, { verb: "stand", flavor: "stretching", seconds: [6, 10] }], weight: 0.5 },
  { id: "nap", spot: "any", hobby: "relax", prop: null, steps: [{ verb: "sleep", seconds: [90, 150] }], weather: ["sunny", "cloudy"], weight: 0.5 },
];

export function findActivityDefinition(id: string): ActivityDefinition | undefined {
  return activityDefinitions.find((entry) => entry.id === id);
}

/** 雨天照常出门的举伞（居民系统 12）。stay_home 的不出门，go_out_watch 的站屋檐下不用 */
export const weatherProps = {
  rain: { prop: "prop_umbrella", forOnRain: ["go_out_slow"] },
} as const;

export type ActivityContext = {
  hobbies: readonly string[];
  weatherKind: string;
  /** 场所空着（玩家没在用）。工作台之类要它 */
  spotIdle: boolean;
  seed: string;
};

/** 这种场所此刻能做的活动和各自权重（爱好匹配 ×3） */
export function activityCandidates(spot: SpotKind, ctx: ActivityContext): Array<{ activity: ActivityDefinition; weight: number }> {
  return activityDefinitions
    .filter((activity) => activity.spot === spot || activity.spot === "any")
    .filter((activity) => !activity.weather || activity.weather.includes(ctx.weatherKind))
    .filter((activity) => !activity.requiresSpotIdle || ctx.spotIdle)
    .map((activity) => ({ activity, weight: (activity.weight ?? 1) * (ctx.hobbies.includes(activity.hobby) ? 3 : 1) }));
}

/** 确定性抽一个（同一位、同一天、同一场所、同一次 = 同一个） */
export function pickActivity(spot: SpotKind, ctx: ActivityContext): ActivityDefinition | null {
  const candidates = activityCandidates(spot, ctx);
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = seededRandom(hashSeed(ctx.seed))() * total;
  for (const entry of candidates) {
    roll -= entry.weight;
    if (roll < 0) return entry.activity;
  }
  return candidates[candidates.length - 1].activity;
}

/** 把模板翻成动词序列：秒数按种子落在区间里，faceSpot 换成场所坐标 */
export function activitySteps(activity: ActivityDefinition, seed: string, facing: { x: number; z: number }): ResidentActionStep[] {
  const roll = seededRandom(hashSeed(`${seed}|steps`));
  const pick = (range: readonly [number, number]): number => Math.round(range[0] + roll() * (range[1] - range[0]));
  return activity.steps.map((step): ResidentActionStep => {
    switch (step.verb) {
      case "sit":
        return { verb: "sit", facing, seconds: pick(step.seconds) };
      case "stand":
        return { verb: "stand", flavor: step.flavor, seconds: pick(step.seconds), ...(step.faceSpot ? { facing } : {}) };
      case "sleep":
        return { verb: "sleep", seconds: pick(step.seconds) };
      case "gesture":
        return { verb: "gesture", gestureId: step.gestureId };
      case "speak":
        return { verb: "speak", localizationKey: step.localizationKey, seconds: step.seconds };
    }
  });
}
