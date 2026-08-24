import { useEffect, useState } from "react";
import { jarCapacity } from "core";

import { emit, on } from "../../Game/EventBus";
import {
  findPlacement,
  removeBuilding,
  upgradeBuilding,
  upgradeOptions,
} from "../../Game/State/buildings";
import { goldInJar } from "../../Game/State/buildingCommands";
import { findBuilding, findBuildingLevel } from "../../Buildings/index";
import {
  canAfford,
  materialCounts,
  materialNameKey,
} from "../../Game/Systems/materials";
import { t } from "../../i18n/t";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";

/**
 * 建好的建筑的管理面板：**概览 / 升级 / 迁移 / 拆除**。
 * 对着自己盖的东西按 F 打开。
 *
 * 四个动作的实现全是现成的（`moveBuilding` / `removeBuilding` /
 * `upgradeBuilding` / 注册表），这块面板只负责**把它们摆出来**，
 * 以及把"为什么不行"说清楚——拒绝要说得出理由，是这套建筑系统一开始
 * 就立下的规矩（见 `whyBuild`）。
 *
 * 迁移和升级都要**选位置**，所以它们不在这里执行：发一个意图给场景，
 * 由 `BuildingPlacementController` 的两步确认接管。面板不碰世界。
 */

type UpgradeOption = {
  levelId: string;
  nameKey: string;
  cost: Array<{ itemId: string; quantity: number }>;
};

type Detail = {
  instanceId: string;
  nameKey: string;
  levelKey: string;
  /** 罐类才有：存了多少 / 能装多少 */
  gold?: { stored: number; capacity: number };
  /** 在建中（工地）：这时候不给再下单，也不给拆 */
  building: boolean;
  /** 家具小店才有：一颗进上架面板的按钮 */
  hasShelf: boolean;
  next: UpgradeOption[];
};

function readDetail(instanceId: string): Detail | null {
  const placement = findPlacement(instanceId);
  if (!placement) return null;
  const definition = findBuilding(placement.buildingId);
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  if (!definition || !level) return null;

  const next = upgradeOptions(instanceId).map((levelId) => ({
    levelId,
    nameKey:
      findBuildingLevel(placement.buildingId, levelId)?.localizationKey ?? levelId,
    cost: [...(level.upgradeCost?.[levelId] ?? [])],
  }));

  return {
    instanceId,
    nameKey: definition.localizationKey,
    levelKey: level.localizationKey,
    gold:
      placement.buildingId === "gold_jar"
        ? { stored: goldInJar(instanceId), capacity: jarCapacity(level.levelId) }
        : undefined,
    building: Boolean(placement.construction),
    // 建好了才有货架：工地上摆货没有意义，也会让"结算到哪天"提前起算
    hasShelf:
      placement.buildingId === "furniture_shop" && !placement.construction,
    next,
  };
}

