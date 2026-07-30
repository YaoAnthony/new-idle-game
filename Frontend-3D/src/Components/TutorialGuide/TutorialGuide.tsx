import { tutorialDefinition, type StorySignal, type StoryTrigger } from "core";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { t } from "../../i18n/t";

/**
 * 教程引导。步骤内容全部来自 Core 的 tutorialDefinition，
 * 组件只负责渲染当前步骤和监听完成信号——没有任何步骤字面量。
 */

function matches(trigger: StoryTrigger, signal: StorySignal): boolean {
  if (trigger.signal !== signal.kind) return false;
  if (trigger.subject && trigger.subject !== signal.subject) return false;
  return true;
}

export function TutorialGuide() {
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const steps = tutorialDefinition.steps;

  useEffect(() => {
    return on("story_signal", (signal) => {
      setStepIndex((current) => {
        // 允许跳步：玩家提前完成了后面的步骤也认
        const hit = steps.findIndex(
          (step, index) => index >= current && matches(step.completedBy, signal),
        );
        return hit >= 0 ? hit + 1 : current;
      });
    });
  }, [steps]);

  useEffect(() => {
    if (stepIndex < steps.length) return;
    const timer = setTimeout(() => setDismissed(true), 9000);
    return () => clearTimeout(timer);
  }, [stepIndex, steps.length]);

  if (dismissed) return null;

  const finished = stepIndex >= steps.length;

  return (
    <div className="absolute left-4 top-4 z-10 max-w-[300px] rounded-lg border-2 border-[#8a6239] bg-[#f6ecd0]/95 px-3.5 py-2.5 shadow-lg">
      {finished ? (
        <div className="text-[13px] leading-relaxed text-[#4a3020]">
          {t(tutorialDefinition.completedLocalizationKey)}
        </div>
      ) : (
        <>
          <div className="mb-0.5 text-[11px] text-[#8a6a48]">
            接下来（{stepIndex + 1}/{steps.length}）
          </div>
          <div className="text-[13px] leading-relaxed text-[#4a3020]">
            {t(steps[stepIndex].localizationKey)}
          </div>
        </>
      )}
    </div>
  );
}
