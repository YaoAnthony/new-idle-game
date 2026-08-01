import { useEffect, useState } from "react";
import { ChatMessageKind } from "core";
import { on } from "../../Game/EventBus";
import { pushChatMessage } from "../../Game/State/chatLog";
import { t } from "../../i18n/t";

/** 剧情提示条。内容由 Core 的 storyRules 的 show_toast 效果推送 */
export function StoryToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const off = on("story_toast", ({ localizationKey, durationMs }) => {
      const text = t(localizationKey);
      setMessage(text);
      /**
       * 浮层照旧飘一下，**同时**记进消息流。
       *
       * 浮层管"现在看得见"，记录管"翻得回去"——原来只有浮层，
       * 玩家一走神提示就飘走了，没有任何地方能再看一眼。
       * 存成文而不是 key：这是历史，改文案不该把三天前那句一起改了。
       */
      pushChatMessage({
        kind: ChatMessageKind.Story,
        text,
        sourceKey: localizationKey,
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), durationMs);
    });

    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-6 z-30 max-w-[560px] -translate-x-1/2 rounded-lg border-2 border-[#8a6239] bg-[#f6ecd0]/95 px-5 py-3 text-center text-[14px] leading-relaxed text-[#4a3020] shadow-lg">
      {message}
    </div>
  );
}
