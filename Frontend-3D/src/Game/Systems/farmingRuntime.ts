import {
  WeatherKind,
  describeCell,
  farmingTuning,
  findCropDefinition,
  giantCandidates,
  giantSeedString,
  needsWater,
  rollGiant,
  settleGiant,
  waterCell,
} from "core";

import { emit, on } from "../EventBus";
import { isRemoteWorldActive } from "../Multiplayer/session";
import { nowUtc } from "../State/clock";
import { farmBedsHere, readFarmBed, writeFarmBed } from "../State/farmBeds";
import { getWeather } from "../State/weather";
import { getWorldSeed } from "../State/worldSeed";
import { tf } from "../../i18n/format";
import { t } from "../../i18n/t";

/**
 * 种植的节拍器（2026-09-17）。三件事：
 *
 * 1. **画面刷新信号**。阶段是算出来的不是存的，视图需要一个"该重画了"的通知。
 *    每拍给每格算一个签名（造型段 | 湿 | 熟），变了才发 `farm_cell_changed`——
 *    田的存档没变，所以不发 `building_state_changed`（那条会触发自动存档）。
 * 2. **雨水**。天气翻到雨 / 暴风雨时把露天的田浇一遍：田没有屋顶，本来就该
 *    淋着。事件驱动而不是按天气日程积分——离线那几天的雨不补，和"跨天不
 *    补算天气"同一条纪律（V0.5）。
 * 3. **巨大果实的判定**。四格同种同时熟的窗口掷一次，掷过就记下不重掷。
 *
 * 后两件是**写入**，只在自己的世界跑（做客时田是房主的，房主那边会掷、会浇，
 * 结果经 op / 刷新推过来）；第一件两边都跑。
 *
 * 节拍走墙钟 `setInterval`：画面是给在看的人画的，标签页藏起来慢半拍无所谓；
 * 生长本体按世界钟走，不受节拍影响。
 */

const signatures = new Map<string, string>();

function signatureOf(instanceId: string): string | null {
  const ref = readFarmBed(instanceId);
  if (!ref) return null;
  const now = nowUtc();
  return ref.bed.cells
    .map((_, index) => {
      const view = describeCell(ref.bed, ref.footprint, index, findCropDefinition, now);
      if (view.soil === "packed") return "p";
      const plant = view.plant;
      return `${view.wet ? "w" : "d"}${plant ? `${plant.stageIndex}${plant.ripe ? "r" : ""}${plant.giant ? "g" : ""}` : ""}`;
    })
    .join("|");
}

/** 露天的田浇一遍雨。返回浇了几格 */
function rainOnBeds(): number {
  let watered = 0;
  const now = nowUtc();
  for (const ref of farmBedsHere()) {
    let bed = ref.bed;
    bed.cells.forEach((cell, index) => {
      const crop = cell.plant ? findCropDefinition(cell.plant.cropId) : undefined;
      if (!crop || !needsWater(cell, crop, now)) return;
      bed = waterCell(bed, index, crop, now);
      watered += 1;
    });
    if (bed !== ref.bed) writeFarmBed(ref.instanceId, bed);
  }
  return watered;
}

function isRaining(): boolean {
  const kind = getWeather().kind;
  return kind === WeatherKind.Rain || kind === WeatherKind.Storm;
}

/** 每块田最多掷一个窗口：一田一颗，第二个窗口和第一个共用中间一列 */
function rollGiants(): void {
  const now = nowUtc();
  const worldId = String(getWorldSeed());
  for (const ref of farmBedsHere()) {
    const [candidate] = giantCandidates(ref.bed, ref.footprint, findCropDefinition, now);
    if (!candidate) continue;
    const crop = findCropDefinition(candidate.cropId);
    if (!crop?.giant) continue;
    const seed = giantSeedString(worldId, ref.instanceId, ref.bed, ref.footprint, candidate, farmingTuning.giantSeedSalt);
    const hit = rollGiant(seed, crop.giant.chance);
    writeFarmBed(ref.instanceId, settleGiant(ref.bed, candidate, hit));
    if (hit) {
      emit("farm_giant_grown", { instanceId: ref.instanceId, cropId: candidate.cropId });
      // 掷中那一拍就说一声：玩家多半在别处，田里悄悄变了个样子没人知道
      emit("story_toast", {
        localizationKey: "farm.toast.giant_grown",
        durationMs: 3000,
        text: tf("farm.toast.giant_grown", { crop: t(crop.localizationKey) }),
        icon: `items/${crop.harvest.itemId}`,
      });
    }
  }
}

function tick(): void {
  const seen = new Set<string>();
  for (const ref of farmBedsHere()) {
    seen.add(ref.instanceId);
    const next = signatureOf(ref.instanceId);
    if (next === null) continue;
    if (signatures.get(ref.instanceId) !== next) {
      signatures.set(ref.instanceId, next);
      emit("farm_cell_changed", { instanceId: ref.instanceId });
    }
  }
  for (const key of [...signatures.keys()]) if (!seen.has(key)) signatures.delete(key);
  if (!isRemoteWorldActive()) rollGiants();
}

/** 调试 `/farm rain`：不用等天气，当场下一场雨。返回浇了几格 */
export function debugRainOnFarms(): number {
  return rainOnBeds();
}

/** 给用例和调试探针：手动推一拍 */
export function tickFarming(): void {
  tick();
}

export function startFarming(): () => void {
  signatures.clear();
  const timer = setInterval(tick, farmingTuning.tickSeconds * 1000);
  const offs = [
    on("weather_changed", ({ kind }) => {
      if (isRemoteWorldActive()) return;
      if (kind === WeatherKind.Rain || kind === WeatherKind.Storm) rainOnBeds();
    }),
    on("save_applied", () => {
      signatures.clear();
      // 读档时正下着雨：这一场也算
      if (!isRemoteWorldActive() && isRaining()) rainOnBeds();
    }),
    on("world_changed", ({ reason }) => {
      if (reason === "buildings" || reason === "restored") signatures.clear();
    }),
    on("map_changed", () => signatures.clear()),
  ];
  return () => {
    clearInterval(timer);
    for (const off of offs) off();
    signatures.clear();
  };
}
