import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { on } from "../../Game/EventBus";
import { t } from "../../i18n/t";
import { useAppSelector } from "../../Redux/hooks";
import { selectPanelStack } from "../../Redux/features/uiSlice";
import { GameBtn } from "../GameBtn/GameBtn";
import { Modal } from "../Modal/Modal";
import { HammerSeal } from "../Modal/seals";
import { usePanel } from "../PanelStack/usePanel";
import { findGuideDefinition, guideImages, type GuideDefinition } from "./guides";

/**
 * 引导面板（2026-09-09）：剧情在某个时刻弹出来讲一件事——第一次拿到家具时讲
 * "怎么摆"。走通用 Modal（印章仪式那套），内容是标题 + 示意图 + 一个按钮（可选一句话）。
 *
 * 没画示意图的引导留一块虚线框占位，图画好了填进 guides.ts 的 image / images 就替换掉占位。
 * 什么时候弹由 Core 的 storyRules 决定（show_guide 效果），这里只听事件。
 *
 * ---- 2026-09-12 两处改动 ----
 *
 * **排队，不抢。** 引导请求到的时候别的面板开着（用户拿到日记本之后 0.65 秒内点开了
 * 日记本，教程压在日记本上一起出现——用户："打开任务的 modal 的时候会自动同时打开教程"），
 * 就先记下来，等面板栈空了再弹。剧情规则不知道玩家此刻手上在干什么，"什么时候弹"
 * 这个判断只能在这儿做。排队的只留最后一条：两条引导挤在同一秒本身就是内容排错了。
 *
 * **多图翻页。** 一条引导可以给几张图（`images`）。第一版把箭头放在书外面（照日记本），
 * 用户："鬼知道有第二页"——图是 4:3、卡是 3:2，图两侧本来就空着一截，箭头就站在那里，
 * 和图挨着才读成"这张图还有下一张"。**没翻到最后一页时主按钮是「下一页」**，到最后一页
 * 才变成「知道了」（用户定：读到最后一页才能点）；点遮罩 / ESC 照旧能关，那是逃生门。
 */
export function GuidePanel() {
  const [open, setOpen] = usePanel("guide");
  const [guide, setGuide] = useState<GuideDefinition | null>(null);
  const [page, setPage] = useState(0);
  const queued = useRef<GuideDefinition | null>(null);
  const stack = useAppSelector(selectPanelStack);

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

  const show = (found: GuideDefinition) => {
    setGuide(found);
    setPage(0);
    setOpen(true);
  };

  useEffect(
    () =>
      on("guide_open_requested", ({ guideId }) => {
        const found = findGuideDefinition(guideId);
        if (!found) return;
        // 有别的面板开着（含正开着的另一条引导）→ 排队，栈空了再弹
        if (stack.length > 0) queued.current = found;
        else show(found);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stack 只在回调里读当下值，不该重订阅
    [setOpen, stack.length],
  );

  useEffect(() => {
    if (stack.length > 0 || !queued.current) return;
    const next = queued.current;
    queued.current = null;
    show(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show 用的 setter 都是稳定的
  }, [stack.length]);

  const images = guide ? guideImages(guide) : [];
  const multi = images.length > 1;
  const current = images[page];
  const last = page >= images.length - 1;

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
          {current ? (
            <div className="flex min-h-0 flex-1 items-center gap-2 short:gap-1">
              {multi && <PageArrow side="left" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} />}
              <img key={current} src={current} alt="" className="h-full min-h-0 min-w-0 flex-1 rounded-xl object-contain" />
              {multi && (
                <PageArrow side="right" disabled={last} onClick={() => setPage((p) => Math.min(images.length - 1, p + 1))} />
              )}
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center rounded-xl border-2 border-dashed border-[#c9c2b4] text-[13px] text-[#8a8274]">
              {t("guide.image_pending")}
            </div>
          )}
          {/* 说明（如果有）、页码点、按钮并排成一行：竖着叠在矮屏上又要从图那里抠 40px */}
          <div className="flex shrink-0 items-center gap-4 short:gap-3">
            {guide.bodyKey ? (
              <p className="m-0 flex-1 text-[14px] leading-relaxed short:text-[12px] short:leading-snug">{t(guide.bodyKey)}</p>
            ) : (
              <span className="flex-1" />
            )}
            {multi && (
              <div className="flex items-center gap-1.5" aria-label={`${page + 1} / ${images.length}`}>
                {images.map((src, index) => (
                  <button
                    key={src}
                    type="button"
                    aria-label={t("guide.page").replace("{n}", String(index + 1))}
                    onClick={() => setPage(index)}
                    className={`h-3 w-3 rounded-full border-0 p-0 transition-transform ${
                      index === page ? "scale-125 bg-[#4CAF50]" : "bg-[#c9dcc9]"
                    }`}
                  />
                ))}
              </div>
            )}
            {last ? (
              <GameBtn size={phone ? "sm" : "md"} tone="mint" onClick={() => setOpen(false)}>
                {t("guide.close")}
              </GameBtn>
            ) : (
              <GameBtn size={phone ? "sm" : "md"} tone="mint" onClick={() => setPage((p) => p + 1)}>
                {t("guide.next")}
              </GameBtn>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * 翻页箭头：站在图两侧的空地上，和日记本的那两枚同一套长相。
 * 到头那一侧不藏、只变淡：藏了图会横向跳一下，而且"这边没有了"本身也是信息。
 */
function PageArrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const isLeft = side === "left";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t(isLeft ? "guide.prev" : "guide.next")}
      className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-[#81C784] text-white shadow-[0_4px_0_#4CAF50] transition-all hover:bg-[#66BB6A] active:translate-y-[4px] active:shadow-none disabled:cursor-default disabled:opacity-30 disabled:hover:bg-[#81C784] disabled:active:translate-y-0 disabled:active:shadow-[0_4px_0_#4CAF50] short:h-9 short:w-9"
    >
      {isLeft ? <ChevronLeft className="h-6 w-6" strokeWidth={3.5} /> : <ChevronRight className="h-6 w-6" strokeWidth={3.5} />}
    </button>
  );
}
