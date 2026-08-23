import { useEffect, useState } from "react";

import { on } from "../../Game/EventBus";
import { pushSystemMessage } from "../../Game/State/chatLog";
import { addItem } from "../../Game/State/inventory";
import {
  allPlots,
  buyPlot,
  plotCost,
  unlockablePlotIds,
} from "../../Game/State/territory";
import {
  canAfford,
  materialCounts,
  materialNameKey,
  spendMaterials,
  type MaterialNeed,
} from "../../Game/Systems/materials";
import { buildingDefinitions, findBuildingLevel } from "../../Buildings/index";
import { itemDefinitions } from "core";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";

/**
 * 建造面板：对着醒着的石傀儡按 F 打开。**没有对话这一步**
 * （用户定："不用说话，点开就是面板"）。
 *
 * 一行一种可盖的建筑：名字 / 说明 / 造价（材料**逐条**列出，够的绿不够的红）。
 * 点击 = 扣材料 + 拿到一张图纸；图纸怎么变成工地是选址那一步的事，
 * 这块面板不碰世界。
 *
 * ## 能盖什么 = 有没有图纸物品
 *
 * 不另写一张"商店卖什么"的表：**注册表里存在 `blueprint.buildingId`
 * 指向它的物品**，它就上架。加一种可盖的建筑 = 加一件图纸物品，
 * 这块面板一行不用改；反过来也不会出现"面板上有但买了没用"的条目。
 *
 * ## 扩地也在这块面板里（2026-08-23）
 *
 * "开一块新地"没有另开一个面板，也没有另找一个 NPC：**石傀儡是这块地上
 * 唯一会动土的**，盖房子和推界桩本来就是同一双手。分成两个入口的话，
 * 玩家得记住"盖东西找石头、扩地找别处"，而那条分界在故事里不存在。
 *
 * 两段共用一套渲染（名字 / 说明 / 逐条代价 / 够不够变色），
 * 因为它们对玩家是同一件事：**花掉手上的东西，换一样立得起来的**。
 */

type Row = {
  buildingId: string;
  blueprintItemId: string;
  nameKey: string;
  descKey?: string;
  cost: MaterialNeed[];
};

/** 上架清单：从图纸物品反查建筑，不另立一张表 */
function shopRows(): Row[] {
  const rows: Row[] = [];
  for (const item of itemDefinitions) {
    const buildingId = item.blueprint?.buildingId;
    if (!buildingId) continue;

    const definition = buildingDefinitions.find((b) => b.buildingId === buildingId);
    if (!definition) continue;

    // 造价挂在**初始等级**上——"从无到有"就是盖出第一级
    const first = definition.levels[0];
    const level = findBuildingLevel(buildingId, first.levelId);
    rows.push({
      buildingId,
      blueprintItemId: item.id,
      nameKey: definition.localizationKey,
      descKey: definition.descriptionKey,
      cost: [...(level?.buildCost ?? [])],
    });
  }
  return rows;
}

/**
 * 一行的样子：名字 / 说明 / 逐条代价 / 一个按钮。
 *
 * 抽出来是因为"盖建筑"和"开地"要长得一模一样——它们对玩家是同一件事
 * （花掉手上的东西换一样立得起来的），长得不一样反而要解释。
 */
