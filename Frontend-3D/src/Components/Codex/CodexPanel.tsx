import type { CodexEntry, CodexSectionId } from "core";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { iconUrl } from "../../Assets/icons";
import { on } from "../../Game/EventBus";
import { getCodexProgress, listCodex, listCodexTabs, type CodexView } from "../../Game/Systems/codex";
import { hasLocalizationKey, t } from "../../i18n/t";
import { GameBtn } from "../GameBtn/GameBtn";
import { Modal } from "../Modal/Modal";
import { HammerSeal } from "../Modal/seals";
import { usePanel } from "../PanelStack/usePanel";

/**
 * 图鉴面板（2026-09-15，ESC 抽屉进）。顶上一条总览（已收录 n / 总数 + 进度条），左栏分区导航，
 * 右栏**所有分区按顺序连着排**（分区标题 → 子分组 → 方格卡片），下面一条详情。
 *
 * 左栏是**导航不是筛选**（用户 2026-09-17）：点"居民"平滑滚到居民那一段，滚动时左栏跟着高亮
 * 当前所在的分区。原来是筛选（点了只剩那一类）+ 一个"全部"页签，切换时卡片整块跳，读起来很怪。
 *
 * **紧凑布局**（横屏矮屏 ≤500 高 = 手机基准机 667×375，或竖屏的窄窗口）走另一套骨架：
 * 页签放成顶上一行小胶囊、关闭钮并进标题行、详情改成点了才浮出来的一层（盖在卡片上，
 * 不占常驻高度），Modal 不给 aspect——按屏幕铺开而不是硬塞一块 1.6:1 的牌子。
 *
 * 这里**不认识任何注册表**：分区、条目、分组、图、文案键全从 Systems/codex 的查询口来
 * （最终来自 Core `Data/codex` 的来源表）。加一个分区，这个文件一行不改。
 *
 * 卡片两态：没见过 = 同一张图压成黑影 + 「？？？」，点了详情里也只有黑影和「？？？」；见过 = 正常图 + 名字，
 * 点了下面展开介绍和初见日。介绍文案缺的显示"介绍还没写"（用户自己补文案）。
 */
const HAND_FONT = '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif';

/** 和 tailwind 的 `short:` 同一条判据（横屏矮屏）；竖屏另算一条——窄窗口里 1.6:1 的牌子会被压成一条 */
const COMPACT_QUERY = "(orientation: landscape) and (max-height: 500px), (orientation: portrait)";

function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(media.matches);
    media.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);
  return compact;
}

type Group = { groupKey: string; views: CodexView[] };
type SectionBlock = { section: CodexSectionId; titleKey: string; emoji: string; groups: Group[] };

