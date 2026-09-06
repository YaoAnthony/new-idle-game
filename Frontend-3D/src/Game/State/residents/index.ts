import type { ResidentSave } from "core";
import { ResidentAgent } from "../residentAgent";
import { resolveSkills } from "../skills/index";
import { CoinDragon } from "./dragon";
import { FishTrader } from "./fishTrader";
import { Fox } from "./fox";
import { Golem } from "./golem";
import { Otter } from "./otter";
import { Shushu } from "./shushu";
import { Slime } from "./slime";
import { Spirit } from "./spirit";
import { Wisp } from "./wisp";

/**
 * 工厂：definitionId → 子类（居民系统 01）。
 *
 * **一个基类，每种小动物一个子类**（用户 2026-09-05 定）。子类只声明技能表和
 * 少数钩子；这张表是"这个 definitionId 是哪一种动物"的唯一答案。
 *
 * 表里没有的 definitionId 用基类兜底，挂宠物那三样（`FALLBACK_SKILLS`）——
 * 加新动物忘了登记时它还能走路、吃饭，content 测试会点名"没有对应子类"。
 */
type ResidentClass = typeof ResidentAgent;

const CLASS_OF: Record<string, ResidentClass> = {
  moss_wisp: Wisp,
  foam_wisp: Wisp,
  ember_wisp: Wisp,
  shushu: Shushu,
  slime_neighbor: Slime,
  fox_neighbor: Fox,
  spirit_neighbor: Spirit,
  stone_golem: Golem,
  otter_trader: Otter,
  fish_trader: FishTrader,
  coin_dragon: CoinDragon,
};

/** 没登记的动物按宠物过日子 */
export const FALLBACK_SKILLS: readonly string[] = ["needs", "nap", "approach", "wander"];

export function residentClassOf(definitionId: string): ResidentClass | undefined {
  return CLASS_OF[definitionId];
}

export function createResident(
  residentId: string,
  definitionId: string,
  at: { x: number; z: number; heading: number },
): ResidentAgent {
  const Klass = CLASS_OF[definitionId] ?? ResidentAgent;
  const ids = Klass === ResidentAgent ? FALLBACK_SKILLS : Klass.skills;
  return new Klass(residentId, definitionId, at, resolveSkills(ids));
}

export function createResidentFromSave(entry: ResidentSave): ResidentAgent {
  const agent = createResident(entry.residentId, entry.definitionId, {
    x: entry.position.x,
    z: entry.position.y,
    heading: entry.position.heading,
  });
  agent.applySave(entry);
  return agent;
}
