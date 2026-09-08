import { ChevronDown, ChevronRight, FolderPlus, Play, Trash2 } from "lucide-react";
import { useState, type DragEvent } from "react";
import type { DiaryData, DiaryTask } from "./useDiaryData";

/**
 * 日记本左页上的文件夹（任务组，2026-09-08）。
 *
 * 一个文件夹 = 一个名字 + 一串有序的计划。**折叠时只露出第一条**——它是
 * "接下来该做的"；展开之后其余的也只是排着队，播放键仍然只在第一条上。
 * 第一条做完会从清单里划掉，第二条自然浮上来，所以这里没有"当前进度"。
 *
 * ---- 拖拽 ----
 *
 * 用原生 HTML5 拖放，拖的东西通过 dataTransfer 带 taskId，**不走 React
 * 状态**：拖的源头（散条目）在 BookPlanner 里，落点（文件夹）在这里，
 * 共享一份"正在拖谁"的状态就得把它提到两边共同的父级，而父级是一本
 * 翻页书。dataTransfer 本来就是为跨组件带数据设计的。
 *
 * 书里**只有拖拽**这一条路进文件夹（用户 2026-09-08 把每行那个「放进…」
 * 下拉去掉了：它把每一行都撑宽了一截，而这一页的整个语言是"纸上的
 * 东西用手挪"）。已知代价：触摸端没有原生 HTML5 拖放，手机上要把计划
 * 放进系列得去行动面板用那边的「放进系列」。成员展开后仍有「拿出」。
 *
 * 这一页在 react-pageflip 里：外面那层 InteractiveArea 已经把 pointerdown
 * 拦下来不让书翻页，而 dragstart 走的是浏览器自己的手势识别，不受影响。
 */

export const PLAN_DRAG_MIME = "application/x-idle-home-plan";

/** 拖起一条计划时调（散条目和文件夹成员都用它） */
export function beginPlanDrag(event: DragEvent, taskId: string): void {
  event.dataTransfer.setData(PLAN_DRAG_MIME, taskId);
  event.dataTransfer.effectAllowed = "move";
}

function draggedPlanId(event: DragEvent): string | null {
  const id = event.dataTransfer.getData(PLAN_DRAG_MIME);
  return id || null;
}

/** 落点是不是一条计划：不是的话（比如拖了段文字进来）不要接 */
function acceptsPlan(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(PLAN_DRAG_MIME);
}

type Props = {
  diary: DiaryData;
  /** 今天左页上所有还没做的计划（含在文件夹里的），按 id 查标题和时长 */
  tasks: DiaryTask[];
  onStart: (task: DiaryTask) => void;
  /** 过去的页只读：不显示按钮、不接拖放 */
  readonly: boolean;
};