export function CodexPanel() {
  const [open, setOpen] = usePanel("codex");
  const [views, setViews] = useState<CodexView[]>(() => listCodex());
  const [progress, setProgress] = useState(() => getCodexProgress());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const compact = useCompact();
  const tabs = useMemo(() => listCodexTabs(), []);
  const [active, setActive] = useState<CodexSectionId | null>(tabs[0]?.section ?? null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<CodexSectionId, HTMLElement>());
  /** 点了导航正在平滑滚过去：这段时间滚动监听不改高亮，不然会一路闪过中间的分区 */
  const jumping = useRef<{ section: CodexSectionId; until: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setViews(listCodex());
    setProgress(getCodexProgress());
    setActive(tabs[0]?.section ?? null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [open, tabs]);

  useEffect(
    () =>
      on("codex_changed", () => {
        setViews(listCodex());
        setProgress(getCodexProgress());
      }),
    [],
  );

  // 分区（按来源表顺序）→ 子分组（按条目出现顺序）
  const blocks = useMemo<SectionBlock[]>(
    () =>
      tabs.map((tab) => {
        const byGroup = new Map<string, CodexView[]>();
        for (const view of views) {
          if (view.entry.section !== tab.section) continue;
          const list = byGroup.get(view.entry.groupKey) ?? [];
          list.push(view);
          byGroup.set(view.entry.groupKey, list);
        }
        return { ...tab, groups: [...byGroup.entries()].map(([groupKey, list]) => ({ groupKey, views: list })) };
      }),
    [tabs, views],
  );
  const selected = views.find((view) => view.entry.id === selectedId) ?? null;
  const total = progress.all;

  /** 分区标题离滚动区顶端多远（滚动坐标系） */
  const offsetOf = (section: CodexSectionId): number | null => {
    const container = scrollRef.current;
    const el = sectionRefs.current.get(section);
    if (!container || !el) return null;
    return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  };

  const jumpTo = (section: CodexSectionId) => {
    const container = scrollRef.current;
    const top = offsetOf(section);
    if (!container || top === null) return;
    setActive(section);
    jumping.current = { section, until: performance.now() + 900 };
    container.scrollTo({ top, behavior: "smooth" });
  };

  // 滚动高亮：最后一个标题已经滚到顶上的分区；滚到底就是最后一个
  const onScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const jump = jumping.current;
    if (jump) {
      const top = offsetOf(jump.section) ?? 0;
      const arrived = Math.abs(container.scrollTop - top) < 2 || container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
      if (!arrived && performance.now() < jump.until) return;
      jumping.current = null;
    }
    let current = tabs[0]?.section ?? null;
    for (const tab of tabs) {
      const top = offsetOf(tab.section);
      if (top !== null && top <= container.scrollTop + 12) current = tab.section;
    }
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
      current = tabs[tabs.length - 1]?.section ?? current;
    }
    setActive(current);
  };

  const grid = (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="ui-scroll min-h-0 flex-1 overflow-y-auto pr-1"
      style={{ scrollBehavior: "smooth" }}
    >
      {blocks.map((block) => {
        const count = progress[block.section];
        return (
          <section
            key={block.section}
            ref={(el) => {
              if (el) sectionRefs.current.set(block.section, el);
              else sectionRefs.current.delete(block.section);
            }}
            className={compact ? "mb-3" : "mb-4"}
          >
            <h2
              className={`m-0 mb-1.5 flex items-center gap-1.5 font-black text-[#4a3b33] ${compact ? "text-[13px]" : "text-[15px]"}`}
            >
              <span className="leading-none">{block.emoji}</span>
              <span>{t(block.titleKey)}</span>
              {count && <span className="text-[11px] tabular-nums text-[#9E9E9E]">{count.seen}/{count.total}</span>}
            </h2>
            {block.groups.map((group) => (
              <div key={group.groupKey} className={compact ? "mb-1.5" : "mb-2"}>
                <h3 className={`m-0 mb-1 font-black text-[#8D7B6E] ${compact ? "text-[11px]" : "text-[12px]"}`}>{t(group.groupKey)}</h3>
                <div
                  className={`grid gap-2 ${
                    compact ? "grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5" : "grid-cols-[repeat(auto-fill,minmax(88px,1fr))]"
                  }`}
                >
                  {group.views.map((view) => (
                    <CodexCard
                      key={view.entry.id}
                      view={view}
                      active={view.entry.id === selectedId}
                      compact={compact}
                      onClick={() => setSelectedId((current) => (compact && current === view.entry.id ? null : view.entry.id))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      seal={<HammerSeal />}
      edgeColor="#D7CCC8"
      frameColor="#8D6E63"
      paperColor="#FDFBF7"
      aspect={compact ? undefined : 1.6}
      fill={compact ? undefined : 0.92}
      label={t("codex.panel.title")}
    >
      {compact ? (
        /* ---- 紧凑：标题行（含关闭）→ 导航一行 → 卡片铺满 → 详情浮层 ---- */
        <div className="absolute inset-0 flex flex-col gap-1.5 p-2.5" style={{ fontFamily: HAND_FONT }}>
          <header className="flex shrink-0 items-center gap-2">
            <span className="text-[20px] leading-none">📖</span>
            <h2 className="m-0 text-[16px] font-black tracking-wide text-[#3e2f28]">{t("codex.panel.title")}</h2>
            <div className="ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[#F3EFE9] px-2 py-1">
              <span className="shrink-0 text-[11px] font-black text-[#4a3b33]">
                {t("codex.panel.collected")} <span className="text-[13px] tabular-nums">{total.seen}/{total.total}</span>
              </span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#E0E0E0]">
                <span className="block h-full rounded-full bg-[#8D6E63]" style={{ width: `${total.total ? (total.seen / total.total) * 100 : 0}%` }} />
              </span>
            </div>
            <GameBtn size="sm" tone="mint" onClick={() => setOpen(false)}>
              {t("guide.close")}
            </GameBtn>
          </header>

          <nav className="ui-scroll flex shrink-0 gap-1.5 overflow-x-auto pb-0.5">
            {tabs.map((item) => {
              const on_ = item.section === active;
              const count = progress[item.section];
              return (
                <button
                  key={item.section}
                  type="button"
                  onClick={() => jumpTo(item.section)}
                  className={[
                    "flex shrink-0 items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[12px] font-black text-[#4a3b33] transition-colors duration-200",
                    on_ ? "border-[#BCAAA4] bg-[#EFEBE9]" : "border-[#EEE9DE] bg-white",
                  ].join(" ")}
                >
                  <span className="text-[14px] leading-none">{item.emoji}</span>
                  <span>{t(item.titleKey)}</span>
                  <span className="text-[10px] tabular-nums text-[#9E9E9E]">{count ? `${count.seen}/${count.total}` : ""}</span>
                </button>
              );
            })}
          </nav>

          <div className="relative flex min-h-0 flex-1 flex-col">
            {grid}
            {selected && (
              <div className="absolute inset-x-0 bottom-0 z-10">
                <CodexDetail view={selected} compact onClose={() => setSelectedId(null)} />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ---- 桌面：顶栏总览 → 左栏导航 + 右栏卡片 → 常驻详情条 → 底部按钮 ---- */
        <div className="absolute inset-0 flex flex-col gap-2 p-4" style={{ fontFamily: HAND_FONT }}>
          <header className="flex shrink-0 items-center gap-3">
            <span className="text-[30px] leading-none">📖</span>
            <h2 className="m-0 text-[clamp(18px,2.4vw,28px)] font-black tracking-wide text-[#3e2f28]">{t("codex.panel.title")}</h2>
            <div className="ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-[#F3EFE9] px-3 py-1.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[13px] font-black text-[#4a3b33]">
                  {t("codex.panel.collected")} <span className="text-[16px]">{total.seen} / {total.total}</span>
                </span>
                <span className="h-2.5 w-full overflow-hidden rounded-full bg-[#E0E0E0]">
                  <span className="block h-full rounded-full bg-[#8D6E63]" style={{ width: `${total.total ? (total.seen / total.total) * 100 : 0}%` }} />
                </span>
              </div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 gap-3">
            <aside className="ui-scroll flex w-[24%] min-w-0 shrink-0 flex-col gap-1.5 overflow-y-auto border-r-2 border-[#E6E0D4] pr-3">
              {tabs.map((item) => {
                const on_ = item.section === active;
                const count = progress[item.section];
                return (
                  <button
                    key={item.section}
                    type="button"
                    onClick={() => jumpTo(item.section)}
                    className={[
                      "flex shrink-0 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-[15px] font-black text-[#4a3b33] transition-colors duration-200",
                      on_ ? "border-[#BCAAA4] bg-[#EFEBE9]" : "border-[#EEE9DE] bg-white hover:bg-[#FAF6F2]",
                    ].join(" ")}
                  >
                    <span className="text-[18px]">{item.emoji}</span>
                    <span className="flex-1 truncate">{t(item.titleKey)}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[#9E9E9E]">
                      {count ? `${count.seen}/${count.total}` : ""}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9E9E9E]" strokeWidth={3} />
                  </button>
                );
              })}
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              {grid}
              <CodexDetail view={selected} compact={false} />
            </div>
          </div>

          <div className="flex shrink-0 justify-end">
            <GameBtn size="md" tone="mint" onClick={() => setOpen(false)}>
              {t("guide.close")}
            </GameBtn>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** 卡片上的图：有 PNG 用 PNG，没有用兜底 emoji。没见过时整个压成黑影（同一张图，不另画） */
function CodexIconTile({ entry, seen, big }: { entry: CodexEntry; seen: boolean; big?: boolean }) {
  const src = iconUrl(entry.icon.iconKey);
  const style = seen ? undefined : { filter: "brightness(0)", opacity: 0.32 };
  const size = big ? "h-[84%] w-[84%]" : "h-[76%] w-[76%]";
  return src ? (
    <img src={src} alt="" draggable={false} className={`${size} object-contain`} style={style} />
  ) : (
    <span className={big ? "text-[44px]" : "text-[clamp(20px,4vh,28px)]"} style={style}>
      {entry.icon.fallback}
    </span>
  );
}

function CodexCard({
  view,
  active,
  compact,
  onClick,
}: {
  view: CodexView;
  active: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  const seen = Boolean(view.discovery);
  return (
    <button
      type="button"
      onClick={onClick}
      title={seen ? t(view.entry.nameKey) : t("codex.panel.unknown_name")}
      className={[
        "flex flex-col items-center rounded-2xl border-2 text-center transition-colors",
        compact ? "gap-0.5 p-1" : "gap-1 p-1.5",
        active ? "border-[#BCAAA4] bg-[#EFEBE9]" : "border-[#EEE9DE] bg-white hover:bg-[#FAF6F2]",
      ].join(" ")}
    >
      <span className={`grid aspect-square w-full place-items-center rounded-xl ${seen ? "bg-[#FFF8E1]" : "bg-[#ECEAE6]"}`}>
        <CodexIconTile entry={view.entry} seen={seen} />
      </span>
      <span className={`w-full truncate font-black ${compact ? "text-[10px]" : "text-[12px]"} ${seen ? "text-[#3e2f28]" : "text-[#9E9E9E]"}`}>
        {seen ? t(view.entry.nameKey) : t("codex.panel.unknown_name")}
      </span>
    </button>
  );
}

function CodexDetail({
  view,
  compact,
  onClose,
}: {
  view: CodexView | null;
  compact: boolean;
  onClose?: () => void;
}) {
  if (!view) {
    return (
      <div className="shrink-0 rounded-2xl border-2 border-dashed border-[#EEE9DE] px-3 py-2 text-[12px] text-[#9E9E9E]">
        {t("codex.panel.detail_hint")}
      </div>
    );
  }
  const seen = Boolean(view.discovery);
  // 没见过的只露黑影和"？？？"，不配说明文字（用户 2026-09-17 删的）
  const desc = seen
    ? hasLocalizationKey(view.entry.descKey)
      ? t(view.entry.descKey)
      : t("codex.panel.no_desc")
    : null;
  return (
    <div
      className={[
        "flex shrink-0 items-center gap-3 rounded-2xl border-2 border-[#EEE9DE] bg-white",
        compact ? "gap-2 p-2 shadow-[0_-4px_14px_rgba(62,47,40,0.18)]" : "p-2.5",
      ].join(" ")}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-2xl ${seen ? "bg-[#FFF8E1]" : "bg-[#ECEAE6]"} ${compact ? "h-[48px] w-[48px]" : "h-[72px] w-[72px]"}`}
      >
        <CodexIconTile entry={view.entry} seen={seen} big={!compact} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={`truncate font-black text-[#3e2f28] ${compact ? "text-[13px]" : "text-[16px]"}`}>
            {seen ? t(view.entry.nameKey) : t("codex.panel.unknown_name")}
          </span>
          {view.discovery && (
            <span className="shrink-0 text-[11px] text-[#8D7B6E]">
              {t("codex.panel.seen_on")} {view.discovery.seenDayId}
            </span>
          )}
        </span>
        {desc && (
          <span className={`line-clamp-2 leading-snug text-[#5D4037] ${compact ? "text-[11px]" : "text-[12px]"}`}>{desc}</span>
        )}
      </span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("guide.close")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F3EFE9] text-[14px] font-black text-[#8D7B6E]"
        >
          ✕
        </button>
      )}
    </div>
  );
}
