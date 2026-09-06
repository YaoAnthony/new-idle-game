import { NET_LIMITS } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { getResident } from "../../Game/State/residentsRuntime";
import { setResidentAddress } from "../../Game/Systems/residents/naming";
import { residentNickname } from "../../i18n/residentName";
import { t } from "../../i18n/t";
import { Modal } from "../Modal/Modal";

/**
 * 单行输入（居民系统 04）："别这么叫我" → 你想被叫什么；"换个口头禅" → 他以后说什么。
 *
 * 由剧情效果 `prompt_text` 拉起（`text_prompt_requested` 事件），写回走 `setResidentAddress`
 * ——长度闸和玩家名同一条（`NET_LIMITS.maxNameLength`），空的等于取消。
 * 面板走 Modal 的 instant：这是对话里顺手的一下，不值得一秒钟的仪式。
 */
type Request = { residentId: string; target: "nickname" | "catchphrase" };

export function TextPrompt() {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    return on("text_prompt_requested", (payload) => {
      const agent = getResident(payload.residentId);
      setValue((payload.target === "nickname" ? agent?.playerNickname : agent?.catchphrase) ?? "");
      setRequest(payload);
    });
  }, []);

  if (!request) return null;

  const who = residentNickname(request.residentId);
  const title = request.target === "nickname" ? t("ui.prompt.nickname.title") : t("ui.prompt.catchphrase.title");
  const submit = () => {
    setResidentAddress(request.residentId, request.target, value);
    setRequest(null);
  };

  return (
    <Modal open onClose={() => setRequest(null)} instant seal={<span className="text-3xl">✎</span>}>
      <div className="flex flex-col gap-3 p-5 text-[#3d2817]">
        <div className="text-[16px] font-bold">{title.replace("{who}", who)}</div>
        <input
          autoFocus
          className="ui-input rounded-lg border border-[#e0d3b8] bg-[#fffaf0] px-3 py-2 text-[15px] outline-none"
          maxLength={NET_LIMITS.maxNameLength}
          value={value}
          placeholder={request.target === "nickname" ? t("ui.prompt.nickname.placeholder") : t("ui.prompt.catchphrase.placeholder")}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            event.stopPropagation();
          }}
          onKeyUp={(event) => event.stopPropagation()}
        />
        <div className="flex justify-end gap-2">
          <button type="button" className="ui-btn rounded-full px-4 py-1.5 text-[14px]" onClick={() => setRequest(null)}>
            {t("ui.prompt.cancel")}
          </button>
          <button type="button" className="ui-btn ui-btn-primary rounded-full px-4 py-1.5 text-[14px]" onClick={submit}>
            {t("ui.prompt.confirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
