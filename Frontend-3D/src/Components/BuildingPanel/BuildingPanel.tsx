import { useEffect, useRef, useState } from "react";
import { jarCapacity } from "core";
import { Home, X } from "lucide-react";

import { emit, on } from "../../Game/EventBus";
import {
  findPlacement,
  removeBuilding,
  upgradeBuilding,
  upgradeOptions,
} from "../../Game/State/buildings";
import { goldInJar } from "../../Game/State/buildingCommands";
import {
  buildingIcon,
  findBuilding,
  findBuildingLevel,
} from "../../Buildings/index";
import {
  canAfford,
  materialCounts,
  materialNameKey,
} from "../../Game/Systems/materials";
import { t } from "../../i18n/t";
import { Modal } from "../Modal/Modal";
import { HammerSeal } from "../Modal/seals";
import { useMirroredPanel } from "../PanelStack/useMirroredPanel";

/**
 * 建好的建筑的管理面板：**概览 / 升级 / 迁移 / 拆除**。
 * 对着自己盖的东西按 F 打开。
 *
 * 四个动作的实现全是现成的（`moveBuilding` / `removeBuilding` /
 * `upgradeBuilding` / 注册表），这块面板只负责**把它们摆出来**，
 * 以及把"为什么不行"说清楚——拒绝要说得出理由，是这套建筑系统一开始
 * 就立下的规矩（见 `whyBuild`）。
 *
 * 迁移和升级都要**选位置**，所以它们不在这里执行：发一个意图给场景，
 * 由 `BuildingPlacementController` 的两步确认接管。面板不碰世界。
 *
 * ---- 版式（2026-08-29，用户手绘的线框）----
 *
 * 上：标题行 + 名字·等级胶囊行；
 * 中：**左边一大块建模图，右边 名称/介绍/员工 三栏**；
 * 下：「升级方案」——每个后继一张卡，带下一级的建模图缩略；
 * 底：迁移 / 拆除。
 *
 * 建模图直接吃 `buildingIcon(buildingId, levelId)` 那条现成链路
 * （背包里图纸的图标就是从它借的，含"没画的等级退回上一级"的容错）。
 * 现在只有金库和木栅栏有图，其他楼显示"施工图还没画好"的占位——
 * 美术补一张 `icon` 进注册表这里就自动亮，面板一个字不用改。
 *
 * **员工一栏今天是空的。** 数据里还没有"建筑雇员"这个概念（工地上的
 * 石傀儡是全局工人，不挂在某栋楼名下）。栏位按线框留好、写"还没有员工"，
 * 等雇员系统落地把真数据接进来——先画格子后接线，比到时候再挪版式便宜。
 *
 * ---- 外观：跟日记本同一套设计语言 ----
 *
 * 外壳是 `Modal`（点外面/ESC 都能关），三层配色就是那本日记的封面：
 * 浅绿描边 / 封面绿 / 白纸页。内容部件（圆点纸纹、圆徽章标题、白卡片、
 * 灰胶囊、实心按钮按下沉 4px、#FFEBEE 报错）每个数值都从
 * `BookPlanner.tsx`（用户钦定的设计稿）逐字取——语言的权威在那份稿子里。
 */

type UpgradeOption = {
  levelId: string;
  nameKey: string;
  /** 下一级的建模图。没画的等级由 buildingIcon 退回上一级的图 */
  icon?: string;
  cost: Array<{ itemId: string; quantity: number }>;
};

type Detail = {
  instanceId: string;
  nameKey: string;
  levelKey: string;
  /** 这一级的介绍（等级没写就用整栋楼的）。注册表里都是必填/常配的键 */
  descriptionKey?: string;
  /** 当前等级的建模图 */
  icon?: string;
  /** 罐类才有：存了多少 / 能装多少 */
  gold?: { stored: number; capacity: number };
  /** 在建中（工地）：这时候不给再下单，也不给拆 */
  building: boolean;
  /** 家具小店才有：一颗进上架面板的按钮 */
  hasShelf: boolean;
  next: UpgradeOption[];
};