export function BuildingPanel() {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useMirroredPanel("building", detail !== null, () => setDetail(null));

  useEffect(() => {
    const reread = () =>
      setDetail((current) => (current ? readDetail(current.instanceId) : null));

    const offOpen = on("building_panel_open_requested", ({ instanceId }) => {
      setError(null);
      setDetail(readDetail(instanceId));
    });
    // 世界变了（下了单、拆了、存了钱）就重读，别显示旧数
    const offWorld = on("world_changed", reread);
    const offGold = on("gold_changed", reread);
    return () => {
      offOpen();
      offWorld();
      offGold();
    };
  }, []);

  if (!detail) return null;

  const close = () => setDetail(null);

  const doMove = () => {
    emit("building_siting_requested", {
      mode: "move",
      instanceId: detail.instanceId,
    });
    close();
  };

  const doRemove = () => {
    const result = removeBuilding(detail.instanceId, {
      gold: detail.gold?.stored ?? 0,
    });
    if (result.ok === false) {
      // 非空不给拆，而且说得出剩多少——这条规则早就写好了
      setError(
        result.reason === "not_empty"
          ? t("build.remove.not_empty")
          : t("build.remove.failed"),
      );
      return;
    }
    close();
  };

  const doUpgrade = (levelId: string) => {
    const result = upgradeBuilding(detail.instanceId, levelId);
    if (result.ok === false) {
      setError(
        result.reason === "missing_materials"
          ? t("build.upgrade.missing")
          : result.reason === "not_empty"
            ? t("build.upgrade.not_empty")
            : t("build.upgrade.failed"),
      );
      return;
    }
    // 下单成功 = 变成一块工地，等石傀儡走过来。面板关掉让玩家看得见围栏
    close();
  };

  const have = materialCounts();

  return (
    <div className="ui-book absolute left-1/2 top-1/2 z-30 w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="absolute left-1/2 top-[8%] -translate-x-1/2 text-[18px] font-bold tracking-[0.2em] text-[#f4e6c0] [text-shadow:0_2px_2px_rgb(0_0_0_/_0.75)]">
        {t(detail.levelKey)}
      </div>
      <button
        type="button"
        className="ui-wood-btn absolute right-[7.5%] top-[10%] z-10 grid h-10 w-10 place-items-center text-[16px] font-bold"
        onClick={close}
      >
        ×
      </button>

      <div className="ui-scroll absolute left-[10%] top-[21%] flex h-[54%] w-[80%] flex-col gap-3 overflow-y-auto pr-1">
        {/* ---- 概览 ---- */}
        <div className="rounded-xl border-2 border-[#b09468] bg-[#f4ead0] px-4 py-3">
          <div className="text-[12px] font-bold text-[#4a3520]">
            {t("build.panel.overview")}
          </div>
          <div className="mt-1 text-[11px] text-[#6b5030]">
            {t(detail.nameKey)} · {t(detail.levelKey)}
          </div>
          {detail.gold && (
            <div className="mt-1 text-[11px] text-[#6b5030]">
              {t("build.panel.stored")} {detail.gold.stored} / {detail.gold.capacity}
            </div>
          )}
          {detail.building && (
            <div className="mt-1 text-[11px] text-[#b4432e]">
              {t("build.panel.working")}
            </div>
          )}
          {/*
            * 上架入口开在管理面板里，不是"走进店里对着货架按 F"。
            * 后者更有代入感，但那要求店里真的立着一排货架模型——参考图
            * 还没来，占位壳里塞个方块反而更糟。图到了再把入口挪进去，
            * 面板本身不用动。
            */}
          {detail.hasShelf && (
            <button
              type="button"
              className="ui-wood-btn mt-2 w-full px-3 py-2 text-[12px] font-bold"
              onClick={() => {
                emit("shelf_open_requested", { instanceId: detail.instanceId });
                close();
              }}
            >
              {t("build.panel.shelf")}
            </button>
          )}
          {!detail.building && detail.next.length === 0 && (
            <div className="mt-1 text-[11px] text-[#8a6a48]">
              {t("build.panel.max")}
            </div>
          )}
        </div>

        {/* ---- 升级：每个后继一行，材料逐条列（够的绿、不够的红）---- */}
        {!detail.building &&
          detail.next.map((option) => {
            const affordable = canAfford(option.cost);
            return (
              <div
                key={option.levelId}
                className="flex items-center gap-3 rounded-xl border-2 border-[#b09468] bg-[#f4ead0] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-[#4a3520]">
                    {t("build.panel.upgrade_to")} {t(option.nameKey)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {option.cost.length === 0 && (
                      <span className="text-[11px] text-[#8a6a48]">
                        {t("ui.build_shop.free")}
                      </span>
                    )}
                    {option.cost.map((need) => {
                      const owned = have.get(need.itemId) ?? 0;
                      return (
                        <span
                          key={need.itemId}
                          className={[
                            "text-[11px] font-semibold",
                            owned >= need.quantity
                              ? "text-[#3f7d3f]"
                              : "text-[#b4432e]",
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
                  onClick={() => doUpgrade(option.levelId)}
                  className={[
                    "ui-wood-btn shrink-0 px-4 py-2 text-[12px] font-bold",
                    affordable ? "" : "cursor-not-allowed opacity-50",
                  ].join(" ")}
                >
                  {t("build.panel.upgrade")}
                </button>
              </div>
            );
          })}

        {error && (
          <div className="rounded-xl border-2 border-[#c98a7c] bg-[#f0dcd2] px-4 py-2 text-[11px] text-[#b4432e]">
            {error}
          </div>
        )}
      </div>

      {/* ---- 迁移 / 拆除 ---- */}
      <div className="absolute bottom-[9%] left-1/2 flex -translate-x-1/2 gap-3">
        <button
          type="button"
          className="ui-wood-btn px-5 py-2 text-[12px] font-bold"
          onClick={doMove}
        >
          {t("build.panel.move")}
        </button>
        <button
          type="button"
          className="ui-wood-btn px-5 py-2 text-[12px] font-bold"
          onClick={doRemove}
        >
          {t("build.panel.remove")}
        </button>
      </div>
    </div>
  );
}
