import { findItemDefinition, type NewspaperIssue,
  findResidentDefinition,
  residentDefinitionOf,
} from "core";
import { useEffect, useState } from "react";

import { on } from "../../Game/EventBus";
import { latestIssue, paperName } from "../../Game/Systems/newspaper";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";
import "./newspaper.css";

/**
 * 今日报纸（期 7）。**当一件版式作品做，不是普通面板。**
 *
 * 版式的取舍写在 `newspaper.css` 的文件头（直角、双线、衬线、分栏、做旧）。
 * 这个文件负责的是**把一期定稿翻译成版面语言**——这一步有几个决定：
 *
 * ## 一 · 头条要成句，不是罗列 kind
 *
 * 事实里存的是 `{ kind: "shop_sold", subject: "furniture_chair|resident-fox_neighbor" }`。
 * 直接印出来是数据库转储不是报纸。所以每种 kind 有一句**自己的写法**
 * （`headlineOf`），主语宾语都填进去。这一层不做成数据表：句式本身
 * 就是文案，和 i18n 是一件事，不是配置。
 *
 * ## 二 · "这几天"由 spanDays 决定
 *
 * 离线回来出的还是一期（不补发），但头版那句要认得出你离开过——
 * 动森村民那句"好久不见"是同一个东西。
 *
 * ## 三 · 没有内容也要出版面
 *
 * 昨天什么都没发生的日子，报纸照出，头条位置写"昨天很安静"。
 * 空版面比"今天没有报纸"好：那台打印机是玩家送出去的，
 * 它每天都该响一次。
 */
