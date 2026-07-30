import { findDialogueDefinition, findItemDefinition } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { getCount } from "../../Game/State/inventory";
import {
  advance,
  choose,
  declineGift,
  end,
  getActiveDialogue,
  getCurrentNode,
  giveItem,
  visibleChoices,
} from "../../Game/Systems/dialogue";
import { petNickname } from "../../i18n/petName";
import { t } from "../../i18n/t";

/**
 * 对话 id → 头像图。生成的头像放 public/portraits/。
 * 图缺了不要紧——<img> 的 onError 会把头像整块收起来，只剩名字药丸。
 */
function portraitFor(dialogueId: string): string {
  if (dialogueId.startsWith("mom")) return "/portraits/mom.png";
  return `/portraits/${dialogueId.replace(/_(first_meet|casual)$/, "")}.png`;
}

/**
 * 底部对话框 + 镜头拉近（V0.6 / 动森式）。
 * 线性节点点击继续，分支出选项，送礼节点列出背包里可送的东西。
 */
export function DialoguePanel() {
  const [, force] = useState(0);
  const [portraitOk, setPortraitOk] = useState(true);

  useEffect(() => {
    return on("dialogue_changed", () => force((n) => n + 1));
  }, []);

  const node = getCurrentNode();
  const active = getActiveDialogue();
  if (!node || !active) return null;

  const definition = findDialogueDefinition(active.dialogueId);
  // 对话对象是宠物时优先用它的昵称（玩家可能改过），否则用注册表里的说话人名
  const speakerName = active.petId
    ? petNickname(active.petId)
    : definition?.speakerNameKey
      ? t(definition.speakerNameKey)
      : t("pet.unknown");
  const portrait = portraitFor(active.dialogueId);

  const choices = visibleChoices();
  const request = node.itemRequest;
  const giftable = (request?.acceptedItemIds ?? []).filter(
    (itemId) => getCount(itemId) > 0,
  );

  return (
    <div className="absolute bottom-10 left-1/2 z-30 w-[min(880px,88vw)] -translate-x-1/2">
      {/* 名字药丸：浮在气泡左上角，压住气泡边缘（动森式） */}
      <div className="ui-name-tag relative z-10 ml-6 inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-5">
        {portraitOk && (
          <img
            src={portrait}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full border-2 border-[#f7f1e0] object-cover"
            onError={() => setPortraitOk(false)}
          />
        )}
        <span className="text-[16px] font-bold tracking-wide text-[#4a3b2a]">
          {node.speaker === "npc" ? speakerName : t("ui.you")}
        </span>
      </div>

      <div className="ui-dialogue -mt-4 rounded-[26px] px-8 pb-7 pt-7">
        <div className="min-h-[76px]">
          <div className="text-[21px] leading-[1.75] tracking-wide text-[#463726]">
            {t(node.localizationKey)}
          </div>
        </div>

        {(choices.length > 0 || request) && (
          <div className="mt-4 flex flex-wrap justify-end gap-2.5">
            {choices.map((choice) => (
              <button
                key={choice.choiceId}
                type="button"
                className="ui-dialogue-choice rounded-full px-5 py-2 text-[16px]"
                onClick={() => choose(choice.choiceId)}
              >
                {t(choice.localizationKey)}
              </button>
            ))}

            {request && (
              <>
                {giftable.map((itemId) => {
                  const item = findItemDefinition(itemId);
                  return (
                    <button
                      key={itemId}
                      type="button"
                      className="ui-dialogue-choice ui-dialogue-choice--gift rounded-full px-5 py-2 text-[16px]"
                      onClick={() => giveItem(itemId)}
                    >
                      {t("ui.give")}
                      {item ? t(item.localizationKey) : itemId} ×
                      {getCount(itemId)}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="ui-dialogue-choice rounded-full px-5 py-2 text-[16px]"
                  onClick={declineGift}
                >
                  {t("ui.no_food")}
                </button>
              </>
            )}
          </div>
        )}
      </div>

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
  );
}
