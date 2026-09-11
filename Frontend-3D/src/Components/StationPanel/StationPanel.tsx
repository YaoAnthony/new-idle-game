import { FurnitureCapability } from "core";
import { BookOpen, Hammer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { on } from "../../Game/EventBus";
import { craft, listRecipes, type RecipeView } from "../../Game/Systems/crafting";
import { t } from "../../i18n/t";
import { GameBtn } from "../GameBtn/GameBtn";
import { ItemIcon } from "../Inventory/slots";
import { Modal } from "../Modal/Modal";
import { HammerSeal } from "../Modal/seals";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";

/**
 * 工作台面板（2026-09-09 重做）。
 *
 * 第一版是像素皮时代的"皮面笔记本"：木牌标题、按百分比钉在纸面上的两页、自己画的
 * 关闭钮。标题层、寄售箱、日记本都换成手账那套语言之后它成了孤例（用户：
 * "都不是一个设计风格了，也没有调用 modal"）。现在走通用 Modal（锤子印章、
 * 绿框、白纸、点阵底），版式照寄售箱的"左栏列表 / 右栏一块卡"：
 *
 * - 左：配方本。一行一条配方——成品图标 + 名字 + 材料图标（带需要的数量，缺的标红）。
 * - 右：工作台。顶上一条深一档的色带（图标 + 名字），中间成品大图 + 名字，
 *   下面材料清单（每行"有 x / 需 y"），底下一个「制作」主按钮。
 *
 * 字号一律 clamp 随视口缩，不按断点写死；标题类一律不换行。
 *
 * **灶台不走这里**。菜是真的在锅里做出来的（手持 → 投料 → 看火起锅），
 * 见 Game/Systems/kitchen。这个面板只剩工作台一种用法。
 */

type OpenStation = {
  instanceId: string;
  capability: "crafting";
};

const HAND_FONT = "[font-family:'Nunito','LXGW_WenKai_GB','Kaiti_SC',sans-serif]";

export function StationPanel() {
  const [station, setStation] = useState<OpenStation | null>(null);
  const [recipes, setRecipes] = useState<RecipeView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stationRef = useRef<OpenStation | null>(null);
  // 手机横屏（667×375 这类）：不按比例收，铺满可用空间
  const [phone, setPhone] = useState(
    () => window.matchMedia("(max-height: 500px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-height: 500px)");
    const sync = () => setPhone(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    stationRef.current = station;
  }, [station]);

  // 开着的是哪张桌子仍是本地状态，只把"开着"这件事同步给面板栈；
  // ESC 弹栈之后回头把 station 清掉，见 useMirroredPanel
  useMirroredPanel("station", station !== null, () => setStation(null));

  const refresh = (target: OpenStation | null) => {
    if (!target) return setRecipes([]);
    const list = listRecipes(FurnitureCapability.Crafting);
    setRecipes(list);
    setSelectedId((current) =>
      list.some((entry) => entry.recipe.id === current)
        ? current
        : (list[0]?.recipe.id ?? null),
    );
  };

  useEffect(() => {
    const offOpen = on("station_open_requested", (target) => {
      setStation(target);
      refresh(target);
    });
    // 读 ref 而不是借 setStation 的 updater 拿当前值——
    // updater 必须是纯函数，在里面调 refresh 等于渲染期 setState
    const offInventory = on("inventory_changed", () =>
      refresh(stationRef.current),
    );
    const offLeave = on("interact_target_changed", (target) => {
      const stillNear = target?.kind === "station" ? target.instanceId : null;
      setStation((current) =>
        current && stillNear !== current.instanceId ? null : current,
      );
    });

    // ESC 归 EscArbiter：它弹栈，useMirroredPanel 再把 station 清掉
    return () => {
      offOpen();
      offInventory();
      offLeave();
    };
  }, []);

  const selected = recipes.find((entry) => entry.recipe.id === selectedId);
  const lackOf = (view: RecipeView, itemId: string) =>
    view.missing.find((entry) => entry.itemId === itemId);

  return (
    <Modal
      open={station !== null}
      onClose={() => setStation(null)}
      seal={<HammerSeal />}
      edgeColor="#C8E6C9"
      frameColor="#81C784"
      paperColor="#FFFFFF"
      aspect={phone ? undefined : 1.7}
      fill={phone ? undefined : 0.92}
      label={t("ui.craft")}
    >
      {station && (
        <div
          className="absolute inset-0 flex flex-col p-3 sm:p-4"
          style={{ fontFamily: '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif' }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: "radial-gradient(#E0E0E0 2px, transparent 2px)",
              backgroundSize: "24px 24px",
            }}
          />

          {/* ---- 主体：左配方本 / 右工作台 ---- */}
          <div className="relative z-10 flex min-h-0 flex-1 items-stretch gap-2 sm:gap-3">
            {/* 左：配方本 */}
            <div className="flex min-h-0 min-w-0 flex-[3] flex-col rounded-[20px] border-2 border-[#EEEEEE] bg-white/70 p-2 sm:p-3">
              <div className="mb-1.5 flex shrink-0 items-center justify-center gap-2 self-center short:mb-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4DB6AC] shadow-[0_3px_0_#00897B] sm:h-9 sm:w-9 short:h-7 short:w-7">
                  <BookOpen className="h-4 w-4 text-white sm:h-5 sm:w-5 short:h-4 short:w-4" strokeWidth={2.5} />
                </div>
                <span className={`whitespace-nowrap text-[clamp(14px,1.5vw,20px)] font-black tracking-wide text-[#795548] ${HAND_FONT}`}>
                  {t("ui.craft.recipes")}
                </span>
              </div>

              <div className="ui-scroll min-h-0 flex-1 overflow-y-auto pr-1">
                {recipes.length === 0 ? (
                  <div className="grid h-full place-items-center px-4 text-center text-[clamp(12px,1.1vw,15px)] text-[#A1887F]">
                    {t("ui.craft.no_recipes")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 sm:gap-2">
                    {recipes.map((view) => {
                      const { recipe, craftable } = view;
                      const active = recipe.id === selectedId;
                      return (
                        <button
                          key={recipe.id}
                          type="button"
                          onClick={() => setSelectedId(recipe.id)}
                          className={[
                            "flex shrink-0 items-center gap-2 rounded-2xl border-2 px-2.5 py-1.5 text-left transition-colors sm:gap-3 sm:px-3 sm:py-2",
                            active
                              ? "border-[#81C784] bg-[#E8F5E9] shadow-[0_0_0_3px_rgba(129,199,132,0.3)]"
                              : "border-[#EEEEEE] bg-white hover:border-[#C8E6C9] hover:bg-[#F1F8E9]",
                            craftable ? "" : "opacity-70",
                          ].join(" ")}
                        >
                          <span className="ui-slot grid h-12 w-12 shrink-0 place-items-center rounded-xl sm:h-14 sm:w-14 short:h-10 short:w-10">
                            <ItemIcon itemId={recipe.outputs[0]?.itemId ?? ""} size={40} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className={`truncate text-[clamp(13px,1.25vw,17px)] font-black text-[#5D4037] ${HAND_FONT}`}>
                              {t(recipe.localizationKey)}
                            </span>
                            <span className="flex flex-wrap items-center gap-1">
                              {recipe.ingredients.map((ingredient) => {
                                const lack = lackOf(view, ingredient.itemId);
                                return (
                                  <span
                                    key={ingredient.itemId}
                                    className={[
                                      "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[clamp(11px,1vw,13px)] font-black tabular-nums",
                                      lack ? "bg-[#FFEBEE] text-[#C62828]" : "bg-[#F5F5F5] text-[#6D4C41]",
                                    ].join(" ")}
                                  >
                                    <ItemIcon itemId={ingredient.itemId} size={18} />
                                    ×{ingredient.quantity}
                                  </span>
                                );
                              })}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 右：工作台卡 */}
            <div className="flex min-h-0 min-w-0 flex-[2] flex-col overflow-hidden rounded-[20px] border-2 border-[#C8E6C9] bg-[#F1F8E9]/80 p-2 sm:p-3">
              <div className="-mx-2 -mt-2 mb-2 flex shrink-0 items-center justify-center gap-2 rounded-t-[18px] bg-gradient-to-b from-[#C8E6C9] to-[#A5D6A7] px-3 py-2 sm:-mx-3 sm:-mt-3 lg:py-3 short:mb-1.5 short:py-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#66BB6A] shadow-[0_3px_0_#388E3C] sm:h-9 sm:w-9 lg:h-11 lg:w-11 short:h-7 short:w-7">
                  <Hammer className="h-5 w-5 text-white lg:h-6 lg:w-6 short:h-4 short:w-4" strokeWidth={2.5} aria-hidden />
                </div>
                <span className={`whitespace-nowrap text-[clamp(14px,1.5vw,20px)] font-black tracking-wide text-[#33691E] ${HAND_FONT}`}>
                  {t("ui.craft.station")}
                </span>
              </div>

              {selected ? (
                <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto sm:gap-3">
                  <div className="ui-slot grid h-[clamp(72px,11vw,128px)] w-[clamp(72px,11vw,128px)] shrink-0 place-items-center rounded-2xl">
                    <ItemIcon itemId={selected.recipe.outputs[0]?.itemId ?? ""} size={96} fluid />
                  </div>
                  <div className={`text-center text-[clamp(15px,1.6vw,22px)] font-black text-[#3E2723] ${HAND_FONT}`}>
                    {t(selected.recipe.localizationKey)}
                  </div>

                  {/* 材料清单：一行一种，右侧"有 / 需"两个数，缺的整行标红 */}
                  <div className="flex w-full flex-col gap-1 rounded-2xl border-2 border-dashed border-[#C8E6C9] bg-white/70 px-2.5 py-2 sm:px-3">
                    {selected.recipe.ingredients.map((ingredient) => {
                      const lack = lackOf(selected, ingredient.itemId);
                      const have = lack ? lack.have : ingredient.quantity;
                      return (
                        <div
                          key={ingredient.itemId}
                          className={[
                            "flex items-center gap-2 text-[clamp(12px,1.15vw,16px)] font-black",
                            lack ? "text-[#C62828]" : "text-[#5D4037]",
                          ].join(" ")}
                        >
                          <ItemIcon itemId={ingredient.itemId} size={28} />
                          <span className="min-w-0 flex-1 truncate">
                            {t(`item.${ingredient.itemId}`)}
                          </span>
                          <span className="shrink-0 whitespace-nowrap tabular-nums">
                            {t("ui.craft.have")} {have} / {t("ui.craft.need")} {ingredient.quantity}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-auto w-full shrink-0 pt-1">
                    <GameBtn
                      size="lg"
                      tone={selected.craftable ? "mint" : "cream"}
                      fullWidth
                      disabled={!selected.craftable}
                      onClick={() => craft(selected.recipe.id)}
                    >
                      {t("ui.craft")}
                    </GameBtn>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 place-items-center px-4 text-center text-[clamp(12px,1.1vw,15px)] text-[#A1887F]">
                  {t("ui.craft.pick")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
