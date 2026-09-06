import assert from "node:assert/strict";
import { test } from "node:test";
import { auditStoryContent } from "../src/logic/storyAudit.js";
import { arcDefinitions, findArc } from "../src/Data/residents/arcs.js";
import { findEventDefinition } from "../src/Data/events/index.js";
import { favorDefinitions, findFavorDefinition } from "../src/Data/residents/favors.js";
import { storyRules } from "../src/Data/story/index.js";
import { findLetterDefinition } from "../src/Data/residents/letters.js";
import { dialogueDefinitions } from "../src/Data/dialogues/index.js";
import { talkPools } from "../src/Data/residents/talk/index.js";
import { triggerMatches, type StoryContext } from "../src/logic/storyTriggers.js";

/** 居民系统 13：三条线目录 ↔ 事件 ↔ 规则对得上、审计干净、委托三种新口、幕后段挂在对的阶段、幕序靠 requiresEventStage 卡住 */

test("arcs_审计干净_每一幕有规则写_目录和事件一致", () => {
  const problems = auditStoryContent().filter((line) => line.includes("个人线") || line.includes("offer_favor") || line.includes("event_stage"));
  assert.deepEqual(problems, []);
  for (const arc of arcDefinitions) {
    const event = findEventDefinition(arc.eventId)!;
    assert.deepEqual(arc.steps.map((step) => step.stageId), event.stages.map((stage) => stage.stageId));
    for (const step of arc.steps) assert.ok(storyRules.some((rule) => rule.id === step.ruleId), step.ruleId);
  }
  assert.equal(findArc("spirit_neighbor")?.steps.length, 4);
  assert.equal(findArc("otter_trader"), undefined);
});

test("arcs_三条新委托_escort有场所_plant有半径_deliver有目的地图_都不进抽签", () => {
  const walk = findFavorDefinition("slime_walk_to_well")!;
  assert.equal(walk.kind, "escort");
  assert.equal(walk.escortTo, "water");
  const plant = findFavorDefinition("spirit_plant_near_home")!;
  assert.equal(plant.kind, "plant");
  assert.equal(plant.plantedNear?.radius, 6);
  const deliver = findFavorDefinition("fox_deliver_town")!;
  assert.equal(deliver.toMap, "town");
  assert.equal(deliver.to, undefined);
  for (const favor of favorDefinitions.filter((entry) => ["slime_walk_to_well", "fox_deliver_town", "spirit_plant_near_home"].includes(entry.id))) {
    assert.equal(favor.weight, 0, `${favor.id} 会被抽签抽到`);
    assert.ok(favor.requires?.some((condition) => condition.kind === "event_stage"), `${favor.id} 没卡在阶段上`);
  }
  // 灯的委托从此卡在"说过怕黑"之后
  assert.ok(findFavorDefinition("slime_wants_lamp")!.requires!.some((condition) => condition.kind === "event_stage" && condition.stageId === "afraid_of_dark"));
  assert.ok(findLetterDefinition("witch_from_town")?.onOpened?.some((effect) => effect.kind === "set_event_stage" && effect.stageId === "done"));
  assert.equal(findLetterDefinition("witch_from_town")?.residentId, undefined, "那封信不该有寄件人");
});

test("arcs_幕后段_每幕三段挂在event_stage上_对话都登记了", () => {
  for (const [who, stages] of [["slime", ["afraid_of_dark", "lamp_lit", "done"]], ["fox", ["wants_shortcut", "delivered_to_town", "brought_letter"]], ["spirit", ["asked_to_plant", "planted", "taught_chimes"]]] as const) {
    const pool = (talkPools as readonly { residentId: string; chats: Array<{ dialogueId: string; when?: Array<{ kind: string; eventId?: string; stageId?: string }> }> }[]).find((entry) => entry.residentId === `${who}_neighbor`)!;
    for (const stage of stages) {
      const entries = pool.chats.filter((chat) => chat.when?.some((condition) => condition.kind === "event_stage" && condition.eventId === `arc_${who}` && condition.stageId === stage));
      assert.ok(entries.length >= 3, `${who} 的 ${stage} 只有 ${entries.length} 段`);
      for (const entry of entries) assert.ok(dialogueDefinitions.some((dialogue) => dialogue.id === entry.dialogueId), entry.dialogueId);
    }
  }
  assert.ok(dialogueDefinitions.find((dialogue) => dialogue.id === "slime_opens_up")?.nodes.n5.emitEventId === "slime_arc_done");
});

test("arcs_幕序_好感先到档也不会跳幕_前一幕立了次日才补", () => {
  const rule = storyRules.find((entry) => entry.id === "arc_slime_opens_up")!;
  const base: StoryContext = {
    worldDayId: "2026-09-06",
    weatherId: "sunny",
    itemCounts: {},
    signalCounts: {},
    eventStage: () => "afraid_of_dark",
    isFeatureUnlocked: () => false,
    affectionStage: () => "family",
    holds: () => true,
  };
  const signal = { kind: "day_started" as const };
  assert.equal(triggerMatches(rule.triggers[0], signal, base), false, "灯还没亮就到家人档：不该开口");
  assert.equal(triggerMatches(rule.triggers[0], signal, { ...base, eventStage: () => "lamp_lit" }), true);
  assert.equal(triggerMatches(rule.triggers[0], signal, { ...base, eventStage: () => "lamp_lit", affectionStage: () => "life_companion" }), false);
});
