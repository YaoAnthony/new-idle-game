import type { CropDefinition } from "../types/farming.js";

/**
 * 作物表体检（开机 DEV 点名 + Core 用例）。
 *
 * 作物表是内容，写错不炸编译：种子指错作物、造型没登记、段落没按升序——
 * 界面上只是一格不长、一段不画。这里逐条对表，缺什么说什么。
 */
export function auditCrops(
  crops: readonly CropDefinition[],
  items: ReadonlyArray<{ id: string; seed?: { cropId: string } }>,
  options: {
    hasVisual: (visualId: string) => boolean;
    hasLocalizationKey: (key: string) => boolean;
  },
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const crop of crops) {
    const tag = `作物 ${crop.cropId}`;
    if (seen.has(crop.cropId)) problems.push(`${tag}：id 重复`);
    seen.add(crop.cropId);

    const seed = byId.get(crop.seedItemId);
    if (!seed) problems.push(`${tag}：种子物品 ${crop.seedItemId} 不存在`);
    else if (seed.seed?.cropId !== crop.cropId) {
      problems.push(`${tag}：种子物品 ${crop.seedItemId} 的 seed.cropId 没指回来`);
    }

    if (!byId.has(crop.harvest.itemId)) problems.push(`${tag}：收获物 ${crop.harvest.itemId} 不存在`);
    for (const [name, range] of [
      ["count", crop.harvest.count],
      ["seeds", crop.harvest.seeds],
    ] as const) {
      if (range[0] < 0 || range[1] < range[0]) problems.push(`${tag}：harvest.${name} 区间 [${range}] 反了`);
    }
    if (crop.harvest.count[0] < 1) problems.push(`${tag}：收获至少要有 1 个`);

    if (crop.growMinutes <= 0) problems.push(`${tag}：growMinutes 必须 > 0`);
    if (crop.stages.length === 0) problems.push(`${tag}：stages 为空`);
    else if (crop.stages[0].at !== 0) problems.push(`${tag}：stages 首项 at 必须是 0`);
    crop.stages.forEach((stage, index) => {
      if (stage.at < 0 || stage.at > 1) problems.push(`${tag}：stages[${index}].at 超出 0~1`);
      if (index > 0 && stage.at <= crop.stages[index - 1].at) {
        problems.push(`${tag}：stages[${index}].at 没有升序`);
      }
      if (!options.hasVisual(stage.visual)) problems.push(`${tag}：造型 ${stage.visual} 没登记`);
    });

    if (!crop.needs.some((need) => need.kind === "water")) problems.push(`${tag}：needs 里没有水`);
    for (const need of crop.needs) {
      if (need.kind === "water" && need.lastsMinutes <= 0) {
        problems.push(`${tag}：水的 lastsMinutes 必须 > 0`);
      }
    }

    if (crop.giant) {
      if (crop.giant.size !== 2) problems.push(`${tag}：giant.size 只支持 2`);
      if (!(crop.giant.chance > 0 && crop.giant.chance <= 1)) problems.push(`${tag}：giant.chance 超出 (0, 1]`);
      if (crop.giant.yieldMultiplier <= 0) problems.push(`${tag}：giant.yieldMultiplier 必须 > 0`);
      if (!options.hasVisual(crop.giant.visual)) problems.push(`${tag}：巨大造型 ${crop.giant.visual} 没登记`);
    }

    if (!options.hasLocalizationKey(crop.localizationKey)) problems.push(`${tag}：缺文案 ${crop.localizationKey}`);
  }

  // 反向：每包种子都要有它的作物，否则播下去长不出东西
  for (const item of items) {
    if (item.seed && !crops.some((crop) => crop.cropId === item.seed?.cropId)) {
      problems.push(`种子 ${item.id}：指向的作物 ${item.seed.cropId} 不在作物表里`);
    }
  }

  return problems;
}
