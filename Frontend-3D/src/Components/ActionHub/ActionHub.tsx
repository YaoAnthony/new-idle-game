import {
  ActionCategory,
  ActionPriority,
  actionDefinitions,
  actionPriorityDefinitions,
  findActionDefinition,
  type PlayerActionEntry,
} from "core";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { on } from "../../Game/EventBus";
import {
  addActionEntry,
  canAfford,
  countActionEntries,
  fatigueCostOf,
  findSupportingFurniture,
  getActionEntriesByCategory,
  getActiveAction,
  removeActionEntry,
  startActionEntry,
} from "../../Game/Systems/actions";
import { getDefinition, getWorld } from "../../Game/State/worldRuntime";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";
import { ChainView } from "./ChainView";
import { getActionChains } from "../../Game/State/actionChains";

/**
 * 行动面板。三屏，对照 `old/版本期望/figures` 的像素稿：
 *
 *   A 分类网格（四张卡 + 数字角标 + 锁定态）
 *     → B 分类列表（信纸区 + 已存的行动 + 添加按钮）
 *       → C 添加表单（名字 / 时长 / 重要级 / 使用家具）
 *
 * 行动是**先创建、后启动**的：清单存在 PlayerSave.actionEntries 里，
 * 卡片角标读的就是它。
 */

/** 时长预设（分钟）。图里是 5 / 10 / 25 / 45 / 60 */
const DURATION_PRESETS = [5, 10, 25, 45, 60];

/** 四张卡的顺序按图：运动 → 工作学习 → 创作 → 休息 */
const CATEGORY_ORDER: ActionCategory[] = [
  ActionCategory.Exercise,
  ActionCategory.WorkStudy,
  ActionCategory.Creation,
  ActionCategory.Rest,
];

type Screen =
  | { kind: "grid" }
  | { kind: "list"; category: ActionCategory }
  | { kind: "form"; category: ActionCategory }
  | { kind: "chains"; category: ActionCategory };

/** 该分类当前会用到的家具名（表单里的「使用家具」只读行） */
function supportingFurnitureName(category: ActionCategory): string | null {
  const instanceId = findSupportingFurniture(category);
  if (instanceId === null) return null;

  const placed = getWorld().placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  const definition = placed ? getDefinition(placed.furnitureId) : undefined;
  return definition ? t(definition.localizationKey) : null;
}

