import { findActionDefinition, type PlayerActionEntry } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import {
  createActionGroup,
  deleteActionGroup,
  layoutEntries,
  moveEntryToGroup,
  reorderInGroup,
} from "../../Game/State/actionGroups";
import {
  canAfford,
  getActionEntries,
  startActionEntry,
} from "../../Game/Systems/actions";
import { t } from "../../i18n/t";

/**
 * 行动面板首屏下面的「系列任务」区块：清单上的文件夹（任务组）。
 *
 * ---- 为什么长在首屏而不是分类列表里 ----
 *
 * 分类列表（B 屏）是**按分类切开**的：运动一屏、创作一屏。而一个组是
 * 跨分类的——"写完那本小说"里可以有"画人设"（创作）和"跑步清脑子"
 * （运动）。硬塞进某个分类屏，要么只显示该分类的成员（"只露出第一条"
 * 就不成立了），要么整组显示在四个屏里各出现一遍。首屏是唯一一个
 * 分类无关的地方，组就该在这儿。
 *
 * ---- 只露出第一条 ----
 *
 * 折叠时只显示成员里的第一条，它是"接下来该做的"。**展开之后也只有
 * 第一条能开始**——否则文件夹只是视觉分组，不是"系列"；而顺序能调
 * 这件事只有在"顺序有意义"时才成立。折叠状态不进存档：它是视图，
 * 每次打开面板都是折叠的。
 *
 * 这里没有拖拽：往组里放东西走每一行的「放进系列」下拉（分类屏里那条
 * 和这里的组不在同一屏，拖不过来），组内挪顺序用上下箭头。真正的拖拽
 * 在日记本左页——那一页是一张扁平清单，拖得起来。
 */

function StartButton({ entry }: { entry: PlayerActionEntry }) {
  const definition = findActionDefinition(entry.actionId);
  const affordable = definition ? canAfford(definition, entry.priority) : false;
  return (
    <button
      type="button"
      disabled={!affordable}
      title={affordable ? undefined : t("ui.action.too_tired")}
      className="ui-green-btn shrink-0 px-4 py-1 text-[13px] font-bold"
      onClick={() => startActionEntry(entry.entryId)}
    >
      {t("ui.action.start")}
    </button>
  );
}

export function GroupSection() {
  const [, force] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const offs = [
      on("action_groups_changed", () => force((n) => n + 1)),
      on("action_entries_changed", () => force((n) => n + 1)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const layout = layoutEntries(getActionEntries());

  const toggle = (groupId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  const submitName = () => {
    const name = draft.trim();
    if (name) createActionGroup(name);
    setDraft("");
    setNaming(false);
  };

  return (
    <section className="mt-3 flex shrink-0 flex-col">
      <header className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[13px] font-bold text-[#2b3b36]">{t("ui.group.title")}</span>
        {naming ? (
          <input
            autoFocus
            className="ui-input min-w-0 px-3 py-1 text-[13px]"
            placeholder={t("ui.group.name_placeholder")}
            value={draft}
            maxLength={24}
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
            className="ui-chip px-3 py-1 text-[12px] font-bold"
            onClick={() => setNaming(true)}
          >
            ＋ {t("ui.group.add")}
          </button>
        )}
      </header>

      {layout.groups.length === 0 ? (
        <div className="px-1 text-[12px] text-[#8a9a94]">{t("ui.group.empty_hint")}</div>
      ) : (
        <div className="ui-scroll flex max-h-[38vh] flex-col gap-2 overflow-y-auto">
          {layout.groups.map(({ group, members }) => {
            const open = expanded.has(group.groupId);
            const shown = open ? members : members.slice(0, 1);
            return (
              <div
                key={group.groupId}
                className="rounded-xl px-3 py-2"
                style={{ background: "#f4efe6" }}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => toggle(group.groupId)}
                    aria-expanded={open}
                  >
                    <span className="text-[13px] text-[#8a9a94]">{open ? "▾" : "▸"}</span>
                    <span className="truncate text-[14px] font-bold text-[#4a3b2a]">
                      📁 {group.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-[#8a9a94]">
                      {t("ui.group.count").replace("{n}", String(members.length))}
                    </span>
                  </button>
                  {/* 删组和删行一样安静：淡字，放上去才变红。删的只是文件夹，里面的事回到散条目 */}
                  <button
                    type="button"
                    aria-label={t("ui.group.delete")}
                    title={t("ui.group.delete_hint")}
                    className="shrink-0 rounded-lg px-2 py-1 text-[13px] text-[#b3bdb9] transition-colors hover:text-[#c25a48]"
                    onClick={() => deleteActionGroup(group.groupId)}
                  >
                    ✕
                  </button>
                </div>

                {members.length === 0 ? (
                  <div className="mt-1 pl-5 text-[12px] text-[#8a9a94]">
                    {t("ui.group.drop_hint")}
                  </div>
                ) : (
                  <div className="mt-1.5 flex flex-col gap-1 pl-5">
                    {shown.map((entry, index) => (
                      <div
                        key={entry.entryId}
                        className="flex items-center gap-2 rounded-lg px-2 py-1"
                        style={{ background: index === 0 ? "#fdfbf7" : "transparent" }}
                      >
                        <span className="w-4 shrink-0 text-[11px] text-[#8a9a94]">
                          {index + 1}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate text-[13px]"
                          style={{
                            color: index === 0 ? "#4a3b2a" : "#8a9a94",
                            fontWeight: index === 0 ? 700 : 500,
                          }}
                        >
                          {entry.customName}
                        </span>
                        <span className="shrink-0 text-[11px] text-[#9a8360]">
                          {entry.durationMinutes} {t("ui.action.minutes")}
                        </span>
                        {open && (
                          <>
                            <button
                              type="button"
                              aria-label={t("ui.group.move_up")}
                              disabled={index === 0}
                              className="shrink-0 px-1 text-[12px] text-[#8a9a94] disabled:opacity-30"
                              onClick={() => reorderInGroup(group.groupId, entry.entryId, index - 1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={t("ui.group.move_down")}
                              disabled={index === members.length - 1}
                              className="shrink-0 px-1 text-[12px] text-[#8a9a94] disabled:opacity-30"
                              onClick={() => reorderInGroup(group.groupId, entry.entryId, index + 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              aria-label={t("ui.group.take_out")}
                              title={t("ui.group.take_out")}
                              className="shrink-0 px-1 text-[12px] text-[#b3bdb9] hover:text-[#c25a48]"
                              onClick={() => moveEntryToGroup(entry.entryId, null)}
                            >
                              ⇱
                            </button>
                          </>
                        )}
                        {index === 0 && <StartButton entry={entry} />}
                      </div>
                    ))}
                    {!open && members.length > 1 && (
                      <button
                        type="button"
                        className="self-start pl-2 text-[11px] text-[#8a9a94] underline"
                        onClick={() => toggle(group.groupId)}
                      >
                        {t("ui.group.more").replace("{n}", String(members.length - 1))}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
