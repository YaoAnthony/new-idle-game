import type { LetterDefinition } from "../../types/letters.js";

/**
 * 信件表（居民系统 10）。
 *
 * 居民自发的信按条件 + 权重抽（每位每几天最多一封、同一天全体最多一封——走 resident_mail 池）；
 * 出门的寄明信片（09）；剧情信由效果发（没有实体角色也能寄，主线的魔女来信走这个）。
 * 拆信的后果写在 `onOpened`，由表生成规则——信箱系统本身不加好感。
 * 文案在前端 i18n：`letter.<who>.<slug>`、`postcard.<slug>`、`letter.witch.<slug>`。
 */
const WHO = ["slime", "fox", "spirit"] as const;

const residentLetters: LetterDefinition[] = WHO.flatMap((who): LetterDefinition[] => {
  const residentId = `${who}_neighbor`;
  const rid = `resident-${residentId}`;
  return [
    {
      id: `${who}_hello`,
      kind: "resident",
      residentId,
      bodyKey: `letter.${who}.hello`,
      requires: [{ kind: "affection_at_least", stage: "familiar_resident" }],
      weight: 2,
      attach: { pool: "presents" },
      onOpened: [{ kind: "adjust_affection", residentId: rid, source: "letter" }],
    },
    {
      id: `${who}_miss_you`,
      kind: "resident",
      residentId,
      bodyKey: `letter.${who}.miss_you`,
      requires: [{ kind: "affection_at_least", stage: "life_companion" }, { kind: "days_since_last_talk", atLeast: 2 }],
      weight: 3,
      onOpened: [{ kind: "adjust_affection", residentId: rid, source: "letter" }],
    },
    {
      id: `${who}_thanks_favor`,
      kind: "resident",
      residentId,
      bodyKey: `letter.${who}.thanks_favor`,
      requires: [{ kind: "remembers", memoryId: who === "slime" ? "favor_slime_lamp" : who === "fox" ? "favor_fox_parcel" : "favor_spirit_soup" }],
      weight: 4,
      once: true,
      attach: { pool: "presents" },
      onOpened: [
        { kind: "adjust_affection", residentId: rid, source: "letter" },
        { kind: "add_memory", residentId: rid, memoryId: "wrote_thanks" },
      ],
    },
  ];
});

export const letterDefinitions: LetterDefinition[] = [
  ...residentLetters,
  // 11：生日当天早上的邀请（规则寄，不进自发抽签——kind 不是 resident）；你生日那天每位寄一封、夹一件
  ...WHO.flatMap((who): LetterDefinition[] => [
    { id: `birthday_invite_${who}`, kind: "story", residentId: `${who}_neighbor`, bodyKey: `letter.${who}.birthday_invite` },
    { id: `player_birthday_${who}`, kind: "story", residentId: `${who}_neighbor`, bodyKey: `letter.${who}.your_birthday`, attach: { pool: "presents" } },
  ]),
  // 09 的多日出门：第二天到的明信片（寄件人是出门那位）
  { id: "postcard_hometown", kind: "postcard", bodyKey: "postcard.hometown", illustrationId: "postcard_hometown" },
  // 主线（14 开场之后）：魔女来信。没有对应的实体角色，效果直接寄
  { id: "witch_first", kind: "story", bodyKey: "letter.witch.first", illustrationId: "letter_witch" },
  // 13：咕噜灯亮那晚歪歪扭扭的信；阿茜从镇上带回的、不是她写的信（寄件人空白——魔女线的第一个钩子，拆开 = 她那条线走完）
  { id: "slime_thanks_lamp", kind: "story", residentId: "slime_neighbor", bodyKey: "letter.slime.thanks_lamp" },
  {
    id: "witch_from_town",
    kind: "story",
    bodyKey: "letter.witch.from_town",
    illustrationId: "letter_witch",
    onOpened: [{ kind: "set_event_stage", eventId: "arc_fox", stageId: "done", complete: true }],
  },
];

export function findLetterDefinition(id: string): LetterDefinition | undefined {
  return letterDefinitions.find((entry) => entry.id === id);
}

export const mailTuning = {
  /** 信箱最多几封；满了不寄（不丢），池的 miss 不累加 */
  boxCapacity: 20,
  /** 每位居民每 N 天最多一封自发信 */
  perResidentEveryDays: 4,
  /** 全体共享的日抽签（同一天最多一位写信）；伙伴档起进池（规则的 requiresAffection） */
  pool: { poolId: "resident_mail", base: 0.25, step: 0.15, max: 0.9 },
  /** 你写信能挑的句子（不做自由输入） */
  playerTemplates: ["letter.you.hi", "letter.you.thanks", "letter.you.miss", "letter.you.come_over"],
} as const;
