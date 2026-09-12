import { ACHIEVEMENT_CATEGORY_ORDER, AchievementCategory } from "core";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import {
  claimAchievementReward,
  getAchievementPoints,
  listAchievements,
  type AchievementView,
} from "../../Game/Systems/achievements";
import { t } from "../../i18n/t";
import { GameBtn } from "../GameBtn/GameBtn";
import { Modal } from "../Modal/Modal";
import { HammerSeal } from "../Modal/seals";
import { usePanel } from "../PanelStack/usePanel";

/**
 * 成就面板（2026-09-12，ESC 抽屉进）。照设计稿：顶上一条总览（已完成 n / 总数 + 进度条、
 * 成就点数、一句口号），左栏分类，右栏两列卡片（矮屏一列）。
 *
 * 数据全从 Systems/achievements 的查询口来（`listAchievements` / `getAchievementPoints`），
 * 这里不算任何东西；统计表或成就状态一变（`stats_changed` / `achievements_changed`）就重取。
 *
 * 卡片状态：达成且有奖没领 → 「领取」按钮；达成 → 已完成；有进度 → 进行中 + 进度条；
 * 零进度 → 未解锁 + 进度条。隐藏成就没达成前只露「？？？」和点数。
 */
const HAND_FONT = '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif';

const CATEGORY_ICON: Record<"all" | AchievementCategory, string> = {
  all: "▦",
  [AchievementCategory.Newbie]: "🌱",
  [AchievementCategory.Life]: "🏡",
  [AchievementCategory.Cooking]: "🍲",
  [AchievementCategory.Furniture]: "🛋️",
  [AchievementCategory.Diary]: "📔",
  [AchievementCategory.Collect]: "⭐",
  [AchievementCategory.Hidden]: "🔒",
};