function ShopRow({
  nameKey,
  descKey,
  cost,
  have,
  actionKey,
  onAction,
}: {
  nameKey: string;
  descKey?: string;
  cost: MaterialNeed[];
  have: Map<string, number>;
  actionKey: string;
  onAction: () => void;
}) {
  const affordable = canAfford(cost);
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-xl border-2 border-[#b09468] bg-[#f4ead0] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-[#4a3520]">{t(nameKey)}</div>
        {descKey && (
          <div className="mt-0.5 text-[11px] leading-snug text-[#8a6a48]">
            {t(descKey)}
          </div>
        )}
        {/* 材料逐条列出：够的绿、不够的红。数组就是数组，不合并成一句话 */}
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {cost.length === 0 && (
            <span className="text-[11px] text-[#8a6a48]">
              {t("ui.build_shop.free")}
            </span>
          )}
          {cost.map((need) => {
            const owned = have.get(need.itemId) ?? 0;
            const enough = owned >= need.quantity;
            return (
              <span
                key={need.itemId}
                className={[
                  "text-[11px] font-semibold",
                  enough ? "text-[#3f7d3f]" : "text-[#b4432e]",
                ].join(" ")}
              >
                {t(materialNameKey(need.itemId))} {need.quantity}
                <span className="ml-1 opacity-70">({owned})</span>
              </span>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        disabled={!affordable}
        onClick={onAction}
        className={[
          "ui-wood-btn shrink-0 px-4 py-2 text-[12px] font-bold",
          affordable ? "" : "cursor-not-allowed opacity-50",
        ].join(" ")}
      >
        {t(actionKey)}
      </button>
    </div>
  );
}

/** 段落小标题。两段之间要有一条明显的界，不然读起来像一张长清单 */
function SectionLabel({ labelKey }: { labelKey: string }) {
  return (
    <div className="mt-1 flex shrink-0 items-center gap-2">
      <span className="h-px flex-1 bg-[#b09468]" />
      <span className="text-[11px] font-bold tracking-[0.2em] text-[#8a6a48]">
        {t(labelKey)}
      </span>
      <span className="h-px flex-1 bg-[#b09468]" />
    </div>
  );
}

/** 面板上的一块地：能开的才列出来（不相邻的不列，列了也点不动） */
type PlotRow = { plotId: string; nameKey: string };

function plotRows(): PlotRow[] {
  const byId = new Map(allPlots().map((plot) => [plot.plotId, plot]));
  return unlockablePlotIds().map((plotId) => ({
    plotId,
    nameKey: byId.get(plotId)?.localizationKey ?? plotId,
  }));
}

export function BuildShopPanel() {
  const [open, setOpen] = usePanel("buildShop");
  const [rows, setRows] = useState<Row[]>([]);
  const [plots, setPlots] = useState<PlotRow[]>([]);
  // 手上有多少材料。开着的时候要跟着背包/金币变，不然扣完还显示旧数
  const [have, setHave] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const refresh = () => setHave(materialCounts());
    const offOpen = on("build_shop_open_requested", () => {
      setRows(shopRows());
      setPlots(plotRows());
      refresh();
      setOpen(true);
    });
    const offInventory = on("inventory_changed", refresh);
    const offGold = on("gold_changed", refresh);
    /*
     * 开完一块地要把清单重算：刚买下的那块从"能开"变成"已有"，
     * 而它的邻居们这时候才第一次变得可开。不重算的话面板上还留着
     * 一行已经买过的地，再点一次会拿到 owned。
     */
    const offWorld = on("world_changed", () => {
      setPlots(plotRows());
      refresh();
    });
    return () => {
      offOpen();
      offInventory();
      offGold();
      offWorld();
    };
  }, [setOpen]);

  if (!open) return null;

  const buy = (row: Row) => {
    if (!spendMaterials(row.cost)) return;
    addItem(row.blueprintItemId, 1);
    setHave(materialCounts());
  };

  /*
   * 开地和拿图纸不一样：**当场就生效**，没有"拿着图纸去选址"这一步。
   * 一块地的位置是它自己定死的（`PlotDefinition.rect`），没什么可选的。
   */
  const unlock = (row: PlotRow) => {
    if (!buyPlot(row.plotId).ok) return;
    pushSystemMessage(
      `${t(row.nameKey)}${t("ui.build_shop.territory.done")}`,
    );
    // world_changed 那条订阅会把清单和余额一起刷了
  };

  return (
    <div className="ui-book absolute left-1/2 top-1/2 z-30 w-[min(720px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="absolute left-1/2 top-[8%] -translate-x-1/2 text-[19px] font-bold tracking-[0.3em] text-[#f4e6c0] [text-shadow:0_2px_2px_rgb(0_0_0_/_0.75)]">
        {t("ui.build_shop")}
      </div>
      <button
        type="button"
        className="ui-wood-btn absolute right-[7.5%] top-[10%] z-10 grid h-10 w-10 place-items-center text-[16px] font-bold"
        onClick={() => setOpen(false)}
      >
        ×
      </button>

      <div className="ui-scroll absolute left-[10%] top-[21%] flex h-[58%] w-[80%] flex-col gap-2 overflow-y-auto pr-1">
        {rows.length === 0 && (
          <div className="py-6 text-center text-[12px] text-[#8a6a48]">
            {t("ui.build_shop.empty")}
          </div>
        )}
        {rows.map((row) => (
          <ShopRow
            key={row.buildingId}
            nameKey={row.nameKey}
            descKey={row.descKey}
            cost={row.cost}
            have={have}
            actionKey="ui.build_shop.buy"
            onAction={() => buy(row)}
          />
        ))}

        <SectionLabel labelKey="ui.build_shop.territory" />
        {plots.length === 0 && (
          <div className="shrink-0 py-3 text-center text-[12px] text-[#8a6a48]">
            {t("ui.build_shop.territory.none")}
          </div>
        )}
        {plots.map((row) => (
          <ShopRow
            key={row.plotId}
            nameKey={row.nameKey}
            cost={[...plotCost()]}
            have={have}
            actionKey="ui.build_shop.territory.buy"
            onAction={() => unlock(row)}
          />
        ))}
      </div>

      <div className="absolute bottom-[9%] left-1/2 w-[80%] -translate-x-1/2 text-center text-[11px] leading-snug text-[#8a6a48]">
        {t("ui.build_shop.hint")}
      </div>
    </div>
  );
}
