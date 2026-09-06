import type { TalkPool } from "../../../types/talk.js";

/**
 * 薇尔（精灵）的话（居民系统 03）。
 *
 * 说话方式：句子完整、用"请"、偶尔说一句像诗的话。**没有口头禅**——
 * 池里不填 `catchphrase`，文案里也不写 `{cp}`；渲染时没有 `{cp}` 就什么都不替换，
 * 所以不需要为她特判。她住树洞（附-薇尔的大树），话里的"家"是树。
 */
export const spiritTalk: TalkPool = {
  residentId: "spirit_neighbor",
  greetings: [
    // ---- 11：生日 / 节日（权重 100 = 只说这个）----
    { key: "talk.spirit.greet.my_birthday", when: [{ kind: "is_birthday_of" }], weight: 100, expression: "happy" },
    { key: "talk.spirit.greet.friend_birthday", when: [{ kind: "is_birthday_of", residentId: "fox_neighbor" }], weight: 100, expression: "happy" },
    { key: "talk.spirit.greet.your_birthday", when: [{ kind: "is_player_birthday" }], weight: 100, expression: "happy" },
    { key: "talk.spirit.greet.festival", when: [{ kind: "flag_is", key: "festival_active" }], weight: 100, expression: "happy" },
    { key: "talk.spirit.greet.dawn_1", when: [{ kind: "day_phase_is", phase: "dawn" }], weight: 2 },
    { key: "talk.spirit.greet.dawn_2", when: [{ kind: "day_phase_is", phase: "dawn" }], weight: 2 },
    { key: "talk.spirit.greet.day_1", when: [{ kind: "day_phase_is", phase: "day" }], weight: 2 },
    { key: "talk.spirit.greet.day_2", when: [{ kind: "day_phase_is", phase: "day" }], weight: 2 },
    { key: "talk.spirit.greet.dusk_1", when: [{ kind: "day_phase_is", phase: "dusk" }], weight: 2 },
    { key: "talk.spirit.greet.dusk_2", when: [{ kind: "day_phase_is", phase: "dusk" }], weight: 2 },
    { key: "talk.spirit.greet.night_1", when: [{ kind: "day_phase_is", phase: "night" }], weight: 2 },
    { key: "talk.spirit.greet.night_2", when: [{ kind: "day_phase_is", phase: "night" }], weight: 2, expression: "sleepy" },
    { key: "talk.spirit.greet.sunny", when: [{ kind: "weather_is", weatherId: "sunny" }], weight: 3 },
    { key: "talk.spirit.greet.cloudy", when: [{ kind: "weather_is", weatherId: "cloudy" }], weight: 3 },
    // 她雨天反而出门看雨（02 的性格）——招呼里也是喜欢雨的
    { key: "talk.spirit.greet.rain", when: [{ kind: "weather_is", weatherId: "rain" }], weight: 4, expression: "happy" },
    { key: "talk.spirit.greet.storm", when: [{ kind: "weather_is", weatherId: "storm" }], weight: 6, expression: "surprised" },
    { key: "talk.spirit.greet.low_mood_1", when: [{ kind: "mood_below", value: 40 }], weight: 6, expression: "sad" },
    { key: "talk.spirit.greet.low_mood_2", when: [{ kind: "mood_below", value: 40 }], weight: 6 },
    { key: "talk.spirit.greet.high_mood", when: [{ kind: "mood_at_least", value: 85 }], weight: 4, expression: "happy" },
    { key: "talk.spirit.greet.holding_food", when: [{ kind: "holding_item", food: true }], weight: 8, expression: "puzzled" },
    { key: "talk.spirit.greet.long_time", when: [{ kind: "days_since_last_talk", atLeast: 3 }], weight: 10 },
    { key: "talk.spirit.greet.saw_creation", when: [{ kind: "recent_action_category", category: "creation" }], weight: 6, expression: "happy" },
    { key: "talk.spirit.greet.any_1" },
    { key: "talk.spirit.greet.any_2" },
  ],
  nicknames: ["talk.spirit.nick.1", "talk.spirit.nick.2", "talk.spirit.nick.3"],
  chats: [
    // ---- 04：伙伴档起可以在对话里改他叫你的昵称 / 他的口头禅 ----
    { dialogueId: "spirit_chat_naming", when: [{ kind: "affection_at_least", stage: "life_companion" }], weight: 3 },
    { dialogueId: "spirit_chat_enough", when: [{ kind: "talks_today", atLeast: 3 }], weight: 100 },
    { dialogueId: "spirit_chat_saw_exercise", when: [{ kind: "recent_action_category", category: "exercise" }], weight: 4, oncePerDay: true },
    { dialogueId: "spirit_chat_saw_work", when: [{ kind: "recent_action_category", category: "work_study" }], weight: 4, oncePerDay: true },
    { dialogueId: "spirit_chat_saw_creation", when: [{ kind: "recent_action_category", category: "creation" }], weight: 5, oncePerDay: true },
    { dialogueId: "spirit_chat_saw_rest", when: [{ kind: "recent_action_category", category: "rest" }], weight: 4, oncePerDay: true },
    { dialogueId: "spirit_chat_holding_food", when: [{ kind: "holding_item", food: true }], weight: 5 },
    { dialogueId: "spirit_chat_fox_around", when: [{ kind: "neighbor_present", residentId: "fox_neighbor" }], weight: 3, oncePerDay: true },
    // ---- 06：八卦 ----
    { dialogueId: "spirit_chat_gossip_slime_sick", when: [{ kind: "neighbor_remembers", residentId: "slime_neighbor", memoryId: "favor_slime_sick" }], weight: 4, oncePerDay: true },
    { dialogueId: "spirit_chat_gossip_fox_town", when: [{ kind: "neighbor_fact_yesterday", residentId: "fox_neighbor", fact: "resident_town_trip" }], weight: 5, oncePerDay: true },
    { dialogueId: "spirit_chat_gift_memory", when: [{ kind: "remembers", memoryId: "gift_loved" }], weight: 3 },
    { dialogueId: "spirit_chat_dragon_memory", when: [{ kind: "remembers", memoryId: "story_dragon_caught" }], weight: 2 },
    { dialogueId: "spirit_chat_long_time", when: [{ kind: "days_since_last_talk", atLeast: 3 }], weight: 10, oncePerDay: true },
    { dialogueId: "spirit_chat_new_here", when: [{ kind: "days_since_moved_in", atMost: 3 }], weight: 6, oncePerDay: true },
    { dialogueId: "spirit_chat_dawn", when: [{ kind: "day_phase_is", phase: "dawn" }], weight: 2 },
    { dialogueId: "spirit_chat_day", when: [{ kind: "day_phase_is", phase: "day" }], weight: 2 },
    { dialogueId: "spirit_chat_dusk", when: [{ kind: "day_phase_is", phase: "dusk" }], weight: 2 },
    { dialogueId: "spirit_chat_night", when: [{ kind: "day_phase_is", phase: "night" }], weight: 2 },
    { dialogueId: "spirit_chat_sunny", when: [{ kind: "weather_is", weatherId: "sunny" }], weight: 2 },
    { dialogueId: "spirit_chat_cloudy", when: [{ kind: "weather_is", weatherId: "cloudy" }], weight: 2 },
    { dialogueId: "spirit_chat_rain", when: [{ kind: "weather_is", weatherId: "rain" }], weight: 3 },
    { dialogueId: "spirit_chat_storm", when: [{ kind: "weather_is", weatherId: "storm" }], weight: 4 },
    { dialogueId: "spirit_chat_low_mood", when: [{ kind: "mood_below", value: 40 }], weight: 5 },
    { dialogueId: "spirit_chat_high_mood", when: [{ kind: "mood_at_least", value: 85 }], weight: 3 },
    { dialogueId: "spirit_chat_any_1" },
    { dialogueId: "spirit_chat_any_2" },
    { dialogueId: "spirit_chat_any_3" },
    { dialogueId: "spirit_chat_any_4" },
    { dialogueId: "spirit_chat_any_5" },
    // ---- 08：你在他屋里时的闲聊——权重 100 = 只抽这几段（屋里不说院子里的话） ----
    { dialogueId: "spirit_chat_home_1", when: [{ kind: "player_in_my_home" }], weight: 100 },
    { dialogueId: "spirit_chat_home_2", when: [{ kind: "player_in_my_home" }], weight: 100 },
    { dialogueId: "spirit_chat_home_3", when: [{ kind: "player_in_my_home" }], weight: 100 },
    // ---- 10：你写过信、他收到了还没当面提——见面第一段就是它 ----
    { dialogueId: "spirit_chat_replied_letter", when: [{ kind: "letter_replied_pending" }], weight: 100 },
    // ---- 11：生日当天 / 节日进行中的闲聊 ----
    { dialogueId: "spirit_chat_my_birthday", when: [{ kind: "is_birthday_of" }], weight: 100 },
    { dialogueId: "spirit_chat_festival", when: [{ kind: "flag_is", key: "festival_active" }], weight: 100 },
  ],
};
