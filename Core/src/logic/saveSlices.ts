import type {
  PlayerSliceKey,
  PlayerSliceValue,
  WorldSliceKey,
  WorldSliceValue,
} from "../types/saveSlices.js";
import type { PlayerSave } from "../types/player.js";
import type { WorldSave } from "../types/world.js";

/**
 * 按**切片键**读写存档。键可能带一层嵌套（`progression.stats`、
 * `character.inventory`），这里把那一层解开，调用方不用知道哪些键是嵌套的。
 *
 * 服务端合并刷新切片、前端按注册表序列化 / 读档，走的都是这四个函数——
 * "progression 下面有哪些键"这件事只在 `types/saveSlices.ts` 的键类型里说一次。
 *
 * `write*` **就地改**传进来的对象：服务端合并要的正是这个（会话世界是一个
 * 长期存活的对象）；前端序列化时先造一个空壳再逐键写，同样合适。
 * 值为 `undefined` 也照写（键会存在、值是 undefined）：可选片没内容时
 * 存档对象的形状要和手写那版一致，`saveShape` 的指纹就是按这个算的。
 */

const PROGRESSION = "progression.";
const CHARACTER = "character.";

export function readWorldSlice<K extends WorldSliceKey>(
  world: WorldSave,
  key: K,
): WorldSliceValue<K> {
  if (key.startsWith(PROGRESSION)) {
    const inner = key.slice(PROGRESSION.length) as keyof WorldSave["progression"];
    return world.progression[inner] as WorldSliceValue<K>;
  }
  return world[key as keyof WorldSave] as WorldSliceValue<K>;
}

export function writeWorldSlice<K extends WorldSliceKey>(
  world: WorldSave,
  key: K,
  value: WorldSliceValue<K>,
): void {
  if (key.startsWith(PROGRESSION)) {
    const inner = key.slice(PROGRESSION.length) as keyof WorldSave["progression"];
    (world.progression as Record<string, unknown>)[inner] = value;
    return;
  }
  (world as Record<string, unknown>)[key] = value;
}

export function readPlayerSlice<K extends PlayerSliceKey>(
  player: PlayerSave,
  key: K,
): PlayerSliceValue<K> {
  if (key.startsWith(CHARACTER)) {
    const inner = key.slice(CHARACTER.length) as keyof PlayerSave["character"];
    return player.character[inner] as PlayerSliceValue<K>;
  }
  return player[key as keyof PlayerSave] as PlayerSliceValue<K>;
}

export function writePlayerSlice<K extends PlayerSliceKey>(
  player: PlayerSave,
  key: K,
  value: PlayerSliceValue<K>,
): void {
  if (key.startsWith(CHARACTER)) {
    const inner = key.slice(CHARACTER.length) as keyof PlayerSave["character"];
    (player.character as Record<string, unknown>)[inner] = value;
    return;
  }
  (player as Record<string, unknown>)[key] = value;
}
