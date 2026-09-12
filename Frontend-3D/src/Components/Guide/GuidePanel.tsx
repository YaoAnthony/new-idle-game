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
 * 没画示意图的引导留一块虚线框占位，图画好了填进 guides.ts 的 image 就替换掉占位。
 * 什么时候弹由 Core 的 storyRules 决定（show_guide 效果），这里只听事件。
 */
export function GuidePanel() {
  const [open, setOpen] = usePanel("guide");
  const [guide, setGuide] = useState<GuideDefinition | null>(null);

  /*
   * 矮屏（SE 横屏 375 高）不给 Modal 比例，让它铺满——和背包 / 寄售箱同一套判据。
   * 第一版给了 aspect 1.3 + fill 0.72，在 SE 上算出来的内胆只有两百多像素高，
   * 标题、两行说明、按钮各吃一截，示意图剩 37px 高，成了一条看不清的缩略图
   * （2026-09-12 渲图量到的）。占位虚线框时代看不出来，图真画好了才暴露。
   */
  const [phone, setPhone] = useState(
    () => window.matchMedia("(max-height: 500px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-height: 500px)");
    const onChange = () => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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
      aspect={phone ? undefined : 1.5}
      fill={phone ? undefined : 0.8}
      label={guide ? t(guide.titleKey) : ""}
    >
      {guide ? (
        <div className="flex h-full flex-col gap-3 overflow-hidden px-6 py-5 text-[#2b3b36] short:gap-2 short:px-4 short:py-3">
          <h2 className="m-0 text-[clamp(16px,2.6vw,20px)] font-black short:text-[15px]">{t(guide.titleKey)}</h2>
          {guide.image ? (
            <img src={guide.image} alt="" className="min-h-0 w-full flex-1 rounded-xl object-contain" />
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center rounded-xl border-2 border-dashed border-[#c9c2b4] text-[13px] text-[#8a8274]">
              {t("guide.image_pending")}
            </div>
          )}
          {/* 说明和按钮并排成一行：竖着叠两行在矮屏上又要从图那里抠 40px */}
          <div className="flex shrink-0 items-center gap-4 short:gap-3">
            <p className="m-0 flex-1 text-[14px] leading-relaxed short:text-[12px] short:leading-snug">{t(guide.bodyKey)}</p>
            <GameBtn size={phone ? "sm" : "md"} tone="mint" onClick={() => setOpen(false)}>
              {t("guide.close")}
            </GameBtn>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
