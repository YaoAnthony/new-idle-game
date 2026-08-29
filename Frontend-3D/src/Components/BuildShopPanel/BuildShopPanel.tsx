import { useEffect, useState } from "react";

import { on } from "../../Game/EventBus";
import { pushSystemMessage } from "../../Game/State/chatLog";
import { addItem } from "../../Game/State/inventory";
import {
  allPlots,
  buyPlot,
  plotCost,
  unlockablePlotIds,
} from "../../Game/State/territory";
import {
  canAfford,
  materialCounts,
  materialIconUrl,
  materialNameKey,
  spendMaterials,
  type MaterialNeed,
} from "../../Game/Systems/materials";
import {
  buildingDefinitions,
  buildingIcon,
  findBuildingLevel,
} from "../../Buildings/index";
import { itemDefinitions } from "core";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";
import { GoldChip } from "./GoldChip";
import { PurchaseConfirm, type PurchaseRequest } from "./PurchaseConfirm";

/**
 * 石傀儡的铺子：对着醒着的他按 F 打开。**没有对话这一步**
 * （用户定："不用说话，点开就是面板"）。
 *
 * ## 一张卡一件东西，左边竖着分类
 *
 * 改版前是一列长条，建筑和地块混在一串里往下滚，用户的评价是"太丑"。
 * 现在照他给的参考（部落冲突的商店）重排：**左侧分类栏 + 右侧卡片网格**，
 * 一张卡就是一件能买的东西——图、名字、价钱，整块能按。
 *
 * 借的是**版式**不是画风（用户明确说的："不用参考木头棕，我只是让你参考
 * UIUX 的架构"）。配色仍是全局那套奶油马卡龙；套一层部落冲突的木纹会和
 * 背包、每日板、行动面板全部打架。
 *
 * **分类栏竖着放而不是横着**：横屏（基准 iPhone SE 667×375）里稀缺的是
 * **纵向**空间，一条横标签要吃掉一整行的高度；竖栏吃的是横向，而横向是
 * 宽的那一边。参考图里也是竖的。
 *
 * ## 能盖什么 = 有没有图纸物品
 *
 * 不另写一张"商店卖什么"的表：**注册表里存在 `blueprint.buildingId`
 * 指向它的物品**，它就上架。加一种可盖的建筑 = 加一件图纸物品，
 * 这块面板一行不用改；反过来也不会出现"面板上有但买了没用"的条目。
 *
 * ## 扩地也在这块面板里
 *
 * "开一块新地"是这里的第二个分类，没有另开面板、也没有另找 NPC：
 * **石傀儡是这块地上唯一会动土的**，盖房子和推界桩本来就是同一双手。
 * 拆成两个入口的话，玩家得记住"盖东西找石头、扩地找别处"，
 * 而那条分界在故事里不存在。
 */

/** 面板上一件能买的东西。建筑和地块都摊成它，于是共用一套卡片 */
type Card = {
  key: string;
  nameKey: string;
  descKey?: string;
  icon?: string;
  cost: MaterialNeed[];
  /**
   * 确认框上那个动词。**不再印在卡片上**（用户 2026-08-25："要图纸也没有
   * 必要"）——一屏六张卡就把同一句话印六遍，而它真正该出现的时机是玩家
   * 正要掏钱那一下。挪进确认框之后，它旁边还能跟一句 `noteKey` 把话说全。
   */
  actionKey: string;
  /** 买完那条绿条的后半句。图纸是"放进背包了"，开地是"开好了" */
  receiptKey: string;
  onAction: () => void;
};

type Category = {
  id: string;
  labelKey: string;
  emptyKey: string;
  hintKey: string;
  cards: Card[];
};

