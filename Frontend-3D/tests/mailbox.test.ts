import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, affectionTuning, mailTuning, residentIdOf } from "core";
import { restoreBuildings } from "../src/Game/State/buildings";
import { addItem, getCount, getSelectedStack, replaceCounts, setSelectedStack } from "../src/Game/State/inventory";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { end, evaluateCondition, getActiveDialogue, startDialogue } from "../src/Game/Systems/dialogue";
import { fireStoryRuleById, getSignalCounts, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, signal, startStorySystem } from "../src/Game/Systems/story";
import { claimUnpack, dismissUnpack, getPendingUnpack } from "../src/Game/Systems/unpack";
import { resetAffectionLedger, setAffection, startAffectionSystem } from "../src/Game/Systems/residents/affection";
import { setTalkClockSource, type TalkClock } from "../src/Game/Systems/residents/talk";
import { leaveForTown, restoreResidentTrips, setTripsClockSource } from "../src/Game/Systems/residents/townTrips";
import { chatOutlook } from "../src/Game/State/skills/talk";
import {
  claimAttachment,
  clearMailbox,
  deliverLetter,
  deliverScheduled,
  letterReplyPending,
  letterText,
  listLetters,
  listOutbox,
  mailboxFull,
  openLetter,
  processOutbox,
  restoreMailbox,
  sendResidentLetter,
  setMailClockSource,
  snapshotMailbox,
  startMailSystem,
  unreadCount,
  writeLetter,
} from "../src/Game/Systems/mail";

/**
 * 居民系统 10 · 信箱：自发信按条件抽 + 节流 + once、满箱不寄、剧情信、拆信信号 → 规则加好感、附件收下才入包、
 * 明信片第二天到、你写的信次日走送礼判定 + 他当面提、存档往返、做客只读。
 */
const SLIME = residentIdOf("slime_neighbor");
let stops: Array<() => void> = [];
let clock = { minuteOfDay: 9 * 60, worldDayId: "2026-09-06" };
const HOUSE = { instanceId: "h1", buildingId: "slime_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" };

function day(worldDayId: string) {
  clock = { ...clock, worldDayId };
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([HOUSE]);
  restoreResidents({});
  restoreResidentTrips(undefined);
  replaceCounts({});
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  dismissUnpack();
  clearMailbox();
  resetAffectionLedger();
  removeResident(SLIME);
  invalidateNavGrid();
  clock = { minuteOfDay: 9 * 60, worldDayId: "2026-09-06" };
  setMailClockSource(() => clock);
  setTripsClockSource(() => clock);
  setTalkClockSource((): TalkClock => ({ worldDayId: clock.worldDayId, phase: "day" }));
  stops.push(startStorySystem(false), startAffectionSystem(), startMailSystem());
});

afterEach(() => {
  if (getActiveDialogue()) end();
  for (const stop of stops) stop();
  stops = [];
  setMailClockSource(null);
  setTripsClockSource(null);
  setTalkClockSource(null);
  dismissUnpack();
  clearMailbox();
  removeResident(SLIME);
});

test("mail_自发信_条件抽_附件从presents挑_每几天一封_once不重寄", () => {
  const slime = spawnResident(SLIME, "slime_neighbor");
  setAffection(SLIME, affectionTuning.stageThresholds.familiar_resident);
  const first = sendResidentLetter(SLIME)!;
  expect(first).toBeDefined();
  expect(first.fromResidentId).toBe("slime_neighbor");
  expect(["tomato", "egg", "cheese"]).toContain(first.attach?.itemId);
  expect(getSignalCounts()[`letter_received|${first.letterId}`]).toBe(1);
  expect(unreadCount()).toBe(1);
  // 同一位隔天不再写（everyDays）
  day("2026-09-07");
  expect(sendResidentLetter(SLIME)).toBeNull();
  day("2026-09-10");
  expect(sendResidentLetter(SLIME)).toBeDefined();
  // once：谢委托那封只寄一次
  slime.remember("favor_slime_lamp");
  day("2026-09-14");
  const thanks = sendResidentLetter(SLIME);
  day("2026-09-18");
  const again = sendResidentLetter(SLIME);
  if (thanks?.letterId === "slime_thanks_favor") expect(again?.letterId).not.toBe("slime_thanks_favor");
  // 规则链：池里的规则点火 → 效果 → 信到
  clearMailbox();
  day("2026-09-30");
  expect(fireStoryRuleById("mail_slime_neighbor")).toBe("fired");
  expect(listLetters().length).toBe(1);
});

