import type { GameSave } from "core";
import { on } from "../../Game/EventBus";
import { getSaveRepository } from "./SaveRepository";
import { autosaveTriggers, matchTriggers } from "./registry/derive";
import { isRestoring, serializeGameSave } from "./serialize";

/**
 * 自动存档。V0.2 定的原则是**不要每帧或每分钟写**，
 * 只在耐久状态真的变了之后写，并且合并连续操作。
 *
 * 触发点由每一片持久状态自己声明（Data/Save/registry 的 `changedBy` / `write`）：
 * | 耐久操作后（防抖 2.5 秒） | 家具、储物、厨房、灯、活物、清单、日记…（各片的 changedBy） |
 * | 剧情推进（立即写）        | 事件阶段推进（progression.events 的 write: "immediate"） |
 * | 页面进入后台 / 关闭       | visibilitychange + pagehide     |
 *
 * 不触发：角色移动、相机旋转、镜头缩放、UI 开关——这些是瞬时状态，不入档。
 */

const DEBOUNCE_MS = 2500;

let timer: ReturnType<typeof setTimeout> | null = null;
let lastSave: GameSave | null = null;
let writing = false;
let dirty = false;

/**
 * 存档合成器。null = 正常路径（serializeGameSave 全量序列化运行时）；
 * 联机做客期间由 Game/Multiplayer/session 装一个合成函数进来：**玩家侧取
 * 运行时现状（背包、需求——做客捡到的东西要保住），世界侧取入房前
 * 的快照（运行时里那份是房主的世界，绝不能写进自己的存档）**。
 *
 * 闸口设在 writeNow 这一个脖子上，而不是挨个拦触发点——触发点有
 * 十几个（防抖、事件直写、pagehide、ESC 手动存档），漏拦任何一个
 * 都会把房主的世界写进房客的档。第一版用的是"做客全程不写盘"，
 * 代价是做客期间捡的东西一崩就丢；合成器把两头都保住。
 */
let composer: (() => GameSave) | null = null;

export function setSaveComposer(compose: (() => GameSave) | null): void {
  composer = compose;
}

/** 记住上一份存档，让 createdAtUtc、seed 这类"只在建档时定"的字段能传下去 */
export function setBaseline(save: GameSave | null): void {
  lastSave = save;
}

/** 做客前抓自己世界的快照要用它当 serialize 的底稿（保住 createdAtUtc） */
export function getBaseline(): GameSave | null {
  return lastSave;
}

async function writeNow(): Promise<void> {
  if (writing) {
    // 正在写的时候又有变更：标记一下，写完再补一次，避免丢最后一笔
    dirty = true;
    return;
  }

  writing = true;
  try {
    const save = composer ? composer() : serializeGameSave(lastSave ?? undefined);
    const result = await getSaveRepository().save(save);

    if (result.ok) lastSave = save;
    else if ("message" in result) console.warn("[autosave] 写入失败：", result.message);
  } finally {
    writing = false;
    if (dirty) {
      dirty = false;
      void writeNow();
    }
  }
}

/** 立刻落盘（关页面、手动存档用），不等防抖 */
export function saveNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return writeNow();
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void writeNow();
  }, DEBOUNCE_MS);
}

export function startAutosave(): () => void {
  /*
   * 听什么、防抖还是立即写，**从注册表派生**（registry/derive）：每一片持久
   * 状态声明自己的 changedBy / write，这里不再手抄一份名单。手抄那版漏了
   * building_state_changed / gold_changed / storage_changed / mail_changed …
   * 一串——浇了水、往罐里存了钱就强退，全靠 pagehide 兜底，而那条路是异步
   * 写 IndexedDB，页面卸载时经常来不及。
   *
   * 读档事务期间（`isRestoring()`）一律不触发：各片 restore 连锁发出的
   * `*_changed` 不是"世界变了"。原来用 `reason !== "restored"` 之类逐条过滤，
   * 三种写法各漏各的，`restoreProgression` 那串立即写就是从缝里漏出去的。
   */
  const table = autosaveTriggers();
  const offs: Array<() => void> = [];
  for (const event of table.keys()) {
    offs.push(
      on(event, (payload: unknown) => {
        if (isRestoring()) return;
        const { matched, immediate } = matchTriggers(table, event, payload);
        if (!matched) return;
        if (immediate) void saveNow();
        else schedule();
      }),
    );
  }

  // 页面进入后台 / 关闭：来不及防抖，直接写
  const onHide = () => void saveNow();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") void saveNow();
  };

  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    for (const off of offs) off();
    window.removeEventListener("pagehide", onHide);
    document.removeEventListener("visibilitychange", onVisibility);
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