export function BuildShopPanel() {
  const [open, setOpen] = usePanel("buildShop");
  const [tab, setTab] = useState("build");
  // 手上有多少材料。开着的时候要跟着背包/金币变，不然扣完还显示旧数
  const [have, setHave] = useState<Map<string, number>>(new Map());
  /*
   * 世界变了要重算的那部分（买完地之后邻居名单会变）。存一个计数当刷新
   * 信号，而不是把卡片列表存进 state：列表是从注册表和领地现状**推**出来
   * 的，存一份就有了第二个真相，第一次忘记同步就是"买过的地还留在架上"。
   */
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((n) => n + 1);
  /** 正在问"真要买吗"的那一笔。null = 没在问 */
  const [pending, setPending] = useState<PurchaseRequest | null>(null);
  /**
   * 刚买完那条回执（存的是名字的 key）。
   *
   * 要有这一条是因为**买完之后画面上什么都没变**：图纸进了背包，而背包
   * 这会儿是关着的；扣掉的金币在面板外面。玩家点完确认只看到框消失了，
   * 分不清是买成了还是点空了。
   */
  const [receipt, setReceipt] = useState<{
    nameKey: string;
    receiptKey: string;
  } | null>(null);

  useEffect(() => {
    const refresh = () => setHave(materialCounts());
    const offOpen = on("build_shop_open_requested", () => {
      refresh();
      bump();
      setOpen(true);
    });
    const offInventory = on("inventory_changed", refresh);
    const offGold = on("gold_changed", refresh);
    /*
     * 开完一块地要重算：刚买下的那块从"能开"变成"已有"，而它的邻居们
     * 这时候才第一次变得可开。不重算的话架上还留着一张已经买过的地，
     * 再点一次会拿到 owned。
     */
    const offWorld = on("world_changed", () => {
      refresh();
      bump();
    });
    return () => {
      offOpen();
      offInventory();
      offGold();
      offWorld();
    };
  }, [setOpen]);

  /*
   * 回执飘 3 秒。清理写在 effect 里而不是 setTimeout 里直接 setState：
   * 面板中途被关掉时定时器要跟着取消，否则回调会对着已卸载的组件写 state。
   */
  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => setReceipt(null), 3000);
    return () => clearTimeout(timer);
  }, [receipt]);

  // 面板关掉时把没答完的那个问句一起收走，免得下次开面板它还挂在那儿
  useEffect(() => {
    if (!open) setPending(null);
  }, [open]);

  if (!open) return null;

  const buyBlueprint = (blueprintItemId: string, cost: MaterialNeed[]) => {
    if (!spendMaterials(cost)) return;
    addItem(blueprintItemId, 1);
    setHave(materialCounts());
  };

  /*
   * 开地和拿图纸不一样：**当场就生效**，没有"拿着图纸去选址"那一步。
   * 一块地的位置是它自己定死的（`PlotDefinition.rect`），没什么可选的。
   */
  const unlock = (plotId: string, nameKey: string) => {
    if (!buyPlot(plotId).ok) return;
    pushSystemMessage(`${t(nameKey)}${t("ui.build_shop.territory.done")}`);
    // world_changed 那条订阅会把清单和余额一起刷了
  };

  /**
   * 点卡片**不再直接买**，只是把这一笔摆出来问一句。
   *
   * 真正掏钱的是 `card.onAction`，它被包在这里的 confirm 里——
   * 于是"扣钱"这件事全项目只有一条路径经过确认框，加新分类也绕不过去。
   */
  const ask = (card: Card) => {
    setPending({
      icon: card.icon,
      nameKey: card.nameKey,
      cost: card.cost,
      actionKey: card.actionKey,
      confirm: () => {
        card.onAction();
        setPending(null);
        setReceipt({ nameKey: card.nameKey, receiptKey: card.receiptKey });
      },
    });
  };

  // 读一下 revision：它存在的意义就是让下面这两个列表跟着世界变化重算
  void revision;

  const categories: Category[] = [
    {
      id: "build",
      labelKey: "ui.build_shop.tab.build",
      emptyKey: "ui.build_shop.empty",
      hintKey: "ui.build_shop.hint",
      cards: buildCards(buyBlueprint),
    },
    {
      id: "terrain",
      labelKey: "ui.build_shop.tab.terrain",
      emptyKey: "ui.build_shop.territory.none",
      hintKey: "ui.build_shop.territory.hint",
      cards: terrainCards(unlock),
    },
  ];
  const active = categories.find((item) => item.id === tab) ?? categories[0];

  return (
    <div
      className="absolute inset-0 z-40 grid min-h-0 place-items-center bg-black/45 px-6 py-7"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="ui-action-panel relative flex max-h-full min-h-0 flex-col px-6 pb-5 pt-9"
        style={{ width: "min(1040px,94vw)" }}
      >
        <div className="ui-plaque absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 px-9 py-2">
          <span className="text-[20px] font-bold tracking-[0.25em] text-[#7a5a1d]">
            {t("ui.build_shop")}
          </span>
        </div>
        {/*
          关闭按钮**骑在面板右上角上**，不是蹲在面板里面。

          原来是 `right-5 top-5`——面板的上内边距只有 36px，而按钮占
          20..56px，正好压在货架那圈框线上（出图一看就是个错位的疙瘩）。
          往里挪要给整块面板加一截上内边距，左栏跟着空一块；往外骑既解决
          碰撞，又和上面那块牌匾是同一个手法：**挂件都挂在面板边上**。

          骑出去用的是**负偏移（-18px = 半个按钮）不是 translate**。
          第一版写的是 `-translate-y-1/2 translate-x-1/2`，而
          `.ui-wood-btn:hover` 自己有一条 `transform: translateY(-1px)`
          ——同一个属性，后者把定位那份整个顶掉：鼠标一放上去按钮当场
          弹回角里，移开又飘回来。**定位归 inset，transform 留给动效**，
          两者一旦共用一个属性就永远是这个下场。
        */}
        <button
          type="button"
          className="ui-wood-btn absolute -right-[18px] -top-[18px] grid h-9 w-9 place-items-center text-[16px]"
          aria-label={t("ui.close")}
          onClick={() => setOpen(false)}
        >
          ✕
        </button>

        <div className="mt-1 flex min-h-0 gap-3">
          {/* ---- 左：分类栏 ---- */}
          <nav className="flex w-[86px] shrink-0 flex-col gap-1.5 pt-0.5 sm:w-[104px]">
            {/*
              余额排在分类**上面**，是左栏的第一项。

              **不能用绝对定位挂在面板角上**——上一版写的是
              `absolute left-5 top-4`，而左栏正好从那个位置开始，
              胶囊直接压在「建筑」那一格上（出图才看出来）。
              面板顶上那一条已经被牌匾和关闭按钮占满了，没有第三个位置
              可以塞东西；排进列里就永远不会撞，屏幕多窄都一样。

              放左栏也讲得通：钱和分类都是"你在哪儿、你有什么"这类
              导航信息，货架才是货。
            */}
            <div className="mb-1 flex justify-center">
              <GoldChip amount={have.get("gold") ?? 0} size="chip" />
            </div>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setTab(category.id)}
                className={[
                  "ui-tab px-2 py-2 text-[12px] font-bold sm:text-[13px]",
                  category.id === active.id ? "ui-tab--active" : "",
                ].join(" ")}
              >
                {t(category.labelKey)}
              </button>
            ))}
          </nav>

          {/* ---- 右：卡片货架 ---- */}
          <div className="ui-shop-shelf ui-scroll min-h-[196px] flex-1 overflow-y-auto p-3">
            {active.cards.length === 0 ? (
              <div className="grid h-full min-h-[172px] place-items-center px-6 text-center text-[13px] leading-relaxed text-[var(--ink-soft)]">
                {t(active.emptyKey)}
              </div>
            ) : (
              // 列数不写死：列宽和图框都从 --shop-art 推，见 index.css
              <div className="ui-shop-grid">
                {active.cards.map((card) => (
                  <ShopCard
                    key={card.key}
                    card={card}
                    have={have}
                    onPick={() => ask(card)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/*
          回执**顶掉**常驻提示那一行，不另占一行：底下多一条的话，面板高度
          会在买东西的那 3 秒里跳一下，货架跟着往上缩。同一个位置换内容，
          买完那下画面是稳的。
        */}
        <div className="mt-2.5 grid min-h-[18px] place-items-center text-center text-[11px] leading-snug">
          {receipt ? (
            <span className="ui-shop-receipt px-3 py-1 font-bold">
              ✓ {t(receipt.nameKey)} · {t(receipt.receiptKey)}
            </span>
          ) : (
            <span className="text-[var(--ink-soft)]">{t(active.hintKey)}</span>
          )}
        </div>
      </div>

      <PurchaseConfirm
        request={pending}
        have={have}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

/**
 * 一张卡：名字在上，图在中间，价钱在下，**整块可按**。
 *
 * 整块可按而不是角上挂一个小按钮：横屏基准是 iPhone SE，一根手指去够
 * 44px 的按钮本来就勉强；而卡片本身就是那件东西，按它是最自然的动作。
 */
function ShopCard({
  card,
  have,
  onPick,
}: {
  card: Card;
  have: Map<string, number>;
  onPick: () => void;
}) {
  const affordable = canAfford(card.cost);
  const costs = card.cost.filter((need) => need.quantity > 0);
  return (
    <button
      type="button"
      disabled={!affordable}
      // 按下去只是"我看上这个了"，掏钱在确认框里
      onClick={onPick}
      title={card.descKey ? t(card.descKey) : undefined}
      className={[
        "ui-shop-card flex flex-col items-center gap-1 px-2 pb-2 pt-2",
        affordable ? "" : "ui-shop-card--broke",
      ].join(" ")}
    >
      <span
        className="w-full truncate text-center font-bold text-[var(--ink)]"
        style={{ fontSize: "clamp(12px, 1.7vmin, 16px)" }}
      >
        {t(card.nameKey)}
      </span>

      {/* 尺寸在 CSS 里（--shop-art），跟视口走：小屏收住，大屏放开 */}
      <span className="ui-shop-card__art grid place-items-center">
        {card.icon ? (
          <img src={card.icon} alt="" className="h-[88%] w-[88%] object-contain" />
        ) : (
          // 没配图的先画名字，不留一个空洞——图是慢慢补的，功能不等图
          <span className="px-1.5 text-center text-[11px] leading-tight text-[var(--ink-soft)]">
            {t(card.nameKey)}
          </span>
        )}
      </span>

      {/*
        价钱逐项列出：够的绿、不够的红。数组就是数组，不合并成一句话。

        **数量为 0 的项直接不算数**：金库现在的造价是 `[{gold: 0}]`
        （期 2 的占位），照直画就是一枚金币配一个 0，读起来像"卖零块钱"，
        而它的意思是"不要材料"。
      */}
      <span className="flex flex-wrap items-center justify-center gap-1">
        {costs.length === 0 && (
          <span className="ui-shop-price ui-shop-price--ok text-[15px] font-bold">
            {t("ui.build_shop.free")}
          </span>
        )}
        {costs.map((need) => (
          <PricePill
            key={need.itemId}
            need={need}
            owned={have.get(need.itemId) ?? 0}
          />
        ))}
      </span>
    </button>
  );
}

/**
 * 一项代价：图标 + 数量。**图标优先于名字**——价钱是要一眼扫过去的，
 * 三个字的材料名在 120px 宽的卡片上会换行，把卡片撑成参差不齐的高度。
 * 没有图的材料才退回文字。
 */
function PricePill({ need, owned }: { need: MaterialNeed; owned: number }) {
  const enough = owned >= need.quantity;
  const icon = materialIconUrl(need.itemId);
  return (
    /*
     * **价钱是这张卡上第二重要的信息**（第一是那张图），字号原来 11px、
     * 图标 13px，比卡片上任何别的东西都小——用户点名说"不如把金币数字和
     * 金币 icon 弄大一点"。现在 15px / 20px：它和名字一个量级，
     * 扫货架时一眼落得上去。
     *
     * 卡片下面那行动词删掉之后腾出来的高度，正好给它。
     */
    <span
      className={[
        "ui-shop-price inline-flex items-center gap-1 text-[15px] font-bold",
        enough ? "ui-shop-price--ok" : "ui-shop-price--short",
      ].join(" ")}
      // 图标看不出是什么的时候，指上去还有名字和"手上有多少"
      title={`${t(materialNameKey(need.itemId))} ${need.quantity}（${owned}）`}
    >
      {icon ? (
        <img src={icon} alt="" className="h-[20px] w-[20px] object-contain" />
      ) : (
        <span>{t(materialNameKey(need.itemId))}</span>
      )}
      {need.quantity}
    </span>
  );
}

/** 上架清单：从图纸物品反查建筑，不另立一张表 */
function buildCards(
  buy: (blueprintItemId: string, cost: MaterialNeed[]) => void,
): Card[] {
  const cards: Card[] = [];
  for (const item of itemDefinitions) {
    const buildingId = item.blueprint?.buildingId;
    if (!buildingId) continue;

    const definition = buildingDefinitions.find((b) => b.buildingId === buildingId);
    if (!definition) continue;

    /*
     * **架上永远是初始等级**（用户 2026-08-23 定："石傀儡里面能建的都是
     * LV1 的，lv2 啥的就是升级界面里面能看到的"）。
     *
     * 所以造价和图都取 `levels[0]`：造价本来就挂在初始等级上——"从无到有"
     * 就是盖出第一级；图跟着同一个等级走，卡片上那张脸和你按下去会立起来
     * 的东西才对得上。二级以上的图归升级界面，不在这块面板的职责里。
     */
    const first = definition.levels[0];
    const level = findBuildingLevel(buildingId, first.levelId);
    const cost = [...(level?.buildCost ?? [])];
    cards.push({
      key: buildingId,
      nameKey: definition.localizationKey,
      descKey: definition.descriptionKey,
      icon: buildingIcon(buildingId, first.levelId),
      cost,
      actionKey: "ui.build_shop.buy",
      receiptKey: "ui.build_shop.bought",
      onAction: () => buy(item.id, cost),
    });
  }
  return cards;
}

/** 能开的地块。不相邻的不列——列了也点不动，那是给玩家看一堵墙 */
function terrainCards(unlock: (plotId: string, nameKey: string) => void): Card[] {
  const byId = new Map(allPlots().map((plot) => [plot.plotId, plot]));
  return unlockablePlotIds().map((plotId) => {
    const nameKey = byId.get(plotId)?.localizationKey ?? plotId;
    return {
      key: plotId,
      nameKey,
      // 图由地块表说了算（`PlotDefinition.icon`），这块面板不认识任何文件名
      icon: byId.get(plotId)?.icon,
      cost: [...plotCost()],
      actionKey: "ui.build_shop.territory.buy",
      receiptKey: "ui.build_shop.territory.opened",
      onAction: () => unlock(plotId, nameKey),
    };
  });
}
