import type { WorldOp } from "core";
import {
  applyRemoteClaimed,
  applyRemoteProgress,
} from "../State/dailyBoard";
import {
  replayRemovedItem,
  replaySettledItem,
  replayThrownItem,
} from "../State/droppedItems";
import { replayGramophoneRecord } from "../State/gramophones";
import { replayLampSwitch } from "../State/lamps";
import { replayStorageBox } from "../State/storage";
import {
  replayBathWater,
  replayPlaceFurniture,
  replayRemoveFurniture,
  replaySlotContent,
} from "../State/worldRuntime";

/**
 * 收到房里其他人的 world:op → 在本地重放。
 *
 * 每个分支只调 State 层的 replay* 入口——那些入口**不发 world_op**
 * （发了就是把别人的动作再广播一遍，回环）。它们照常发 *_changed
 * 事件，所以视图跟着动、房主的整片刷新跟着排队，都是想要的连锁。
 *
 * 全部幂等：重复送达（op 和刷新都带到了同一份数据）就地跳过。
 * 这里**不做游戏规则校验**——满权限模型下对方端已经校过，
 * 极端竞争的错位由房主刷新收敛（契约"op 管即时，refresh 管收敛"）。
 */
export function applyWorldOp(op: WorldOp): void {
  switch (op.kind) {
    case "furniture_placed":
      replayPlaceFurniture(op.placed);
      return;
    case "furniture_removed":
      // 附带的储物内容清理不在这里做：收家具的那一端会跟着发一条
      // 空箱的 storage_box_set，两条 op 各管各的状态
      replayRemoveFurniture(op.instanceId);
      return;
    case "kitchen_slot_set":
      replaySlotContent(op.instanceId, op.slotId, op.content);
      return;
    case "item_thrown":
      replayThrownItem(op);
      return;
    case "item_settled":
      replaySettledItem(op.item);
      return;
    case "item_removed":
      replayRemovedItem(op.id);
      return;
    case "storage_box_set":
      replayStorageBox(op.box);
      return;
    case "gramophone_record_set":
      // 旧唱片弹出来那一下走 item_thrown 自己会到，这里只管"装着哪张"
      replayGramophoneRecord(op.instanceId, op.recordItemId);
      return;
    case "daily_board_ticked":
      // 取绝对进度、只认今天的包、只增不减——三条都在 applyRemoteProgress 里
      applyRemoteProgress(op.worldDayId, op.progress);
      return;
    case "daily_board_claimed":
      // 只置位不吐东西：奖励本体是发起方的若干次 throwItem，
      // 那些走 item_thrown 自己会到（联机那一轮已经打通）
      applyRemoteClaimed(op.worldDayId);
      return;
    case "lamp_switched":
      // 发的是绝对状态不是"切一下"，所以重复/乱序的包也收敛到同一档
      replayLampSwitch(op.instanceId, op.on);
      return;
    case "bath_water_set":
      // 只记转折点：本地的 tickBath 从这个水位按同一速率接着涨/放
      replayBathWater(op.instanceId, op.level, op.flow);
      return;
  }
}
