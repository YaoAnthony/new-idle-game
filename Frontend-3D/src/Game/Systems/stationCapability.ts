import { FurnitureCapability, type PlacementBlock } from "core";
import type { StationCapability } from "../EventBus";

/**
 * 走近一件家具按 F，该干什么。一件家具可能带好几个能力，这里按优先级取一个；
 * 返回 null = 这件东西 F 无事可做（盆栽这类纯装饰件，只浮气泡）。
 *
 * 原来是 `RoomScene.refreshInteractTarget` 里一长串三元，2026-09-13 原样
 * 搬出来——链条是纯数据判断，留在场景里就只能进浏览器看，测不到。搬的起因
 * 是石傀儡的头：气泡说"捡起来"，F 的链条里却没有它这一支，按了毫无反应。
 */
export function stationCapabilityOf(
  placement: PlacementBlock,
): StationCapability | null {
  const has = (capability: FurnitureCapability) =>
    placement.capabilities.includes(capability);

  /*
   * 气泡写明 `action: "pickup"` 的，F 就是捡，排最前。
   *
   * 判据取气泡数据，没另开一个 FurnitureCapability.Pickup：气泡上印的键和
   * F 真正做的事出自**同一个字段**，才不会一个说"F 捡起来"、一个不理。
   * 另开能力的话两处要各写一次，漏一处就是这次的 bug 原样回来。
   *
   * 剧情道具走交互键是动作游戏的通行做法（原神 F、旷野之息 A）。右键收家具
   * 是摆设系统的操作，照样能用，只是不该是捡剧情道具唯一的入口。
   */
  if (placement.interactHint?.action === "pickup") return "pickup";
  // 日记本排在其余能力前面：它只有这一种交互，而且拿走之后实例就没了
  if (has(FurnitureCapability.Journal)) return "journal";
  if (has(FurnitureCapability.Unpack)) return "unpack";
  if (has(FurnitureCapability.DailyBoard)) return "daily_board";
  if (has(FurnitureCapability.MusicPlayer)) return "music_player";
  // 灯排在做工的前面：带灯的工作台还不存在，真出现了也该是
  // "先开灯再干活"（灯是一按就完、随时可逆的那种交互）
  if (has(FurnitureCapability.Lighting)) return "lighting";
  if (has(FurnitureCapability.Crafting)) return "crafting";
  if (has(FurnitureCapability.Cooking)) return "cooking";
  // 寄售箱不是储物箱：放进去的东西隔夜就没了，开的是寄售面板
  if (has(FurnitureCapability.Consign)) return "consign";
  if (has(FurnitureCapability.Storage)) return "storage";
  // 浴缸自己管"注水/泡"两步，比坐卧优先（它的锚点只在满缸时才给坐）
  if (has(FurnitureCapability.Bath)) return "bath";
  // 床优先当"躺"处理；沙发这类只有 Sitting 的落到坐
  if (has(FurnitureCapability.Sleep)) return "sleep";
  if (has(FurnitureCapability.Sitting)) return "sitting";
  return null;
}
