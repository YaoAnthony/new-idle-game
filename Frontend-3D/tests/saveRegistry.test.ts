import { describe, expect, test } from "vitest";
import {
  PLAYER_SLICE_KEYS,
  WORLD_REFRESH_KEYS,
  WORLD_SLICE_KEYS,
  WORLD_SLICE_POLICY,
  wireKeyOf,
} from "core";

import { RESTORE_ORDER } from "../src/Data/Save/registry/order";
import { PLAYER_SLICES } from "../src/Data/Save/registry/playerSlices";
import { WORLD_SLICES } from "../src/Data/Save/registry/worldSlices";
import { isDead, type LiveSlice, type RestoreKey } from "../src/Data/Save/registry/types";
import {
  autosaveTriggers,
  refreshTriggers,
  replicateWorldSlices,
} from "../src/Data/Save/registry/derive";

/**
 * 持久状态注册表的运行时守卫。编译期那几条断言管"漏登记"；这里管编译期
 * 拦不住的：读档顺序的完整性与因果、触发表的派生结果、刷新载荷的键集合。
 *
 * **黄金顺序**那条是"注册表化之后行为不变"的钉子：2026-09-13 之前
 * `serialize.ts` 里 hydrateGameSave 的 48 步顺序照抄成 `RESTORE_ORDER`，
 * 改动它必须是一次显式的决定，不能是重构时手一滑。
 */

const GOLDEN_ORDER: readonly RestoreKey[] = [
  "world.worldId",
  "world.seed",
  "world.house",
  "world.maps",
  "world.placedFurniture",
  "world.clock",
  "world.weather",
  "world.inventories",
  "world.gramophones",
  "world.lamps",
  "world.grounds",
  "world.buildings",
  "world.baseGold",
  "world.droppedItems",
  "world.chatLog",
  "world.dailyBoard",
  "player.dailyTasks",
  "player.avatar",
  "player.character.inventory",
  "player.character.heldItem",
  "player.character.position",
  "player.discoveredRecipeIds",
  "player.character.restingOn",
  "player.character.needs",
  "world.pets",
  "world.doors",
  "world.progression.events",
  "world.progression.unlockedFeatureIds",
  "world.progression.firedStoryRuleIds",
  "world.progression.signalCounts",
  "world.progression.poolMisses",
  "world.progression.stats",
  "world.progression.achievements",
  "world.progression.codex",
  "world.dayFacts",
  "world.residentTrips",
  "world.tripPlans",
  "world.mailbox",
  "world.flags",
  "player.birthday",
  "world.favors",
  "world.porch",
  "world.interiors",
  "world.travelerStock",
  "world.newspaper",
  "player.actionEntries",
  "player.actionGroups",
  "player.actionLog",
  "player.diary",
  "player.pendingGold",
  "player.activeActionProcess",
  "player.name",
  "player.playerId",
  "player.character.inventoryId",
  "world.gameRules",
];

function liveOf(key: RestoreKey): LiveSlice<unknown> | null {
  const slice = key.startsWith("world.")
    ? WORLD_SLICES[key.slice("world.".length) as keyof typeof WORLD_SLICES]
    : PLAYER_SLICES[key.slice("player.".length) as keyof typeof PLAYER_SLICES];
  return isDead(slice) ? null : (slice as LiveSlice<unknown>);
}

describe("读档顺序", () => {
  test("test_registry_restore_order_covers_every_key_exactly_once", () => {
    const expected = [
      ...WORLD_SLICE_KEYS.map((key) => `world.${key}`),
      ...PLAYER_SLICE_KEYS.map((key) => `player.${key}`),
    ].sort();
    expect([...RESTORE_ORDER].sort()).toEqual(expected);
    expect(new Set(RESTORE_ORDER).size).toBe(RESTORE_ORDER.length);
  });

  test("test_registry_restore_order_matches_golden_sequence", () => {
    expect([...RESTORE_ORDER]).toEqual([...GOLDEN_ORDER]);
  });

  test("test_registry_restore_order_satisfies_every_after_constraint", () => {
    const position = new Map<string, number>(RESTORE_ORDER.map((key, index) => [key, index]));
    const violations: string[] = [];
    for (const key of RESTORE_ORDER) {
      const slice = liveOf(key);
      for (const dependency of slice?.after ?? []) {
        if ((position.get(dependency) ?? Infinity) > position.get(key)!) {
          violations.push(`${key} 声明要排在 ${dependency} 之后，清单里却在它前面`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("派生", () => {
  test("test_registry_refresh_payload_keys_equal_protocol_whitelist", () => {
    // 房主拼出来的载荷，键集合就是协议的白名单——多一个服务端整条拒绝，少一个房客那片冻结
    const payload = replicateWorldSlices();
    expect(Object.keys(payload).sort()).toEqual([...WORLD_REFRESH_KEYS].sort());
    // 每一片都有值：snapshot 返回 undefined 的片（空信箱、空旗子）必须由 replicate 补成空值
    for (const key of WORLD_REFRESH_KEYS) {
      expect((payload as Record<string, unknown>)[key], `刷新载荷里 ${key} 是 undefined`).toBeDefined();
    }
  });

  test("test_registry_refresh_triggers_cover_protocol_v13_events", () => {
    // 2026-09-13 之前 session.ts 手抄的 13 条触发事件，一条不能少
    const events = [...refreshTriggers().keys()].sort();
    for (const required of [
      "world_changed",
      "dropped_items_changed",
      "storage_changed",
      "gramophone_changed",
      "lamp_changed",
      "weather_changed",
      "kitchen_changed",
      "resident_changed",
      "favors_changed",
      "porch_changed",
      "interiors_changed",
      "mail_changed",
      "flags_changed",
    ]) {
      expect(events, `房主刷新不再听 ${required}`).toContain(required);
    }
  });

  test("test_registry_autosave_triggers_keep_progress_immediate_and_cover_old_list", () => {
    const table = autosaveTriggers();
    // 剧情节点立即写，这是防"刷新页面丢掉刚认的朋友"的那条
    expect(table.get("event_progress_changed")?.some((entry) => entry.immediate)).toBe(true);
    // 2026-09-13 之前 autosave.ts 手抄的 12 条，一条不能少
    for (const required of [
      "world_changed",
      "inventory_changed",
      "event_progress_changed",
      "resident_changed",
      "action_changed",
      "action_log_changed",
      "kitchen_changed",
      "held_changed",
      "posture_changed",
      "needs_changed",
      "chat_message",
      "lamp_changed",
    ]) {
      expect(table.has(required as never), `自动存档不再听 ${required}`).toBe(true);
    }
    // 审计点名漏掉的几条，现在必须在
    for (const added of ["building_state_changed", "gold_changed", "storage_changed", "mail_changed", "flags_changed"]) {
      expect(table.has(added as never), `自动存档还是没听 ${added}`).toBe(true);
    }
  });

  test("test_registry_every_refresh_slice_declares_at_least_one_trigger_or_is_documented", () => {
    // 策略为 refresh 却一个事件都不听的片，只能搭别人的车——今天允许（clock），但必须是有意的
    const silent = WORLD_SLICE_KEYS.filter((key) => {
      if (WORLD_SLICE_POLICY[key].sync !== "refresh") return false;
      const slice = liveOf(`world.${key}`);
      return slice && (slice.replicateOn ?? slice.changedBy).length === 0;
    }).map((key) => wireKeyOf(key));
    expect(silent).toEqual(["clock"]);
  });
});
