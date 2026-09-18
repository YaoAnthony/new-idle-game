import { afterEach, beforeEach, expect, test } from "vitest";
import { getCount, replaceCounts } from "../src/Game/State/inventory";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { restoreProgression } from "../src/Game/Systems/events";
import { getFlag, restoreFlags } from "../src/Game/Systems/flags";
import { restoreFiredStoryRules, restoreSignalCounts, signal, startStorySystem } from "../src/Game/Systems/story";

/** 魔女的条子读完烧掉（2026-09-16）：信封从背包消失、记旗子；别的信烧不到它 */
let stop: (() => void) | null = null;

beforeEach(() => {
  setRemoteWorldActive(false);
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  restoreFlags(undefined);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  replaceCounts({ witch_letter: 1 });
  stop = startStorySystem(false);
});

afterEach(() => {
  stop?.();
  stop = null;
});

test("letter_魔女的条子烧掉_信封没了_旗子记上", () => {
  expect(getCount("witch_letter")).toBe(1);
  signal("letter_burned", "witch_first");
  expect(getCount("witch_letter")).toBe(0);
  expect(getFlag("witch_letter_burned")).toBe("1");
});

test("letter_别的信烧掉不碰魔女的信封", () => {
  signal("letter_burned", "slime_thanks_lamp");
  expect(getCount("witch_letter")).toBe(1);
  expect(getFlag("witch_letter_burned")).toBeUndefined();
});
