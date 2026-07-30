import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { getDefinition } from "../../Game/State/worldRuntime";
import { petNickname } from "../../i18n/petName";
import { t } from "../../i18n/t";

/** 走近可交互目标时的"按 F"提示 */
export function InteractHint() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    return on("interact_target_changed", (target) => {
      if (!target) return setLabel(null);
      if (target.kind === "pet") {
        setLabel(`${petNickname(target.petId)} — ${t("ui.talk_hint")}`);
        return;
      }
      const definition = getDefinition(target.furnitureId);
      setLabel(
        definition
          ? `${t(definition.localizationKey)} — ${t("ui.interact_hint")}`
          : null,
      );
    });
  }, []);

  if (!label) return null;

  return (
    <div className="pointer-events-none absolute bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-md border border-white/20 bg-black/60 px-3 py-1.5 text-[13px] text-white/90 backdrop-blur">
      <span className="mr-1.5 rounded bg-amber-400/90 px-1.5 text-[12px] font-bold text-black">
        F
      </span>
      {label}
    </div>
  );
}
