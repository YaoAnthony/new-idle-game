import type { TalkPool } from "../../../types/talk.js";

/**
 * 咕噜（史莱姆）的话（居民系统 03）。
 *
 * 说话方式：第三人称叫自己"咕噜"、短句、多省略号，句尾常带口头禅 `{cp}`（"嘿嘿"）。
 * 天气段不解释天气，说他对天气的**感受**（雨落在身上会陷进去一点）。
 * 特殊段每段至少引用一处上下文（记忆 / 行动 / 手持物），不然不算特殊段。
 *
 * 文案在前端 i18n：`talk.slime.greet.<slug>`、`dlg.slime_chat_<slug>.n1`。
 */
export const slimeTalk: TalkPool = {
  residentId: "slime_neighbor",
  catchphrase: "talk.slime.catchphrase",
  greetings: [
    // 时段（一段两句，抽到哪句看种子）
    { key: "talk.slime.greet.dawn_1", when: [{ kind: "day_phase_is", phase: "dawn" }], weight: 2 },
    { key: "talk.slime.greet.dawn_2", when: [{ kind: "day_phase_is", phase: "dawn" }], weight: 2 },
    { key: "talk.slime.greet.day_1", when: [{ kind: "day_phase_is", phase: "day" }], weight: 2 },
    { key: "talk.slime.greet.day_2", when: [{ kind: "day_phase_is", phase: "day" }], weight: 2 },
    { key: "talk.slime.greet.dusk_1", when: [{ kind: "day_phase_is", phase: "dusk" }], weight: 2 },
    { key: "talk.slime.greet.dusk_2", when: [{ kind: "day_phase_is", phase: "dusk" }], weight: 2 },
    { key: "talk.slime.greet.night_1", when: [{ kind: "day_phase_is", phase: "night" }], weight: 2, expression: "sleepy" },
    { key: "talk.slime.greet.night_2", when: [{ kind: "day_phase_is", phase: "night" }], weight: 2, expression: "sleepy" },
    // 天气
    { key: "talk.slime.greet.sunny", when: [{ kind: "weather_is", weatherId: "sunny" }], weight: 3, expression: "happy" },
    { key: "talk.slime.greet.cloudy", when: [{ kind: "weather_is", weatherId: "cloudy" }], weight: 3 },
    { key: "talk.slime.greet.rain", when: [{ kind: "weather_is", weatherId: "rain" }], weight: 4, expression: "puzzled" },
    { key: "talk.slime.greet.storm", when: [{ kind: "weather_is", weatherId: "storm" }], weight: 6, expression: "surprised" },
    // 心情
    { key: "talk.slime.greet.low_mood_1", when: [{ kind: "mood_below", value: 40 }], weight: 6, expression: "sad" },
    { key: "talk.slime.greet.low_mood_2", when: [{ kind: "mood_below", value: 40 }], weight: 6, expression: "sad" },
    { key: "talk.slime.greet.high_mood", when: [{ kind: "mood_at_least", value: 85 }], weight: 4, expression: "happy" },
    // 上下文
    { key: "talk.slime.greet.holding_food", when: [{ kind: "holding_item", food: true }], weight: 8, expression: "surprised" },
    { key: "talk.slime.greet.long_time", when: [{ kind: "days_since_last_talk", atLeast: 3 }], weight: 10, expression: "surprised" },
    { key: "talk.slime.greet.saw_exercise", when: [{ kind: "recent_action_category", category: "exercise" }], weight: 6 },
    // 兜底
    { key: "talk.slime.greet.any_1" },
    { key: "talk.slime.greet.any_2" },
  ],
  nicknames: ["talk.slime.nick.1", "talk.slime.nick.2", "talk.slime.nick.3"],
  chats: [
    // ---- 04：伙伴档起可以在对话里改他叫你的昵称 / 他的口头禅 ----
    { dialogueId: "slime_chat_naming", when: [{ kind: "affection_at_least", stage: "life_companion" }], weight: 3 },
    // ---- 说够了：权重压倒一切 ----
    { dialogueId: "slime_chat_enough", when: [{ kind: "talks_today", atLeast: 3 }], weight: 100 },
    // ---- 特殊段（引用上下文） ----
    { dialogueId: "slime_chat_saw_exercise", when: [{ kind: "recent_action_category", category: "exercise" }], weight: 4, oncePerDay: true },
    { dialogueId: "slime_chat_saw_work", when: [{ kind: "recent_action_category", category: "work_study" }], weight: 4, oncePerDay: true },
    { dialogueId: "slime_chat_saw_creation", when: [{ kind: "recent_action_category", category: "creation" }], weight: 4, oncePerDay: true },
    { dialogueId: "slime_chat_saw_rest", when: [{ kind: "recent_action_category", category: "rest" }], weight: 4, oncePerDay: true },
    { dialogueId: "slime_chat_holding_food", when: [{ kind: "holding_item", food: true }], weight: 5 },
    { dialogueId: "slime_chat_holding_tomato", when: [{ kind: "holding_item", itemId: "tomato" }], weight: 8 },
    // ---- 06：八卦 = 引用别人记忆 / 昨天事实的闲聊 ----
    { dialogueId: "slime_chat_gossip_fox_town", when: [{ kind: "neighbor_fact_yesterday", residentId: "fox_neighbor", fact: "resident_town_trip" }], weight: 6, oncePerDay: true },
    { dialogueId: "slime_chat_gossip_fox_parcel", when: [{ kind: "neighbor_remembers", residentId: "fox_neighbor", memoryId: "favor_fox_parcel" }], weight: 3, oncePerDay: true },
    { dialogueId: "slime_chat_gift_memory", when: [{ kind: "remembers", memoryId: "gift_loved" }], weight: 3 },
    { dialogueId: "slime_chat_dragon_memory", when: [{ kind: "remembers", memoryId: "story_dragon_caught" }], weight: 2 },
    { dialogueId: "slime_chat_long_time", when: [{ kind: "days_since_last_talk", atLeast: 3 }], weight: 10, oncePerDay: true },
    { dialogueId: "slime_chat_new_here", when: [{ kind: "days_since_moved_in", atMost: 3 }], weight: 6, oncePerDay: true },
    // ---- 一般段：时段 ----
    { dialogueId: "slime_chat_dawn", when: [{ kind: "day_phase_is", phase: "dawn" }], weight: 2 },
    { dialogueId: "slime_chat_day", when: [{ kind: "day_phase_is", phase: "day" }], weight: 2 },
    { dialogueId: "slime_chat_dusk", when: [{ kind: "day_phase_is", phase: "dusk" }], weight: 2 },
    { dialogueId: "slime_chat_night", when: [{ kind: "day_phase_is", phase: "night" }], weight: 2 },
    // ---- 一般段：天气 ----
    { dialogueId: "slime_chat_sunny", when: [{ kind: "weather_is", weatherId: "sunny" }], weight: 2 },
    { dialogueId: "slime_chat_cloudy", when: [{ kind: "weather_is", weatherId: "cloudy" }], weight: 2 },
    { dialogueId: "slime_chat_rain", when: [{ kind: "weather_is", weatherId: "rain" }], weight: 3 },
    { dialogueId: "slime_chat_storm", when: [{ kind: "weather_is", weatherId: "storm" }], weight: 4 },
    // ---- 一般段：心情 ----
    { dialogueId: "slime_chat_low_mood", when: [{ kind: "mood_below", value: 40 }], weight: 5 },
    { dialogueId: "slime_chat_high_mood", when: [{ kind: "mood_at_least", value: 85 }], weight: 3 },
    // ---- 一般段：无条件 ----
    { dialogueId: "slime_chat_any_1" },
    { dialogueId: "slime_chat_any_2" },
    { dialogueId: "slime_chat_any_3" },
    { dialogueId: "slime_chat_any_4" },
    { dialogueId: "slime_chat_any_5" },
    // ---- 08：你在他屋里时的闲聊——权重 100 = 只抽这几段（屋里不说院子里的话） ----
    { dialogueId: "slime_chat_home_1", when: [{ kind: "player_in_my_home" }], weight: 100 },
    { dialogueId: "slime_chat_home_2", when: [{ kind: "player_in_my_home" }], weight: 100 },
    { dialogueId: "slime_chat_home_3", when: [{ kind: "player_in_my_home" }], weight: 100 },
    // ---- 10：你写过信、他收到了还没当面提——见面第一段就是它 ----
    { dialogueId: "slime_chat_replied_letter", when: [{ kind: "letter_replied_pending" }], weight: 100 },
  ],
};
