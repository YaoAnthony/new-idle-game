import {
  COMMAND_SKILL_ID,
  findBlueprintForBuilding,
  findItemDefinition,
  findResidentDefinition,
  findSkillPriority,
  residentIdOf,
  roomCellToWorld,
  mailTuning,
} from "core";
import { registerCommand, type CommandResult } from "../../CommandLine/commands";
import { listBuildings } from "../../State/buildings";
import { listDoors } from "../../State/doorsRuntime";
import { emit } from "../../EventBus";
import { clearMailbox, deliverLetter, listLetters, listOutbox, processOutbox, writeLetter } from "../mail";
import { forceBirthdayToday, getPlayerBirthday, setPlayerBirthday } from "./birthday";
import { activeFestival, endFestival, listFestivals, startFestival } from "../festivals";
import { listFlags, setFlag } from "../flags";
import { fireStoryRuleById } from "../story";
import { getCount } from "../../State/inventory";
import { getResidents } from "../../State/residentsRuntime";
import { ACTION_VERBS, type ActionStep } from "../../State/actions";
import type { ResidentAgent } from "../../State/residentAgent";
import { getCurrentMap, getRoom, isWalkable } from "../../State/worldRuntime";
import { findRoute } from "../navigation";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { formatMinute, residentDefinitions } from "core";
import { routinePlanOf } from "../../State/skills/routine";
import { chatOutlook, resetTalkToday } from "../../State/skills/talk";
import { findExpression } from "core";
import { talkText } from "./talk";
import { describeAffection, gainAffection, setAffection } from "./affection";
import { giveResidentPresent } from "./presents";
import { setResidentAddress } from "./naming";
import { completeFavor, describeFavors, expireFavor, listFavors, makeSick, offerFavor, acceptFavor } from "./favors";
import { describeRelations, forcePairTalk } from "./social";
import { forceVisit, houseCommentKeysFor, houseSnapshot, playerIndoors, visitInProgress } from "./visits";
import { clearPorch, listPorch, placeOnPorch, setNamePlate } from "./porch";
import { clearInterior, listInteriors, placeInInterior } from "./interiors";
import { homeSteps } from "../../State/skills/routine";
import { evaluateHouseComments } from "core";
import { listTalkCandidates, findTalkPool } from "core";
import { evaluateCondition } from "../dialogue";
import { describeSpots, homeSpotOf, nearestFreeSpot, type Spot } from "./spots";
import { activityDefinitions, activitySteps, findActivityDefinition, findArc } from "core";
import { getEventStage, isEventCompleted } from "../events";
import { debugSendToTown, listResidentTrips, returnFromTown, tripPlanOf } from "./townTrips";
import { currentVisitor, describeVisitor, leaveVisitor, spawnVisitor, visitorCandidatesNow } from "./visitors";
import { debugTrip, describeTripPlan, tripPlanOf as multiDayPlanOf } from "./trips";
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
  "/npc <谁> visit —— 立即来访（无视时段与抽签，但仍要求你在屋里）",
  "/npc visitor [spawn [物种]|leave] —— 桥头访客：看候选 / 立即来一位 / 立即走（09）",
  "/npc <谁> trip [tripId] —— 立即多日出门（默认 hometown，当面说过算说过）；/npc <谁> back 立即回来（09）",
  "/npc <谁> birthday [off] —— 把今天临时当成他的生日（不进存档）；/festival start|end、/birthday set MM-DD（11）",
  "/npc <谁> porch <itemId> | porch clear —— 摆 / 清门口展示位",
  "/npc <谁> nameplate on|off —— 门牌",
  "/npc housecomment —— 此刻室内快照求值出的评论 id 和各位会说的文案键",
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
    `  状态 ${agent.state}${agent.moving ? "（走路中）" : ""}  手里 ${agent.heldProp ?? "空"}`,
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
            const plan = describeTripPlan(residentIdOf(resident.id));
            if (present?.visiting) {
              status = describeVisitor(present);
            } else if (present) {
              // 驻地和现在站的位置一起打：'搬没搬进去'唯一看得见的证据是驻地，
              // '到没到'看的是现在在哪（还在从桥头往家走的路上 = 两个数不一样）
              status =
                `在场（驻地 ${present.homeX.toFixed(1)}, ${present.homeZ.toFixed(1)}；` +
                `现在在 ${present.x.toFixed(1)}, ${present.z.toFixed(1)}）` +
                (plan ? `，${plan}` : "");
            } else if (listResidentTrips()[residentIdOf(resident.id)]) {
              const trip = listResidentTrips()[residentIdOf(resident.id)];
              status = trip.kind === "town" ? `出门了（小镇，${trip.backAtLocalTime} 回）` : `出门了（${trip.kind}，${trip.dayId} ${trip.backAtLocalTime} 回）`;
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

        if (sub === "visitor") {
          if (isRemoteWorld()) return fail("做客中桥头不归你管");
          const op = (args[1] ?? "").toLowerCase();
          if (op === "spawn") {
            const species = findSpecies(args[2]);
            if (args[2] && !species) return fail(`没有这位：${args[2]}`);
            const agent = spawnVisitor(species?.id);
            if (agent) return ok(`${t(findResidentDefinition(agent.definitionId)!.localizationKey)} 来到桥头了`);
            const why = currentVisitor() ? "桥头已经有人了" : `没有候选（${visitorCandidatesNow().length === 0 ? "都住下了 / 图纸在你手上 / 领地放不下" : "他不在候选里"}）`;
            return fail(`来不了：${why}`);
          }
          if (op === "leave") {
            const visitor = currentVisitor();
            return visitor && leaveVisitor(visitor.residentId) ? ok(`${visitor.residentId} 走了`) : fail("桥头没人");
          }
          const rows = visitorCandidatesNow().map((definition) => `  ${shortName(definition.id)}`);
          const visitor = currentVisitor();
          return ok([visitor ? `桥头：${visitor.residentId} ${describeVisitor(visitor)}` : "桥头没人", "今天能来的：", ...(rows.length ? rows : ["  （没有）"])].join("\n"));
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
        if (sub === "housecomment") {
          const snapshot = houseSnapshot();
          const ids = evaluateHouseComments(snapshot);
          // 15：住户名单从定义表来，不写死三位
          const rows = residentDefinitions.filter((definition) => definition.residence).map((definition) => `  ${definition.id}：${houseCommentKeysFor(definition.id).join(" → ")}`);
          return ok([`室内 ${snapshot.furniture.length} 件 / ${snapshot.floorCells} 格 → ${ids.join(", ")}`, ...rows, `门口：${JSON.stringify(listPorch())}`, `来访：${JSON.stringify(visitInProgress())}`, `你在屋里：${playerIndoors()}`].join("\n"));
        }
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
        if (sub === "flags") return ok(`旗子：${JSON.stringify(listFlags())}`);
        if (sub === "flag") {
          // 11 / 14 的通用旗子：调试口直接写（正式写入口只有剧情效果 set_flag）
          if (isRemoteWorld()) return fail("做客中不能动别人的旗子");
          const key = args[1] ?? "";
          if (!key) return fail("用法：/npc flag <键> <值|none>");
          const value = (args[2] ?? "none").toLowerCase() === "none" ? null : args[2]!;
          setFlag(key, value);
          return ok(`旗子 ${key} = ${value ?? "（清掉）"}`);
        }
        if (sub === "activities") {
          // 12：活动表 + 每位的爱好
          const rows = activityDefinitions.map((activity) =>
            `  ${activity.id.padEnd(12)} ${String(activity.spot).padEnd(14)} ${activity.hobby.padEnd(10)} ${(activity.prop ?? "-").padEnd(14)} ×${activity.weight ?? 1}${activity.weather ? `  天气 ${activity.weather.join("/")}` : ""}${activity.requiresSpotIdle ? "  要空着" : ""}`,
          );
          const hobbies = getResidents()
            .map((resident) => ({ resident, info: routinePlanOf(resident) }))
            .filter((entry) => entry.info)
            .map((entry) => `  ${entry.resident.residentId}：${entry.info!.personality.hobbies.join(" / ") || "（没有爱好）"}`);
          return ok(["活动表：  id / 场所 / 爱好 / 道具 / 权重", ...rows, "爱好：", ...hobbies].join("\n"));
        }

        // ---- /npc <谁> do|skill|skills|where|routine|home|town ----
        const agent = findAgent(args[0]);
        const verb = (args[1] ?? "").toLowerCase();
        if (agent && verb === "where") return ok(describeAgent(agent));
        if (agent && verb === "route") {
          // 调试：他从现在的位置到某点排不排得出路（08 验收抓室内进不去用）
          const x = Number(args[2]);
          const z = Number(args[3]);
          if (!Number.isFinite(x) || !Number.isFinite(z)) return fail("用法：/npc <谁> route <x> <z>");
          const route = findRoute({ x: agent.x, z: agent.z }, { x, z }, { radius: agent.radius });
          const there = isWalkable(x, z, agent.radius, agent.residentId);
          return ok([
            `目标 (${x}, ${z}) 站得住：${there}；他的半径 ${agent.radius}`,
            route ? `路 ${route.length} 点：${route.map(([px, pz]) => `(${px.toFixed(2)}, ${pz.toFixed(2)})`).join(" → ")}` : "排不出路",
          ].join("\n"));
        }
        if (agent && verb === "prop") {
          // 12：手里换个道具看（走天气道具那条：跨 Intent、进屋自动放下）
          const id = args[2] ?? "";
          agent.weatherProp = !id || id.toLowerCase() === "none" ? null : id;
          return ok(`${agent.residentId} 手里：${agent.heldProp ?? "空"}${agent.weatherProp && !agent.heldProp ? "（在屋里 / 藏着，没举）" : ""}`);
        }
        if (agent && verb === "activity") {
          // 12：立刻去做某个活动（有场所的先走到最近的那个）
          if (isRemoteWorld()) return fail("做客中不能指挥别人的邻居");
          const activity = findActivityDefinition(args[2] ?? "");
          if (!activity) return fail(`没有这种活动：${args[2] ?? "(空)"}。可选：${activityDefinitions.map((entry) => entry.id).join(" / ")}`);
          const steps: ActionStep[] = [];
          let spot: Spot | null = null;
          if (activity.spot !== "any") {
            spot = nearestFreeSpot(activity.spot, { x: agent.x, z: agent.z, residentId: agent.residentId });
            if (!spot) return fail(`没有空着的 ${activity.spot} 场所（/npc spots 看）`);
            const stand = agent.findSpotNear(spot.x, spot.z, spot.reach + agent.radius);
            if (!stand) return fail(`到 ${spot.key} 排不出路`);
            steps.push({ verb: "walk_to", x: stand.x, z: stand.z });
          }
          const facing = spot ? { x: spot.faceX, z: spot.faceZ } : { x: agent.x + Math.sin(agent.heading), z: agent.z + Math.cos(agent.heading) };
          steps.push(...activitySteps(activity, `${agent.residentId}|debug|${Date.now()}`, facing));
          agent.perform({
            skillId: COMMAND_SKILL_ID,
            priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
            interruptible: false,
            steps,
            prop: activity.prop ?? undefined,
          });
          return ok(`${agent.residentId} 去做 ${activity.id}${spot ? `（${spot.key}）` : "（就地）"}，手里 ${activity.prop ?? "空"}：${steps.map((step) => step.verb).join(" → ")}`);
        }
        if (agent && verb === "arc") {
          // 13：他的线在哪一幕、下一幕等什么；next = 点火下一幕那条规则（跳过条件）
          const arc = findArc(agent.definitionId);
          if (!arc) return fail(`${agent.residentId} 没有个人线`);
          const stage = getEventStage(arc.eventId);
          const index = arc.steps.findIndex((step) => step.stageId === stage);
          const next = arc.steps[index + 1];
          if ((args[2] ?? "").toLowerCase() === "next") {
            if (isRemoteWorld()) return fail("做客中不能推别人的剧情");
            if (!next) return fail("已经是最后一幕");
            const result = fireStoryRuleById(next.ruleId);
            return result === "fired" ? ok(`${arc.eventId} → ${next.stageId}（点了 ${next.ruleId}）`) : fail(`${next.ruleId}：${result}`);
          }
          return ok([
            `${arc.eventId}：${stage ?? "（没开始）"}${isEventCompleted(arc.eventId) ? "（完）" : ""}`,
            next ? `  下一幕 ${next.stageId} 等：${next.waitsFor}` : "  没有下一幕",
            ...arc.steps.map((step) => `  ${step.stageId === stage ? "▶" : " "} ${step.stageId}  ← ${step.waitsFor}`),
          ].join("\n"));
        }
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
          const steps = homeSteps(agent);
          if (!steps) return fail(`${agent.residentId} 没有房子`);
          const nest = homeSpotOf(agent.definitionId);
          // 有室内（08）：走进去坐在窝上；没有：02 的老路 hide
          steps.push(nest ? { verb: "sit", facing: { x: nest.faceX, z: nest.faceZ }, seconds: 3600 } : { verb: "hide" });
          agent.perform({
            skillId: COMMAND_SKILL_ID,
            priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
            interruptible: false,
            steps,
          });
          return ok(`${agent.residentId} 回家${nest ? "（进屋）" : ""}`);
        }
        if (agent && verb === "interior") {
          const what = args[2] ?? "list";
          if (what === "list") {
            const rows = Object.entries(listInteriors()).map(([id, entry]) => `  ${id}：槽 ${JSON.stringify(entry.gifts)} 箱 ${JSON.stringify(entry.boxed)}`);
            const nest = homeSpotOf(agent.definitionId);
            return ok([`室内槽位：`, ...(rows.length ? rows : ["  （空）"]), nest ? `${agent.residentId} 的窝在 ${nest.x.toFixed(1)}, ${nest.z.toFixed(1)}` : `${agent.residentId} 的房子没有室内`].join("\n"));
          }
          if (isRemoteWorld()) return fail("做客中不能动别人的屋里");
          if (what === "clear") return clearInterior(agent.residentId) ? ok("屋里清空了") : fail("屋里本来就是空的 / 没有室内");
          const itemId = what === "place" ? args[3] ?? "" : what;
          if (!findItemDefinition(itemId)) return fail(`没有这种物品：${itemId || "(空)"}`);
          const placed = placeInInterior(agent.residentId, itemId);
          if (!placed) return fail("摆不了（没有房子 / 不是家具）");
          return ok(`${itemId} 摆到了 ${placed.instanceId} ${placed.where === "interior" ? "屋里" : "门口"}${placed.movedToPorch ? `，${placed.movedToPorch} 挪到门口` : ""}${placed.boxed ? `，${placed.boxed} 进箱` : ""}`);
        }
        if (agent && verb === "birthday") {
          // 11：把今天临时当成他的生日（不进存档），当场把"当天早上"那条规则点一遍
          if (isRemoteWorld()) return fail("做客中不能改别人的日子");
          forceBirthdayToday(agent.definitionId, (args[2] ?? "on").toLowerCase() !== "off");
          const fired = fireStoryRuleById(`birthday_today_${agent.definitionId}`);
          return ok(`今天是 ${agent.residentId} 的生日了（规则 ${fired}）；/npc list 看旗子，门口有彩带`);
        }
        if (agent && verb === "trip") {
          if (isRemoteWorld()) return fail("做客中不能指挥别人的邻居");
          const why = debugTrip(agent.residentId, args[2] ?? "hometown");
          return why ? fail(`走不了：${why}`) : ok(`${agent.residentId} 出门了（${args[2] ?? "hometown"}），/npc list 看哪天回`);
        }
        if (agent && verb === "visit") {
          const why = forceVisit(agent.residentId);
          return why ? fail(`来不了：${why}`) : ok(`${agent.residentId} 来敲门了`);
        }
        if (agent && verb === "porch") {
          if (isRemoteWorld()) return fail("做客中不能动别人的门口");
          const what = args[2] ?? "";
          if (what === "clear") return clearPorch(agent.residentId) ? ok("门口清空了") : fail("门口本来就是空的 / 没有房子");
          if (!findItemDefinition(what)) return fail(`没有这种物品：${what || "(空)"}`);
          const placed = placeOnPorch(agent.residentId, what);
          return placed ? ok(`${what} 摆到了 ${placed.instanceId} 门口${placed.evicted ? `（挤掉 ${placed.evicted}）` : ""}`) : fail("摆不了（没有房子 / 没有展示位）");
        }
        if (agent && verb === "nameplate") {
          if (isRemoteWorld()) return fail("做客中不能动别人的门口");
          const on = (args[2] ?? "on").toLowerCase() !== "off";
          return setNamePlate(agent.residentId, on) ? ok(`门牌${on ? "挂上了" : "摘了"}`) : fail("没有房子");
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
        if (species && (args[1] ?? "").toLowerCase() === "back") {
          // 09：立即回来（多日出门 / 小镇都行）
          if (isRemoteWorld()) return fail("做客中不能指挥别人的邻居");
          if (!listResidentTrips()[residentIdOf(species.id)]) return fail(`${shortName(species.id)} 没出门`);
          returnFromTown(residentIdOf(species.id));
          const plan = multiDayPlanOf(residentIdOf(species.id));
          return ok(`${shortName(species.id)} 回来了${plan ? "，见面第一句在等你" : ""}`);
        }
        if (species) {
          const trip = listResidentTrips()[residentIdOf(species.id)];
          if (trip) return fail(`${shortName(species.id)} 出门了（${trip.kind}），${trip.backAtLocalTime} 回来`);
          return fail(`${shortName(species.id)} 现在不在场`);
        }

        return fail(`不认识的子命令：${sub}\n${USAGE}`);
      },
    }),
    registerCommand({
      name: "mail",
      usage: "mail [list|send <letterId> [itemId]|write <谁> <模板序号> [attach]|outbox|process|clear|open]",
      description: "信箱（10）：看信 / 立即寄一封 / 写一封 / 处理你写的 / 清空 / 打开面板",
      arguments: [{ name: "动作", suggest: () => ["list", "send", "write", "outbox", "process", "clear", "open"].map((value) => ({ value })) }],
      handler: (args) => {
        const op = (args[0] ?? "list").toLowerCase();
        if (op === "open") {
          emit("mailbox_open_requested", {});
          return ok("打开信箱");
        }
        if (op === "list") {
          const rows = listLetters().map((letter) => `  ${letter.opened ? "  " : "● "}${letter.id}  来自 ${letter.fromResidentId ?? "（剧情）"}  ${letter.receivedDayId}${letter.attach ? `  夹 ${letter.attach.itemId}×${letter.attach.quantity}` : ""}`);
          return ok(rows.length ? ["信箱：", ...rows].join("\n") : "信箱是空的");
        }
        if (op === "outbox") {
          const rows = listOutbox().map((letter) => `  ${letter.id} → ${letter.toResidentId}  ${letter.templateKey}${letter.attach ? `  夹 ${letter.attach.itemId}` : ""}`);
          return ok(rows.length ? ["待处理的你的信：", ...rows].join("\n") : "没有待处理的信");
        }
        if (isRemoteWorld()) return fail("做客中信箱只读");
        if (op === "send") {
          const letterId = args[1] ?? "";
          const itemId = args[2];
          if (itemId && !findItemDefinition(itemId)) return fail(`没有这种物品：${itemId}`);
          const letter = deliverLetter(letterId, itemId ? { attach: { itemId, quantity: 1 } } : {});
          return letter ? ok(`寄到了：${letter.id}`) : fail("寄不了（信不存在 / 信箱满了）");
        }
        if (op === "write") {
          const species = findSpecies(args[1]);
          if (!species) return fail(`没有这位：${args[1] ?? "(空)"}`);
          const index = Number(args[2] ?? "1") - 1;
          const template = mailTuning.playerTemplates[index];
          if (!template) return fail(`模板序号 1~${mailTuning.playerTemplates.length}`);
          const letter = writeLetter(species.id, template, (args[3] ?? "").toLowerCase() === "attach");
          return letter ? ok(`写好了：${letter.id}，明早他收到`) : fail("写不了（手里没东西可夹？）");
        }
        if (op === "process") return ok(`处理了 ${processOutbox()} 封`);
        if (op === "clear") {
          clearMailbox();
          return ok("信箱清空了");
        }
        return fail("用法：/mail [list|send|write|outbox|process|clear|open]");
      },
    }),
    registerCommand({
      name: "festival",
      usage: "festival [list|start <id>|end]",
      description: "节日（11）：看表 / 强制开始 / 结束。进行中的节日 = 旗子 festival_active",
      arguments: [{ name: "动作", suggest: () => ["list", "start", "end"].map((value) => ({ value })) }],
      handler: (args) => {
        const op = (args[0] ?? "list").toLowerCase();
        if (op === "start") {
          if (isRemoteWorld()) return fail("做客中不归你管");
          const id = args[1] ?? listFestivals()[0]?.id ?? "";
          return startFestival(id) ? ok(`节日 ${id} 开始了：全体作息换、门口挂灯笼、对话是节日段`) : fail(`没有这个节日：${id}`);
        }
        if (op === "end") return endFestival() ? ok("节日结束了") : fail("现在没有节日");
        const active = activeFestival();
        return ok([`进行中：${active ? active.id : "（无）"}`, "节日表：", ...listFestivals().map((festival) => `  ${festival.id}  ${JSON.stringify(festival.when)}`), `旗子：${JSON.stringify(listFlags())}`].join("\n"));
      },
    }),
    registerCommand({
      name: "birthday",
      usage: "birthday [set MM-DD|clear]",
      description: "你的生日（11）：当天居民寄信、招呼换段。不办派对",
      arguments: [{ name: "动作", suggest: () => ["set", "clear"].map((value) => ({ value })) }],
      handler: (args) => {
        const op = (args[0] ?? "").toLowerCase();
        if (op === "set") {
          setPlayerBirthday(args[1]);
          return getPlayerBirthday() ? ok(`你的生日：${getPlayerBirthday()}`) : fail("格式 MM-DD");
        }
        if (op === "clear") {
          setPlayerBirthday(undefined);
          return ok("清掉了");
        }
        return ok(`你的生日：${getPlayerBirthday() ?? "（没填）"}`);
      },
    }),
    registerCommand({
      name: "doors",
      usage: "doors",
      description: "调试：场上每扇门的开合 / 锁 / 主人（08 居民房的门锁跟着主人走）",
      arguments: [],
      handler: () =>
        ok(
          listDoors()
            .map((door) => `  ${door.refId}（${door.definition.id}）@ ${door.center.x.toFixed(1)}, ${door.center.z.toFixed(1)}：${door.open ? "开" : "关"}${door.locked ? "·锁" : ""}${door.owner ? ` 主人 ${door.owner}` : ""}`)
            .join("\n") || "没有门",
        ),
    }),
  ];
}
