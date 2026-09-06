import {
  BIRTHDAY_FRIEND_ROUTINE,
  BIRTHDAY_ROUTINE,
  birthdayFriendOf,
  birthdayTuning,
  daysUntilBirthday,
  findFestivalDefinition,
  findResidentDefinition,
  festivalTuning,
  isBirthdayOn,
  type RoutineInput,
} from "core";
import { on } from "../../EventBus";
import { getClock } from "../../State/clock";
import { getResidents } from "../../State/residentsRuntime";
import { getFlag } from "../flags";

/**
 * 生日（居民系统 11）。日期在居民定义上，按**世界日**的月日比；流程全是规则（Core `Data/story`），
 * 这里只有三件事：条件怎么求值（今天是不是谁的生日、你的生日）、作息覆盖（寿星整天在家、朋友整天陪着）、
 * 调试口 `/npc <谁> birthday`（把今天临时当成他的生日，不进存档）。
 */
let clockSource: () => { worldDayId: string } = () => ({ worldDayId: getClock().worldDayId });
export function setBirthdayClockSource(source: (() => { worldDayId: string }) | null): void {
  clockSource = source ?? (() => ({ worldDayId: getClock().worldDayId }));
}

/** 调试：今天临时当成这几位的生日（运行时，刷新就没） */
const forced = new Set<string>();
export function forceBirthdayToday(definitionId: string, on = true): void {
  if (on) forced.add(definitionId);
  else forced.delete(definitionId);
}
export function clearForcedBirthdays(): void {
  forced.clear();
}

/** 你的生日（"MM-DD"，可空）。进 PlayerSave.birthday */
let playerBirthday: string | undefined;
export function getPlayerBirthday(): string | undefined {
  return playerBirthday;
}
export function setPlayerBirthday(value: string | undefined): void {
  playerBirthday = value && /^\d\d-\d\d$/.test(value) ? value : undefined;
}

export function isResidentBirthdayToday(definitionId: string): boolean {
  if (forced.has(definitionId)) return true;
  return isBirthdayOn(findResidentDefinition(definitionId)?.birthday, clockSource().worldDayId);
}

export function daysToBirthday(definitionId: string): number | null {
  const birthday = findResidentDefinition(definitionId)?.birthday;
  return birthday ? daysUntilBirthday(birthday, clockSource().worldDayId) : null;
}

export function isPlayerBirthdayToday(): boolean {
  return isBirthdayOn(playerBirthday, clockSource().worldDayId);
}

/** 今天的寿星（旗子；规则早上立的） */
export function birthdayResidentToday(): string | undefined {
  return getFlag(birthdayTuning.flag);
}

/**
 * 今天这位的作息覆盖：寿星整天在家；寿星的朋友整天去寿星门口；节日进行中按节日表。
 * 只读旗子（规则早上立的），不自己判日期——两边一致靠这一点。
 */
export function routineOverrideFor(definitionId: string): RoutineInput["override"] | undefined {
  const star = birthdayResidentToday();
  if (star === definitionId) return { segments: BIRTHDAY_ROUTINE };
  if (star && birthdayFriendOf(star) === definitionId) return { segments: BIRTHDAY_FRIEND_ROUTINE, visitOwner: star };
  const festivalId = getFlag(festivalTuning.flag);
  const festival = festivalId ? findFestivalDefinition(festivalId) : undefined;
  if (festival?.residents.routineOverride) return { segments: festival.residents.routineOverride };
  return undefined;
}

let detach: (() => void) | null = null;

/**
 * 旗子一变（谁的生日 / 哪个节日）作息表就换了：把每位正在做的作息打断，下一拍按新表重下。
 * 不打断的话正在坐的那一小时谁也抢不掉——同优先级不互抢（身体那层的规矩）。
 */
export function startRoutineOverrideWatch(): () => void {
  if (detach) return detach;
  const off = on("flags_changed", () => {
    for (const agent of getResidents()) if (!agent.puppet) agent.interruptIntentOf("routine");
  });
  detach = () => {
    off();
    detach = null;
  };
  return detach;
}
