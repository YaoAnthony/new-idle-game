import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import {
  buildingRectWorld,
  checkBuildingPlacement,
  checkRemove,
  checkUpgrade,
  successorsOf,
  type LevelShape,
} from "../src/logic/buildings.js";
import { auditBuildings } from "../src/logic/buildingAudit.js";
import { farmActionAt, farmStageAt } from "../src/logic/farm.js";
import {
  depositGold,
  spendGold,
  totalGold,
} from "../src/logic/goldJar.js";
import { goldJarTuning, jarCapacity, totalCapacity } from "../src/Data/buildings/index.js";

/**
 * 建筑系统。要钉住的是三件**只有分叉才会出问题**的事：
 * - 升级必须指定目标（不指定就默认第一个后继的话，房子会悄悄变成 3a）；
 * - 跳级要拦（l1 直接升 l3a）；
 * - 图的校验比链多两条：环和孤岛。
 */

/** 一个 l1 → l2 → {l3a, l3b} 的测试型号，专门用来验分叉 */
const forked: LevelShape[] = [
  { levelId: "l1", footprint: { width: 8, height: 6 }, nextLevelIds: ["l2"] },
  {
    levelId: "l2",
    footprint: { width: 10, height: 8 },
    nextLevelIds: ["l3a", "l3b"],
    upgradeCost: { l3a: [], l3b: [] },
  },
  { levelId: "l3a", footprint: { width: 12, height: 10 } },
  { levelId: "l3b", footprint: { width: 8, height: 8 } },
];
const byId = (id: string): LevelShape => forked.find((l) => l.levelId === id)!;

// ---- 占地 ----

test("占地按当前等级算，East/West 宽深互换", () => {
  const north = buildingRectWorld(
    { x: 0, z: 0, facing: Facing.North },
    { width: 8, height: 6 },
  );
  assert.deepEqual(north, { minX: -4, maxX: 4, minZ: -3, maxZ: 3 });

  const east = buildingRectWorld(
    { x: 0, z: 0, facing: Facing.East },
    { width: 8, height: 6 },
  );
  assert.deepEqual(east, { minX: -3, maxX: 3, minZ: -4, maxZ: 4 });
});

// ---- 分叉升级 ----

test("分叉：l2 有两个后继，各自可升", () => {
  assert.deepEqual(successorsOf(byId("l2")).sort(), ["l3a", "l3b"]);
  assert.deepEqual(checkUpgrade({ level: byId("l2"), targetLevelId: "l3a" }), { ok: true });
  assert.deepEqual(checkUpgrade({ level: byId("l2"), targetLevelId: "l3b" }), { ok: true });
});

test("跳级要拦：l1 不能直接升 l3a", () => {
  const result = checkUpgrade({ level: byId("l1"), targetLevelId: "l3a" });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "not_a_successor");
});

test("满级再升报 max_level", () => {
  const result = checkUpgrade({ level: byId("l3a"), targetLevelId: "whatever" });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "max_level");
});

test("不是后继的目标一律拒绝（打错的 id 也走这条）", () => {
  const result = checkUpgrade({ level: byId("l2"), targetLevelId: "l9" });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "not_a_successor");
});

// ---- 预留字段的通路（本期恒空，但路径要通）----

test("requires：不满足时报 requires_unmet 并列出缺什么；置空则恒 ok", () => {
  const gated: LevelShape = {
    ...byId("l2"),
    requires: { l3a: [{ buildingId: "gold_jar", minLevelId: "l2" }] },
  };

  const unmet = checkUpgrade({ level: gated, targetLevelId: "l3a", others: [] });
  assert.equal(unmet.ok, false);
  assert.equal(!unmet.ok && unmet.reason, "requires_unmet");
  assert.deepEqual(!unmet.ok && unmet.unmet, [
    { buildingId: "gold_jar", minLevelId: "l2" },
  ]);

  const met = checkUpgrade({
    level: gated,
    targetLevelId: "l3a",
    others: [{ buildingId: "gold_jar", levelId: "l2" }],
  });
  assert.deepEqual(met, { ok: true });

  // 值恒空时这条路径不产生任何拦截——本期就是这个状态
  assert.deepEqual(checkUpgrade({ level: byId("l2"), targetLevelId: "l3a" }), { ok: true });
});

