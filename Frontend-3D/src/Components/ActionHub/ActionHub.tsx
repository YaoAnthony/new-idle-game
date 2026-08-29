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
  fatigueCostOf,
  findSupportingFurniture,
  getActionEntriesByCategory,
  getActiveAction,
  removeActionEntry,
  describeActionLog,
  logCompletedAction,
  startActionEntry,
  type LogActionResult,
} from "../../Game/Systems/actions";
import { getDefinition, getWorld } from "../../Game/State/worldRuntime";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";
import { ChainView } from "./ChainView";
import { Modal } from "../Modal/Modal";
import { factsOfToday } from "../../Game/Systems/dayRecord";
import { HouseSeal } from "../Modal/seals";
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

      {/*
        外壳交给 `Modal`（同心厚框 + 印章绽开）。**不要写成 `{open && <Modal/>}`**
        ——那样一关就整个卸载，关闭动画（exit）根本没机会播，面板会瞬间消失。
        open 是 Modal 自己的入参，它挂载与否由它自己按相位决定。

        原来这里那层 `absolute inset-0 z-40 grid` 连同 min-h-0 的注意事项一起
        搬进了 `.modal-stage`，那套牌匾被顶出屏幕的坑也随牌匾一起没了。
      */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        seal={<HouseSeal />}
        frameColor="#2f6b58"
        paperColor="#fdfbf7"
        label={t("ui.action.title")}
      >
        <>
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
        </>
      </Modal>
    </>
  );
}

