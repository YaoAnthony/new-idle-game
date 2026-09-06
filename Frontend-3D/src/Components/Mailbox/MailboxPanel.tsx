import { CreatureRole, findLetterDefinition, findResidentDefinition, mailTuning } from "core";
import { useEffect, useState } from "react";

import { on } from "../../Game/EventBus";
import { isRemoteWorld } from "../../Game/Multiplayer/worldLock";
import { getSelectedStack } from "../../Game/State/inventory";
import { getResidents } from "../../Game/State/residentsRuntime";
import { claimAttachment, findLetter, letterText, listLetters, listOutbox, openLetter, writeLetter } from "../../Game/Systems/mail";
import { t } from "../../i18n/t";
import { ItemIcon } from "../Inventory/slots";
import { usePanel } from "../PanelStack/usePanel";
import "../NewspaperPanel/newspaper.css";

/**
 * 信箱面板（居民系统 10）：左边一叠信封（未读加粗），右边信纸；附件"收下"经领取面板入包；
 * "写信"= 收信人 + 模板句 + 可选夹上手里那件。信纸借报纸那套做旧纹理（同一族字体）。
 * 做客中只读：没有"收下"和"写信"。手机横屏单列切换（列表 / 信纸）。
 */
export function MailboxPanel() {
  const [open, setOpen] = usePanel("mailbox");
  const [, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    const offOpen = on("mailbox_open_requested", () => {
      setRevision((n) => n + 1);
      setWriting(false);
      setOpen(true);
    });
    const offChange = on("mail_changed", () => setRevision((n) => n + 1));
    return () => {
      offOpen();
      offChange();
    };
  }, [setOpen]);

  if (!open) return null;

  const letters = [...listLetters()].reverse();
  const current = selected ? findLetter(selected) : undefined;
  const guest = isRemoteWorld();

  const pick = (id: string): void => {
    setSelected(id);
    setWriting(false);
    openLetter(id);
  };

  return (
    <div
      className="absolute inset-0 z-40 grid min-h-0 place-items-center bg-black/55 px-4 py-5"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="news-sheet relative flex max-h-full min-h-0 flex-col overflow-hidden px-5 pb-4 pt-4" style={{ width: "min(820px,95vw)" }}>
        <button
          type="button"
          className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center border border-[#3b3428] text-[13px] leading-none"
          style={{ borderRadius: 0 }}
          aria-label={t("ui.close")}
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
        <header className="news-masthead">
          <div className="flex items-baseline justify-between gap-3 pr-8">
            <h1 className="news-title" style={{ fontSize: "clamp(18px, 3vmin, 26px)" }}>{t("ui.mail.title")}</h1>
            <span className="text-[11px] tracking-[0.14em] text-[#6d6350]">
              {t("ui.mail.count").replace("{n}", String(letters.length)).replace("{max}", String(mailTuning.boxCapacity))}
            </span>
          </div>
        </header>

        <div className="mt-2 grid min-h-0 flex-1 gap-3 md:grid-cols-[220px_1fr]">
          {/* ---- 信封列表 ---- */}
          <div className={`ui-scroll min-h-0 overflow-y-auto pr-1 ${current || writing ? "hidden md:block" : ""}`}>
            {!guest && (
              <button type="button" className="ui-green-btn mb-2 w-full rounded-full py-1.5 text-[13px] font-bold" onClick={() => { setWriting(true); setSelected(null); }}>
                {t("ui.mail.write")}
              </button>
            )}
            {letters.length === 0 && <p className="news-body m-0 text-[12px]" style={{ textIndent: 0 }}>{t("ui.mail.empty")}</p>}
            <ul className="m-0 list-none p-0">
              {letters.map((letter) => {
                const from = letter.fromResidentId ? t(findResidentDefinition(letter.fromResidentId)?.localizationKey ?? "ui.mail.unknown_sender") : t("ui.mail.story_sender");
                const definition = findLetterDefinition(letter.letterId);
                return (
                  <li key={letter.id}>
                    <button
                      type="button"
                      className={`block w-full border-b border-[#d9cdb4] px-1 py-1.5 text-left text-[13px] ${letter.opened ? "text-[#6d6350]" : "font-bold text-[#3b3428]"} ${selected === letter.id ? "bg-[#f0e6cf]" : ""}`}
                      onClick={() => pick(letter.id)}
                    >
                      <span>{definition?.kind === "postcard" ? "🖼 " : "✉ "}{from}</span>
                      <span className="float-right text-[11px] font-normal text-[#8a7d66]">{letter.receivedDayId.slice(5)}{letter.attach ? " 📎" : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ---- 信纸 / 写信 ---- */}
          <div className="ui-scroll min-h-0 overflow-y-auto pr-1">
            {writing ? (
              <WriteForm guest={guest} onDone={() => setWriting(false)} />
            ) : current ? (
              <Letter id={current.id} guest={guest} onBack={() => setSelected(null)} />
            ) : (
              <p className="news-body m-0 hidden md:block" style={{ textIndent: 0 }}>{t("ui.mail.pick_one")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Letter({ id, guest, onBack }: { id: string; guest: boolean; onBack: () => void }) {
  const letter = findLetter(id);
  if (!letter) return null;
  const definition = findLetterDefinition(letter.letterId);
  const from = letter.fromResidentId ? t(findResidentDefinition(letter.fromResidentId)?.localizationKey ?? "ui.mail.unknown_sender") : t("ui.mail.story_sender");
  const postcard = definition?.kind === "postcard";
  return (
    <div className={postcard ? "border-4 border-double border-[#b9ad92] p-3" : "p-1"}>
      <button type="button" className="mb-1 text-[12px] text-[#6d6350] md:hidden" onClick={onBack}>← {t("ui.mail.back")}</button>
      {postcard && <div className="mb-2 grid h-[90px] place-items-center bg-[#e6dcc4] text-[11px] tracking-[0.2em] text-[#6d6350]">{t("ui.mail.postcard_art")}</div>}
      <div className="news-kicker">{t("ui.mail.from").replace("{who}", from)} · {letter.receivedDayId}</div>
      <p className="news-body mt-2 whitespace-pre-line" style={{ textIndent: 0, fontSize: 15, lineHeight: 1.7 }}>{letterText(letter)}</p>
      <p className="news-body mt-3 text-right" style={{ textIndent: 0 }}>— {from}</p>
      {letter.attach && (
        <div className="mt-3 flex items-center gap-3 border-t border-[#d9cdb4] pt-3">
          <div className="ui-slot grid h-[52px] w-[52px] place-items-center"><ItemIcon itemId={letter.attach.itemId} size={40} /></div>
          <span className="text-[13px] text-[#3b3428]">{t("ui.mail.attached").replace("{what}", t(`item.${letter.attach.itemId}`))}</span>
          {!guest && (
            <button type="button" className="ui-green-btn ml-auto rounded-full px-4 py-1.5 text-[13px] font-bold" onClick={() => claimAttachment(id)}>
              {t("ui.reward_claim")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WriteForm({ guest, onDone }: { guest: boolean; onDone: () => void }) {
  const residents = getResidents().filter((agent) => agent.role === CreatureRole.Resident && !agent.visiting);
  const [to, setTo] = useState(residents[0]?.definitionId ?? "");
  const [template, setTemplate] = useState<string>(mailTuning.playerTemplates[0]);
  const [attach, setAttach] = useState(false);
  const held = getSelectedStack();
  const outbox = listOutbox();
  if (guest) return null;
  return (
    <div className="p-1">
      <div className="news-kicker">{t("ui.mail.write")}</div>
      <label className="mt-2 block text-[13px]">
        {t("ui.mail.to")}
        <select className="ml-2 border border-[#b9ad92] bg-[#fbf6ea] px-1 py-0.5 text-[13px]" value={to} onChange={(event) => setTo(event.target.value)}>
          {residents.map((agent) => (
            <option key={agent.definitionId} value={agent.definitionId}>{t(findResidentDefinition(agent.definitionId)?.localizationKey ?? agent.definitionId)}</option>
          ))}
        </select>
      </label>
      <ul className="mt-2 m-0 list-none p-0">
        {mailTuning.playerTemplates.map((key) => (
          <li key={key}>
            <label className="flex items-center gap-2 py-1 text-[13px]">
              <input type="radio" name="mail-template" checked={template === key} onChange={() => setTemplate(key)} />
              <span>{t(key)}</span>
            </label>
          </li>
        ))}
      </ul>
      <label className="mt-2 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={attach} disabled={!held} onChange={(event) => setAttach(event.target.checked)} />
        <span>{held ? t("ui.mail.attach_held").replace("{what}", t(`item.${held.itemId}`)) : t("ui.mail.attach_none")}</span>
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="ui-green-btn rounded-full px-5 py-1.5 text-[13px] font-bold disabled:opacity-50"
          disabled={!to}
          onClick={() => {
            if (writeLetter(to, template, attach && held !== null)) onDone();
          }}
        >
          {t("ui.mail.send")}
        </button>
        <button type="button" className="rounded-full border border-[#b9ad92] px-4 py-1.5 text-[13px]" onClick={onDone}>{t("ui.cancel")}</button>
      </div>
      {outbox.length > 0 && (
        <p className="news-body mt-3 text-[12px]" style={{ textIndent: 0 }}>{t("ui.mail.outbox_pending").replace("{n}", String(outbox.length))}</p>
      )}
    </div>
  );
}
