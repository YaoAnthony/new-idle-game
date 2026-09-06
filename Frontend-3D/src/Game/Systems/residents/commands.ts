import {
  COMMAND_SKILL_ID,
  findBlueprintForBuilding,
  findItemDefinition,
  findSkillPriority,
  residentIdOf,
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
import { formatMinute } from "core";
import { routinePlanOf } from "../../State/skills/routine";
import { chatOutlook, resetTalkToday } from "../../State/skills/talk";
import { findExpression } from "core";
import { talkText } from "./talk";
import { describeAffection, gainAffection, setAffection } from "./affection";
import { giveResidentPresent } from "./presents";
import { setResidentAddress } from "./naming";
import { completeFavor, describeFavors, expireFavor, listFavors, makeSick, offerFavor, acceptFavor } from "./favors";
import { describeRelations, forcePairTalk } from "./social";
import { listTalkCandidates, findTalkPool } from "core";
import { evaluateCondition } from "../dialogue";
import { describeSpots, homeDoorstepOf } from "./spots";
import { debugSendToTown, listResidentTrips, tripPlanOf } from "./townTrips";
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
  "/npc <谁> routine   —— 性格、此刻的计划、今天是不是小镇日",
  "/npc <谁> home      —— 立即回家（走到门口、进屋），看窗灯用",
  "/npc <谁> town      —— 立即出发去小镇，十分钟后回",
  "/npc <谁> place <格X> <格Y> —— 瞬移到院子某格（调试：两只叠在一格会互相挡死）",
  "/npc <谁> say <文案键> —— 立即冒一句气泡（口头禅已替换）",
  "/npc <谁> expr <表情id> —— 立即做一个表情",
  "/npc <谁> talk      —— 此刻闲聊池里满足条件的段落和权重、会抽到哪段、今天聊了几次",
  "/npc <谁> memory add|rm <memoryId> —— 调记忆（正式写入口只有剧情效果 add_memory）",
  "/npc <谁> reset-talk —— 今天的聊天次数归零、招呼节流清空",
  "/npc <谁> affection [+N|=N|<来源>] —— 看 / 调好感；来源（greet / chat / gift_loved…）走正式的一天一次那条路",
  "/npc <谁> mood [=N] —— 看 / 调心情",
  "/npc <谁> nickname <文字> / catchphrase <文字> —— 直接改他叫你的昵称 / 他的口头禅（空 = 清掉）",
  "/npc <谁> present —— 立即触发一次「他送你东西」（走过来 → 对话 → 领取面板）",
  "/npc favor list —— 全部委托定义 + 当前状态 + 今天为什么没提出",
  "/npc favor offer|accept|done|expire <favorId> —— 立即提出 / 跳到接受 / 完成 / 过期",
  "/npc <谁> sick [天数] —— 让他病倒（整天在家、窗灯白天也亮）",
  "/npc pair <谁> <谁> —— 立即发起一段双人对话（无视距离，先把两人拉到一起）",
  "/npc relations —— 关系表 + 今天各对聊过几次",
  "/npc <谁> gossip —— 他此刻能讲的八卦段（引用别人记忆 / 昨天事实的闲聊）",
  "/npc spots          —— 当前世界解析出的全部场所和占用",
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
            ...["list", "join", "spots"].map((value) => ({ value })),
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
            } else if (listResidentTrips()[residentIdOf(resident.id)]) {
              const trip = listResidentTrips()[residentIdOf(resident.id)];
              status = `出门了（${trip.kind}，${trip.backAtLocalTime} 回）`;
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

        if (sub === "relations") return ok(["关系：", ...describeRelations()].join("\n"));
        if (sub === "pair") {
          if (isRemoteWorld()) return fail("做客中不能指挥别人的邻居");
          const a = findAgent(args[1]);
          const b = findAgent(args[2]);
          if (!a || !b || a === b) return fail("用法：pair <谁> <谁>（两位都得在场）");
          return forcePairTalk(a, b) ? ok(`${a.residentId} 和 ${b.residentId} 聊起来了`) : fail("聊不起来（没有话可聊的关系，或者一方正忙着不可打断）");
        }
        if (sub === "favor") {
          const op = (args[1] ?? "list").toLowerCase();
          if (op === "list") return ok(["委托：", ...describeFavors()].join("\n"));
          if (isRemoteWorld()) return fail("做客中不能动别人的委托");
          const favorId = args[2] ?? "";
          if (op === "offer") {
            const result = offerFavor(favorId);
            return result === "offered" ? ok(`${favorId} 提出来了`) : fail(`没提成：${result}`);
          }
          if (op === "accept") return acceptFavor(favorId) ? ok(`${favorId} 接下了`) : fail("接不了（不是 offered）");
          if (op === "done") {
            if (listFavors()[favorId]?.state === "offered") acceptFavor(favorId);
            const dialogueId = completeFavor(favorId);
            return dialogueId ? ok(`${favorId} 做完了，该播 ${dialogueId}`) : fail("完不成（不是 accepted，或者背包里没有他要的）");
          }
          if (op === "expire") return expireFavor(favorId) ? ok(`${favorId} 过期了`) : fail("没有挂着的这一条");
          return fail("用法：favor list | offer|accept|done|expire <favorId>");
        }

        if (sub === "spots") {
          const rows = describeSpots();
          return ok(rows.length ? ["场所：", ...rows].join("\n") : "现在一个场所都没有（没有室外椅子、店、井）");
        }

        // ---- /npc <谁> do|skill|skills|where|routine|home|town ----
        const agent = findAgent(args[0]);
        const verb = (args[1] ?? "").toLowerCase();
        if (agent && verb === "where") return ok(describeAgent(agent));
        if (agent && verb === "routine") {
          const info = routinePlanOf(agent);
          if (!info) return ok(`${agent.residentId} 没有性格（不是居民 / 访客），routine 不作声`);
          const trip = tripPlanOf(agent.definitionId);
          const away = listResidentTrips()[agent.residentId];
          return ok([
            `${agent.residentId}：性格 ${info.personality.id}，起 ${formatMinute(info.personality.wakeAt)} 睡 ${formatMinute(info.personality.sleepAt)}`,
            `  现在 ${formatMinute(info.nowMinute)} → 计划 ${JSON.stringify(info.plan)}`,
            trip ? `  小镇：每 ${info.personality.townTripEveryDays} 天一趟，${formatMinute(trip.leaveAt)} 走 ${formatMinute(trip.backAt)} 回` : "  不去小镇",
            away ? `  现在在外面，${away.backAtLocalTime} 回` : "",
          ].filter(Boolean).join("\n"));
        }
        if (agent && verb === "home") {
          if (isRemoteWorld()) return fail("做客中不能指挥别人的邻居");
          const door = homeDoorstepOf(agent.definitionId);
          if (!door) return fail(`${agent.residentId} 没有房子`);
          const near = Math.hypot(agent.x - door.x, agent.z - door.z) <= 1.2;
          agent.perform({
            skillId: COMMAND_SKILL_ID,
            priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
            interruptible: false,
            steps: near ? [{ verb: "hide" }] : [{ verb: "walk_to", x: door.x, z: door.z }, { verb: "hide" }],
          });
          return ok(`${agent.residentId} 回家`);
        }
        if (agent && verb === "gossip") {
          const pool = findTalkPool(agent.definitionId);
          if (!pool) return ok(`${agent.residentId} 没有对话池`);
          const gossip = pool.chats.filter((entry) => (entry.when ?? []).some((c) => c.kind === "neighbor_remembers" || c.kind === "neighbor_fact_yesterday"));
          const rows = listTalkCandidates(gossip, (c) => evaluateCondition(c, agent.residentId)).map(({ entry, weight }) => `  ${entry.dialogueId}（${weight}）`);
          return ok([`${agent.residentId} 此刻能讲的八卦：`, ...(rows.length ? rows : ["  （没有——别人还没发生过值得说的事）"])].join("\n"));
        }
        if (agent && verb === "sick") {
          if (isRemoteWorld()) return fail("做客中不能指挥别人的邻居");
          makeSick(agent, Math.max(1, Number(args[2] ?? 3) || 3));
          return ok(`${agent.residentId} 病到 ${agent.sickUntilDayId}`);
        }
        if (agent && verb === "affection") {
          const arg = args[2];
          if (arg && isRemoteWorld()) return fail("做客中不能改别人邻居的好感");
          if (arg?.startsWith("=")) setAffection(agent.residentId, Number(arg.slice(1)));
          else if (arg?.startsWith("+")) setAffection(agent.residentId, agent.affection + Number(arg.slice(1)));
          else if (arg) {
            const result = gainAffection(agent.residentId, arg);
            if (!result) return fail(`没有这种来源：${arg}`);
            if (result.gained === 0) return ok(`${arg} 今天已经给过了。${describeAffection(agent)}`);
          }
          return ok(describeAffection(agent));
        }
        if (agent && verb === "mood") {
          const arg = args[2];
          if (arg?.startsWith("=")) agent.mood = Math.max(0, Math.min(100, Number(arg.slice(1))));
          return ok(`${agent.residentId}：心情 ${agent.mood.toFixed(0)}`);
        }
        if (agent && (verb === "nickname" || verb === "catchphrase")) {
          if (isRemoteWorld()) return fail("做客中不能改别人的邻居");
          setResidentAddress(agent.residentId, verb, args.slice(2).join(" "));
          return ok(`${agent.residentId}：${verb === "nickname" ? "叫你" : "口头禅"}「${(verb === "nickname" ? agent.playerNickname : agent.catchphrase) ?? "（默认）"}」`);
        }
        if (agent && verb === "present") {
          if (isRemoteWorld()) return fail("做客中不能指挥别人的邻居");
          const short = agent.definitionId.replace(/_neighbor$/, "");
          return giveResidentPresent(agent.residentId, `${short}_gives_present`) ? ok(`${agent.residentId} 来送东西了`) : fail("他没有东西可送（不是居民 / 没有 presents）");
        }
        if (agent && verb === "say") {
          if (!args[2]) return fail("用法：say <文案键> [秒]");
          agent.say(args[2], args[3] ? Number(args[3]) : undefined);
          return ok(`${agent.residentId}：「${talkText(agent.definitionId, args[2])}」`);
        }
        if (agent && verb === "expr") {
          const id = args[2] ?? "";
          if (!findExpression(id)) return fail(`没有这个表情：${id || "(空)"}`);
          agent.showExpression(id);
          return ok(`${agent.residentId}：${id}`);
        }
        if (agent && verb === "talk") {
          const outlook = chatOutlook(agent);
          if (!outlook) return ok(`${agent.residentId} 没有对话池`);
          const rows = outlook.candidates.map(({ entry, weight }) => `  ${entry.dialogueId}（${weight}）${entry.oncePerDay ? " 一天一次" : ""}`);
          return ok([
            `${agent.residentId}：今天聊了 ${outlook.talksToday} 次，记得 ${[...agent.memories].join(" / ") || "（什么都不记得）"}`,
            `  会抽到：${outlook.pick?.dialogueId ?? "（没有能说的）"}`,
            "  候选：",
            ...(rows.length ? rows : ["  （空）"]),
          ].join("\n"));
        }
        if (agent && verb === "memory") {
          const op = (args[2] ?? "").toLowerCase();
          const id = args[3];
          if (!id || (op !== "add" && op !== "rm")) return fail("用法：memory add|rm <memoryId>");
          const changed = op === "add" ? agent.remember(id) : agent.forget(id);
          return ok(`${agent.residentId} ${op === "add" ? "记住了" : "忘了"} ${id}${changed ? "" : "（本来就是这样）"}`);
        }
        if (agent && verb === "reset-talk") {
          resetTalkToday(agent);
          return ok(`${agent.residentId} 今天的账清了`);
        }
        if (agent && verb === "place") {
          if (isRemoteWorld()) return fail("做客中不能指挥别人的邻居");
          const step = parseStep("walk_to", args.slice(2));
          if (typeof step === "string") return fail(step.replace("do walk_to", "place"));
          if (step.verb !== "walk_to") return fail("用法：place <格X> <格Y>");
          agent.debugPlace(step.x, step.z);
          return ok(`${agent.residentId} 放到了 ${step.x.toFixed(1)}, ${step.z.toFixed(1)}`);
        }
        if (agent && verb === "town") {
          if (isRemoteWorld()) return fail("做客中不能指挥别人的邻居");
          return debugSendToTown(agent.definitionId) ? ok(`${agent.residentId} 去小镇了，十分钟后回`) : fail("没走成");
        }
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

        // 认识这位、但人不在场：出门了就说出门了，别答"不认识的子命令"
        const species = findSpecies(args[0]);
        if (species) {
          const trip = listResidentTrips()[residentIdOf(species.id)];
          if (trip) return fail(`${shortName(species.id)} 出门了（${trip.kind}），${trip.backAtLocalTime} 回来`);
          return fail(`${shortName(species.id)} 现在不在场`);
        }

        return fail(`不认识的子命令：${sub}\n${USAGE}`);
      },
    }),
  ];
}
