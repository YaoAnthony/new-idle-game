import {
  AvatarSlot,
  avatarPartsForSlot,
  defaultAvatarConfig,
  findAvatarPalette,
  type AvatarConfig,
} from "core";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../i18n/t";
import { CreatorPreview } from "./CreatorPreview";

/**
 * 捏脸页（开新档前的一站）。布局照玩家给的动森参照：
 * 左边角色实时预览（可拖转），右边零件格子 + 底下调色板。
 *
 * 界面完全由注册表驱动——标签页、零件格、色板都是查表画出来的，
 * Core 加一款发型这里自动多一格，不改界面代码。
 *
 * 配置在本组件里是**草稿**：改零件只重建预览，点"就这样出发"才写进
 * 运行时（由 App 传入的 onConfirm 负责）。返回则什么都不留。
 */

/** 捏脸页开放的槽位和顺序。body 不在内（V1 不开放体型） */
const SLOT_ORDER: AvatarSlot[] = [
  AvatarSlot.Face,
  AvatarSlot.Hair,
  AvatarSlot.Eyes,
  AvatarSlot.Mouth,
  AvatarSlot.Nose,
  AvatarSlot.Top,
  AvatarSlot.Bottom,
  AvatarSlot.Shoes,
];

/** 槽位 → AvatarConfig 上的字段。加槽位时 TS 会在这里逼你补映射 */
const SLOT_FIELD: Record<AvatarSlot, keyof AvatarConfig | null> = {
  [AvatarSlot.Body]: "bodyId",
  [AvatarSlot.Face]: "faceId",
  [AvatarSlot.Hair]: "hairId",
  [AvatarSlot.Eyes]: "eyesId",
  [AvatarSlot.Mouth]: "mouthId",
  [AvatarSlot.Nose]: "noseId",
  [AvatarSlot.Top]: "topId",
  [AvatarSlot.Bottom]: "bottomId",
  [AvatarSlot.Shoes]: "shoesId",
};

type Props = {
  /** 进来时的底稿（上次捏的形象或默认值） */
  initial?: AvatarConfig;
  onConfirm: (config: AvatarConfig) => void;
  onBack: () => void;
};

export function CharacterCreator({ initial, onConfirm, onBack }: Props) {
  const [config, setConfig] = useState<AvatarConfig>(
    () => initial ?? defaultAvatarConfig(),
  );
  const [slot, setSlot] = useState<AvatarSlot>(AvatarSlot.Face);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<CreatorPreview | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preview = new CreatorPreview(canvas);
    previewRef.current = preview;

    const observer = new ResizeObserver(() => preview.resize());
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      preview.dispose();
      previewRef.current = null;
    };
    // 只随挂载建一次；外观变化走下面那个 effect
  }, []);

  useEffect(() => {
    previewRef.current?.setAvatar(config);
  }, [config]);

  const parts = useMemo(() => avatarPartsForSlot(slot), [slot]);

  /**
   * 当前槽位涉及的调色板：取这一槽所有零件颜色键的并集。
   * 按"当前选中零件"取的话，选到眯眯眼（无瞳色）时色板会整个消失，
   * 界面一跳一跳的；按槽取，色板稳定存在，改色对无色零件只是暂时无感。
   */
  const paletteKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const part of parts) for (const key of part.colorKeys) keys.add(key);
    return [...keys];
  }, [parts]);

  const field = SLOT_FIELD[slot];
  const selectedId = field ? (config[field] as string) : "";

  const pickPart = (partId: string): void => {
    if (!field) return;
    setConfig((previous) => ({ ...previous, [field]: partId }));
  };

  const pickColor = (key: string, color: string): void => {
    setConfig((previous) => ({
      ...previous,
      colors: { ...previous.colors, [key]: color },
    }));
  };

  return (
    <div className="absolute inset-0 flex bg-[#f0e6cc]">
      {/* ---- 左：预览台 ---- */}
      <div className="relative flex-[2] min-w-0">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
        />
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[12px] text-[#8a6a45]">
          {t("ui.creator.drag_hint")}
        </div>
        <button
          type="button"
          className="ui-wood-btn absolute left-4 top-4 px-4 py-2 text-[14px] font-bold"
          onClick={onBack}
        >
          ← {t("ui.creator.back")}
        </button>
      </div>

      {/* ---- 右：零件面板 ---- */}
      <div className="ui-pack m-3 flex w-[min(460px,52vw)] min-h-0 flex-col p-3">
        {/* 槽位标签页 */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SLOT_ORDER.map((entry) => (
            <button
              key={entry}
              type="button"
              className={[
                "ui-wood-btn px-3 py-1.5 text-[13px] font-bold",
                entry === slot ? "ui-wood-btn--active" : "",
              ].join(" ")}
              onClick={() => setSlot(entry)}
            >
              {t(`avatar.slot.${entry}`)}
            </button>
          ))}
        </div>

        {/* 零件格子 */}
        <div className="ui-parchment min-h-0 flex-1 overflow-y-auto p-2.5">
          <div className="grid grid-cols-3 gap-2">
            {parts.map((part) => (
              <button
                key={part.id}
                type="button"
                className={[
                  "ui-slot flex h-16 items-center justify-center px-2 text-center text-[13px] font-bold text-[#5c3a1d]",
                  part.id === selectedId ? "ui-slot--selected" : "",
                ].join(" ")}
                onClick={() => pickPart(part.id)}
              >
                {t(part.localizationKey)}
              </button>
            ))}
          </div>

          {/* 调色板 */}
          {paletteKeys.map((key) => {
            const palette = findAvatarPalette(key);
            if (!palette) return null;
            return (
              <div key={key} className="mt-3">
                <div className="mb-1.5 text-[12px] font-bold text-[#8a6a45]">
                  {t(palette.localizationKey)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {palette.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      className={[
                        "h-9 w-9 rounded-full border-2 transition-transform",
                        config.colors[key] === color
                          ? "scale-110 border-[#5c3a1d] shadow-[0_0_0_2px_rgb(224_169_74/0.7)]"
                          : "border-black/25",
                      ].join(" ")}
                      style={{ backgroundColor: color }}
                      onClick={() => pickColor(key, color)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* 确认 */}
        <button
          type="button"
          className="ui-wood-btn mt-3 py-2.5 text-[15px] font-bold tracking-widest"
          onClick={() => onConfirm(config)}
        >
          {t("ui.creator.confirm")}
        </button>
      </div>
    </div>
  );
}