export function ActionHub() {
  // 挡屏面板，开关挂在全局面板栈上：谁开着、ESC 该退哪一层，全场一份账
  const [open, setOpen] = usePanel("actions");
  const [screen, setScreen] = useState<Screen>({ kind: "grid" });
  const [, force] = useState(0);
  const active = getActiveAction();

  useEffect(
    () => on("ui_panel_requested", ({ panel }) => {
      if (panel === "actions") setOpen(true);
    }),
    [setOpen],
  );

  useEffect(() => {
    const offAction = on("action_changed", ({ status }) => {
      force((n) => n + 1);
      if (status === "started") setOpen(false);
    });
    const offEntries = on("action_entries_changed", () => force((n) => n + 1));
    const offChains = on("action_chains_changed", () => force((n) => n + 1));
    const offNeeds = on("needs_changed", () => force((n) => n + 1));
    const offWorld = on("world_changed", () => force((n) => n + 1));

    return () => {
      offAction();
      offEntries();
      offChains();
      offNeeds();
      offWorld();
    };
  }, [setOpen]);

  // 关闭时回到网格，下次打开不会停在上次的子页
  useEffect(() => {
    if (!open) setScreen({ kind: "grid" });
  }, [open]);

  /*
   * 专注中把整块 UI 收起来：不能在专注时开面板另起一个行动。
   *
   * 倒计时卡、全屏暗角、结束提示都**不在这里**了（V0.13 抽走）——
   * 它们属于屏幕正上方那一栈（见 Hud/HudTopCenter），留在这里的话
   * 会和每日进度条抢同一个绝对定位点。这里只剩"按钮 + 面板"。
   */
  if (active) return null;

  return (
    <>
      {/*
        用户提供的图标（work.png，自带木框描边）换掉原来的文字药丸；
        文案挪进 aria-label。几何仍交给 .hud-corner-btn--inner（见
        index.css）：按 --hud-btn 算高度、按齿轮的宽度算让位距离。
      */}
      <motion.button
        type="button"
        aria-label={t("ui.action.title")}
        className="hud-icon-btn hud-corner-btn hud-corner-btn--inner z-10"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen((value) => !value)}
      >
        <img src="/icons/button/work.png" alt="" />
      </motion.button>

      {open && (
        /*
         * z-40 而不是 30：这是全屏模态，按仓库既有分层（HUD 和侧栏 z-30、
         * 全屏覆盖 z-40）该和背包一档。留在 z-30 会和右上角的设置齿轮同层，
         * 齿轮 DOM 靠后就赢——横屏上它正好压在面板的 ✕ 上（实测 667x375）。
         *
         * `min-h-0` 同背包那处：grid 项的 min-height 默认是 auto，会顶掉
         * 子元素的 max-height，面板撑高后牌匾（-translate-y-1/2 挂在上边缘外）
         * 直接被顶出屏幕。
         */
        <div className="absolute inset-0 z-40 grid min-h-0 place-items-center bg-black/45 px-6 py-7">
          {screen.kind === "grid" && (
            <CategoryGrid
              onClose={() => setOpen(false)}
              onEnter={(category) => setScreen({ kind: "list", category })}
            />
          )}
          {screen.kind === "list" && (
            <CategoryList
              category={screen.category}
              onBack={() => setScreen({ kind: "grid" })}
              onClose={() => setOpen(false)}
              onAdd={() => setScreen({ kind: "form", category: screen.category })}
              onChains={() => setScreen({ kind: "chains", category: screen.category })}
            />
          )}
          {screen.kind === "chains" && (
            <ChainView
              category={screen.category}
              onBack={() => setScreen({ kind: "list", category: screen.category })}
              onClose={() => setOpen(false)}
            />
          )}
          {screen.kind === "form" && (
            <ActionForm
              category={screen.category}
              onClose={() => setOpen(false)}
              onDone={() => setScreen({ kind: "list", category: screen.category })}
            />
          )}
        </div>
      )}
    </>
  );
}

/** 面板外壳：木框 + 牌匾标题 + 右上关闭，三屏共用 */
function Panel({
  title,
  subtitle,
  onBack,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    /*
     * 尺寸是**固定**的，三屏（网格/列表/表单）共用同一块：高吃满视口减
     * 遮罩的 py-7（桌面封顶 640，SE 横屏自动收到 ~319），宽同理。
     * 原来各屏由内容撑高，切屏面板一跳一跳的（用户打回）。内容装不下
     * 就在自己的滚动区里滚，外壳不动。
     */
    <div
      className="ui-action-panel relative flex flex-col px-8 pb-6 pt-9"
      style={{
        width: "min(1120px, 92vw)",
        height: "min(calc(100dvh - 56px), 640px)",
      }}
    >
      {/* 牌匾压在面板上边缘 */}
      <div className="ui-plaque absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 px-10 py-2">
        <span className="text-[22px] font-bold tracking-[0.25em] text-[#5c3a1d]">
          {title}
        </span>
      </div>

      {onBack && (
        <button
          type="button"
          className="ui-wood-btn absolute left-5 top-5 grid h-9 w-9 place-items-center text-[16px]"
          aria-label="返回"
          onClick={onBack}
        >
          ←
        </button>
      )}
      <button
        type="button"
        className="ui-wood-btn absolute right-5 top-5 grid h-9 w-9 place-items-center text-[16px]"
        aria-label="关闭"
        onClick={onClose}
      >
        ✕
      </button>

      <div className="mb-4 mt-2 shrink-0 text-center text-[13px] tracking-wide text-[#8a6a45]">
        ❧ {subtitle} ❧
      </div>

      <div className="min-h-0 flex-1">{children}</div>

      {footer && (
        <div className="mt-3 shrink-0 text-center text-[12px] text-[#8a6a45]">
          💡 {footer}
        </div>
      )}
    </div>
  );
}