test("upgradeCost：材料不够报 missing_materials；空数组恒可升", () => {
  const costly: LevelShape = {
    ...byId("l2"),
    upgradeCost: { l3a: [{ itemId: "wood", quantity: 10 }] },
  };
  const poor = checkUpgrade({
    level: costly,
    targetLevelId: "l3a",
    materials: new Map([["wood", 3]]),
  });
  assert.equal(poor.ok, false);
  assert.equal(!poor.ok && poor.reason, "missing_materials");

  const rich = checkUpgrade({
    level: costly,
    targetLevelId: "l3a",
    materials: new Map([["wood", 10]]),
  });
  assert.deepEqual(rich, { ok: true });
});

test("屋里非空不给升——这条消掉了「升级时家具会不会丢」那个风险", () => {
  const result = checkUpgrade({
    level: byId("l2"),
    targetLevelId: "l3a",
    furnitureInside: 7,
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "not_empty");
  assert.equal(!result.ok && result.itemCount, 7);

  // 收空之后就能升
  assert.deepEqual(
    checkUpgrade({ level: byId("l2"), targetLevelId: "l3a", furnitureInside: 0 }),
    { ok: true },
  );
});

// ---- 放置 ----

test("放置：领地外、压到别的楼、压到占用格、超出实例上限，四种理由各可达", () => {
  const rect = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };

  assert.deepEqual(checkBuildingPlacement({ rect, others: [] }), { ok: true });

  assert.equal(
    (checkBuildingPlacement({
      rect,
      others: [{ instanceId: "a", rect: { minX: 2, maxX: 6, minZ: 2, maxZ: 6 } }],
    }) as { reason: string }).reason,
    "overlaps_building",
  );

  assert.equal(
    (checkBuildingPlacement({
      rect,
      others: [],
      occupiedCells: new Set(["2,2"]),
    }) as { reason: string }).reason,
    "cell_occupied",
  );

  assert.equal(
    (checkBuildingPlacement({
      rect,
      others: [],
      instances: { current: 1, max: 1 },
    }) as { reason: string }).reason,
    "max_instances",
  );

  const territory = {
    definition: {
      plots: [
        { plotId: "P", localizationKey: "p", rect: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, initial: true },
      ],
    },
    unlocked: new Set<string>(),
  };
  assert.equal(
    (checkBuildingPlacement({ rect, others: [], territory }) as { reason: string }).reason,
    "outside_territory",
  );
});

test("移动时排除自己——不然原地微调会被判成压到自己", () => {
  const rect = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };
  const others = [{ instanceId: "me", rect }];
  assert.equal(
    (checkBuildingPlacement({ rect, others }) as { reason: string }).reason,
    "overlaps_building",
  );
  assert.deepEqual(
    checkBuildingPlacement({ rect, others, excludeInstanceId: "me" }),
    { ok: true },
  );
});

// ---- 拆除 ----

test("非空不给拆，且说清楚是哪一样还剩多少", () => {
  assert.deepEqual(checkRemove({}), { ok: true });
  assert.deepEqual(checkRemove({ furniture: 0, gold: 0 }), { ok: true });

  const withGold = checkRemove({ gold: 120 });
  assert.equal(withGold.ok, false);
  assert.deepEqual(!withGold.ok && withGold.detail, { gold: 120 });

  const withFurniture = checkRemove({ furniture: 3 });
  assert.deepEqual(!withFurniture.ok && withFurniture.detail, { furniture: 3 });
});

// ---- 审计：图比链多的那几条 ----

test("audit：正常的分叉型号通过", () => {
  assert.deepEqual(auditBuildings([{ buildingId: "house", levels: forked }]), []);
});

test("audit：环要报错——环会让升级变成死循环", () => {
  const cyclic = forked.map((l) =>
    l.levelId === "l3a" ? { ...l, nextLevelIds: ["l1"] } : l,
  );
  assert.ok(
    auditBuildings([{ buildingId: "house", levels: cyclic }]).some((m) => m.includes("成环")),
  );
});