export function PlanFolders({ diary, tasks, onStart, readonly }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  /** 正悬在哪个文件夹上（高亮落点） */
  const [hover, setHover] = useState<string | null>(null);

  const byId = new Map(tasks.map((task) => [task.id, task]));

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitName = () => {
    const name = draft.trim();
    if (name) diary.addGroup(name);
    setDraft("");
    setNaming(false);
  };

  /** 落到文件夹上（卡面任何位置）= 排到末尾；落到某一行上 = 插到那一行前面 */
  const dropInto = (event: DragEvent, groupId: string, index?: number) => {
    if (!acceptsPlan(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setHover(null);
    const taskId = draggedPlanId(event);
    if (!taskId) return;
    const group = diary.groups.find((g) => g.id === groupId);
    if (group && group.taskIds.includes(taskId) && index !== undefined) {
      // 同一个文件夹里挪位置：拖到第 index 行前面。往下拖时自己会先被摘掉，下标要减一
      const from = group.taskIds.indexOf(taskId);
      diary.reorderInGroup(groupId, taskId, from < index ? index - 1 : index);
      return;
    }
    diary.moveToGroup(taskId, groupId, index);
  };

  const allowDrop = (event: DragEvent) => {
    if (!acceptsPlan(event) || readonly) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  if (readonly && diary.groups.length === 0) return null;

  return (
    <div className="mb-2">
      {/* 建文件夹：一个小胶囊，点开只要一个名字。它不是一条计划，所以不走上面那张添加表单 */}
      {!readonly && (
        <div className="mb-2 flex items-center">
          {naming ? (
            <input
              autoFocus
              value={draft}
              maxLength={24}
              placeholder="这一串叫什么"
              className="h-[40px] flex-1 rounded-full border-2 border-[#A5D6A7] bg-white px-4 text-[15px] font-bold text-[#5D4037] outline-none placeholder:text-[#BCAAA4]"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={submitName}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") submitName();
                if (event.key === "Escape") {
                  setDraft("");
                  setNaming(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="flex h-[40px] items-center gap-2 rounded-full bg-[#81C784] px-4 text-[14px] font-black text-white shadow-[0_4px_0_#4CAF50] transition-all hover:bg-[#66BB6A] active:translate-y-[4px] active:shadow-none"
            >
              <FolderPlus className="h-[18px] w-[18px]" strokeWidth={3} />
              系列任务
            </button>
          )}
        </div>
      )}

      {diary.groups.map((group) => {
        const members = group.taskIds
          .map((id) => byId.get(id))
          .filter((task): task is DiaryTask => task !== undefined);
        const open = expanded.has(group.id);
        const shown = open ? members : members.slice(0, 1);
        const hot = hover === group.id;

        return (
          <div
            key={group.id}
            className={`mb-2 rounded-[20px] border-2 bg-[#FFF8E1] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-colors ${hot ? "border-[#4DB6AC]" : "border-[#FFE082]"}`}
            onDragOver={(event) => {
              allowDrop(event);
              if (acceptsPlan(event)) setHover(group.id);
            }}
            onDragLeave={() => setHover(null)}
            onDrop={(event) => dropInto(event, group.id)}
          >
            <div className="flex h-[40px] items-center gap-2">
              <button
                type="button"
                onClick={() => toggle(group.id)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#FFE082] text-[#5D4037] shadow-[0_3px_0_#FFCA28]">
                  {open ? (
                    <ChevronDown className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <ChevronRight className="h-4 w-4" strokeWidth={3} />
                  )}
                </span>
                <span className="truncate text-[16px] font-black text-[#795548]">{group.name}</span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[12px] font-bold text-[#8D6E63] shadow-[inset_0_-2px_0_#EEEEEE]">
                  {members.length} 件
                </span>
              </button>
              {!readonly && (
                <button
                  type="button"
                  aria-label="删除这个系列（里面的计划回到清单）"
                  onClick={() => diary.removeGroup(group.id)}
                  className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-full bg-white text-[#BCAAA4] shadow-[0_3px_0_#E0E0E0] transition-colors hover:bg-[#EF5350] hover:text-white active:translate-y-[3px] active:shadow-none"
                >
                  <Trash2 className="h-[15px] w-[15px]" strokeWidth={2.5} />
                </button>
              )}
            </div>

            {members.length === 0 ? (
              <div className="px-2 pb-1 pt-1 text-[13px] font-bold text-[#BCAAA4]">
                把下面的计划拖进来，就按顺序排成一串
              </div>
            ) : (
              <div className="mt-1 flex flex-col gap-1">
                {shown.map((task, index) => (
                  <div
                    key={task.id}
                    draggable={!readonly && open}
                    onDragStart={(event) => beginPlanDrag(event, task.id)}
                    onDragOver={allowDrop}
                    onDrop={(event) => dropInto(event, group.id, index)}
                    className={`flex h-[48px] items-center gap-2 rounded-[14px] px-2 ${index === 0 ? "bg-white shadow-[0_2px_6px_rgba(0,0,0,0.04)]" : "bg-transparent"} ${open ? "cursor-grab" : ""}`}
                  >
                    <span className="w-5 shrink-0 text-center text-[12px] font-black text-[#BCAAA4]">
                      {index + 1}
                    </span>
                    <span
                      className={`flex-1 truncate text-[15px] font-bold ${index === 0 ? "text-[#5D4037]" : "text-[#A1887F]"}`}
                    >
                      {task.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[12px] font-bold text-[#8D6E63] shadow-[inset_0_-2px_0_#E0E0E0]">
                      {task.durationMinutes} min
                    </span>
                    {!readonly && open && (
                      <button
                        type="button"
                        title="拿出来，变回普通计划"
                        onClick={() => diary.moveToGroup(task.id, null)}
                        className="shrink-0 rounded-full px-2 text-[12px] font-bold text-[#BCAAA4] hover:text-[#EF5350]"
                      >
                        拿出
                      </button>
                    )}
                    {!readonly && index === 0 && (
                      <button
                        type="button"
                        aria-label="开始专注"
                        onClick={() => onStart(task)}
                        className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-[#FFCA28] text-white shadow-[0_3px_0_#FF8F00] transition-all hover:bg-[#FFB300] active:translate-y-[3px] active:shadow-none"
                      >
                        <Play className="ml-[2px] h-[14px] w-[14px] fill-current" strokeWidth={3} />
                      </button>
                    )}
                  </div>
                ))}
                {!open && members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    className="self-start px-2 pb-1 text-[12px] font-bold text-[#8D6E63] underline"
                  >
                    还有 {members.length - 1} 件，展开
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
