import { useEffect, useState } from "react";

import { findItemDefinition } from "core";
import { on } from "../../Game/EventBus";
import { getGold } from "../../Game/State/gold";
import { getCounts } from "../../Game/State/inventory";
import {
  buyItem,
  buyPriceOf,
  otterStock,
  sellItem,
  sellPriceOf,
  wantedToday,
} from "../../Game/Systems/trading";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";

/**
 * 水獭的交易面板（期 3）：对着在场的他按 F 打开。
 *
 * 版式照 BuildShopPanel（左分类右卡片，全套 ui-shop-* 样式复用）——
 * 那一版是用户看着参考图定过的，第二块商店面板没有理由另起炉灶。
 *
 * ## 卖：一张卡 = 背包里的一种东西
 *
 * 判据"能不能卖"就是"有没有 value"（期 1 那层）。**今日想要**的几件
 * 卡上戴一枚徽章、价钱按倍率标高——同一天重开面板必须是同一批
 * （`wantedToday` 是确定性抽签），否则刷面板会成为最优策略。
 *
 * ## 买：他的货架
 *
 * 食材 + 基础材料（`Data/merchants` 的清单）。食材是六道菜里四道的
 * **第一个来源**；材料是行动改开箱之后工作台的续命。
 *
 * 点一下卖一件 / 买一件，不做批量：批量要挑数量，挑数量要一个
 * stepper，而这个面板的高频动作是"清几件重复家具"——连点比对着
 * 输入框敲数字快。真出现"卖三十根木头"的场景再说。
 */
export function TradePanel() {
  const [open, setOpen] = usePanel("trade");
  const [tab, setTab] = useState<"sell" | "buy">("sell");
  // 计数当刷新信号：卡片列表从背包和注册表推，不另存一份真相
  const [, setRevision] = useState(0);
  const bump = () => setRevision((n) => n + 1);

  useEffect(() => {
    const offOpen = on("trade_open_requested", () => {
      bump();
      setOpen(true);
    });
    const offInventory = on("inventory_changed", bump);
    const offGold = on("gold_changed", bump);
    return () => {
      offOpen();
      offInventory();
      offGold();
    };
  }, [setOpen]);

  if (!open) return null;

  const counts = getCounts();
  const gold = getGold();
  const wanted = wantedToday();

  const sellables = Object.entries(counts)
    .filter(([itemId, count]) => count > 0 && sellPriceOf(itemId) > 0)
    .sort(([a], [b]) => sellPriceOf(b) - sellPriceOf(a));

  const stock = otterStock();

  return (
    <div
      className="absolute inset-0 z-40 grid min-h-0 place-items-center bg-black/45 px-6 py-7"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="ui-action-panel relative flex max-h-full min-h-0 flex-col px-6 pb-5 pt-9"
        style={{ width: "min(1040px,94vw)" }}
      >
        <div className="ui-plaque absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 px-9 py-2">
          <span className="text-[20px] font-bold tracking-[0.25em] text-[#7a5a1d]">
            {t("ui.trade")}
          </span>
        </div>
        <button
          type="button"
          className="ui-wood-btn absolute right-5 top-5 grid h-9 w-9 place-items-center text-[16px]"
          aria-label={t("ui.close")}
          onClick={() => setOpen(false)}
        >
          ✕
        </button>

        <div className="mt-1 flex min-h-0 gap-3">
          <nav className="flex w-[86px] shrink-0 flex-col gap-1.5 pt-0.5 sm:w-[104px]">
            {(
              [
                ["sell", "ui.trade.tab.sell"],
                ["buy", "ui.trade.tab.buy"],
              ] as const
            ).map(([id, labelKey]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={[
                  "ui-tab px-2 py-2 text-[12px] font-bold sm:text-[13px]",
                  tab === id ? "ui-tab--active" : "",
                ].join(" ")}
              >
                {t(labelKey)}
              </button>
            ))}
            {/* 余额：买页签的"够不够"一眼有参照 */}
            <div className="mt-2 text-center text-[12px] font-bold text-[var(--ink-soft)]">
              🪙 {gold}
            </div>
          </nav>

          <div className="ui-shop-shelf ui-scroll min-h-[196px] flex-1 overflow-y-auto p-3">
            {tab === "sell" ? (
              sellables.length === 0 ? (
                <div className="grid h-full min-h-[172px] place-items-center px-6 text-center text-[13px] leading-relaxed text-[var(--ink-soft)]">
                  {t("ui.trade.sell.empty")}
                </div>
              ) : (
                <div className="ui-shop-grid">
                  {sellables.map(([itemId, count]) => (
                    <TradeCard
                      key={itemId}
                      itemId={itemId}
                      count={count}
                      price={sellPriceOf(itemId)}
                      wanted={wanted.has(itemId)}
                      enabled
                      onAction={() => {
                        sellItem(itemId);
                        bump();
                      }}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="ui-shop-grid">
                {stock.map((itemId) => (
                  <TradeCard
                    key={itemId}
                    itemId={itemId}
                    price={buyPriceOf(itemId)}
                    enabled={gold >= buyPriceOf(itemId)}
                    onAction={() => {
                      buyItem(itemId);
                      bump();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2.5 text-center text-[11px] leading-snug text-[var(--ink-soft)]">
          {t(tab === "sell" ? "ui.trade.sell.hint" : "ui.trade.buy.hint")}
        </div>
      </div>
    </div>
  );
}

function TradeCard({
  itemId,
  count,
  price,
  wanted = false,
  enabled,
  onAction,
}: {
  itemId: string;
  count?: number;
  price: number;
  wanted?: boolean;
  enabled: boolean;
  onAction: () => void;
}) {
  const nameKey = findItemDefinition(itemId)?.localizationKey ?? itemId;
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onAction}
      className={[
        "ui-shop-card relative flex flex-col items-center gap-1 px-2 pb-2 pt-2",
        enabled ? "" : "ui-shop-card--broke",
      ].join(" ")}
    >
      {/* 今日想要的徽章：加价的理由要摆在脸上，不是藏在价签的差额里 */}
      {wanted && (
        <span className="absolute -right-1 -top-1 rounded-full bg-[#c9503c] px-1.5 py-0.5 text-[10px] font-bold text-white">
          {t("ui.trade.wanted")}
        </span>
      )}
      <span
        className="w-full truncate text-center font-bold text-[var(--ink)]"
        style={{ fontSize: "clamp(12px, 1.7vmin, 16px)" }}
      >
        {t(nameKey)}
        {count !== undefined && count > 1 ? ` ×${count}` : ""}
      </span>
      <span className="ui-shop-card__art grid place-items-center">
        <img
          src={`/icons/${itemId}.png`}
          alt=""
          className="h-[88%] w-[88%] object-contain"
          onError={(event) => {
            // 没画图的物品退化成名字，不留空洞——功能不等图
            (event.target as HTMLImageElement).style.display = "none";
          }}
        />
      </span>
      <span
        className={[
          "ui-shop-price text-[11px] font-bold",
          wanted ? "" : "ui-shop-price--ok",
        ].join(" ")}
        style={wanted ? { color: "#c9503c" } : undefined}
      >
        🪙 {price}
      </span>
    </button>
  );
}
