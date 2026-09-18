import { findItemDefinition, type ItemDefinition, type ToolType } from "core";
import { getHeld } from "../../Game/State/heldItem";
import { HeldTool } from "./HeldTool";
import { HoeTool } from "./HoeTool";
import { WateringCanTool } from "./WateringCanTool";

/**
 * 工具注册表：`tool.toolType` → 类。**按种类不按物品 id**——普通壶和广口壶
 * 是同一个类的两件实例。没登记的种类（相机、斧头、鱼竿）返回 null，
 * 按普通手持物走，和今天一样；哪天给斧头写了类，这里加一行。
 */
const TOOL_CLASSES: Partial<Record<ToolType, (definition: ItemDefinition) => HeldTool>> = {
  hoe: (definition) => new HoeTool(definition),
  watering_can: (definition) => new WateringCanTool(definition),
};

const cache = new Map<string, HeldTool | null>();

export function toolForItem(itemId: string | null | undefined): HeldTool | null {
  if (!itemId) return null;
  const cached = cache.get(itemId);
  if (cached !== undefined) return cached;
  const definition = findItemDefinition(itemId);
  const make = definition?.tool ? TOOL_CLASSES[definition.tool.toolType] : undefined;
  const tool = definition && make ? make(definition) : null;
  cache.set(itemId, tool);
  return tool;
}

/** 手上现在这件是不是工具（选中的快捷栏格） */
export function toolForHeld(): HeldTool | null {
  return toolForItem(getHeld()?.itemId);
}

export { HeldTool } from "./HeldTool";
export type { ToolEffects, ToolIntent, ToolUseSpec, ToolGrip, ToolUseFrame, ToolEffectContext } from "./HeldTool";
export { HoeTool, DIRT_COLOR } from "./HoeTool";
export { WateringCanTool, WATER_COLOR } from "./WateringCanTool";
export { ToolPlayer, type ToolPlayOptions } from "./ToolPlayer";
