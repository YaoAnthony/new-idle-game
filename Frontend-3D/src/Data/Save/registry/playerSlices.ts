import type { PlayerSliceKey, PlayerSliceValue } from "core";
import { restoreAvatar, snapshotAvatar } from "../../../Game/State/avatar";
import { restoreActionGroups, snapshotActionGroups } from "../../../Game/State/actionGroups";
import { restoreActionLog, snapshotActionLog } from "../../../Game/State/actionLog";
import { restoreDailyTasks, snapshotDailyTasks } from "../../../Game/State/dailyTasks";
import { restoreDiary, snapshotDiary } from "../../../Game/State/diary";
import { restorePendingGold, snapshotPendingGold } from "../../../Game/State/gold";
import { restoreHeld, snapshotHeld } from "../../../Game/State/heldItem";
import { restoreInventory, snapshotInventory } from "../../../Game/State/inventory";
import { getNeeds, restoreNeeds } from "../../../Game/State/needs";
import { restoreLocalPosition, snapshotLocalPosition } from "../../../Game/State/participants";
import { restoreResting, snapshotResting } from "../../../Game/State/posture";
import {
  restoreAction,
  restoreActionEntries,
  snapshotAction,
  snapshotActionEntries,
} from "../../../Game/Systems/actions";
import { getDiscoveredRecipeIds, restoreDiscoveredRecipes } from "../../../Game/Systems/crafting";
import { getPlayerBirthday, setPlayerBirthday } from "../../../Game/Systems/residents/birthday";
import type { SliceRuntime } from "./types";

/**
 * 玩家侧每一片怎么进出运行时。跟着人走的东西：背包、需求、清单、日记……
 * 联机做客时这些照抄运行时（做客捡的东西实时进自己的档），世界侧才用快照
 * ——那条合成规则在 Game/Multiplayer/session，不在这里。
 */

const noop = (): void => undefined;

export const PLAYER_SLICES = {
  playerId: { dead: "全仓无读写（审计 2026-09-13），阶段 6 连类型一起删" },
  name: {
    // 全仓没有写入口，只能从上一份存档抄；新档从来都是"旅人"（审计 2026-09-13，来源待拍板）
    snapshot: ({ previous }) => previous?.player.name ?? "旅人",
    restore: noop,
    changedBy: [],
  },
  avatar: {
    snapshot: () => snapshotAvatar(),
    restore: (value) => restoreAvatar(value),
    // 捏脸只在开新档时写一次（App 的 setAvatar），之后没有改脸的入口
    changedBy: [],
  },
  actionGroups: {
    snapshot: () => snapshotActionGroups(),
    restore: (value) => restoreActionGroups(value),
    changedBy: ["action_groups_changed"],
    after: ["player.actionEntries"],
  },
  pendingGold: {
    // 在别人家赚的、还没带回家的钱。跟着人走，所以落在玩家侧
    snapshot: () => snapshotPendingGold(),
    restore: (value) => restorePendingGold(value),
    changedBy: ["gold_changed"],
  },
  birthday: {
    snapshot: () => getPlayerBirthday(),
    restore: (value) => setPlayerBirthday(value),
    // birthday 模块不发事件，今天只搭别的落盘的车。阶段 3 补
    changedBy: [],
  },
  "character.inventory": {
    snapshot: () => snapshotInventory(),
    restore: (value) => restoreInventory(value),
    changedBy: ["inventory_changed", "held_changed"],
  },
  "character.inventoryId": { dead: "全仓无读写（审计 2026-09-13），阶段 6 连类型一起删" },
  "character.needs": {
    snapshot: () => getNeeds(),
    // 带上上次存盘的时刻，startNeeds 的首次 tick 才能补算离线期间的衰减
    restore: (value, ctx) => restoreNeeds(value, ctx.save?.meta?.updatedAtUtc),
    changedBy: ["needs_changed"],
  },
  "character.heldItem": {
    // 写入恒为 null，读回只为兼容旧档（塞进背包第一个空位），所以必须在背包之后
    snapshot: () => snapshotHeld(),
    restore: (value) => restoreHeld(value),
    changedBy: ["held_changed"],
    after: ["player.character.inventory"],
  },
  "character.position": {
    // 权威在 Game/State/participants，渲染层每帧写进去；不触发落盘，落盘时顺带抓
    snapshot: () => snapshotLocalPosition(),
    restore: (value) => restoreLocalPosition(value),
    changedBy: [],
  },
  "character.restingOn": {
    snapshot: () => snapshotResting(),
    restore: (value) => restoreResting(value),
    changedBy: ["posture_changed"],
    after: ["world.maps"],
  },
  discoveredRecipeIds: {
    // 做过一次的配方——"见过"而不是"解锁"，它保证配方不会因为材料用光而从列表里消失
    snapshot: () => getDiscoveredRecipeIds(),
    restore: (value) => restoreDiscoveredRecipes(value ?? []),
    // crafting 不发"见过新配方"的事件；做东西必然动背包，搭 inventory_changed 的车
    changedBy: [],
  },
  actionEntries: {
    snapshot: () => snapshotActionEntries(),
    restore: (value) => restoreActionEntries(value),
    changedBy: ["action_entries_changed"],
  },
  dailyTasks: {
    snapshot: () => snapshotDailyTasks(),
    restore: (value) => restoreDailyTasks(value),
    changedBy: ["daily_tasks_changed"],
  },
  actionLog: {
    snapshot: () => snapshotActionLog(),
    restore: (value) => restoreActionLog(value),
    /*
     * 补记走的不是 action_changed（它没有"进行中"这个状态），所以额度要单独订。
     * 漏了的后果：补记完关掉游戏，箱子里的东西在、额度却回到没用过——
     * 下次进来又能补满一天。
     */
    changedBy: ["action_log_changed"],
  },
  diary: {
    snapshot: () => snapshotDiary(),
    restore: (value) => restoreDiary(value),
    changedBy: ["diary_changed"],
  },
  activeActionProcess: {
    snapshot: () => snapshotAction(),
    // 可能立刻结算并发奖励，需要背包已经就位
    restore: (value) => restoreAction(value),
    changedBy: ["action_changed"],
    after: ["player.character.inventory", "player.pendingGold"],
  },
} satisfies { [K in PlayerSliceKey]-?: SliceRuntime<PlayerSliceValue<K>> };
