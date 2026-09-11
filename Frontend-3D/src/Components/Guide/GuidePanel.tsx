import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { t } from "../../i18n/t";
import { GameBtn } from "../GameBtn/GameBtn";
import { Modal } from "../Modal/Modal";
import { HammerSeal } from "../Modal/seals";
import { usePanel } from "../PanelStack/usePanel";
import { findGuideDefinition, type GuideDefinition } from "./guides";

/**
 * 引导面板（2026-09-09）：剧情在某个时刻弹出来讲一件事——第一次拿到家具时讲
 * "怎么摆"。走通用 Modal（印章仪式那套），内容是标题 + 示意图 + 一段话 + 一个按钮。
 *
 * 示意图现在还没画：留一块虚线框占位，图画好了填进 guides.ts 的 image 就替换掉占位。
 * 什么时候弹由 Core 的 storyRules 决定（show_guide 效果），这里只听事件。
 */
export function GuidePanel() {
  const [open, setOpen] = usePanel("guide");
  const [guide, setGuide] = useState<GuideDefinition | null>(null);

  useEffect(
    () =>
      on("guide_open_requested", ({ guideId }) => {
        const found = findGuideDefinition(guideId);
        if (!found) return;
        setGuide(found);
        setOpen(true);
      }),
    [setOpen],
  );

  return (
    <Modal
      open={open && guide !== null}
      onClose={() => setOpen(false)}
      seal={<HammerSeal />}
      frameColor="#66BB6A"
      paperColor="#fdfbf7"
      aspect={1.3}
      fill={0.72}
      label={guide ? t(guide.titleKey) : ""}
    >
      {guide ? (
        <div className="flex h-full flex-col gap-3 overflow-hidden px-6 py-5 text-[#2b3b36]">
          <h2 className="m-0 text-[clamp(16px,2.6vw,20px)] font-black">{t(guide.titleKey)}</h2>
          {guide.image ? (
            <img src={guide.image} alt="" className="min-h-0 w-full flex-1 rounded-xl object-contain" />
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center rounded-xl border-2 border-dashed border-[#c9c2b4] text-[13px] text-[#8a8274]">
              {t("guide.place_furniture.image_pending")}
            </div>
          )}
          <p className="m-0 text-[14px] leading-relaxed">{t(guide.bodyKey)}</p>
          <div className="flex justify-end">
            <GameBtn size="md" tone="mint" onClick={() => setOpen(false)}>
              {t("guide.close")}
            </GameBtn>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
