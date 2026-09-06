import type { PersonalityDefinition } from "../../types/residents.js";

/**
 * 性格表（居民系统 02，2026-09-06）：一位居民一天在哪、几点起几点睡、下雨怎么办。
 *
 * 照动森的做法：八种性格各有起居时间。我们**三种**，三位各一种；第四位来时再加
 * 一行——加一种性格是加一行数据，不预留。
 *
 * 时段用**钟点**不用四段（黎明 / 白天 / 黄昏 / 夜里）：四段太粗，"傍晚回家"和
 * "天黑睡觉"是两个时刻。四段留给 03 的对话条件。
 *
 * 数字全在这里：溜达半径、打盹时长、雨天减速——正文里写的只是三位的初值。
 * 段落该连续不重叠（content 测试查），没覆盖到的钟点等于 hang_home。
 */
export const personalityDefinitions = [
  {
    // 咕噜（史莱姆）：懒散。九点才起，爱晒太阳，下雨不出门
    id: "easygoing",
    wakeAt: "09:00",
    sleepAt: "22:00",
    routine: [
      { from: "09:00", to: "11:00", do: "hang_home" },
      { from: "11:00", to: "13:00", do: "visit", spot: "seat" },
      { from: "13:00", to: "15:00", do: "nap_out", weather: ["sunny", "cloudy"] },
      { from: "15:00", to: "18:00", do: "visit", spot: "shop" },
      { from: "18:00", to: "22:00", do: "hang_home" },
    ],
    onRain: "stay_home",
    onStorm: "stay_home",
    townTripEveryDays: 0,
    roamRadius: 6,
    napSeconds: [90, 150],
    rainSpeedScale: 0.7,
    greetDistance: 2.5,
    likesWeather: ["sunny"],
    // 12：坐着喝东西、看水
    hobbies: ["relax", "nature"],
  },
  {
    // 阿茜（狐狸）：早起、爱跑、隔三天去一趟小镇
    id: "lively",
    wakeAt: "06:00",
    sleepAt: "21:30",
    routine: [
      { from: "06:00", to: "08:00", do: "roam" },
      { from: "08:00", to: "10:00", do: "visit", spot: "water" },
      { from: "10:00", to: "12:00", do: "visit", spot: "shop" },
      { from: "12:00", to: "17:00", do: "roam" },
      { from: "17:00", to: "21:30", do: "hang_home" },
    ],
    onRain: "go_out_slow",
    onStorm: "stay_home",
    townTripEveryDays: 3,
    townTrip: { leaveAt: "10:00", backAt: "17:00" },
    roamRadius: 12,
    napSeconds: [60, 120],
    rainSpeedScale: 0.7,
    // 话多的先开口：三米半就喊
    greetDistance: 3.5,
    likesWeather: ["sunny", "wind"],
    // 12：伸展、在你的工作台前敲敲打打、哼歌
    hobbies: ["fitness", "craft", "music"],
  },
  {
    // 薇尔（精灵）：晨昏活动、雨天反而出来看雨、常在井边
    id: "gentle",
    wakeAt: "05:30",
    sleepAt: "21:00",
    routine: [
      { from: "05:30", to: "08:00", do: "visit", spot: "water" },
      { from: "08:00", to: "11:00", do: "hang_home" },
      { from: "11:00", to: "16:00", do: "visit", spot: "seat" },
      { from: "16:00", to: "19:00", do: "visit", spot: "water" },
      { from: "19:00", to: "21:00", do: "hang_home" },
    ],
    onRain: "go_out_watch",
    onStorm: "stay_home",
    townTripEveryDays: 0,
    roamRadius: 8,
    napSeconds: [60, 120],
    rainSpeedScale: 0.8,
    greetDistance: 3,
    likesWeather: ["rain", "fog"],
    // 12：看水、看书、哼歌
    hobbies: ["nature", "education", "music"],
  },
] as const satisfies readonly PersonalityDefinition[];

export function findPersonality(id: string): PersonalityDefinition | undefined {
  return (personalityDefinitions as readonly PersonalityDefinition[]).find((entry) => entry.id === id);
}
