import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import {
  BACKPACK_SIZE,
  HOTBAR_SIZE,
  getBackpack,
  getHotbar,
  type SlotRef,
} from "../../Game/State/inventory";
import { declineGift, giveItem } from "../../Game/Systems/dialogue";
import { canGiftTo } from "../../Game/Systems/gifting";
import { t } from "../../i18n/t";
import {
  DragGhost,
  ItemTooltip,
  SlotCell,
  registerDropZone,
  useDragState,
  useTooltip,
} from "../Inventory/slots";

/**
 * 送礼面板：头像 + 一个放入框（动森式直给，越简单越好）。
 *
 * **背包里的东西全都能拖进去，不做任何过滤。**
 * 玩家能递错是设计要求——试错本身是了解对方的一部分，
 * 只列它接受的东西等于把这件事整个删掉。收不收由喜好表算
 * （见 `Core/src/logic/giftRules.ts`），不由这个组件挑。
 *
 * 格子直接铺在面板里而不是让玩家去开背包：递东西是对话中的一个动作，
 * 中途去开另一块面板会把这一下打断成两件事。
 */
export function GiftBox({ petId }: { petId: string | null }) {
  const [, force] = useState(0);
  const { tooltip, show, hide } = useTooltip();
  const drag = useDragState();

  useEffect(() => on("inventory_changed", () => force((n) => n + 1)), []);

  // 拖到放入框上松手 = 递过去。判定和后果都不在这里
  useEffect(
    () => registerDropZone("gift", (from: SlotRef) => void giveItem(from)),
    [],
  );

  const blocked = petId === null || !canGiftTo(petId);
  const hotbar = getHotbar();
  const backpack = getBackpack();

  return (
    <>
      <div className="ui-dialogue absolute bottom-[calc(100%+14px)] left-1/2 w-[min(560px,86vw)] -translate-x-1/2 rounded-[24px] px-6 pb-5 pt-5">
        {/* 头像和名字**不在这里画**——下面的对话气泡已经有名字药丸了，
            这块再挂一份就变成同一只宠物的头像同时出现两次。 */}

        {/* 放入框：拖东西过来的时候亮一下，告诉玩家这里能放 */}
        <div className="flex justify-center">
          <div
            data-dropzone="gift"
            className={[
              "ui-gift-slot grid h-[88px] w-[88px] place-items-center text-[13px]",
              drag && !blocked ? "ui-gift-slot--active" : "",
            ].join(" ")}
          >
            {blocked ? t("ui.gift_full") : t("ui.gift_drop")}
          </div>
        </div>

        {blocked ? (
          <div className="mt-3 text-center text-[13px] text-[#8a7860]">
            {t("ui.gift_already_today")}
          </div>
        ) : (
          /* 窄屏下 8 列铺不开就横向滚动，不要把格子挤变形 */
          <div className="ui-scroll mt-4 overflow-x-auto">
            <div className="mx-auto grid w-max grid-cols-8 gap-1">
              {hotbar.slice(0, HOTBAR_SIZE).map((stack, index) => (
                <SlotCell
                  key={`h${index}`}
                  slotRef={{ container: "hotbar", index }}
                  stack={stack}
                  size={42}
                  onHover={show}
                  onLeave={hide}
                />
              ))}
              {backpack.slice(0, BACKPACK_SIZE).map((stack, index) => (
                <SlotCell
                  key={`b${index}`}
                  slotRef={{ container: "backpack", index }}
                  stack={stack}
                  size={42}
                  onHover={show}
                  onLeave={hide}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          {/* 吃饱了的时候不要再提示"拖进来"——那是在邀请一个做不到的动作。
              颜色比背包里的同类提示深一档：那边衬在羊皮纸上，这边是奶油底，
              照抄 #a08560 会淡到看不见 */}
          <span className="text-[12px] text-[#8a7250]">
            {blocked ? "" : t("ui.gift_hint")}
          </span>
          <button
            type="button"
            className="ui-dialogue-choice rounded-full px-5 py-1.5 text-[15px]"
            onClick={declineGift}
          >
            {t("ui.decline_gift")}
          </button>
        </div>
      </div>

      <DragGhost />
      <ItemTooltip tooltip={tooltip} />
    </>
  );
}
