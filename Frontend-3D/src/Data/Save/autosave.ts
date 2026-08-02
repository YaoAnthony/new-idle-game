import type { GameSave } from "core";
import { on } from "../../Game/EventBus";
import { getSaveRepository } from "./SaveRepository";
import { serializeGameSave } from "./serialize";

/**
 * 自动存档。V0.2 定的原则是**不要每帧或每分钟写**，
 * 只在耐久状态真的变了之后写，并且合并连续操作。
 *
 * 触发点：
 * | 耐久操作后（防抖 2.5 秒） | 放置/移除家具、制作、烹饪、送礼 |
 * | 行动开始 / 完成           | ActionProcessSave 变更          |
 * | 剧情推进                  | 事件阶段、功能解锁              |
 * | 页面进入后台 / 关闭       | visibilitychange + pagehide     |
 *
 * 不触发：角色移动、相机旋转、镜头缩放、UI 开关——这些是瞬时状态，不入档。
 */

const DEBOUNCE_MS = 2500;

let timer: ReturnType<typeof setTimeout> | null = null;
let lastSave: GameSave | null = null;
let writing = false;
let dirty = false;

/** 记住上一份存档，让 createdAtUtc、seed 这类"只在建档时定"的字段能传下去 */
export function setBaseline(save: GameSave | null): void {
  lastSave = save;
}

async function writeNow(): Promise<void> {
  if (writing) {
    // 正在写的时候又有变更：标记一下，写完再补一次，避免丢最后一笔
    dirty = true;
    return;
  }

  writing = true;
  try {
    const save = serializeGameSave(lastSave ?? undefined);
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
  const offs = [
    on("world_changed", ({ reason }) => {
      // 读档自身触发的 world_changed 不该立刻回写
      if (reason !== "restored") schedule();
    }),
    on("inventory_changed", ({ reason }) => {
      if (reason !== "restore") schedule();
    }),
    /**
     * 事件阶段推进**立即写，不防抖**。
     *
     * 这是唯一不走 `schedule()` 的信号。它代表的是剧情/主线节点
     * （送礼认作朋友、任务阶段完成……），低频、重要，和"移动了一件
     * 家具"这种高频小动作性质不一样，不该用同一条 2.5 秒防抖合并。
     *
     * 实测撞过一次：舒舒的初见对话走完，`shushu_bond` 推进到
     * "gifted"，但玩家在防抖窗口内就刷新了页面——`pagehide` 兜底
     * 会尝试立即存盘，但那是**异步**写 IndexedDB，页面卸载过程中
     * 经常来不及跑完（这是 `pagehide`/`beforeunload` 里做异步存储的
     * 通病，不是这一处独有）。结果是刚认完的朋友，读档后又要重新哄一遍。
     * 触发点从"等 2.5 秒后台写"挪到"当场写"，把这个窗口压到最小。
     */
    on("event_progress_changed", () => void saveNow()),
    on("pet_changed", ({ reason }) => {
      if (reason !== "restored") schedule();
    }),
    on("action_changed", () => schedule()),
    on("kitchen_changed", () => schedule()),
    on("held_changed", () => schedule()),
    on("posture_changed", () => schedule()),
    on("needs_changed", () => schedule()),
    /**
     * 说过的话也要存。
     *
     * 漏了这一条的后果不明显但很难受：说完一句就关掉游戏，那句话没了——
     * 而**别的操作会顺手把它带进存档**（扔个东西触发 inventory_changed，
     * 那次写盘正好把之前的消息一起写了）。于是"有时候记得住有时候记不住"，
     * 玩家根本猜不到规律。防抖在 schedule 里，刷屏也只写一次。
     */
    on("chat_message", () => schedule()),
  ];

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
