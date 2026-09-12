import { ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { emit, on } from "../../Game/EventBus";
import { t } from "../../i18n/t";
import { GameBtn } from "../GameBtn/GameBtn";
import {
  GUIDE_CATEGORY_ICON,
  guideCategoriesInUse,
  guideDefinitions,
  guideImages,
  type GuideCategory,
  type GuideDefinition,
  type GuideTag,
} from "../Guide/guides";
import { Modal } from "../Modal/Modal";
import { HammerSeal } from "../Modal/seals";
import { usePanel } from "../PanelStack/usePanel";

/**
 * 攻略查询器（2026-09-12，ESC 抽屉进）。**只是索引，不是阅读器**：左栏搜索 + 分类，
 * 右栏卡片，点一张 = `guide_open_requested`（immediate），用现成的引导面板看图；
 * 关掉引导回到这里。一份翻页逻辑、一份图。
 *
 * 分类来自 guides.ts 每条的 `category`，没有条目的分类不列（补了教程自动出现）。
 * 搜索一输入就跨分类过滤（标题 + 副标题），清空回到当前分类。
 * 缩略图先拿该教程第一张图裁（object-cover），设计稿那种单独画的小插画以后填 `thumb`。
 */
const HAND_FONT = '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif';

const TAG_STYLE: Record<GuideTag, string> = {
  basic: "bg-[#E8F5E9] text-[#2E7D32]",
  recommended: "bg-[#FFF3C4] text-[#8D6E00]",
  newbie: "bg-[#E0F2F1] text-[#00695C]",
};

export function GuideBookPanel() {
  const [open, setOpen] = usePanel("guideBook");
  const categories = useMemo(() => guideCategoriesInUse(), []);
  const [category, setCategory] = useState<GuideCategory>(categories[0] ?? "furniture");
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState(() => window.matchMedia("(max-height: 500px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(max-height: 500px)");
    const onChange = () => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(
    () =>
      on("ui_panel_requested", ({ panel }) => {
        if (panel !== "guideBook") return;
        setQuery("");
        setOpen(true);
      }),
    [setOpen],
  );

  const needle = query.trim().toLowerCase();
  const entries = guideDefinitions.filter((guide) =>
    needle
      ? `${t(guide.titleKey)} ${t(guide.subtitleKey)}`.toLowerCase().includes(needle)
      : guide.category === category,
  );

  const openGuide = (guide: GuideDefinition) => emit("guide_open_requested", { guideId: guide.id, immediate: true });

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      seal={<HammerSeal />}
      edgeColor="#C8E6C9"
      frameColor="#66BB6A"
      paperColor="#FDFBF7"
      aspect={phone ? undefined : 1.6}
      fill={phone ? undefined : 0.9}
      label={t("guide.book.title")}
    >
      <div className="absolute inset-0 flex flex-col gap-2 p-4 short:gap-1.5 short:p-2.5" style={{ fontFamily: HAND_FONT }}>
        {/* 标题 */}
        <header className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#66BB6A] text-[20px] shadow-[0_3px_0_#388E3C] short:h-7 short:w-7 short:text-[15px]">📗</span>
          <h2 className="m-0 text-[clamp(18px,2.4vw,28px)] font-black tracking-wide text-[#2b3b36] short:text-[16px]">{t("guide.book.title")}</h2>
        </header>

        <div className="flex min-h-0 flex-1 gap-3 short:gap-2">
          {/* 左栏：搜索 + 分类 */}
          <aside className="flex w-[34%] min-w-0 shrink-0 flex-col gap-2 border-r-2 border-[#E6E0D4] pr-3 short:w-[36%] short:gap-1 short:pr-2">
            <label className="flex items-center gap-2 rounded-full border-2 border-[#E0DACE] bg-white px-3 py-1.5 short:py-1">
              <Search className="h-4 w-4 shrink-0 text-[#A1887F]" strokeWidth={2.5} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("guide.book.search")}
                aria-label={t("guide.book.search")}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-[#5D4037] outline-none placeholder:text-[#BCAAA4] short:text-[12px]"
              />
            </label>
            <div className="ui-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1 short:gap-1">
              {categories.map((id) => {
                const active = !needle && id === category;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setCategory(id);
                      setQuery("");
                    }}
                    className={[
                      "flex shrink-0 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-[15px] font-black text-[#3E4A44] transition-colors short:px-2 short:py-1 short:text-[13px]",
                      active ? "border-[#A5D6A7] bg-[#E8F5E9]" : "border-[#EEE9DE] bg-white hover:bg-[#F6FBF4]",
                    ].join(" ")}
                  >
                    <span className="text-[18px] short:text-[15px]">{GUIDE_CATEGORY_ICON[id]}</span>
                    <span className="flex-1 truncate">{t(`guide.category.${id}`)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9E9E9E]" strokeWidth={3} />
                  </button>
                );
              })}
            </div>
          </aside>

          {/* 右栏：卡片 */}
          <div className="ui-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 short:gap-1.5">
            {entries.length === 0 && (
              <p className="m-0 grid flex-1 place-items-center text-[14px] text-[#A1887F]">{t("guide.book.empty")}</p>
            )}
            {entries.map((guide) => {
              const thumb = guide.thumb ?? guideImages(guide)[0];
              return (
                <button
                  key={guide.id}
                  type="button"
                  onClick={() => openGuide(guide)}
                  className="flex shrink-0 items-center gap-3 rounded-2xl border-2 border-[#EEE9DE] bg-white p-2 text-left transition-colors hover:border-[#C8E6C9] hover:bg-[#F6FBF4] short:gap-2 short:p-1.5"
                >
                  <span className="h-[64px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-[#F1F8E9] short:h-[48px] short:w-[66px]">
                    {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[17px] font-black text-[#2b3b36] short:text-[14px]">{t(guide.titleKey)}</span>
                      {guide.tag && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${TAG_STYLE[guide.tag]}`}>
                          {t(`guide.tag.${guide.tag}`)}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[13px] text-[#8D7B6E] short:text-[11px]">{t(guide.subtitleKey)}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[#BDBDBD]" strokeWidth={3} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 justify-end">
          <GameBtn size={phone ? "sm" : "md"} tone="mint" onClick={() => setOpen(false)}>
            {t("guide.close")}
          </GameBtn>
        </div>
      </div>
    </Modal>
  );
}