test("audit：孤岛要报错——没人指向的等级永远升不到", () => {
  const island = [
    ...forked.filter((l) => l.levelId !== "l2"),
    { levelId: "l2", footprint: { width: 10, height: 8 } }, // 不再指向 l3a/l3b
  ];
  const problems = auditBuildings([{ buildingId: "house", levels: island }]);
  // l1 仍指向 l2，但 l2 不再指向 l3a/l3b → 那两级成了孤岛
  assert.ok(problems.some((m) => m.includes("l3a") && m.includes("孤岛")));
  assert.ok(problems.some((m) => m.includes("l3b") && m.includes("孤岛")));
});

test("audit：upgradeCost 的键不是后继要报错（死数据）", () => {
  const dead = forked.map((l) =>
    l.levelId === "l1" ? { ...l, upgradeCost: { l3a: [] } } : l,
  );
  assert.ok(
    auditBuildings([{ buildingId: "house", levels: dead }]).some((m) =>
      m.includes("死数据"),
    ),
  );
});

test("audit：nextLevelIds 指向不存在的等级要报错", () => {
  const broken = forked.map((l) =>
    l.levelId === "l1" ? { ...l, nextLevelIds: ["l9"] } : l,
  );
  assert.ok(
    auditBuildings([{ buildingId: "house", levels: broken }]).some((m) =>
      m.includes("不存在的等级"),
    ),
  );
});

test("audit：requires 指向不存在的型号 / 等级要报错", () => {
  const gated = forked.map((l) =>
    l.levelId === "l2"
      ? { ...l, requires: { l3a: [{ buildingId: "ghost", minLevelId: "l2" }] } }
      : l,
  );
  assert.ok(
    auditBuildings([{ buildingId: "house", levels: gated }], {
      hasBuilding: () => false,
    }).some((m) => m.includes("不存在的型号")),
  );
  assert.ok(
    auditBuildings([{ buildingId: "house", levels: gated }], {
      hasBuilding: () => true,
      hasLevel: () => false,
    }).some((m) => m.includes("没有这一级")),
  );
});

// ---- 金币罐 ----

test("存钱：没满时全额进账，跨过总容量时 accepted + overflowed === amount", () => {
  const jars = [{ stored: 0 }];
  const caps = [50];

  const small = depositGold(jars, caps, 20);
  assert.deepEqual(small, { accepted: 20, overflowed: 0, next: [{ stored: 20 }] });

  const over = depositGold([{ stored: 40 }], caps, 30);
  assert.equal(over.accepted + over.overflowed, 30);
  assert.equal(over.accepted, 10);
  assert.equal(over.overflowed, 20);

  const full = depositGold([{ stored: 50 }], caps, 10);
  assert.equal(full.accepted, 0);
  assert.equal(full.overflowed, 10);
});

test("一只罐都没有时全额溢出——这就是「没建罐 = 攒不下钱」", () => {
  const none = depositGold([], [], 25);
  assert.equal(none.accepted, 0);
  assert.equal(none.overflowed, 25);
  assert.equal(totalCapacity([]), 0);
});

test("两只罐按顺序填满第一只再填第二只（不是按比例分）", () => {
  const result = depositGold([{ stored: 0 }, { stored: 0 }], [50, 150], 60);
  assert.deepEqual(result.next, [{ stored: 50 }, { stored: 10 }]);
  assert.equal(result.overflowed, 0);
});

test("花钱从后往前扣，让第一只罐尽量保持满", () => {
  const jars = [{ stored: 50 }, { stored: 30 }];
  const spent = spendGold(jars, 20);
  assert.ok(spent.ok);
  assert.deepEqual(spent.ok && spent.next, [{ stored: 50 }, { stored: 10 }]);

  const deep = spendGold(jars, 60);
  assert.deepEqual(deep.ok && deep.next, [{ stored: 20 }, { stored: 0 }]);

  const short = spendGold(jars, 100);
  assert.equal(short.ok, false);
  assert.equal(!short.ok && short.short, 20);
});

