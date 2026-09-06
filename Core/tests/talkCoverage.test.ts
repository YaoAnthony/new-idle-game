import assert from "node:assert/strict";
import { test } from "node:test";
import { talkPools } from "../src/Data/residents/talk/index.js";
import { listTalkCandidates } from "../src/logic/talk.js";
import { weatherDefinitions } from "../src/Data/weather/index.js";
import type { DialogueCondition } from "../src/types/dialogue.js";
import type { TalkPool } from "../src/types/talk.js";

/**
 * 居民系统 16 · 内容审计：每位居民的招呼池和闲聊池，四个时段 × 六种天气 × 三档心情，每个格子至少一段能抽到，
 * 而且不是只剩兜底——时段 / 天气 / 心情三类里至少有一类"专门写给这个格子"的段。
 */
const PHASES = ["dawn", "day", "dusk", "night"];
const MOODS = [30, 60, 90];

function holdsFor(phase: string, weatherId: string, mood: number): (condition: DialogueCondition) => boolean {
  return (condition) => {
    switch (condition.kind) {
      case "day_phase_is": return condition.phase === phase;
      case "weather_is": return condition.weatherId === weatherId;
      case "mood_below": return mood < condition.value;
      case "mood_at_least": return mood >= condition.value;
      default: return false;
    }
  };
}

test("talkCoverage_每位_每个时段×天气×心情格子都有段可抽_且不只剩兜底", () => {
  for (const pool of talkPools as readonly TalkPool[]) {
    for (const phase of PHASES) {
      for (const weather of weatherDefinitions) {
        for (const mood of MOODS) {
          const holds = holdsFor(phase, weather.id, mood);
          const greetings = listTalkCandidates(pool.greetings, holds);
          const chats = listTalkCandidates(pool.chats, holds);
          const where = `${pool.residentId} ${phase}/${weather.id}/心情${mood}`;
          assert.ok(greetings.length > 0, `${where}：一句招呼都抽不到`);
          assert.ok(chats.length > 0, `${where}：一段闲聊都抽不到`);
          const specific = greetings.some(({ entry }) => (entry.when ?? []).length > 0);
          assert.ok(specific, `${where}：招呼只剩兜底段`);
        }
      }
    }
  }
});