test("mail_拆信发信号_规则加好感_附件收下才入包_房客看不到收下", () => {
  spawnResident(SLIME, "slime_neighbor");
  setAffection(SLIME, affectionTuning.stageThresholds.familiar_resident);
  const letter = sendResidentLetter(SLIME)!;
  const before = getResident(SLIME)!.affection;
  expect(openLetter(letter.id)).toBe(true);
  expect(openLetter(letter.id)).toBe(false);
  expect(getSignalCounts()[`letter_opened|${letter.letterId}`]).toBe(1);
  expect(getResident(SLIME)!.affection).toBe(before + affectionTuning.gains.letter);
  // 附件：拆了还在信里，收下才经领取面板入包
  const itemId = letter.attach!.itemId;
  expect(getCount(itemId)).toBe(0);
  expect(claimAttachment(letter.id)).toBe(true);
  expect(getPendingUnpack()?.localizationKey).toBe("loot.letter_attachment");
  claimUnpack();
  expect(getCount(itemId)).toBe(1);
  expect(listLetters()[0].attach).toBeUndefined();
  expect(letterText(letter)).toContain("咕噜");
  // 做客：只读
  setRemoteWorldActive(true);
  expect(claimAttachment(letter.id)).toBe(false);
  expect(deliverLetter("witch_first")).toBeNull();
  expect(writeLetter("slime_neighbor", mailTuning.playerTemplates[0], false)).toBeNull();
  setRemoteWorldActive(false);
});

test("mail_剧情信_满箱不寄_明信片第二天到", () => {
  spawnResident(SLIME, "slime_neighbor");
  const witch = deliverLetter("witch_first")!;
  expect(witch.fromResidentId).toBeUndefined();
  expect(letterText(witch)).toContain("学徒");
  for (let i = listLetters().length; i < mailTuning.boxCapacity; i += 1) deliverLetter("witch_first");
  expect(mailboxFull()).toBe(true);
  expect(deliverLetter("witch_first")).toBeNull();
  clearMailbox();

  // 09 的多日出门 → resident_away → 明信片排在明天
  expect(leaveForTown(SLIME, 8 * 60, "hometown", "2026-09-09")).toBe(true);
  expect(listLetters().length).toBe(0);
  expect(deliverScheduled()).toBe(0);
  day("2026-09-07");
  expect(deliverScheduled()).toBe(1);
  const postcard = listLetters()[0];
  expect(postcard.letterId).toBe("postcard_hometown");
  expect(postcard.fromResidentId).toBe("slime_neighbor");
  // 去小镇当天往返的不寄
  clearMailbox();
  spawnResident(SLIME, "slime_neighbor");
  leaveForTown(SLIME, 17 * 60);
  day("2026-09-08");
  expect(deliverScheduled()).toBe(0);
});

test("mail_你写的信_夹的东西次日走送礼判定_他当面提_说完清掉", () => {
  const slime = spawnResident(SLIME, "slime_neighbor");
  setAffection(SLIME, affectionTuning.stageThresholds.familiar_resident);
  addItem("tomato", 1);
  setSelectedStack({ itemId: "tomato", count: 1 });
  expect(getSelectedStack()?.itemId).toBe("tomato");
  const out = writeLetter("slime_neighbor", mailTuning.playerTemplates[1], true)!;
  expect(out.attach?.itemId).toBe("tomato");
  expect(getCount("tomato")).toBe(0); // 写信那一拍就离开背包
  expect(listOutbox().length).toBe(1);
  expect(getSignalCounts()["letter_written|slime_neighbor"]).toBe(1);
  expect(letterReplyPending("slime_neighbor")).toBe(false);

  day("2026-09-07");
  expect(processOutbox()).toBe(1);
  expect(listOutbox().length).toBe(0);
  expect(letterReplyPending("slime_neighbor")).toBe(true);
  expect(evaluateCondition({ kind: "letter_replied_pending" }, SLIME)).toBe(true);
  // 夹的番茄走了口味判定：四档信号发了
  expect(Object.keys(getSignalCounts()).some((key) => key.startsWith("resident_gift_received|slime_neighbor:"))).toBe(true);
  // 下次见面：闲聊池必抽回应那段；说完清掉
  expect(chatOutlook(slime)?.pick?.dialogueId).toBe("slime_chat_replied_letter");
  startDialogue("slime_chat_replied_letter", SLIME);
  end();
  expect(letterReplyPending("slime_neighbor")).toBe(false);
  void signal;
});

test("mail_人不在场的信留到他回来_存档往返", () => {
  spawnResident(SLIME, "slime_neighbor");
  writeLetter("slime_neighbor", mailTuning.playerTemplates[0], false);
  removeResident(SLIME);
  day("2026-09-07");
  expect(processOutbox()).toBe(0);
  expect(listOutbox().length).toBe(1);
  deliverLetter("witch_first");
  const saved = snapshotMailbox();
  expect(saved?.letters.length).toBe(1);
  expect(saved?.outbox.length).toBe(1);
  clearMailbox();
  expect(listLetters()).toEqual([]);
  restoreMailbox(saved);
  expect(listLetters().length).toBe(1);
  expect(listOutbox().length).toBe(1);
});
