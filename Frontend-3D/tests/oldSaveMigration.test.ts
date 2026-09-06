import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";
import { migrateSave } from "../src/Data/Save/migrations";
import type { GameSave } from "core";

/**
 * 居民系统 15 · 老档穿越：拿一份真档（IndexedDB 导出的 {keys, all} 或裸 GameSave）一路迁到最新版本。
 * 真档不进仓库（是玩家的东西）：路径从 OLD_SAVE_PATH 来，没有就跳过——CI 不会因为没档而红，
 * 本机跑一次把结果写进 15 的文档。
 */
const path = process.env.OLD_SAVE_PATH;

function loadSaves(): Array<{ key: string; save: GameSave }> {
  const raw = JSON.parse(readFileSync(path!, "utf8")) as { keys?: string[]; all?: Array<{ value: GameSave }> } | GameSave;
  if ("keys" in raw && raw.keys && raw.all) return raw.keys.map((key, index) => ({ key, save: raw.all![index].value }));
  return [{ key: "save", save: raw as GameSave }];
}

test.skipIf(!path || !existsSync(path))("老档迁到最新：三位还在、进度只增不减、金币不变、可重入", () => {
  for (const { key, save } of loadSaves()) {
    const before = JSON.parse(JSON.stringify(save)) as GameSave;
    const result = migrateSave(save);
    expect(result.ok, key).toBe(true);
    if (!result.ok) continue;
    const after = result.save;
    expect(after.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    // 活物一个不少
    expect(Object.keys(after.ownWorld.pets ?? {}).sort()).toEqual(Object.keys(before.ownWorld.pets ?? {}).sort());
    // 进度只增不减
    for (const featureId of before.ownWorld.progression.unlockedFeatureIds ?? []) expect(after.ownWorld.progression.unlockedFeatureIds).toContain(featureId);
    for (const eventId of Object.keys(before.ownWorld.progression.events ?? {})) expect(after.ownWorld.progression.events[eventId]).toBeTruthy();
    expect(after.ownWorld.progression.firedStoryRuleIds ?? []).toEqual(expect.arrayContaining(before.ownWorld.progression.firedStoryRuleIds ?? []));
    // 背包 / 库存一个字节不动
    expect(after.player.character.inventory).toEqual(before.player.character.inventory);
    expect(after.ownWorld.inventories).toEqual(before.ownWorld.inventories);
    // 再迁一遍不动
    const again = migrateSave(JSON.parse(JSON.stringify(after)));
    expect(again.ok && again.migrated).toBe(false);
  }
});