function readDetail(instanceId: string): Detail | null {
  const placement = findPlacement(instanceId);
  if (!placement) return null;
  const definition = findBuilding(placement.buildingId);
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  if (!definition || !level) return null;

  const next = upgradeOptions(instanceId).map((levelId) => ({
    levelId,
    nameKey:
      findBuildingLevel(placement.buildingId, levelId)?.localizationKey ?? levelId,
    icon: buildingIcon(placement.buildingId, levelId),
    cost: [...(level.upgradeCost?.[levelId] ?? [])],
  }));

  return {
    instanceId,
    nameKey: definition.localizationKey,
    levelKey: level.localizationKey,
    descriptionKey: level.descriptionKey ?? definition.descriptionKey,
    icon: buildingIcon(placement.buildingId, placement.levelId),
    gold:
      placement.buildingId === "gold_jar"
        ? { stored: goldInJar(instanceId), capacity: jarCapacity(level.levelId) }
        : undefined,
    building: Boolean(placement.construction),
    // 建好了才有货架：工地上摆货没有意义，也会让"结算到哪天"提前起算
    hasShelf:
      placement.buildingId === "furniture_shop" && !placement.construction,
    next,
  };
}

/** 建模图的框：有图放图，没图放"施工图还没画好"的占位 */
function ModelArt({
  icon,
  alt,
  className,
}: {
  icon?: string;
  alt: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!icon || broken) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-[#E0E0E0] bg-[#FAFAFA] ${className ?? ""}`}
      >
        <Home className="h-8 w-8 text-[#D7CCC8]" strokeWidth={2.5} />
        <span className="text-[12px] font-bold text-[#BCAAA4]">
          {t("build.panel.no_art")}
        </span>
      </div>
    );
  }
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-[16px] bg-[#FAFAFA] ${className ?? ""}`}
    >
      <img
        src={icon}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full select-none object-contain p-2"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

/** 右栏的一条字段：灰胶囊小标签 + 内容 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="inline-block rounded-full bg-[#F5F5F5] px-3 py-1 text-[12px] font-bold text-[#8D6E63] shadow-[inset_0_-2px_0_#E0E0E0]">
        {label}
      </span>
      <div className="mt-1.5 pl-1 text-[14px] font-bold leading-relaxed text-[#5D4037]">
        {children}
      </div>
    </div>
  );
}

export function BuildingPanel() {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useMirroredPanel("building", detail !== null, () => setDetail(null));

  useEffect(() => {
    const reread = () =>
      setDetail((current) => (current ? readDetail(current.instanceId) : null));

    const offOpen = on("building_panel_open_requested", ({ instanceId }) => {
      setError(null);
      setDetail(readDetail(instanceId));
    });
    // 世界变了（下了单、拆了、存了钱）就重读，别显示旧数
    const offWorld = on("world_changed", reread);
    const offGold = on("gold_changed", reread);
    return () => {
      offOpen();
      offWorld();
      offGold();
    };
  }, []);

  /*
   * 关闭动画期间内容要还在：`Modal` 播完 exit 才卸壳，而 `detail` 一关
   * 就变 null——不留一份的话，壳还在缩小、里面的字先消失了一帧。
   */
  const lastShown = useRef<Detail | null>(null);
  if (detail) lastShown.current = detail;
  const shown = detail ?? lastShown.current;

  const close = () => setDetail(null);

  const doMove = () => {
    if (!detail) return;
    emit("building_siting_requested", {
      mode: "move",
      instanceId: detail.instanceId,
    });
    close();
  };

  const doRemove = () => {
    if (!detail) return;
    const result = removeBuilding(detail.instanceId, {
      gold: detail.gold?.stored ?? 0,
    });
    if (result.ok === false) {
      // 非空不给拆，而且说得出剩多少——这条规则早就写好了
      setError(
        result.reason === "not_empty"
          ? t("build.remove.not_empty")
          : t("build.remove.failed"),
      );
      return;
    }
    close();
  };

  const doUpgrade = (levelId: string) => {
    if (!detail) return;
    const result = upgradeBuilding(detail.instanceId, levelId);
    if (result.ok === false) {
      setError(
        result.reason === "missing_materials"
          ? t("build.upgrade.missing")
          : result.reason === "not_empty"
            ? t("build.upgrade.not_empty")
            : t("build.upgrade.failed"),
      );
      return;
    }
    // 下单成功 = 变成一块工地，等石傀儡走过来。面板关掉让玩家看得见围栏
    close();
  };

  const have = materialCounts();

  return (
    <Modal
      open={detail !== null}
      onClose={close}
      seal={<HammerSeal />}
      edgeColor="#A5D6A7"
      frameColor="#81C784"
      paperColor="#FFFFFF"
      aspect={1.45}
      label={shown ? t(shown.levelKey) : "建筑"}
    >
      {shown && (
        <div
          className="absolute inset-0 flex flex-col"
          style={{
            /* 字体只套在这棵子树上，跟日记本同一份栈 */
            fontFamily: '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif',
          }}
        >
          {/* 书页的纸纹：同一张 24px 圆点网格 */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: "radial-gradient(#E0E0E0 2px, transparent 2px)",
              backgroundSize: "24px 24px",
            }}
          />

          {/* ---- 标题行：圆徽章 + 黑体棕字 + 右上关闭 ---- */}
          <div className="relative z-10 flex items-center gap-3 px-6 pt-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFE082] shadow-[0_4px_0_#FFCA28]">
              <Home className="h-5 w-5 text-[#5D4037]" strokeWidth={3} />
            </div>
            <h1 className="flex-1 truncate text-[22px] font-black tracking-wide text-[#795548]">
              {t(shown.levelKey)}
            </h1>
            <button
              type="button"
              aria-label="关闭"
              onClick={close}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F5F5F5] text-[#BCAAA4] shadow-[0_4px_0_#E0E0E0] transition-colors hover:bg-[#EF5350] hover:text-white hover:shadow-[0_4px_0_#C62828] active:translate-y-[4px] active:shadow-none"
            >
              <X className="h-5 w-5" strokeWidth={3} />
            </button>
          </div>
          <div className="mx-6 mt-3 border-b-[4px] border-dashed border-[#FFE082]/60" />

          <div className="relative z-10 flex-1 overflow-y-auto px-6 py-4">
            {/* ---- 状态胶囊行：名字·等级 + 存量/施工中/顶级 ---- */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#F5F5F5] px-3 py-1 text-[14px] font-bold text-[#8D6E63] shadow-[inset_0_-2px_0_#E0E0E0]">
                {t(shown.nameKey)} · {t(shown.levelKey)}
              </span>
              {shown.gold && (
                <span className="rounded-full border-2 border-[#FFE082] bg-[#FFF8E1] px-3 py-1 text-[14px] font-black text-[#F57F17]">
                  {t("build.panel.stored")} {shown.gold.stored} /{" "}
                  {shown.gold.capacity}
                </span>
              )}
              {shown.building && (
                <span className="rounded-full bg-[#FF8A65] px-3 py-1 text-[13px] font-black text-white shadow-[0_3px_0_#F4511E]">
                  {t("build.panel.working")}
                </span>
              )}
              {!shown.building && shown.next.length === 0 && (
                <span className="text-[13px] font-bold text-[#9E9E9E]">
                  {t("build.panel.max")}
                </span>
              )}
            </div>

            {/* ---- 主区：左建模图，右 名称/介绍/员工 ---- */}
            <div className="mt-3 flex gap-4">
              <ModelArt
                icon={shown.icon}
                alt={t(shown.levelKey)}
                className="min-h-[180px] w-[52%] shrink-0 self-stretch border-2 border-[#EEEEEE] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
              />
              <div className="min-w-0 flex-1 space-y-4 py-1">
                <Field label={t("build.panel.name")}>{t(shown.levelKey)}</Field>
                <Field label={t("build.panel.about")}>
                  {shown.descriptionKey ? (
                    t(shown.descriptionKey)
                  ) : (
                    <span className="text-[#BCAAA4]">—</span>
                  )}
                </Field>
                {/* 数据里还没有"建筑雇员"，先按线框把栏位留好（见文件头） */}
                <Field label={t("build.panel.staff")}>
                  <span className="text-[#BCAAA4]">
                    {t("build.panel.staff_none")}
                  </span>
                </Field>
                {shown.hasShelf && (
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-full bg-[#FF8A65] px-4 py-2 text-[14px] font-black tracking-wide text-white shadow-[0_4px_0_#F4511E] transition-all hover:bg-[#FF7043] active:translate-y-[4px] active:shadow-none"
                    onClick={() => {
                      emit("shelf_open_requested", {
                        instanceId: shown.instanceId,
                      });
                      close();
                    }}
                  >
                    {t("build.panel.shelf")}
                  </button>
                )}
              </div>
            </div>

            {/* ---- 升级方案 ---- */}
            {!shown.building && shown.next.length > 0 && (
              <div className="mt-4">
                <span className="inline-block rounded-full bg-[#F5F5F5] px-3 py-1 text-[12px] font-bold text-[#8D6E63] shadow-[inset_0_-2px_0_#E0E0E0]">
                  {t("build.panel.plans")}
                </span>
                <div className="mt-2 space-y-3">
                  {shown.next.map((option) => {
                    const affordable = canAfford(option.cost);
                    return (
                      <div
                        key={option.levelId}
                        className="flex items-center gap-3 rounded-[20px] border-2 border-[#EEEEEE] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                      >
                        {/* 下一级长什么样。没画的等级退回上一级的图（见 buildingIcon） */}
                        <ModelArt
                          icon={option.icon}
                          alt={t(option.nameKey)}
                          className="h-[72px] w-[96px] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-black text-[#5D4037]">
                            {t("build.panel.upgrade_to")} {t(option.nameKey)}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            {option.cost.length === 0 && (
                              <span className="text-[13px] font-bold text-[#9E9E9E]">
                                {t("ui.build_shop.free")}
                              </span>
                            )}
                            {option.cost.map((need) => {
                              const owned = have.get(need.itemId) ?? 0;
                              return (
                                <span
                                  key={need.itemId}
                                  className={[
                                    "text-[13px] font-bold",
                                    owned >= need.quantity
                                      ? "text-[#66BB6A]"
                                      : "text-[#E53935]",
                                  ].join(" ")}
                                >
                                  {t(materialNameKey(need.itemId))}{" "}
                                  {need.quantity}
                                  <span className="ml-1 opacity-60">
                                    ({owned})
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!affordable}
                          onClick={() => doUpgrade(option.levelId)}
                          className="shrink-0 cursor-pointer rounded-full bg-[#FFCA28] px-5 py-2 text-[14px] font-black tracking-wide text-white shadow-[0_4px_0_#FF8F00] transition-all hover:bg-[#FFB300] active:translate-y-[4px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t("build.panel.upgrade")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-[16px] border-2 border-[#EF9A9A] bg-[#FFEBEE] px-4 py-2 text-[14px] font-bold text-[#C62828]">
                {error}
              </div>
            )}
          </div>

          {/* ---- 迁移 / 拆除 ----
            迁移是常规动作走青绿；拆除照抄日记本删除键的皮：灰底灰字，
            悬停才翻成警告红——危险动作不该在静止时就喊叫 */}
          <div className="relative z-10 flex justify-center gap-3 px-6 pb-5">
            <button
              type="button"
              className="cursor-pointer rounded-full bg-[#4DB6AC] px-6 py-2 text-[14px] font-black tracking-widest text-white shadow-[0_4px_0_#00897B] transition-all hover:bg-[#26A69A] active:translate-y-[4px] active:shadow-none"
              onClick={doMove}
            >
              {t("build.panel.move")}
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-full bg-[#F5F5F5] px-6 py-2 text-[14px] font-black tracking-widest text-[#BCAAA4] shadow-[0_4px_0_#E0E0E0] transition-colors hover:bg-[#EF5350] hover:text-white hover:shadow-[0_4px_0_#C62828] active:translate-y-[4px] active:shadow-none"
              onClick={doRemove}
            >
              {t("build.panel.remove")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