/** A 屏：四张分类卡 */
function CategoryGrid({
  onClose,
  onEnter,
}: {
  onClose: () => void;
  onEnter: (category: ActionCategory) => void;
}) {
  return (
    <Panel
      title={t("ui.action.title")}
      subtitle={t("ui.action.pick_category")}
      onClose={onClose}
    >
      <div className="grid h-full grid-cols-4 gap-4">
        {CATEGORY_ORDER.map((category) => {
          const definition = actionDefinitions.find(
            (entry) => entry.category === category,
          );
          if (!definition) return null;

          const unlocked = findSupportingFurniture(category) !== null;
          const count = countActionEntries(category);

          return (
            <button
              key={category}
              type="button"
              disabled={!unlocked}
              className={[
                "ui-action-card relative flex flex-col items-center justify-between px-3 pb-4 pt-5",
                unlocked ? "" : "ui-action-card--locked",
              ].join(" ")}
              onClick={() => unlocked && onEnter(category)}
            >
              <span className="ui-badge absolute right-2.5 top-2.5 min-w-[26px] px-1.5 py-0.5 text-center text-[13px] font-bold">
                {count}
              </span>

              {/*
                标题**从角标下方起头**（角标 top-2.5 + 高 28 = 到 38px，
                pt-5 的 20 再加 mt-5 的 20 正好让开），这样整个卡片宽度都能用。

                试过改成左右各留 28px 给角标——iPhone SE 横屏卡片只有 123px 宽，
                让完只剩 67px，"工作或学习任务"被挤成四行「工作/或学/习任/务」，
                比原来的重叠还难看。横向挤不过就往纵向让。
              */}
              <span
                className={[
                  "mt-5 px-1 text-center text-[15px] font-bold",
                  unlocked ? "text-[#5c3a1d]" : "text-[#6f6a62]",
                ].join(" ")}
              >
                {t(definition.localizationKey)}
              </span>

              {/*
                插图在矮屏上要小一圈：110px 是给桌面定的，iPhone SE 横屏
                只有 375px 高，四张卡加牌匾根本排不下。缩放规则按**高度**判
                （见 index.css 的 .action-card__art）——用 Tailwind 的 sm: 会
                踩坑，那是 640px 的**宽度**断点，横屏 667 宽照样命中，
                等于没缩。

                `onError` 用 display 而不是 visibility——这几张图现在还没画
                （public/ui 里没有 action-*.png），visibility:hidden 会**隐藏
                但照样占位**，实测每张卡白占 142px（图 110 + my-4 的 32），
                占卡片总高的 57%，面板因此撑到 362px 把牌匾顶出屏幕。
                看不见的东西不该占地方。
              */}
              <img
                src={`/ui/action-${category}.png`}
                alt=""
                className={[
                  "action-card__art my-4 h-[110px] w-[110px] object-contain",
                  unlocked ? "" : "opacity-60 grayscale",
                ].join(" ")}
                style={{ imageRendering: "pixelated" }}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />

              {unlocked ? (
                <span className="text-[13px] font-bold tracking-wide text-[#8a6a45]">
                  ❧ {t("ui.action.enter")} ❧
                </span>
              ) : (
                <>
                  <span className="text-[18px] leading-none">🔒</span>
                  <span className="mt-1.5 text-[12px] text-[#6f6a62]">
                    {t("ui.action.locked")}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** B 屏：某个分类下已保存的行动列表 */
function CategoryList({
  category,
  onBack,
  onClose,
  onAdd,
  onChains,
}: {
  category: ActionCategory;
  onBack: () => void;
  onClose: () => void;
  onAdd: () => void;
  onChains: () => void;
}) {
  const definition = actionDefinitions.find(
    (entry) => entry.category === category,
  );
  const entries = getActionEntriesByCategory(category);

  return (
    <Panel
      title={definition ? t(definition.localizationKey) : ""}
      subtitle={t("ui.action.pick_entry")}
      onBack={onBack}
      onClose={onClose}
      footer={
        entries.length === 0
          ? t("ui.action.list_footer_empty")
          : t("ui.action.list_footer")
      }
    >
      <div className="flex h-full flex-col">
      {/*
        工具行：左「系列任务」右「添加行动」，占一整行，信纸从它下面开始。
        原来两个按钮是 absolute 钉在 top-[70px] 的——正好骑在信纸的虚线框上，
        像两块贴上去的补丁（用户抓的就是这个）。按钮是布局的一部分就进布局流，
        绝对定位留给真正要悬浮的东西（关闭键、角标）。
      */}
      <div className="flex shrink-0 items-center justify-between">
        {/* 系列任务入口：分类跟着这张卡走，链和它的所有环都继承这个分类 */}
        <button
          type="button"
          className="ui-wood-btn px-4 py-2 text-[14px] font-bold"
          onClick={onChains}
        >
          🌳 {t("ui.chain.entry")}
          {(() => {
            const count = getActionChains().filter(
              (chain) => chain.category === category && !chain.completedAtUtc,
            ).length;
            return count > 0 ? ` ${count}` : "";
          })()}
        </button>
        <button
          type="button"
          className="ui-green-btn px-4 py-2 text-[14px] font-bold"
          onClick={onAdd}
        >
          ＋ {t("ui.action.add")}
        </button>
      </div>

      {/* 信纸吃掉剩余全部高度（外壳已经定死尺寸），装不下自己滚 */}
      <div className="ui-paper ui-scroll mt-2 min-h-0 flex-1 overflow-y-auto p-4">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <img
              src="/ui/action-empty.png"
              alt=""
              className="mb-3 h-[96px] w-[96px] object-contain"
              style={{ imageRendering: "pixelated" }}
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
            <div className="text-[20px] font-bold text-[#7d6242]">
              {t("ui.action.empty_title")}
            </div>
            <div className="mt-1 text-[13px] text-[#9a8360]">
              {t("ui.action.empty_hint")}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {entries.map((entry) => (
              <ActionRow key={entry.entryId} entry={entry} category={category} />
            ))}
          </div>
        )}
      </div>
      </div>
    </Panel>
  );
}

/** 列表里的一行：重要级徽章 + 名字 + 时长 + 家具 + 开始 */
function ActionRow({
  entry,
  category,
}: {
  entry: PlayerActionEntry;
  category: ActionCategory;
}) {
  const definition = findActionDefinition(entry.actionId);
  const priority = actionPriorityDefinitions.find(
    (item) => item.id === entry.priority,
  );
  const furnitureName = supportingFurnitureName(category);
  const affordable = definition ? canAfford(definition, entry.priority) : false;
  const cost = definition ? fatigueCostOf(definition, entry.priority) : 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border-2 border-[#dcc89a] bg-[#fdf6e2] px-3 py-2.5">
      <span
        className={[
          "ui-chip shrink-0 px-2.5 py-1 text-[12px] font-bold",
          entry.priority === ActionPriority.High
            ? "ui-chip--strong"
            : "ui-chip--on",
        ].join(" ")}
      >
        {entry.priority === ActionPriority.Low ? "🍃" : "⭐"}{" "}
        {priority ? t(priority.localizationKey) : ""}
      </span>

      <span className="flex-1 truncate text-[15px] font-bold text-[#4a3b2a]">
        {entry.customName}
      </span>

      <span className="shrink-0 text-[13px] text-[#7d6242]">
        🕐 {entry.durationMinutes} {t("ui.action.minutes")}
      </span>

      {furnitureName && (
        <span className="shrink-0 text-[13px] text-[#7d6242]">
          {furnitureName}
        </span>
      )}

      <span
        className="shrink-0 text-[12px] text-[#9a8360]"
        title={cost >= 0 ? t("ui.action.fatigue_cost") : t("ui.action.fatigue_restore")}
      >
        {cost >= 0 ? `−${cost}` : `+${-cost}`}
      </span>

      <button
        type="button"
        className="ui-wood-btn shrink-0 px-2 py-1 text-[12px]"
        onClick={() => removeActionEntry(entry.entryId)}
      >
        ✕
      </button>

      <button
        type="button"
        disabled={!affordable}
        title={affordable ? undefined : t("ui.action.too_tired")}
        className="ui-green-btn shrink-0 px-5 py-1.5 text-[14px] font-bold"
        onClick={() => startActionEntry(entry.entryId)}
      >
        {t("ui.action.start")}
      </button>
    </div>
  );
}

/** C 屏：添加行动表单 */
function ActionForm({
  category,
  onClose,
  onDone,
}: {
  category: ActionCategory;
  onClose: () => void;
  onDone: () => void;
}) {
  const definition = actionDefinitions.find(
    (entry) => entry.category === category,
  );
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(25);
  const [priority, setPriority] = useState<ActionPriority>(ActionPriority.Normal);

  const furnitureName = supportingFurnitureName(category);
  const cost = definition ? fatigueCostOf(definition, priority) : 0;

  const clampMinutes = (value: number): number => {
    const min = definition?.durationMinutes.min ?? 1;
    const max = definition?.durationMinutes.max ?? 480;
    return Math.max(min, Math.min(max, value));
  };

  const save = () => {
    if (!definition) return;
    addActionEntry({
      actionId: definition.id,
      customName: name,
      durationMinutes: minutes,
      priority,
    });
    onDone();
  };

  return (
    <Panel
      title={t("ui.action.form_title")}
      subtitle={definition ? t(definition.localizationKey) : ""}
      onClose={onClose}
      footer={t("ui.action.form_footer")}
    >
      <div className="ui-scroll mx-auto flex h-full w-full max-w-[760px] flex-col gap-4 overflow-y-auto">
        {/* 要做什么 */}
        <div>
          <div className="mb-1.5 text-[15px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.action.what")}
          </div>
          <input
            className="ui-input w-full px-3 py-2 text-[15px] outline-none"
            placeholder={t("ui.action.what_placeholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        {/* 做多久：步进器 + 预设 */}
        <div>
          <div className="mb-1.5 text-[15px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.action.how_long")}
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              className="ui-wood-btn h-10 w-11 text-[20px] leading-none"
              onClick={() => setMinutes((value) => clampMinutes(value - 5))}
            >
              −
            </button>
            <div className="ui-input min-w-[190px] px-5 py-2 text-center">
              <span className="text-[26px] font-bold text-[#4a3b2a]">
                {minutes}
              </span>
              <span className="ml-1.5 text-[14px] text-[#7d6242]">
                {t("ui.action.minutes")}
              </span>
            </div>
            <button
              type="button"
              className="ui-wood-btn h-10 w-11 text-[20px] leading-none"
              onClick={() => setMinutes((value) => clampMinutes(value + 5))}
            >
              ＋
            </button>
          </div>
          <div className="mt-2 flex justify-center gap-2">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={[
                  "ui-chip px-3.5 py-1.5 text-[14px]",
                  minutes === preset ? "ui-chip--on" : "",
                ].join(" ")}
                onClick={() => setMinutes(clampMinutes(preset))}
              >
                <span className="font-bold">{preset}</span>
                <span className="ml-1 text-[12px]">{t("ui.action.minutes")}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 重要级：代价和收益同向缩放，所以顺手把数值摆出来给玩家看 */}
        <div>
          <div className="mb-1.5 text-[15px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.action.priority")}
          </div>
          <div className="flex gap-2">
            {actionPriorityDefinitions.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={[
                  "ui-chip flex-1 py-2 text-[15px]",
                  priority === entry.id
                    ? entry.id === ActionPriority.High
                      ? "ui-chip--strong"
                      : "ui-chip--on"
                    : "",
                ].join(" ")}
                onClick={() => setPriority(entry.id)}
              >
                {entry.id === ActionPriority.Low ? "🍃" : "⭐"}{" "}
                <span className="font-bold">{t(entry.localizationKey)}</span>
                <span className="ml-1.5 text-[11px] opacity-80">
                  ×{entry.rewardMultiplier}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-center text-[12px] text-[#8a6a45]">
            {cost >= 0
              ? `${t("ui.action.fatigue_cost")} ${cost}`
              : `${t("ui.action.fatigue_restore")} ${-cost}`}
          </div>
        </div>

        {/* 使用家具：自动选中，不给改（图里带锁） */}
        <div>
          <div className="mb-1.5 text-[15px] font-bold text-[#5c3a1d]">
            🌿 {t("ui.action.furniture")}
          </div>
          <div className="ui-readonly-row mx-auto flex w-[70%] items-center justify-between px-4 py-2.5">
            <span className="text-[15px]">{furnitureName ?? "—"}</span>
            <span className="text-[15px] opacity-70">🔒</span>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between">
          <button
            type="button"
            className="ui-chip px-8 py-2.5 text-[15px] font-bold"
            onClick={onDone}
          >
            {t("ui.action.cancel")}
          </button>
          <button
            type="button"
            className="ui-green-btn px-10 py-2.5 text-[16px] font-bold"
            disabled={!definition}
            onClick={save}
          >
            {t("ui.action.save")}
          </button>
        </div>
      </div>
    </Panel>
  );
}
