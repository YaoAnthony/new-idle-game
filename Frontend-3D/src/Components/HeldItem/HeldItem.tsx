import { findItemDefinition, type HeldStack } from "core";
import { useEffect, useState } from "react";
import { emit, on } from "../../Game/EventBus";
import { getHeld, returnToBackpack } from "../../Game/State/heldItem";
import { eatFromHand, storeHeldContents } from "../../Game/Systems/kitchen";
import { t } from "../../i18n/t";
import { ItemIcon } from "../Inventory/slots";

/**
 * 手上端着什么 = **选中的那个快捷栏格子**里装着什么。
 *
 * 做成右下角一小块而不是弹窗：端着锅走来走去是常态，
 * 它得一直在视野里，又不能挡住画面。快捷栏上那一格也高亮着，
 * 这张卡片补的是快捷栏格子放不下的信息——锅里装了什么、能对它做什么。
 */
export function HeldItem() {
  const [held, setHeld] = useState<HeldStack | null>(getHeld());

  // 换选中格和改锅里的内容都发这条
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
              // 锅里有东西时不给挪进背包：先起锅或装盘，
              // 别把一口热锅塞到背包深处去
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
