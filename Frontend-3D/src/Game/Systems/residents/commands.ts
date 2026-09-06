import {
  COMMAND_SKILL_ID,
  findBlueprintForBuilding,
  findItemDefinition,
  findSkillPriority,
  roomCellToWorld,
} from "core";
import { registerCommand, type CommandResult } from "../../CommandLine/commands";
import { listBuildings } from "../../State/buildings";
import { getCount } from "../../State/inventory";
import { getResidents } from "../../State/residentsRuntime";
import { ACTION_VERBS, type ActionStep } from "../../State/actions";
import type { ResidentAgent } from "../../State/residentAgent";
import { getCurrentMap, getRoom } from "../../State/worldRuntime";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { listResidentSpecies } from "./moveIn";
import { getPendingUnpack, presentItems } from "../unpack";
import { t } from "../../../i18n/t";

/**
 * `/npc` 命令组：居民入住这条链的**委托入口**（2026-09-04，用户定）。
 *
 * `/npc join <物种>` 做的只有一件事：把他的房屋图纸经由领取面板交给你。
 * 之后是玩家自己的事——找地方放图纸落工地、石傀儡来建、完工那一刻
 * 他从领地入口走进来（`Systems/residents`）。以后正式的"NPC 来信说
 * 我要入住、委托你选址"接在这条指令前面，指令本身就是那封信的最后一步。
 *
 * 不复用 `/rule resident_*_arrives`：那是剧情路（人先到、当面给图纸），
 * 而且 once 规则点过一次就不能重来。这条指令是"随时能再发一次图纸"的
 * 调试口，图纸弄丢了也能补。
 */

/** 物种参数：接受完整 id（slime_neighbor）也接受简称（slime） */
function findSpecies(arg: string | undefined) {
  if (!arg) return undefined;
  const key = arg.toLowerCase();
  return listResidentSpecies().find(
    (resident) => resident.id === key || shortName(resident.id) === key,
  );
}

function shortName(definitionId: string): string {
  return definitionId.replace(/_neighbor$/, "");
}

/** 这位居民的房子在场上吗（成品或工地都算：图纸已经用掉了） */
function houseOnGround(buildingId: string): boolean {
  return listBuildings().some((item) => item.buildingId === buildingId);
}

const USAGE = [
  "/npc list           —— 谁有房子、谁住下了、谁的图纸还在你包里",
  "/npc join <物种>    —— 收到他的房屋图纸（领取面板）。放到地上、盖好，他就来",
  "/npc <谁> do <动词> [参数] —— 直接下达一个动词，立即生效：walk_to <格X> <格Y> | stand [秒] | sit | sleep [秒] | hide | show | gesture <id> | speak <文案键> [秒]",
  "/npc <谁> skill <id> on|off —— 开关一个技能（运行时，不进存档）",
  "/npc <谁> skills    —— 挂了哪些技能、哪个在决策",
  "/npc <谁> where     —— 在哪、在做什么、Intent 来自谁",
].join("\n");

/**
 * `<谁>`：简称（slime / golem / otter）、完整 definitionId、或运行时 id。
 * 石傀儡和水獭也是 Resident，同样能点名。
 */
function findAgent(arg: string | undefined): ResidentAgent | undefined {
  if (!arg) return undefined;
  const key = arg.toLowerCase();
  return getResidents().find((agent) => {
    if (agent.residentId === key || agent.definitionId === key) return true;
    if (shortName(agent.definitionId) === key) return true;
    // definitionId 的任一段也算：stone_golem → golem、otter_trader → otter、coin_dragon → dragon
    return agent.definitionId.split("_").includes(key);
  });
}

