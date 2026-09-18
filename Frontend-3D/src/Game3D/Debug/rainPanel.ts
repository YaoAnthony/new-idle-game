import { puddleTuning, rainTuning, setPuddleTuning, setRainTuning, type PuddleTuning, type RainTuning } from "../Visual/rainTuning";

/**
 * 临时调参面板（2026-09-18）：`/rainpanel` 开关。纯 DOM，不进 React——它是走查工具，
 * 定了数就抄回 `rainTuning`，面板可以整个删掉。
 */

type Slider = { key: keyof RainTuning; min: number; max: number; step: number };

const SLIDERS: Slider[] = [
  { key: "count", min: 200, max: 8000, step: 100 },
  { key: "radius", min: 8, max: 80, step: 1 },
  { key: "height", min: 6, max: 40, step: 1 },
  { key: "size", min: 0.1, max: 3, step: 0.05 },
  { key: "sizeJitter", min: 0, max: 0.9, step: 0.05 },
  { key: "streakWidth", min: 0.02, max: 0.5, step: 0.01 },
  { key: "streakSoftness", min: 0, max: 1, step: 0.05 },
  { key: "speedMin", min: 2, max: 30, step: 0.5 },
  { key: "speedMax", min: 2, max: 40, step: 0.5 },
  { key: "opacity", min: 0, max: 1, step: 0.02 },
  { key: "uvSquashMin", min: 0.05, max: 1, step: 0.05 },
  { key: "nearFade", min: 0, max: 8, step: 0.1 },
  { key: "farFade", min: 5, max: 80, step: 1 },
  { key: "windDrift", min: 0, max: 15, step: 0.5 },
  { key: "slantDeg", min: 0, max: 60, step: 1 },
];

type PuddleSlider = { key: keyof PuddleTuning; min: number; max: number; step: number };
const PUDDLE_SLIDERS: PuddleSlider[] = [
  { key: "scale", min: 0.02, max: 0.4, step: 0.005 },
  { key: "thresholdWet", min: 0.3, max: 0.9, step: 0.01 },
  { key: "edgeNoise", min: 0, max: 0.3, step: 0.01 },
  { key: "reflect", min: 0, max: 1, step: 0.05 },
  { key: "distort", min: 0, max: 0.06, step: 0.002 },
  { key: "tint", min: 0, max: 1, step: 0.05 },
  { key: "rippleRate", min: 0, max: 300, step: 5 },
  { key: "rippleLife", min: 0.3, max: 3, step: 0.1 },
  { key: "fillSeconds", min: 2, max: 120, step: 1 },
  { key: "drySeconds", min: 5, max: 600, step: 5 },
];

let panel: HTMLElement | null = null;

export function toggleRainPanel(): boolean {
  if (panel) {
    panel.remove();
    panel = null;
    return false;
  }
  panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:12px;top:72px;z-index:9999;width:300px;max-height:80vh;overflow:auto;" +
    "background:rgba(20,18,16,.88);color:#f3ead8;font:12px/1.5 system-ui,sans-serif;padding:10px 12px;" +
    "border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4)";
  const title = document.createElement("div");
  title.textContent = "雨 · 调参（/rainpanel 关）";
  title.style.cssText = "font-weight:600;margin-bottom:6px";
  panel.appendChild(title);

  for (const slider of SLIDERS) {
    const row = document.createElement("label");
    row.style.cssText = "display:grid;grid-template-columns:96px 1fr 48px;gap:6px;align-items:center;margin:3px 0";
    const name = document.createElement("span");
    name.textContent = slider.key;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(slider.min);
    input.max = String(slider.max);
    input.step = String(slider.step);
    input.value = String(rainTuning[slider.key]);
    const value = document.createElement("span");
    value.textContent = String(rainTuning[slider.key]);
    value.style.textAlign = "right";
    input.oninput = () => {
      const next = Number(input.value);
      value.textContent = String(next);
      setRainTuning({ [slider.key]: next } as Partial<RainTuning>);
    };
    row.append(name, input, value);
    panel.appendChild(row);
  }

  const puddleTitle = document.createElement("div");
  puddleTitle.textContent = "积水";
  puddleTitle.style.cssText = "font-weight:600;margin:10px 0 4px";
  panel.appendChild(puddleTitle);
  for (const slider of PUDDLE_SLIDERS) {
    const row = document.createElement("label");
    row.style.cssText = "display:grid;grid-template-columns:96px 1fr 48px;gap:6px;align-items:center;margin:3px 0";
    const name = document.createElement("span");
    name.textContent = slider.key;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(slider.min);
    input.max = String(slider.max);
    input.step = String(slider.step);
    input.value = String(puddleTuning[slider.key]);
    const value = document.createElement("span");
    value.textContent = String(puddleTuning[slider.key]);
    value.style.textAlign = "right";
    input.oninput = () => {
      const next = Number(input.value);
      value.textContent = String(next);
      setPuddleTuning({ [slider.key]: next } as Partial<PuddleTuning>);
    };
    row.append(name, input, value);
    panel.appendChild(row);
  }

  const colorRow = document.createElement("label");
  colorRow.style.cssText = "display:grid;grid-template-columns:96px 1fr;gap:6px;align-items:center;margin:3px 0";
  const colorName = document.createElement("span");
  colorName.textContent = "color";
  const color = document.createElement("input");
  color.type = "color";
  color.value = rainTuning.color;
  color.oninput = () => setRainTuning({ color: color.value });
  colorRow.append(colorName, color);
  panel.appendChild(colorRow);

  const blendRow = document.createElement("label");
  blendRow.style.cssText = colorRow.style.cssText;
  const blendName = document.createElement("span");
  blendName.textContent = "blending";
  const blend = document.createElement("select");
  for (const option of ["normal", "additive"]) {
    const item = document.createElement("option");
    item.value = option;
    item.textContent = option;
    if (option === rainTuning.blending) item.selected = true;
    blend.appendChild(item);
  }
  blend.onchange = () => setRainTuning({ blending: blend.value as RainTuning["blending"] });
  blendRow.append(blendName, blend);
  panel.appendChild(blendRow);

  const copy = document.createElement("button");
  copy.textContent = "复制 JSON（抄回 rainTuning）";
  copy.style.cssText = "margin-top:8px;width:100%;padding:6px;border:0;border-radius:6px;background:#e3ae90;color:#3a2a1c;font-weight:600;cursor:pointer";
  copy.onclick = () => {
    const text = JSON.stringify({ rain: rainTuning, puddle: puddleTuning }, null, 2);
    void navigator.clipboard?.writeText(text);
    console.log("[rain] tuning", text);
    copy.textContent = "已复制（也打在控制台）";
    setTimeout(() => (copy.textContent = "复制 JSON（抄回 rainTuning）"), 1200);
  };
  panel.appendChild(copy);
  document.body.appendChild(panel);
  return true;
}