test("总账：totalGold / totalCapacity 对多只罐求和", () => {
  assert.equal(totalGold([{ stored: 12 }, { stored: 30 }]), 42);
  assert.equal(totalCapacity(["l1", "l2"]), jarCapacity("l1") + jarCapacity("l2"));
});

test("容量随等级单调递增——升级换来的必须是能装更多", () => {
  const levels = ["l1", "l2", "l3"];
  for (let i = 1; i < levels.length; i += 1) {
    assert.ok(
      jarCapacity(levels[i]) > jarCapacity(levels[i - 1]),
      `${levels[i]} 的容量该比 ${levels[i - 1]} 大`,
    );
  }
});

test("数值可调：把 goldJarTuning 整体乘 10，上面的关系仍然成立", () => {
  const backup = { ...goldJarTuning.capacityByLevel };
  try {
    for (const key of Object.keys(goldJarTuning.capacityByLevel)) {
      goldJarTuning.capacityByLevel[key] *= 10;
    }
    // 断言的是**关系**不是数字：填满第一只再填第二只
    const result = depositGold(
      [{ stored: 0 }, { stored: 0 }],
      [jarCapacity("l1"), jarCapacity("l2")],
      jarCapacity("l1") + 10,
    );
    assert.equal(result.next[0].stored, jarCapacity("l1"));
    assert.equal(result.next[1].stored, 10);
    assert.ok(jarCapacity("l2") > jarCapacity("l1"));
  } finally {
    Object.assign(goldJarTuning.capacityByLevel, backup);
  }
});

// ---- 农田：阶段是算出来的不是存的 ----

const SEED = { waterAtMinutes: 30, growMinutes: 120 };
const T0 = "2026-08-22T00:00:00.000Z";
const at = (minutes: number) =>
  new Date(Date.parse(T0) + minutes * 60_000).toISOString();

test("空地 / 已播种 / 需浇水：按播种时刻算", () => {
  assert.equal(farmStageAt(undefined, SEED, at(0)), "empty");

  const planted = { seedItemId: "tomato_seed", plantedUtc: T0 };
  assert.equal(farmStageAt(planted, SEED, at(10)), "planted");
  assert.equal(farmStageAt(planted, SEED, at(29)), "planted");
  assert.equal(farmStageAt(planted, SEED, at(30)), "thirsty");
});

test("不浇水就停在需浇水，**不枯死**——陪伴类游戏不惩罚忘记", () => {
  const planted = { seedItemId: "tomato_seed", plantedUtc: T0 };
  assert.equal(farmStageAt(planted, SEED, at(60)), "thirsty");
  assert.equal(farmStageAt(planted, SEED, at(60 * 24)), "thirsty");
  assert.equal(farmStageAt(planted, SEED, at(60 * 24 * 30)), "thirsty");
});

test("浇水之后从浇水那一刻接着算，不是从播种算", () => {
  /*
   * 忘了三天再浇水，一浇就熟的话，"记得浇水"这件事就没有意义了。
   * 剩下的时长是 growMinutes − waterAtMinutes = 90 分钟。
   */
  const lateWater = at(60 * 24 * 3);
  const state = {
    seedItemId: "tomato_seed",
    plantedUtc: T0,
    wateredUtc: lateWater,
  };
  const afterWater = (m: number) =>
    new Date(Date.parse(lateWater) + m * 60_000).toISOString();

  assert.equal(farmStageAt(state, SEED, afterWater(1)), "growing");
  assert.equal(farmStageAt(state, SEED, afterWater(89)), "growing");
  assert.equal(farmStageAt(state, SEED, afterWater(90)), "ripe");
});

test("按 F 做什么由地里的状态决定——同一个键，四种事", () => {
  assert.equal(farmActionAt("empty", true), "sow");
  assert.equal(farmActionAt("empty", false), "none"); // 手上没种子就没得种
  assert.equal(farmActionAt("thirsty", false), "water");
  assert.equal(farmActionAt("ripe", false), "harvest");
  assert.equal(farmActionAt("planted", true), "none");
  assert.equal(farmActionAt("growing", true), "none");
});
