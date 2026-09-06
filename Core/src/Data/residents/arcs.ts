/**
 * 三条个人线的**目录**（居民系统 13）：哪位、哪个事件、每一幕由哪条规则立、等的是什么。
 * 规则本身在 `Data/story`——这张表不推剧情，只给两处用：
 * - `/npc <谁> arc`（打印在哪一幕、下一幕等什么）和 `arc next`（点火下一幕那条规则）；
 * - 审计（每一幕真有一条规则会写它）。
 * 阶段顺序 = 幕的顺序；`waitsFor` 是给人看的说明，不参与逻辑。
 */
export type ArcStep = { stageId: string; ruleId: string; waitsFor: string };
export type ArcDefinition = { eventId: string; residentId: string; steps: readonly ArcStep[] };

export const arcDefinitions: readonly ArcDefinition[] = [
  {
    eventId: "arc_slime",
    residentId: "slime_neighbor",
    steps: [
      { stageId: "settled", ruleId: "arc_slime_settled", waitsFor: "resident_moved_in" },
      { stageId: "afraid_of_dark", ruleId: "arc_slime_afraid", waitsFor: "favor_completed slime_walk_to_well（搬来第三天早上他提）" },
      { stageId: "lamp_lit", ruleId: "arc_slime_lamp_lit", waitsFor: "favor_completed slime_wants_lamp（伙伴档早上他提）" },
      { stageId: "opened_up", ruleId: "arc_slime_opens_up", waitsFor: "day_started + 家人档" },
      { stageId: "done", ruleId: "arc_slime_done", waitsFor: "dialogue_event slime_arc_done（slime_opens_up 说完）" },
    ],
  },
  {
    eventId: "arc_fox",
    residentId: "fox_neighbor",
    steps: [
      { stageId: "settled", ruleId: "arc_fox_settled", waitsFor: "resident_moved_in" },
      { stageId: "wants_shortcut", ruleId: "arc_fox_shortcut", waitsFor: "day_started + 搬来第二天" },
      { stageId: "delivered_to_town", ruleId: "arc_fox_delivered", waitsFor: "favor_completed fox_deliver_town（伙伴档早上她提；踏上小镇 = 送到）" },
      { stageId: "brought_letter", ruleId: "arc_fox_letter", waitsFor: "resident_returned fox_neighbor（她下次从镇上回来）" },
      { stageId: "done", ruleId: "letter_opened_witch_from_town", waitsFor: "letter_opened witch_from_town" },
    ],
  },
  {
    eventId: "arc_spirit",
    residentId: "spirit_neighbor",
    steps: [
      { stageId: "settled", ruleId: "arc_spirit_settled", waitsFor: "resident_moved_in" },
      { stageId: "asked_to_plant", ruleId: "arc_spirit_plant_offer", waitsFor: "day_started + 搬来第二天" },
      { stageId: "planted", ruleId: "arc_spirit_planted", waitsFor: "favor_completed spirit_plant_near_home（她家六米内播了种）" },
      { stageId: "taught_chimes", ruleId: "arc_spirit_taught", waitsFor: "favor_completed spirit_invites_you（planted 之后早上她提）" },
    ],
  },
];

export function findArc(residentDefinitionId: string): ArcDefinition | undefined {
  return arcDefinitions.find((arc) => arc.residentId === residentDefinitionId);
}
