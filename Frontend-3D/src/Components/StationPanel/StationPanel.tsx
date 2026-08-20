import { FurnitureCapability } from "core";
import { useEffect, useRef, useState } from "react";
import { on } from "../../Game/EventBus";
import { craft, listRecipes, type RecipeView } from "../../Game/Systems/crafting";
import { t } from "../../i18n/t";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";
import { ItemIcon } from "../Inventory/slots";

/**
 * 工作站面板：皮面笔记本造型（参考图式样）。
 * 左页：配方列表，每行 材料+材料 → 成品（图标），选中行高亮；
 * 右页：所选配方详情（大图标 + 材料余缺 + 制作按钮）。
 *
 * **灶台不走这里**。菜是真的在锅里做出来的（手持 → 投料 → 看火起锅），
 * 见 Game/Systems/kitchen。这个面板只剩工作台一种用法。
 */

type OpenStation = {
  instanceId: string;
  capability: "crafting";
};

export function StationPanel() {
  const [station, setStation] = useState<OpenStation | null>(null);
  const [recipes, setRecipes] = useState<RecipeView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stationRef = useRef<OpenStation | null>(null);

  useEffect(() => {
    stationRef.current = station;
  }, [station]);

  // 开着的是哪张桌子仍是本地状态，只把"开着"这件事同步给面板栈；
  // ESC 弹栈之后回头把 station 清掉，见 useMirroredPanel
  useMirroredPanel("station", station !== null, () => setStation(null));

  const refresh = (target: OpenStation | null) => {
    if (!target) return setRecipes([]);
    const list = listRecipes(FurnitureCapability.Crafting);
    setRecipes(list);
    setSelectedId((current) =>
      list.some((entry) => entry.recipe.id === current)
        ? current
        : (list[0]?.recipe.id ?? null),
    );
  };

  useEffect(() => {
    const offOpen = on("station_open_requested", (target) => {
      setStation(target);
      refresh(target);
    });
    // 读 ref 而不是借 setStation 的 updater 拿当前值——
    // updater 必须是纯函数，在里面调 refresh 等于渲染期 setState
    const offInventory = on("inventory_changed", () =>
      refresh(stationRef.current),
    );
    const offLeave = on("interact_target_changed", (target) => {
      const stillNear = target?.kind === "station" ? target.instanceId : null;
      setStation((current) =>
        current && stillNear !== current.instanceId ? null : current,
      );
    });

    // ESC 归 EscArbiter：它弹栈，useMirroredPanel 再把 station 清掉
    return () => {
      offOpen();
      offInventory();
      offLeave();
    };
  }, []);

  if (!station) return null;

  const selected = recipes.find((entry) => entry.recipe.id === selectedId);

  return (
    <div className="ui-book absolute left-1/2 top-1/2 z-30 w-[min(1020px,95vw)] -translate-x-1/2 -translate-y-1/2">
      {/* 标题写在顶部木牌正中 */}
      <div className="absolute left-1/2 top-[8%] -translate-x-1/2 text-[19px] font-bold tracking-[0.3em] text-[#f4e6c0] [text-shadow:0_2px_2px_rgb(0_0_0_/_0.75)]">
        {t("ui.craft")}
      </div>
      <button
        type="button"
        className="ui-wood-btn absolute right-[7.5%] top-[10%] z-10 grid h-10 w-10 place-items-center text-[16px] font-bold"
        onClick={() => setStation(null)}
      >
        ×
      </button>

      {/* 左页：配方行。纸面实测 x 8.9~47.1% / y 18.8~78%，内缩 2% 躲开缝线 */}
      <div className="ui-scroll absolute left-[11%] top-[21%] flex h-[55%] w-[34%] flex-col gap-2 overflow-y-auto pr-1">
        {recipes.length === 0 && (
          <div className="py-6 text-center text-[12px] text-[#8a6a48]">
            没有可显示的配方
          </div>
        )}
        {recipes.map(({ recipe, craftable }) => (
          <button
            key={recipe.id}
            type="button"
            onClick={() => setSelectedId(recipe.id)}
            className={[
              "flex shrink-0 items-center gap-2.5 rounded-xl border-2 px-4 py-3",
              recipe.id === selectedId
                ? "border-[#e9a83c] bg-[#f9e9b8] shadow-[0_0_8px_rgb(233_168_60_/_0.5)]"
                : craftable
                  ? "border-[#b09468] bg-[#f4ead0] hover:bg-[#f9f0da]"
                  : "border-[#c98a7c] bg-[#f0dcd2] opacity-75",
            ].join(" ")}
          >
            {recipe.ingredients.map((ingredient, index) => (
              <span key={ingredient.itemId} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span className="text-[13px] font-bold text-[#8a6a48]">+</span>
                )}
                <span className="relative">
                  <ItemIcon itemId={ingredient.itemId} size={52} />
                  {ingredient.quantity > 1 && (
                    <span className="absolute -bottom-1 -right-1 text-[14px] font-bold text-[#3d2817]">
                      {ingredient.quantity}
                    </span>
                  )}
                </span>
              </span>
            ))}
            <span className="mx-2 text-[20px] font-bold text-[#6b4a30]">→</span>
            <ItemIcon itemId={recipe.outputs[0]?.itemId ?? ""} size={58} />
          </button>
        ))}
      </div>

      {/* 右页：所选配方详情。纸面实测 x 53.9~91.1% / y 18.8~78% */}
      <div className="absolute left-[56%] top-[21%] flex h-[55%] w-[33%] flex-col items-center justify-center overflow-hidden">
        {selected ? (
          <>
            <ItemIcon itemId={selected.recipe.outputs[0]?.itemId ?? ""} size={150} />
            <div className="mt-3 text-[23px] font-bold text-[#3d2817]">
              {t(selected.recipe.localizationKey)}
            </div>

            <div className="mt-4 flex flex-col gap-2 text-[16px]">
              {selected.recipe.ingredients.map((ingredient) => {
                const lack = selected.missing.find(
                  (entry) => entry.itemId === ingredient.itemId,
                );
                return (
                  <div
                    key={ingredient.itemId}
                    className={[
                      "flex items-center gap-1.5",
                      lack ? "text-[#b03a2e]" : "text-[#5d4028]",
                    ].join(" ")}
                  >
                    <ItemIcon itemId={ingredient.itemId} size={32} />
                    <span>
                      ×{ingredient.quantity}
                      {lack ? `（只有 ${lack.have}）` : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!selected.craftable}
              className={[
                "ui-craft-btn mt-5 min-w-[190px] rounded-xl border-2 px-8 py-3 text-[20px] font-bold tracking-widest",
                selected.craftable
                  ? "border-[#6b3226] bg-[#a0432f] text-[#ffe9c9] shadow-[0_3px_0_rgb(90_40_28)] hover:brightness-110 active:translate-y-0.5 active:shadow-none"
                  : "cursor-not-allowed border-[#9a8468] bg-[#c9b899] text-[#8a7355]",
              ].join(" ")}
              onClick={() => craft(selected.recipe.id)}
            >
              {t("ui.craft")}
            </button>
          </>
        ) : (
          <div className="py-10 text-[12px] text-[#8a6a48]">选择一个配方</div>
        )}
      </div>
    </div>
  );
}
