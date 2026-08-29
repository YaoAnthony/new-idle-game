import {
  materialIconUrl,
  materialNameKey,
  type MaterialNeed,
} from "../../Game/Systems/materials";
import { t } from "../../i18n/t";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";
import { GoldChip } from "./GoldChip";

/**
 * 买之前的确认框（石傀儡的工坊）。
 *
 * ---- 为什么要有这一步 ----
 *
 * 原来点一下卡片就直接扣钱了，没有回头路也没有回执。这块面板尤其伤：
 * **开一块地是不可撤销的**，而卡片"整块可按"，手机上一根拇指划过货架
 * 很容易蹭到。
 *
 * ---- 里面一句话都没有 ----
 *
 * 第一版在这儿写了「买到手的是图纸。拿上它走到想盖的地方按 F……」，
 * 被用户当场否掉——**游戏界面不是说明书**。参考图（public/ui-mockups）
 * 那整块背包界面里没有一句完整的话，全靠大图、图标、数字和进度条。
 *
 * 所以现在只有四样东西：**图、名字、价钱、两个按钮**。
 *   - "买到的是图纸不是墙"由货架底下那行常驻提示讲，讲一次；
 *   - "钱够不够"由价钱标红 + 按钮变灰讲，不用写字；
 *   - "我还剩多少"由右上角那枚币讲——手游商店的钱都在右上角，
 *     位置本身就是标签，不需要"你有"两个字。
 *
 * ---- 为什么单独进面板栈 ----
 *
 * ESC 该**先退掉确认框、货架留着**。只有面板栈知道谁在最上面
 * （见 PanelStack/EscArbiter），自己拿 state 管的话 ESC 会把整块面板
 * 一起关掉，而玩家只是想说"这件先不买"。
 */

export type PurchaseRequest = {
  /** 卡片上那张图。没有图的（还没配图的建筑）就不画图框 */
  icon?: string;
  nameKey: string;
  cost: MaterialNeed[];
  /** 确认按钮上那个动词。图纸是"买下"，开地是"叫他去敲" */
  actionKey: string;
  confirm: () => void;
};

export function PurchaseConfirm({
  request,
  have,
  onClose,
}: {
  request: PurchaseRequest | null;
  have: Map<string, number>;
  onClose: () => void;
}) {
  // 载荷即开关：request 有了就入栈，被 ESC 弹掉就回头把载荷清空
  useMirroredPanel("purchase", request !== null, onClose);

  if (!request) return null;

  /*
   * 够不够**只看传进来的 `have`**，不去问全局的 canAfford()。
   *
   * 两个来源的话，框里显示的余额和按钮的可用状态可能对不上——那是最难查的
   * 一类 bug：画面上写着你有 128、按钮却是灰的，而两边各自都"没错"。
   * 现在这个组件是纯的：给它什么数，它就按什么数判断。
   */
  const shortOf = (need: MaterialNeed) =>
    (have.get(need.itemId) ?? 0) < need.quantity;
  const affordable = !request.cost.some(shortOf);

  return (
    /*
     * z-50 压在货架（z-40）上面。整块半透明底自己也能点掉——
     * 和别的挡屏面板同一个手势，"点旁边 = 算了"。
     */
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/45 px-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ui-dialogue relative w-[min(360px,88vw)] rounded-[26px] px-6 pb-5 pt-5 text-center">
        {/* 余额。右上角是手游商店放钱的地方——位置就是标签 */}
        <div className="absolute right-4 top-4">
          <GoldChip amount={have.get("gold") ?? 0} size="chip" />
        </div>

        {request.icon && (
          <div className="ui-shop-card__art mx-auto mt-7 grid !max-w-[136px] place-items-center">
            <img
              src={request.icon}
              alt=""
              className="h-[88%] w-[88%] object-contain"
            />
          </div>
        )}

        <div
          className={[
            "text-[19px] font-bold text-[#4a3b2a]",
            request.icon ? "mt-3" : "mt-9",
          ].join(" ")}
        >
          {t(request.nameKey)}
        </div>

        {/* 价钱：这块框里最大的那个数。不够就整个标红，不写一个字解释 */}
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
          {request.cost.length === 0 ? (
            <span className="ui-shop-price ui-shop-price--ok text-[17px] font-bold">
              {t("ui.build_shop.free")}
            </span>
          ) : (
            request.cost.map((need) =>
              need.itemId === "gold" ? (
                <GoldChip
                  key={need.itemId}
                  amount={need.quantity}
                  size="price"
                  tone={shortOf(need) ? "short" : "neutral"}
                />
              ) : (
                // 木头、铁锭这些走通用的那条：图标 + 数，同一个长相
                <MaterialCost
                  key={need.itemId}
                  need={need}
                  owned={have.get(need.itemId) ?? 0}
                />
              ),
            )
          )}
        </div>

        <div className="mt-5 flex gap-2.5">
          {/*
            「再想想」走 `.ui-dialogue-choice`（奶油底 + 描边）而不是
            `.ui-wood-btn`。后者是**主按钮**的皮（桃红实底）——用在取消上，
            出图一看就反了：不够钱那一版里「再想想」是全框最亮的东西，
            而「买下」是灰的，读起来像在劝你别买。
            取消永远比确认安静一档。
          */}
          <button
            type="button"
            className="ui-dialogue-choice flex-1 py-2.5 text-[14px] font-bold"
            onClick={onClose}
          >
            {t("ui.build_shop.confirm.cancel")}
          </button>
          <button
            type="button"
            className="ui-green-btn flex-1 rounded-full py-2.5 text-[15px] font-bold"
            disabled={!affordable}
            onClick={request.confirm}
          >
            {t(request.actionKey)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 非金币的代价（木头、铁锭……）。和 GoldChip 同一个长相，换一张图 */
function MaterialCost({ need, owned }: { need: MaterialNeed; owned: number }) {
  const icon = materialIconUrl(need.itemId);
  const enough = owned >= need.quantity;
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-5 py-1.5 text-[30px] font-bold tabular-nums",
        enough
          ? "bg-[var(--cream-3)] text-[#7a5a1d]"
          : "bg-[#ffd2c6] text-[#a3392a]",
      ].join(" ")}
      title={t(materialNameKey(need.itemId))}
    >
      {icon ? (
        <img src={icon} alt="" className="h-[40px] w-[40px] object-contain" />
      ) : (
        <span className="text-[17px]">{t(materialNameKey(need.itemId))}</span>
      )}
      {need.quantity}
    </span>
  );
}
