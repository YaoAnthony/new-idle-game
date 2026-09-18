import { findExpression } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import {
  advance,
  choose,
  end,
  getActiveDialogue,
  getCurrentNode,
  visibleChoices,
} from "../../Game/Systems/dialogue";
import { getAvatar } from "../../Game/State/avatar";
import { getResident } from "../../Game/State/residentsRuntime";
import { talkText } from "../../Game/Systems/residents/talk";
import { playerPortrait, residentPortrait } from "../../Game3D/Portrait/portraitSnapshot";
import { t } from "../../i18n/t";
import { GiftBox } from "./GiftBox";

/**
 * 底部对话框（V0.6 / 动森式；2026-09-16 改版）：**左边一张脸，右边一个框**。
 * 说话的是谁，左边就是谁的正脸——你的是从捏出来的骨架里拍的（换了发型自动跟着变），
 * 居民的用画好的立绘，没画的从造型里拍（`Game3D/Portrait/portraitSnapshot`）。
 * 名字药丸拿掉了：脸就是身份，不用再写一遍。表情图标缩成脸角上的小徽章。
 *
 * 线性节点点击继续，分支出选项，送礼节点列出背包里可送的东西。
 */
export function DialoguePanel() {
  const [, force] = useState(0);

  useEffect(() => {
    return on("dialogue_changed", () => force((n) => n + 1));
  }, []);

  // 03：他做表情时脸角上的小徽章要跟着换
  useEffect(() => {
    return on("resident_changed", ({ reason }) => {
      if (reason === "expression") force((n) => n + 1);
    });
  }, []);

  const node = getCurrentNode();
  const active = getActiveDialogue();
  if (!node || !active) return null;

  const speakerAgent = active.residentId ? getResident(active.residentId) : undefined;
  const expression = speakerAgent?.expression ?? null;
  // 03：台词里的 {cp} 换成这位的口头禅——气泡和面板走同一个口，别在这里再拼一遍
  const line = (key: string): string => (speakerAgent ? talkText(speakerAgent.definitionId, key) : t(key));
  const expressionIcon = expression ? t(findExpression(expression.id)?.iconKey ?? "") : null;
  const choices = visibleChoices();
  const request = node.itemRequest;

  const isPlayer = node.speaker === "player";
  /*
   * 左边那张脸：你 = 骨架拍的正脸；居民 = 立绘 / 造型拍的；
   * 没有对话对象的旁白（拿信封那段、魔女的条子）没有脸可放——给一个对话气泡，
   * 不放动物脚印，那是"某位居民"的意思。
   */
  const portrait = isPlayer
    ? playerPortrait(getAvatar())
    : speakerAgent
      ? residentPortrait(speakerAgent.definitionId)
      : null;
  const fallback = isPlayer ? "🙂" : speakerAgent ? "🐾" : "💬";

  return (
    <div className="absolute bottom-10 left-1/2 z-30 w-[min(960px,92vw)] -translate-x-1/2 short:bottom-4">
      {/* 送礼节点浮在气泡上方：递东西是对话里的一个动作，不是另开一块面板 */}
      {request && <GiftBox residentId={active.residentId} />}

      <div className="flex items-end gap-4 short:gap-2.5">
        {/* 左：说话的人的正脸 */}
        <div className="ui-portrait relative h-[120px] w-[120px] shrink-0 overflow-hidden rounded-[24px] short:h-[76px] short:w-[76px] short:rounded-[16px]">
          {portrait ? (
            <img src={portrait} alt="" draggable={false} className="h-full w-full select-none object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[52px] short:text-[34px]">{fallback}</span>
          )}
          {!isPlayer && expressionIcon && (
            <span
              className="absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-full bg-[#fff8e6] text-[18px] leading-none shadow short:h-6 short:w-6 short:text-[14px]"
              aria-label={expression?.id}
            >
              {expressionIcon}
            </span>
          )}
        </div>

        {/* 右：台词框 */}
        <div className="ui-dialogue relative min-h-[120px] min-w-0 flex-1 rounded-[26px] px-8 pb-7 pt-7 short:min-h-[76px] short:px-5 short:pb-5 short:pt-4">
          <div className="min-h-[52px] short:min-h-[36px]">
            <div className="text-[21px] leading-[1.75] tracking-wide text-[#463726] short:text-[16px] short:leading-[1.5]">
              {line(node.localizationKey)}
            </div>
          </div>
        {choices.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-end gap-2.5">
            {choices.map((choice) => (
              <button
                key={choice.choiceId}
                type="button"
                className="ui-dialogue-choice rounded-full px-5 py-2 text-[16px]"
                onClick={() => choose(choice.choiceId)}
              >
                {line(choice.localizationKey)}
              </button>
            ))}
          </div>
        )}

          {/* 底部居中的继续三角（动森式）。无分支时整框可点 */}
      {!request && choices.length === 0 && (
        <button
          type="button"
          aria-label={node.nextNodeId ? t("ui.continue") : t("ui.close")}
          className="absolute inset-0 cursor-pointer"
          onClick={() => {
            if (node.nextNodeId) advance();
            else end();
          }}
        >
          <span className="ui-dialogue-arrow absolute -bottom-1 left-1/2 -translate-x-1/2" />
        </button>
      )}
        </div>
      </div>
    </div>
  );
}