/** 内容外壳：标题条 + 返回/关闭 + 内容区，四屏共用。外面那圈框归 Modal */
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
  /*
   * 尺寸不再由这里定：`Modal` 展开后就是满屏减一圈框，四屏共用同一块
   * 内容区，切屏时框一动不动——原来各屏自己撑高，切一次跳一次（用户打回过）。
   *
   * 牌匾没了。它原来 `-translate-y-1/2` 挂在面板上边缘之外，一半悬空，
   * 而且是全屏最饱和的黄色——比任何可点的东西都抢眼。标题改成落在内容区
   * 左上的一行粗体字：该重的是内容，不是标题的装裱。
   */
  return (
    <div className="flex h-full flex-col px-4 pb-3 pt-3">
      <header className="mb-3 flex shrink-0 items-center gap-2">
        {onBack && (
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[18px] font-bold"
            style={{ background: "#eae4d8", color: "#4a5a54" }}
            aria-label="返回"
            onClick={onBack}
          >
            ←
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[20px] font-extrabold tracking-[0.06em] text-[#2b3b36]">
            {title}
          </div>
          {/* 副标题不再套 ❧…❧ 那对花括——那是填充物，不是信息 */}
          <div className="truncate text-[12px] text-[#8a9a94]">{subtitle}</div>
        </div>
        <button
          type="button"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[17px] font-bold"
          style={{ background: "#eae4d8", color: "#4a5a54" }}
          aria-label="关闭"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1">{children}</div>

      {footer && (
        <div className="mt-2 shrink-0 text-center text-[12px] text-[#8a9a94]">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * 每类行动各自的颜色。**颜色就是身份**——分类选择器里色相是最快的辨认线索，
 * 比图标快得多（动森的 NookPhone 每个应用一个色就是这个道理）。
 *
 * 锁着的一律退成同一个哑绿灰：**没解锁的东西不该各有各的性格**，
 * 它们此刻的共同身份就是"还不能用"。
 */
const CATEGORY_TONE: Record<ActionCategory, string> = {
  [ActionCategory.Exercise]: "#d9603f",
  [ActionCategory.WorkStudy]: "#2f9e73",
  [ActionCategory.Creation]: "#4a72b8",
  [ActionCategory.Rest]: "#8367b0",
};


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
      {/*
        **卡片不吃满高度**（没有 h-full）。四张卡撑满一块满屏面板的话，
        每张会长到 470px，内容只占顶上一小截——那正是被打回过的
        "拉高填满"。高度给一个够用的数，剩下的屏幕交给下面那条今日小结，
        用真内容填，不是留一片空白。
      */}
      <div className="grid shrink-0 grid-cols-4 gap-2.5" style={{ height: 168 }}>
        {CATEGORY_ORDER.map((category) => {
          const definition = actionDefinitions.find(
            (entry) => entry.category === category,
          );
          if (!definition) return null;

          /*
           * 家具门槛 2026-08-28 取消了（见 `findSupportingFurniture` 的注释），
           * 四张卡不再有"锁定"这个状态——没摆哑铃也能做运动。配套的灰色调、
           * `disabled`、「先去摆一件哑铃」提示一并删掉：留一个永远为真的
           * `unlocked` 在那儿，比删掉更容易骗到下一个人。
           */
          const entries = getActionEntriesByCategory(category);
          const tone = CATEGORY_TONE[category];

          return (
            <button
              key={category}
              type="button"
              className="relative flex flex-col items-stretch gap-1.5 p-2.5 text-left"
              style={{ background: tone, borderRadius: 16 }}
              onClick={() => onEnter(category)}
            >
              {/*
                角标只在**真有东西**时出现。
                原版无条件渲染，于是四个高对比桃色圆点齐刷刷显示「0」——
                用全屏第二强的视觉信号在喊"这里什么都没有"，正好反了。
              */}
              {entries.length > 0 && (
                <span
                  className="absolute grid place-items-center"
                  style={{
                    top: -7,
                    right: -6,
                    minWidth: 26,
                    height: 26,
                    borderRadius: 999,
                    background: "#ffc94d",
                    border: "3px solid #fdfbf7",
                    color: "#3a2a12",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {entries.length}
                </span>
              )}

              <span
                className="text-[15px] font-extrabold leading-tight"
                style={{ color: "#fdfbf7" }}
              >
                {t(definition.localizationKey)}
              </span>

              {/*
                卡片中段列真实内容：这个分类下已经写好的前两条。
                原版这里是一张 110px 的插图位，而 `/ui/action-*.png` 从来
                没画过——图加载失败 display:none，justify-between 把上下两行
                推到天南地北，中间那片 200px 的空白不是留白，是塌了。
                真内容既填得住，又让"点进去"这件事有了理由。
              */}
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                {entries.length > 0 ? (
                  entries.slice(0, 3).map((entry) => (
                    <span
                      key={entry.entryId}
                      className="truncate rounded-lg px-1.5 py-0.5 text-[11px]"
                      style={{ background: "rgb(255 255 255 / 0.22)", color: "#fdfbf7" }}
                    >
                      {entry.customName}
                    </span>
                  ))
                ) : (
                  <span
                    className="text-[11px] leading-snug"
                    style={{ color: "rgb(253 251 247 / 0.82)" }}
                  >
                    {t("ui.action.empty_hint")}
                  </span>
                )}
              </div>

              {entries.length > 3 && (
                <span
                  className="text-[11px]"
                  style={{ color: "rgb(253 251 247 / 0.72)" }}
                >
                  还有 {entries.length - 3} 条
                </span>
              )}
            </button>
          );
        })}
      </div>

      <TodaySummary />
    </Panel>
  );
}

/**
 * 今日小结：今天已经做完了什么。
 *
 * 它在这儿不是为了填空——分类卡回答"我能做什么"，这一条回答"我今天
 * 已经做了什么"，两件事挨着才构成一个完整的"今天"。数据来自
 * `dayRecord`（报纸的素材源），行动完成和事后补记都会写进去。
 *
 * 什么都没做时**不显示空状态**：一条常驻的"今天还什么都没做"是消极凝视，
 * 和每日任务板那条不渲染空进度条的理由一样。
 */
function TodaySummary() {
  const facts = factsOfToday();
  const done = facts?.actions ?? [];
  const log = describeActionLog();

  if (done.length === 0) return null;

  return (
    <section className="mt-3 flex min-h-0 flex-1 flex-col">
      <header className="mb-1.5 flex items-baseline gap-2 px-0.5">
        <span className="text-[13px] font-bold text-[#2b3b36]">今天做完的</span>
        <span className="text-[11px] text-[#8a9a94]">
          {done.length} 件 · 补记额度 {log.count}/{log.countLimit}
        </span>
      </header>
      <div className="ui-scroll flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto">
        {done.map((fact, index) => (
          <span
            key={`${fact.name}-${index}`}
            className="rounded-xl px-2.5 py-1 text-[12px]"
            style={{ background: "#eae4d8", color: "#4a5a54" }}
          >
            {fact.name}
            <span className="ml-1.5 opacity-60">{fact.minutes} 分钟</span>
          </span>
        ))}
      </div>
    </section>
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
          /*
           * 空态**把两条路讲清楚**，而不是一句"还没有行动"配一张不存在的插图。
           *
           * 原来这里挂着 `/ui/action-empty.png`，那张图从来没画过；`onError`
           * 用的是 `visibility:hidden`——**隐藏但照样占位**，96px 的空白白占
           * 在正中间。（同一个坑分类卡上也有过，那边已经改成 display:none。）
           *
           * 换成两条路的说明：这一屏本来就是玩家第一次决定"我要怎么用这个
           * 系统"的地方，而这个系统恰好有两种用法。
           */
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="text-[18px] font-bold text-[#2b3b36]">
              {t("ui.action.empty_title")}
            </div>
            <div className="mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-[#8a9a94]">
              {t("ui.action.empty_two_ways")}
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

/**
 * 补记失败的人话。**逐条写清楚为什么**，不给一句"记不上"——门槛有五道，
 * 只回一句失败的话玩家得靠猜（`/action log` 那边同一份口径）。
 */
const LOG_FAIL_TEXT: Record<Exclude<LogActionResult, "ok">, string> = {
  count_full: "ui.action.log_fail_count",
  minutes_full: "ui.action.log_fail_minutes",
  busy: "ui.action.log_fail_busy",
  tired: "ui.action.log_fail_tired",
  bad_duration: "ui.action.log_fail_duration",
  unknown_action: "ui.action.log_fail_unknown",
};

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
  const logLeft = describeActionLog().countLimit - describeActionLog().count;
  /** 补记被拒时的原因，显示在这一行下面。成功就清掉 */
  const [logError, setLogError] = useState<string | null>(null);

  return (
    <>
    <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: "#f4efe6" }}>
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

      {/*
        删除**要最安静**。原来它是个高饱和的桃色圆钮，在这一行里比
        「开始」还抢眼——最不可逆的操作长得最诱人。改成无底色的淡字，
        鼠标放上去才变红：找得到，但不会误点。
      */}
      <button
        type="button"
        aria-label={t("ui.action.delete")}
        className="shrink-0 rounded-lg px-2 py-1 text-[13px] text-[#b3bdb9] transition-colors hover:text-[#c25a48]"
        style={{ background: "transparent" }}
        onClick={() => removeActionEntry(entry.entryId)}
      >
        ✕
      </button>

      {/*
        **两个出口并排。**「开始」是计划型的路（坐下来跑计时器），
        「记一笔」是记录型的路（这件事我已经做完了，事后结算）。
        两者奖励完全一样，区别只在结算发生在做之前还是做之后。

        「记一笔」在**视觉上更轻**（描边而不是实心）：它是没有时间成本
        的那条路，不该长得比真去做还诱人。
      */}
      <button
        type="button"
        disabled={!affordable || logLeft <= 0}
        title={logLeft <= 0 ? t("ui.action.log_quota_out") : t("ui.action.log_hint")}
        className="shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-bold"
        style={{
          background: "transparent",
          border: "2px solid #cfd8d4",
          color: affordable && logLeft > 0 ? "#4a5a54" : "#aab5b1",
        }}
        onClick={() => {
          const result = logCompletedAction({
            actionId: entry.actionId,
            customName: entry.customName,
            durationMinutes: entry.durationMinutes,
            priority: entry.priority,
          });
          setLogError(result === "ok" ? null : t(LOG_FAIL_TEXT[result]));
        }}
      >
        {t("ui.action.log_row")}
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
    {logError && (
      <div className="mt-1 px-3 text-[12px] text-[#c25a48]">{logError}</div>
    )}
    </>
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
  /** 补记被拒时的原因，显示在按钮上方 */
  const [logError, setLogError] = useState<string | null>(null);
  const log = describeActionLog();
  const logLeft = log.countLimit - log.count;

  const furnitureName = supportingFurnitureName(category);
  const cost = definition ? fatigueCostOf(definition, priority) : 0;

  const clampMinutes = (value: number): number => {
    const min = definition?.durationMinutes.min ?? 1;
    const max = definition?.durationMinutes.max ?? 480;
    return Math.max(min, Math.min(max, value));
  };

  /** 计划型：写好放进清单，之后再点开始跑计时器 */
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

  /*
   * 记录型：这件事我已经做完了，当场结算。
   *
   * **同一张表两个出口**是刻意的：名字、时长、重要级这三样两条路都要填，
   * 分成两张表就要维护两份一样的字段，而且逼玩家在填之前先想清楚
   * "我是哪种人"。填完再选出口，顺序才对。
   */
  const logDone = () => {
    if (!definition) return;
    const result = logCompletedAction({
      actionId: definition.id,
      customName: name,
      durationMinutes: minutes,
      priority,
    });
    if (result === "ok") {
      onDone();
      return;
    }
    setLogError(t(LOG_FAIL_TEXT[result]));
  };

  return (
    <Panel
      title={t("ui.action.form_title")}
      subtitle={definition ? t(definition.localizationKey) : ""}
      onClose={onClose}
      footer={t("ui.action.form_footer")}
    >
      {/*
        **字段区滚动、按钮钉底。**
        原来整块（字段 + 按钮）一起滚，于是在 375 高的基准机上「保存行动」
        和「已经做完了」落在折线以下，而且没有任何提示告诉你下面还有东西
        ——体检还会判它"干净"，因为技术上滚一下就能到。能滚到不等于找得到：
        表单的主按钮永远该在原地待着。
      */}
      <div className="mx-auto flex h-full w-full max-w-[760px] flex-col">
      <div className="ui-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
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

      </div>

        {logError && (
          <div className="mt-1 text-center text-[12px] text-[#c25a48]">
            {logError}
          </div>
        )}

        {/*
          按钮条上面一道分隔线。没有它的话，滚动区正好在这儿被裁断，
          "25 分钟"那个大数字被切掉一半——读起来像布局坏了，而不是
          "内容还能往上滚"。一条线就把这两种读法分开了。
        */}
        <div
          className="mt-2 flex shrink-0 items-center justify-between gap-2 pt-2.5"
          style={{ borderTop: "1px solid #e8e2d8" }}
        >
          <button
            type="button"
            className="ui-chip shrink-0 px-5 py-2.5 text-[15px] font-bold"
            onClick={onDone}
          >
            {t("ui.action.cancel")}
          </button>

          {/*
            右边两个出口：**「已经做完了」在左、视觉更轻**（描边而不是实心）。
            它是没有时间成本的那条路——真去坐 25 分钟才该是那个最亮的按钮，
            否则玩家会顺手点最显眼的，而最显眼的恰好是最省事的。
            额度就写在按钮上，用完之前玩家一直看得见还剩几件。
          */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="rounded-xl px-4 py-2.5 text-[14px] font-bold"
              style={{
                background: "transparent",
                border: "2px solid #cfd8d4",
                color: definition && logLeft > 0 ? "#4a5a54" : "#aab5b1",
              }}
              disabled={!definition || logLeft <= 0}
              title={t("ui.action.log_hint")}
              onClick={logDone}
            >
              {t("ui.action.log_done")}
              <span className="ml-1.5 text-[12px] opacity-70">
                {logLeft > 0
                  ? t("ui.action.log_quota").replace("{left}", String(logLeft))
                  : t("ui.action.log_quota_out")}
              </span>
            </button>
            <button
              type="button"
              className="ui-green-btn px-8 py-2.5 text-[16px] font-bold"
              disabled={!definition}
              onClick={save}
            >
              {t("ui.action.save")}
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
