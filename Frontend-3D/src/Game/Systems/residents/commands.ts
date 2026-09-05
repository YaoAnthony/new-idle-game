import { findBlueprintForBuilding, findItemDefinition } from "core";
import { registerCommand, type CommandResult } from "../../CommandLine/commands";
import { listBuildings } from "../../State/buildings";
import { getCount } from "../../State/inventory";
import { getResidents } from "../../State/residentsRuntime";
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
].join("\n");

export function registerResidentCommands(): Array<() => void> {
  const ok = (message: string): CommandResult => ({ ok: true, message });
  const fail = (message: string): CommandResult => ({ ok: false, message });

  return [
    registerCommand({
      name: "npc",
      usage: "npc <list|join> [物种]",
      description: "居民入住：/npc join <物种> 拿到他的房屋图纸，盖好他就搬来",
      arguments: [
        { name: "动作", suggest: () => ["list", "join"].map((value) => ({ value })) },
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

        return fail(`不认识的子命令：${sub}\n${USAGE}`);
      },
    }),
  ];
}
