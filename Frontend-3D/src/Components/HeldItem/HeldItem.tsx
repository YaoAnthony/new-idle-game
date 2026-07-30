import { findItemDefinition, type HeldStack } from "core";
import { useEffect, useState } from "react";
import { emit, on } from "../../Game/EventBus";
import { getHeld, returnToBackpack } from "../../Game/State/heldItem";
import { eatFromHand, storeHeldContents } from "../../Game/Systems/kitchen";
import { t } from "../../i18n/t";
import { ItemIcon } from "../Inventory/slots";

/**
 * 手上端着什么。厨房的四选一约束里"玩家手中"这一格的可视化。
 *
 * 做成右下角一小块而不是弹窗：端着锅走来走去是常态，
 * 它得一直在视野里，又不能挡住画面。
 */
export function HeldItem() {
  const [held, setHeld] = useState<HeldStack | null>(getHeld());

  useEffect(() => on("held_changed", () => setHeld(getHeld())), []);

  if (!held) return null;

  const definition = findItemDefinition(held.itemId);
  const contents = held.container?.items ?? [];
  const edible = contents.some(
    (item) => findItemDefinition(item.itemId)?.food,
  );

  return (
    <div className="ui-bar absolute bottom-3 right-3 z-10 flex items-center gap-2.5 rounded-xl p-2 pr-3">
      <div className="flex flex-col items-center">
        <span className="text-[10px] tracking-widest text-white/55">
          {t("ui.held.title")}
        </span>
        <ItemIcon itemId={held.itemId} size={40} />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-bold text-white/90">
          {t(definition?.localizationKey ?? held.itemId)}
        </span>

        {/* 锅/盘子里装着的东西。空容器不占地方 */}
        {contents.length > 0 && (
          <span className="text-[11px] text-white/60">
            {contents
              .map((item) => {
                const name = t(
                  findItemDefinition(item.itemId)?.localizationKey ??
                    item.itemId,
                );
                return item.quantity > 1 ? `${name}×${item.quantity}` : name;
              })
              .join(" · ")}
          </span>
        )}

        <div className="mt-0.5 flex gap-1.5">
          {/* 容器里有成品时才给"吃掉"和"收起来"——空锅只需要放回背包 */}
          {edible && (
            <button
              type="button"
              className="rounded-md border border-white/25 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10"
              onClick={() => eatFromHand()}
            >
              {t("ui.held.eat")}
            </button>
          )}

          {contents.length > 0 && (
            <button
              type="button"
              className="rounded-md border border-white/25 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10"
              onClick={() => storeHeldContents()}
            >
              {t("ui.held.store")}
            </button>
          )}

          <button
            type="button"
            className="rounded-md border border-white/25 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/10"
            onClick={() => {
              // 锅里有东西时放不回去（进背包会合堆，内容会丢）
              if (returnToBackpack() === "not_empty") {
                emit("story_toast", {
                  localizationKey: "cooking.pot_not_empty",
                  durationMs: 1800,
                });
              }
            }}
          >
            {t("ui.held.drop")}
          </button>
        </div>
      </div>
    </div>
  );
}
