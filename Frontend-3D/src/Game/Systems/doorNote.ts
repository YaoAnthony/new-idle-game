import { findLetterDefinition, type DoorDefinition } from "core";
import { getFlag, setFlag } from "./flags";
import { signal } from "./story";

/**
 * 门上的条子（居民系统 14）。数据只有两处：门定义上的 `noteFlag`（哪面旗子）、旗子的值（哪封信）。
 * 这里不认识"魔女"也不认识"开场"——以后剧情往门上贴第二张条子，就是再写一次那面旗子。
 */
export function doorNoteOf(door: {
  definition: Pick<DoorDefinition, "noteFlag">;
}): string | null {
  const flag = door.definition.noteFlag;
  if (!flag) return null;
  const letterId = getFlag(flag);
  if (!letterId || !findLetterDefinition(letterId)) return null;
  return letterId;
}

/**
 * 按 F 把条子拿下来：旗子清掉（拿过就没了，门恢复正常），发 `door_note_taken`。
 * 拿下来之后是进背包还是直接摊开，由剧情规则接——这里不认识信封。
 * 返回 false = 门上没条子。
 */
export function readDoorNote(door: {
  definition: Pick<DoorDefinition, "noteFlag">;
}): boolean {
  const letterId = doorNoteOf(door);
  if (!letterId || !door.definition.noteFlag) return false;
  setFlag(door.definition.noteFlag, null);
  signal("door_note_taken", letterId);
  return true;
}
