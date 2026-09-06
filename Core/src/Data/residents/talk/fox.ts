import type { TalkPool } from "../../../types/talk.js";

/**
 * 阿茜（狐狸）的话（居民系统 03）。
 *
 * 说话方式：感叹号多、话密、爱用"哟"，口头禅 `{cp}`（"喏"）常放句首或句尾。
 * 她是三位里唯一去小镇的，闲聊里会提镇上的事；也是最爱提别人的——
 * 场上有咕噜时会说他（`neighbor_present`，06 的八卦从这一条长出来）。
 */
export const foxTalk: TalkPool = {
  residentId: "fox_neighbor",
  catchphrase: "talk.fox.catchphrase",
  greetings: [
    { key: "talk.fox.greet.dawn_1", when: [{ kind: "day_phase_is", phase: "dawn" }], weight: 2, expression: "happy" },
    { key: "talk.fox.greet.dawn_2", when: [{ kind: "day_phase_is", phase: "dawn" }], weight: 2 },
    { key: "talk.fox.greet.day_1", when: [{ kind: "day_phase_is", phase: "day" }], weight: 2 },
    { key: "talk.fox.greet.day_2", when: [{ kind: "day_phase_is", phase: "day" }], weight: 2 },
    { key: "talk.fox.greet.dusk_1", when: [{ kind: "day_phase_is", phase: "dusk" }], weight: 2 },
    { key: "talk.fox.greet.dusk_2", when: [{ kind: "day_phase_is", phase: "dusk" }], weight: 2 },
    { key: "talk.fox.greet.night_1", when: [{ kind: "day_phase_is", phase: "night" }], weight: 2, expression: "puzzled" },
    { key: "talk.fox.greet.night_2", when: [{ kind: "day_phase_is", phase: "night" }], weight: 2 },
    { key: "talk.fox.greet.sunny", when: [{ kind: "weather_is", weatherId: "sunny" }], weight: 3, expression: "happy" },
    { key: "talk.fox.greet.cloudy", when: [{ kind: "weather_is", weatherId: "cloudy" }], weight: 3 },
    { key: "talk.fox.greet.rain", when: [{ kind: "weather_is", weatherId: "rain" }], weight: 4 },
    { key: "talk.fox.greet.storm", when: [{ kind: "weather_is", weatherId: "storm" }], weight: 6, expression: "surprised" },
    { key: "talk.fox.greet.low_mood_1", when: [{ kind: "mood_below", value: 40 }], weight: 6, expression: "sad" },
    { key: "talk.fox.greet.low_mood_2", when: [{ kind: "mood_below", value: 40 }], weight: 6, expression: "sad" },
    { key: "talk.fox.greet.high_mood", when: [{ kind: "mood_at_least", value: 85 }], weight: 4, expression: "happy" },
    { key: "talk.fox.greet.holding_food", when: [{ kind: "holding_item", food: true }], weight: 8, expression: "surprised" },
    { key: "talk.fox.greet.long_time", when: [{ kind: "days_since_last_talk", atLeast: 3 }], weight: 10, expression: "surprised" },
    { key: "talk.fox.greet.saw_exercise", when: [{ kind: "recent_action_category", category: "exercise" }], weight: 6, expression: "happy" },
    { key: "talk.fox.greet.any_1" },
    { key: "talk.fox.greet.any_2" },
  ],
  nicknames: ["talk.fox.nick.1", "talk.fox.nick.2", "talk.fox.nick.3"],
  chats: [
    // ---- 04：伙伴档起可以在对话里改他叫你的昵称 / 他的口头禅 ----
    { dialogueId: "fox_chat_naming", when: [{ kind: "affection_at_least", stage: "life_companion" }], weight: 3 },
    { dialogueId: "fox_chat_enough", when: [{ kind: "talks_today", atLeast: 3 }], weight: 100 },
    { dialogueId: "fox_chat_saw_exercise", when: [{ kind: "recent_action_category", category: "exercise" }], weight: 4, oncePerDay: true },
    { dialogueId: "fox_chat_saw_work", when: [{ kind: "recent_action_category", category: "work_study" }], weight: 4, oncePerDay: true },
    { dialogueId: "fox_chat_saw_creation", when: [{ kind: "recent_action_category", category: "creation" }], weight: 4, oncePerDay: true },
    { dialogueId: "fox_chat_saw_rest", when: [{ kind: "recent_action_category", category: "rest" }], weight: 4, oncePerDay: true },
    { dialogueId: "fox_chat_holding_food", when: [{ kind: "holding_item", food: true }], weight: 5 },
    { dialogueId: "fox_chat_slime_around", when: [{ kind: "neighbor_present", residentId: "slime_neighbor" }], weight: 3, oncePerDay: true },
    { dialogueId: "fox_chat_gift_memory", when: [{ kind: "remembers", memoryId: "gift_loved" }], weight: 3 },
    { dialogueId: "fox_chat_dragon_memory", when: [{ kind: "remembers", memoryId: "story_dragon_caught" }], weight: 2 },
    { dialogueId: "fox_chat_long_time", when: [{ kind: "days_since_last_talk", atLeast: 3 }], weight: 10, oncePerDay: true },
    { dialogueId: "fox_chat_new_here", when: [{ kind: "days_since_moved_in", atMost: 3 }], weight: 6, oncePerDay: true },
    { dialogueId: "fox_chat_dawn", when: [{ kind: "day_phase_is", phase: "dawn" }], weight: 2 },
    { dialogueId: "fox_chat_day", when: [{ kind: "day_phase_is", phase: "day" }], weight: 2 },
    { dialogueId: "fox_chat_dusk", when: [{ kind: "day_phase_is", phase: "dusk" }], weight: 2 },
    { dialogueId: "fox_chat_night", when: [{ kind: "day_phase_is", phase: "night" }], weight: 2 },
    { dialogueId: "fox_chat_sunny", when: [{ kind: "weather_is", weatherId: "sunny" }], weight: 2 },
    { dialogueId: "fox_chat_cloudy", when: [{ kind: "weather_is", weatherId: "cloudy" }], weight: 2 },
    { dialogueId: "fox_chat_rain", when: [{ kind: "weather_is", weatherId: "rain" }], weight: 3 },
    { dialogueId: "fox_chat_storm", when: [{ kind: "weather_is", weatherId: "storm" }], weight: 4 },
    { dialogueId: "fox_chat_low_mood", when: [{ kind: "mood_below", value: 40 }], weight: 5 },
    { dialogueId: "fox_chat_high_mood", when: [{ kind: "mood_at_least", value: 85 }], weight: 3 },
    { dialogueId: "fox_chat_any_1" },
    { dialogueId: "fox_chat_any_2" },
    { dialogueId: "fox_chat_any_3" },
    { dialogueId: "fox_chat_any_4" },
    { dialogueId: "fox_chat_any_5" },
  ],
};
