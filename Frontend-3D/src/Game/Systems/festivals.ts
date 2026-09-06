import { festivalDefinitions, festivalTuning, findFestivalDefinition, listResidentDefinitions, residentIdOf, type FestivalDefinition } from "core";
import { isRemoteWorld } from "../Multiplayer/worldLock";
import { getFlag, setFlag } from "./flags";
import { setDecoration } from "./residents/porch";

/**
 * 节日（居民系统 11）——居民系统这边只保证"节日定义出现时居民会参加"：进行中 = 旗子 festival_active，
 * 作息 / 对话 / 装饰全读它（birthday.routineOverrideFor、池子的 talkCondition、porch.decoration）。
 * 按日期立 / 拔是规则（Core Data/story）的事；这里是强制开始 / 结束的调试口。
 */
export function activeFestival(): FestivalDefinition | null {
  const id = getFlag(festivalTuning.flag);
  return id ? findFestivalDefinition(id) ?? null : null;
}

export function startFestival(festivalId: string): boolean {
  if (isRemoteWorld()) return false;
  const festival = findFestivalDefinition(festivalId);
  if (!festival) return false;
  setFlag(festivalTuning.flag, festival.id);
  if (festival.residents.decoration) {
    for (const definition of listResidentDefinitions()) setDecoration(residentIdOf(definition.id), festival.residents.decoration);
  }
  return true;
}

export function endFestival(): boolean {
  if (isRemoteWorld() || !getFlag(festivalTuning.flag)) return false;
  setFlag(festivalTuning.flag, null);
  for (const definition of listResidentDefinitions()) setDecoration(residentIdOf(definition.id), null);
  return true;
}

export function listFestivals(): readonly FestivalDefinition[] {
  return festivalDefinitions;
}