/** 把 `/npc x do walk_to 20 20` 的尾巴翻成一个动词。翻不出来返回错误文案 */
function parseStep(verb: string, args: string[]): ActionStep | string {
  switch (verb) {
    case "walk_to": {
      const gx = Number(args[0]);
      const gy = Number(args[1]);
      if (!Number.isInteger(gx) || !Number.isInteger(gy)) return "用法：do walk_to <格X> <格Y>（院子格号）";
      // 院子格号 → 世界坐标：格子属于院子那间"房"，换算走 Core 的 roomAnchor（禁手写 halfW）
      const yard = getRoom(getCurrentMap().outdoorRoomId);
      if (!yard) return "这张图没有院子";
      const world = roomCellToWorld(yard, gx, gy);
      return { verb: "walk_to", x: world.x, z: world.z };
    }
    case "stand": {
      const seconds = args[0] === undefined ? undefined : Number(args[0]);
      if (seconds !== undefined && !(seconds >= 0)) return "用法：do stand [秒]";
      return { verb: "stand", seconds };
    }
    case "sit":
      return { verb: "sit" };
    case "sleep": {
      const seconds = args[0] === undefined ? undefined : Number(args[0]);
      if (seconds !== undefined && !(seconds > 0)) return "用法：do sleep [秒]";
      return { verb: "sleep", seconds };
    }
    case "hide":
      return { verb: "hide" };
    case "show":
      return { verb: "show" };
    case "gesture":
      return args[0] ? { verb: "gesture", gestureId: args[0] } : "用法：do gesture <id>";
    case "speak":
      return args[0]
        ? { verb: "speak", localizationKey: args[0], seconds: args[1] ? Number(args[1]) : undefined }
        : "用法：do speak <文案键> [秒]";
    default:
      return `没有这个动词：${verb}。可选：${ACTION_VERBS.join(" / ")}`;
  }
}

function describeAgent(agent: ResidentAgent): string {
  const intent = agent.currentIntent;
  const step = intent?.steps[agent.currentStepIndex];
  return [
    `${agent.residentId}（${agent.definitionId}）`,
    `  位置 ${agent.x.toFixed(1)}, ${agent.z.toFixed(1)} 朝向 ${agent.heading.toFixed(2)} 驻地 ${agent.homeX.toFixed(1)}, ${agent.homeZ.toFixed(1)}`,
    `  状态 ${agent.state}${agent.moving ? "（走路中）" : ""}`,
    intent
      ? `  Intent 来自 ${intent.skillId}（优先级 ${intent.priority}${intent.interruptible ? "，可打断" : "，不可打断"}）第 ${agent.currentStepIndex + 1}/${intent.steps.length} 步：${step ? JSON.stringify(step) : "-"}`
      : `  没有 Intent，${agent.idleTimer.toFixed(1)} 秒后再问技能`,
  ].join("\n");
}

