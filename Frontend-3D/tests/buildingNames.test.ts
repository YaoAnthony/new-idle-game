import { expect, test } from "vitest";

import { buildingDefinitions } from "../src/Buildings/index";
import { t } from "../src/i18n/t";

/**
 * 每栋楼都得有名字（2026-08-25）。
 *
 * 石碑的气泡从"看看这栋"改成**直接报这栋楼的名字**——用户原话
 * "很奇怪，餐厅就说餐厅，家具店就叫家具店"。名字取的是型号的
 * `localizationKey`，i18n 表里本来就有，不另开一套"气泡专用名"。
 *
 * 代价是这条从此**必须成立**：漏登记一栋，气泡会把裸 key 甩给玩家
 * （`t()` 找不到时回显 key），而那是只有走到碑跟前才看得见的错。
 * 加新楼忘了写文案，这一条会先红。
 */

test("buildingNames_每个型号的名字都在文案表里_气泡不会甩出裸 key", () => {
  const broken: string[] = [];

  for (const definition of buildingDefinitions) {
    const key = definition.localizationKey;
    const text = t(key);
    // t() 找不到时回显 key 本身——这就是"没登记"的信号
    if (!text || text === key) broken.push(`${definition.buildingId} → ${key}`);
  }

  expect(broken).toEqual([]);
});

test("buildingNames_每个等级也有名字_升级面板和气泡都靠它", () => {
  const broken: string[] = [];

  for (const definition of buildingDefinitions) {
    for (const level of definition.levels) {
      const text = t(level.localizationKey);
      if (!text || text === level.localizationKey) {
        broken.push(`${definition.buildingId}/${level.levelId} → ${level.localizationKey}`);
      }
    }
  }

  expect(broken).toEqual([]);
});