export function NewspaperPanel() {
  const [open, setOpen] = usePanel("newspaper");
  const [, setRevision] = useState(0);

  useEffect(() => {
    const offOpen = on("newspaper_open_requested", () => {
      setRevision((n) => n + 1);
      setOpen(true);
    });
    return offOpen;
  }, [setOpen]);

  if (!open) return null;

  const issue = latestIssue();

  return (
    <div
      className="absolute inset-0 z-40 grid min-h-0 place-items-center bg-black/55 px-4 py-5"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="news-sheet relative flex max-h-full min-h-0 flex-col overflow-hidden px-5 pb-4 pt-4"
        style={{ width: "min(880px,95vw)" }}
      >
        <button
          type="button"
          className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center border border-[#3b3428] text-[13px] leading-none"
          style={{ borderRadius: 0 }}
          aria-label={t("ui.close")}
          onClick={() => setOpen(false)}
        >
          ✕
        </button>

        {issue ? <Sheet issue={issue} /> : <Empty />}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="grid min-h-[180px] place-items-center px-8 text-center">
      <p className="news-body" style={{ textIndent: 0 }}>
        {t("ui.news.none")}
      </p>
    </div>
  );
}

function Sheet({ issue }: { issue: NewspaperIssue }) {
  const name = paperName() || t("ui.news.default_name");

  return (
    <div className="ui-scroll min-h-0 flex-1 overflow-y-auto pr-1">
      {/* ---- 报头：报名 + 期号 + 日期，双线压底 ---- */}
      <header className="news-masthead">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h1
            className="news-title"
            style={{ fontSize: "clamp(19px, 3.4vmin, 30px)" }}
          >
            {name}
            {t("ui.news.masthead_suffix")}
          </h1>
          <span className="text-[11px] tracking-[0.14em] text-[#6d6350]">
            {t("ui.news.issue_no").replace("{n}", String(issue.number))} ·{" "}
            {issue.worldDayId}
          </span>
        </div>
      </header>

      {/* ---- 头版：插图 + 天气/邻居两栏 ---- */}
      <div className="news-columns mt-2.5">
        <figure className="m-0">
          <Woodcut />
          <figcaption className="mt-1 text-center text-[10px] tracking-[0.2em] text-[#6d6350]">
            {t("ui.news.cut_caption")}
          </figcaption>
        </figure>

        <div>
          <div className="news-kicker">{t("ui.news.weather")}</div>
          <p className="news-body m-0">
            {t(`weather.${issue.weatherId}`)}
            {issue.spanDays > 1
              ? t("ui.news.span").replace("{n}", String(issue.spanDays))
              : ""}
          </p>

          <div className="news-kicker mt-2.5">{t("ui.news.neighbors")}</div>
          {issue.neighbors.length === 0 ? (
            <p className="news-body m-0">{t("ui.news.neighbors_quiet")}</p>
          ) : (
            <ul className="news-list m-0 list-none p-0">
              {issue.neighbors.slice(0, 4).map((item, i) => (
                <li key={i}>· {lineOf(item)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- 头条：粗横线分隔，整幅通栏 ---- */}
      <hr className="news-rule mt-3" />
      <div className="news-kicker">{t("ui.news.headline")}</div>
      <h2 className="news-headline m-0">{headlineOf(issue)}</h2>

      {/* ---- 昨日行动 ---- */}
      <hr className="news-rule news-rule--thin mt-2.5" />
      <div className="news-columns mt-1.5">
        <div>
          <div className="news-kicker">{t("ui.news.actions")}</div>
          {issue.actions.length === 0 ? (
            <p className="news-body m-0">{t("ui.news.actions_none")}</p>
          ) : (
            <ul className="news-list m-0 list-none p-0">
              {issue.actions.slice(0, 5).map((action, i) => (
                <li key={i}>
                  · {action.name}
                  {action.minutes > 0 ? `（${action.minutes} 分钟）` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="news-kicker">{t("ui.news.market")}</div>
          <p className="news-body m-0">
            {t("ui.news.market_line")
              .replace("{in}", String(issue.goldIn))
              .replace("{out}", String(issue.goldOut))}
          </p>
        </div>
      </div>

      {/* ---- 广告版：水獭这回想要什么（决策 30）---- */}
      <div className="news-ad mt-3">
        <strong>{t("ui.news.ad")}</strong>{" "}
        {issue.wanted.length === 0
          ? t("ui.news.ad_none")
          : issue.wanted.map((id) => t(nameKeyOf(id))).join("、")}
      </div>
    </div>
  );
}

function nameKeyOf(itemId: string): string {
  return findItemDefinition(itemId)?.localizationKey ?? itemId;
}

/** `"furniture_chair|resident-fox_neighbor"` → 物品名 + 买主。存的时候拼的，这里拆开 */
function splitSubject(subject: string | undefined): [string, string | undefined] {
  if (!subject) return ["", undefined];
  const at = subject.indexOf("|");
  return at < 0 ? [subject, undefined] : [subject.slice(0, at), subject.slice(at + 1)];
}

/**
 * 买主的显示名。事实里存的是**实例 id**（`resident-fox_neighbor`），
 * 名字从注册表查——原来是从 id 上砍掉 `pet-` 再拼文案键，等于把
 * "id 能反推出文案"当成了契约，改一次 id 就整版报纸都是裸键。
 * 查不到（老档没迁、定义删了）返回 undefined，调用方决定兜底文案。
 */
function whoName(residentId: string): string | undefined {
  const definition = residentDefinitionOf(residentId);
  return definition ? t(definition.localizationKey) : undefined;
}

/** 一条邻居动态写成一句话 */
function lineOf(item: { kind: string; subject?: string }): string {
  const [what, who] = splitSubject(item.subject);
  if (item.kind === "shop_sold") {
    return t("ui.news.line.shop_sold")
      .replace("{who}", who ? whoName(who) ?? t("ui.news.someone") : t("ui.news.someone"))
      .replace("{what}", t(nameKeyOf(what)));
  }
  if (item.kind === "consign_sold") {
    // 寄售没有买主——保底渠道，东西是"被收走"的，不是"谁买走"的
    return t("ui.news.line.consign_sold").replace("{what}", t(nameKeyOf(what)));
  }
  // 居民的作息新闻（居民系统 02）：subject 是实例 id，名字查注册表
  if (item.kind === "resident_town_trip" || item.kind === "resident_stayed_in" || item.kind === "favor_done") {
    return t(`ui.news.line.${item.kind}`).replace("{who}", whoName(what) ?? t("ui.news.someone"));
  }
  if (item.kind === "residents_chatted") {
    // subject 是这一对的键（a|b，definitionId）
    const [a, b] = what.split("|").map((id) => t(findResidentDefinition(id)?.localizationKey ?? `pet.${id}`));
    return t("ui.news.line.residents_chatted").replace("{a}", a ?? "").replace("{b}", b ?? "");
  }
  if (item.kind === "resident_moved_in" || item.kind === "visitor_arrived") {
    // subject 是 definitionId（09 的访客也是）
    return t(`ui.news.line.${item.kind === "resident_moved_in" ? "moved_in" : "visitor_arrived"}`).replace("{who}", t(findResidentDefinition(what)?.localizationKey ?? `pet.${what}`));
  }
  if (item.kind === "birthday_soon") {
    // subject 是 definitionId（11）
    return t("ui.news.line.birthday_soon").replace("{who}", t(findResidentDefinition(what)?.localizationKey ?? `pet.${what}`));
  }
  if (item.kind === "resident_trip_away") {
    return t("ui.news.line.resident_trip_away").replace("{who}", whoName(what) ?? t("ui.news.someone"));
  }
  return t(`ui.news.line.${item.kind}`);
}

/**
 * 头条写成一句话。
 *
 * **句式本身就是文案**，所以每种 kind 一条 i18n，不做成数据表——
 * 表适合放"哪种事更重要"（那在 `Data/newspaper`），不适合放"这句话
 * 怎么说"。
 */
function headlineOf(issue: NewspaperIssue): string {
  if (!issue.headline) {
    return issue.spanDays > 1
      ? t("ui.news.headline.quiet_span").replace("{n}", String(issue.spanDays))
      : t("ui.news.headline.quiet");
  }
  const [what, who] = splitSubject(issue.headline.subject);
  const key = `ui.news.headline.${issue.headline.kind}`;
  return t(key)
    .replace("{what}", what ? t(nameKeyOf(what)) : "")
    .replace("{who}", who ? whoName(who) ?? "" : "");
}

/**
 * 报头下那张木刻插图。
 *
 * **内联 SVG 不是位图**：一是没有美术资源；二是木刻风格本来就是粗线条
 * 色块，SVG 画得出来而且随分辨率清晰；三是它能跟着纸色走（用
 * `currentColor` 系的深墨色），不会像一张 PNG 那样在泛黄的纸上显得
 * 白得突兀。
 *
 * 画的是**这个家本身**：一栋带坡顶的小屋、一棵树、几道山线。
 * 不做成"跟着头条换图"——一张通用的就够，按内容换图是内容量的事
 * （施工文档里列在刻意不做的一项）。
 */
function Woodcut() {
  const ink = "#2f2a22";
  return (
    <svg
      viewBox="0 0 200 130"
      className="w-full"
      style={{ display: "block", background: "#e6dcc2", border: `1px solid ${ink}` }}
      role="img"
      aria-label={t("ui.news.cut_caption")}
    >
      {/* 远山：三道粗折线 */}
      <path d="M0 78 L34 50 L58 70 L86 42 L118 74 L150 48 L200 80 L200 130 L0 130 Z" fill="#cfc2a4" />
      <path d="M0 92 L40 72 L74 88 L110 66 L146 90 L200 70 L200 130 L0 130 Z" fill="#b9a983" />
      {/* 地平线 */}
      <rect x="0" y="104" width="200" height="26" fill="#a89574" />
      {/* 小屋：山墙 + 坡顶 + 门 + 窗 */}
      <path d="M62 104 L62 74 L96 54 L130 74 L130 104 Z" fill="#efe7d2" stroke={ink} strokeWidth="2.5" />
      <path d="M56 76 L96 48 L136 76" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
      <rect x="88" y="84" width="16" height="20" fill={ink} />
      <rect x="68" y="80" width="12" height="11" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="112" y="80" width="12" height="11" fill="none" stroke={ink} strokeWidth="2" />
      {/* 烟囱 + 一缕烟 */}
      <rect x="116" y="56" width="8" height="14" fill={ink} />
      <path d="M120 54 q-6 -8 2 -12 q8 -4 3 -12" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      {/* 一棵树 */}
      <rect x="36" y="88" width="5" height="16" fill={ink} />
      <path d="M38 90 L24 74 L52 74 Z" fill={ink} />
      <path d="M38 78 L27 64 L49 64 Z" fill={ink} />
      {/* 前景几道刻线：木刻的排线 */}
      {[110, 116, 122].map((y) => (
        <path
          key={y}
          d={`M0 ${y} H200`}
          stroke={ink}
          strokeWidth="1"
          strokeDasharray="7 11"
          opacity="0.5"
        />
      ))}
    </svg>
  );
}