export function AchievementsPanel() {
  const [open, setOpen] = usePanel("achievements");
  const [category, setCategory] = useState<"all" | AchievementCategory>("all");
  const [views, setViews] = useState<AchievementView[]>(() => listAchievements());
  const [points, setPoints] = useState(() => getAchievementPoints());
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
        if (panel !== "achievements") return;
        setViews(listAchievements());
        setPoints(getAchievementPoints());
        setOpen(true);
      }),
    [setOpen],
  );

  useEffect(() => {
    const refresh = () => {
      setViews(listAchievements());
      setPoints(getAchievementPoints());
    };
    const offA = on("achievements_changed", refresh);
    const offB = on("stats_changed", refresh);
    return () => {
      offA();
      offB();
    };
  }, []);

  const done = views.filter((view) => view.state).length;
  const shown = views.filter((view) => category === "all" || view.definition.category === category);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      seal={<HammerSeal />}
      edgeColor="#C8E6C9"
      frameColor="#66BB6A"
      paperColor="#FDFBF7"
      aspect={phone ? undefined : 1.6}
      fill={phone ? undefined : 0.92}
      label={t("achievement.panel.title")}
    >
      <div className="absolute inset-0 flex flex-col gap-2 p-4 short:gap-1.5 short:p-2.5" style={{ fontFamily: HAND_FONT }}>
        {/* 顶栏：标题 + 总览 */}
        <header className="flex shrink-0 items-center gap-3 short:gap-2">
          <span className="text-[30px] leading-none short:text-[22px]">🏆</span>
          <h2 className="m-0 text-[clamp(18px,2.4vw,28px)] font-black tracking-wide text-[#2b3b36] short:text-[16px]">{t("achievement.panel.title")}</h2>
          <div className="ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-[#F1F3EE] px-3 py-1.5 short:gap-2 short:px-2 short:py-1">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[13px] font-black text-[#3E4A44] short:text-[11px]">
                {t("achievement.panel.done")} <span className="text-[16px] short:text-[13px]">{done} / {views.length}</span>
              </span>
              <span className="h-2.5 w-full overflow-hidden rounded-full bg-[#E0E0E0] short:h-2">
                <span className="block h-full rounded-full bg-[#66BB6A]" style={{ width: `${views.length ? (done / views.length) * 100 : 0}%` }} />
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 border-l-2 border-[#E0DACE] pl-3 short:pl-2">
              <span className="text-[22px] short:text-[16px]">⭐</span>
              <span className="flex flex-col leading-tight">
                <span className="text-[10px] text-[#8D7B6E]">{t("achievement.panel.points")}</span>
                <span className="text-[18px] font-black text-[#2b3b36] short:text-[14px]">{points}</span>
              </span>
            </div>
          </div>
          <span className="hidden shrink-0 rounded-2xl bg-[#E8F5E9] px-3 py-1.5 text-[13px] font-black text-[#2E7D32] lg:block">
            {t("achievement.panel.slogan")}
          </span>
        </header>

        <div className="flex min-h-0 flex-1 gap-3 short:gap-2">
          {/* 左栏：分类 */}
          <aside className="ui-scroll flex w-[26%] min-w-0 shrink-0 flex-col gap-1.5 overflow-y-auto border-r-2 border-[#E6E0D4] pr-3 short:w-[30%] short:gap-1 short:pr-2">
            {(["all", ...ACHIEVEMENT_CATEGORY_ORDER] as const).map((id) => {
              const active = id === category;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={[
                    "flex shrink-0 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-[15px] font-black text-[#3E4A44] transition-colors short:px-2 short:py-1 short:text-[13px]",
                    active ? "border-[#A5D6A7] bg-[#E8F5E9]" : "border-[#EEE9DE] bg-white hover:bg-[#F6FBF4]",
                  ].join(" ")}
                >
                  <span className="text-[18px] short:text-[15px]">{CATEGORY_ICON[id]}</span>
                  <span className="flex-1 truncate">{t(`achievement.category.${id}`)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#9E9E9E]" strokeWidth={3} />
                </button>
              );
            })}
          </aside>

          {/* 右栏：卡片 */}
          <div className="ui-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto pr-1 lg:grid-cols-2 short:gap-1.5">
            {shown.map((view) => (
              <AchievementCard key={view.definition.id} view={view} phone={phone} />
            ))}
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

function AchievementCard({ view, phone }: { view: AchievementView; phone: boolean }) {
  const { definition, progress, state, claimable } = view;
  const secret = Boolean(definition.hidden) && !state;
  const icon = secret ? "❓" : (definition.icon ?? "🏅");
  const status: "claim" | "done" | "progress" | "locked" = claimable
    ? "claim"
    : state
      ? "done"
      : progress.current > 0
        ? "progress"
        : "locked";

  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-[#EEE9DE] bg-white p-2.5 short:gap-2 short:p-2">
      <span className={`grid h-[60px] w-[60px] shrink-0 place-items-center rounded-2xl text-[30px] short:h-[46px] short:w-[46px] short:text-[24px] ${state ? "bg-[#E8F5E9]" : "bg-[#F5F5F5]"}`}>
        {icon.startsWith("/") ? <img src={icon} alt="" className="h-[78%] w-[78%] object-contain" draggable={false} /> : icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[16px] font-black text-[#2b3b36] short:text-[13px]">
            {secret ? t("achievement.panel.secret_title") : t(definition.titleKey)}
          </span>
          {status === "claim" ? (
            <GameBtn size="sm" tone="mint" onClick={() => claimAchievementReward(definition.id)}>
              {t("achievement.panel.claim")}
            </GameBtn>
          ) : (
            <span
              className={[
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black",
                status === "done" ? "bg-[#E8F5E9] text-[#2E7D32]" : status === "progress" ? "bg-[#FFF3C4] text-[#8D6E00]" : "bg-[#EEEEEE] text-[#757575]",
              ].join(" ")}
            >
              {status === "done" ? `✓ ${t("achievement.panel.status_done")}` : status === "progress" ? t("achievement.panel.status_progress") : t("achievement.panel.status_locked")}
            </span>
          )}
        </span>
        <span className="truncate text-[12px] text-[#8D7B6E] short:text-[11px]">
          {secret ? t("achievement.panel.secret_desc") : t(definition.descriptionKey)}
        </span>
        <span className="flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-[#FFF8E1] px-1.5 py-0.5 text-[11px] font-black text-[#8D6E00]">⭐ +{definition.points}</span>
          {!state && !secret && (
            <>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#E0E0E0]">
                <span className="block h-full rounded-full bg-[#66BB6A]" style={{ width: `${(progress.current / progress.target) * 100}%` }} />
              </span>
              <span className="shrink-0 text-[11px] font-black tabular-nums text-[#8D7B6E]">
                {progress.current}/{progress.target}
              </span>
            </>
          )}
        </span>
      </span>
      {phone ? null : <span className="w-0" />}
    </div>
  );
}