export function registerResidentCommands(): Array<() => void> {
  const ok = (message: string): CommandResult => ({ ok: true, message });
  const fail = (message: string): CommandResult => ({ ok: false, message });

  return [
    registerCommand({
      name: "npc",
      usage: "npc <list|join <物种>|<谁> do|skill|skills|where …>",
      description: "居民入住：/npc join <物种> 拿到他的房屋图纸，盖好他就搬来",
      arguments: [
        {
          name: "动作或谁",
          suggest: () => [
            ...["list", "join"].map((value) => ({ value })),
            ...getResidents().map((agent) => ({ value: shortName(agent.definitionId), description: agent.residentId })),
          ],
        },
        {
          name: "物种",
          suggest: () =>
            listResidentSpecies().map((resident) => ({
              value: shortName(resident.id),
              description: t(resident.localizationKey),
            })),
        },
      ],
      handler: (args) => {
        const sub = (args[0] ?? "").toLowerCase();
        if (!sub) return ok(USAGE);

        if (sub === "list") {
          const pets = getResidents();
          const rows = listResidentSpecies().map((resident) => {
            const buildingId = resident.residence!.buildingId;
            const blueprint = findBlueprintForBuilding(buildingId);
            const present = pets.find((item) => item.definitionId === resident.id);
            let status: string;
            if (present) {
              // 驻地和现在站的位置一起打：'搬没搬进去'唯一看得见的证据是驻地，
              // '到没到'看的是现在在哪（还在从桥头往家走的路上 = 两个数不一样）
              status =
                `在场（驻地 ${present.homeX.toFixed(1)}, ${present.homeZ.toFixed(1)}；` +
                `现在在 ${present.x.toFixed(1)}, ${present.z.toFixed(1)}）`;
            } else if (houseOnGround(buildingId)) {
              status = "房子在场上，人还没到";
            } else if (blueprint && getCount(blueprint.id) > 0) {
              status = "图纸在你包里";
            } else {
              status = "还没来";
            }
            return `  ${shortName(resident.id)}（${t(resident.localizationKey)}）：${buildingId} —— ${status}`;
          });
          return ok(["居民：", ...rows].join("\n"));
        }

        if (sub === "join") {
          const species = findSpecies(args[1]);
          if (!species) {
            const names = listResidentSpecies().map((resident) => shortName(resident.id));
            return fail(`没有这位居民：${args[1] ?? "(空)"}。可选：${names.join(" / ")}`);
          }
          const buildingId = species.residence!.buildingId;
          const blueprint = findBlueprintForBuilding(buildingId);
          if (!blueprint) return fail(`${species.id} 的房型 ${buildingId} 没有图纸物品`);
          const name = t(species.localizationKey);

          const present = getResidents().some((resident) => resident.definitionId === species.id);
          if (present && houseOnGround(buildingId)) return fail(`${name} 已经住下了`);
          if (houseOnGround(buildingId)) {
            return fail(`${name} 的房子已经在场上了，盖好他就来`);
          }
          if (getCount(blueprint.id) > 0) {
            const itemName = t(findItemDefinition(blueprint.id)!.localizationKey);
            return fail(`图纸已经在你包里：${itemName}`);
          }
          if (getPendingUnpack()) return fail("先把手上那批东西收下");

          presentItems("loot.residence_blueprint", [{ itemId: blueprint.id, quantity: 1 }]);
          return ok(`${name} 托人送来了图纸。放到地上、盖好，他就搬来`);
        }

        // ---- /npc <谁> do|skill|skills|where ----
        const agent = findAgent(args[0]);
        const verb = (args[1] ?? "").toLowerCase();
        if (agent && verb === "where") return ok(describeAgent(agent));
        if (agent && verb === "skills") {
          const rows = agent.skills.map((skill) => {
            const priority = findSkillPriority(skill.id)?.priority ?? 0;
            const enabled = agent.isSkillEnabled(skill.id);
            const active = agent.currentIntent?.skillId === skill.id ? " ← 在决策" : "";
            return `  ${skill.id}（${priority}）${enabled ? "" : " [关]"}${active}`;
          });
          return ok([`${agent.residentId} 的技能：`, ...rows].join("\n"));
        }
        // 做客中：场上的是房主的邻居，房客不能指挥（他们是木偶，只听房主的）
        if (agent && (verb === "skill" || verb === "do") && isRemoteWorld()) {
          return fail("做客中不能指挥别人的邻居");
        }
        if (agent && verb === "skill") {
          const id = args[2];
          const toggle = (args[3] ?? "").toLowerCase();
          if (!id || !agent.skills.some((skill) => skill.id === id)) {
            return fail(`他没有技能 ${id ?? "(空)"}。有：${agent.skills.map((skill) => skill.id).join(" / ")}`);
          }
          if (toggle !== "on" && toggle !== "off") return fail("用法：skill <id> on|off");
          agent.setSkillEnabled(id, toggle === "on");
          return ok(`${agent.residentId} 的 ${id} 已${toggle === "on" ? "开" : "关"}`);
        }
        if (agent && verb === "do") {
          const step = parseStep((args[2] ?? "").toLowerCase(), args.slice(3));
          if (typeof step === "string") return fail(step);
          if (step.verb === "gesture" || step.verb === "speak") {
            agent.performParallel(step);
            return ok(`${agent.residentId}：${step.verb}`);
          }
          const accepted = agent.perform({
            skillId: COMMAND_SKILL_ID,
            priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
            interruptible: false,
            steps: [step],
          });
          if (!accepted) return fail("没接受（指令应该无视一切——这是 bug）");
          // walk_to 排不出路时 perform 会当场作废
          if (step.verb === "walk_to" && !agent.isMovingSomewhere()) return fail(`${agent.residentId} 走不到那儿`);
          return ok(`${agent.residentId}：${step.verb}`);
        }
        if (agent) return fail(`不认识的动作：${verb}\n${USAGE}`);

        return fail(`不认识的子命令：${sub}\n${USAGE}`);
      },
    }),
  ];
}
