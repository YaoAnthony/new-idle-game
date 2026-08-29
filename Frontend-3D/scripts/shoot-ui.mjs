/**
 * UI 截图台：用 Playwright 把游戏真跑起来，逐屏拍照。
 *
 * ---- 为什么要有这个东西 ----
 *
 * 这个项目的浏览器面板在当前环境**不合成帧**（`computer{screenshot}` 永远
 * 5 秒超时），而"改完 UI 必须渲图自己看"是硬规矩——量 DOM 证明不了两个
 * 元素有没有叠在一起、主次按钮的皮有没有装反、一张卡是不是空得发慌。
 *
 * 老办法是 DOM → SVG foreignObject → canvas，每屏手工注入、四个坑（动画
 * 要剥、必须 data: 不能 blob:、图要转 data URI、fixed 定位画不出来）。
 * 这条是真浏览器真像素，而且**可重复跑**——改一轮拍一轮，才谈得上"改到通关"。
 *
 * ---- 视口为什么是 667×375 ----
 *
 * 项目只做横屏，基准机是 iPhone SE。最挤的屏幕上不出问题，宽屏上只会更松；
 * 反过来在 1920 上调好看的版式，到 SE 上会挤成一团。`deviceScaleFactor: 2`
 * 只影响出图清晰度，不改变布局。
 *
 * 用法：
 *   node scripts/shoot-ui.mjs              # 拍全套，落到 ./shots
 *   SHOT_DIR=/tmp/x node scripts/shoot-ui.mjs
 *   GAME_URL=http://localhost:5174 node scripts/shoot-ui.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.SHOT_DIR || join(process.cwd(), "shots");
const URL_BASE = process.env.GAME_URL || "http://localhost:5174";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    // headless 里没有真 GPU，走 SwiftShader 软渲染，否则 three.js 拿不到 context
    "--enable-unsafe-swiftshader",
    "--use-gl=swiftshader",
  ],
});

/*
 * 视口可以从环境变量改：`VIEWPORT=1000x513 node scripts/shoot-ui.mjs`。
 * 默认还是基准机 iPhone SE 横屏——但"在基准机上不出问题"和"在用户
 * 那台机器上好看"是两件事，两边都得看。
 */
const [VW, VH] = (process.env.VIEWPORT || "667x375").split("x").map(Number);

const page = await browser.newPage({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 2,
  /*
   * **必须显式关掉。** headless Chromium 默认报告
   * `prefers-reduced-motion: reduce`，凡是尊重无障碍设置的动画都会被跳过
   * ——拍出来永远是终态，转场一帧也看不到。
   */
  reducedMotion: "no-preference",
});

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

let step = 0;
async function shot(name) {
  step += 1;
  const file = `${String(step).padStart(2, "0")}-${name}`;
  await page.screenshot({ path: join(OUT, `${file}.png`) });
  const text = await page
    .evaluate(() => document.body.innerText.replace(/\s*\n+\s*/g, " | ").slice(0, 300))
    .catch(() => "");
  console.log(`shot ${file}\n     ${text}\n`);
}

/**
 * 拿到**应用正在用的那一份**模块，而不是新建一份。
 *
 * 被 Vite HMR 更新过的模块，应用里引用的 URL 带 `?t=时间戳`；裸路径
 * `import("/src/x.ts")` 会**新建一份孤立实例**——状态、监听器都不通。
 * EventBus 撞上这个的后果特别隐蔽：`emit` 一声不响地发给一份没人订阅的
 * 副本，面板不开，也不报错。查了三轮才反应过来是自己改过 EventBus 的
 * 一行注释把它推进了 HMR。
 *
 * 办法是从 performance 的资源表里捞**最后一个**含该路径的 URL。
 */
const APP_MODULE = `(path) => {
  const hit = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.includes(path))
    .pop();
  return import(/* @vite-ignore */ hit ?? path);
}`;

/**
 * 通过应用自己的 EventBus 开面板。
 *
 * 不用点按钮：有些面板的入口藏在三级菜单里，而且点击路径会随版式改动失效
 * ——那正好是这个脚本要拍的东西，不该让它同时是拍照的前提。
 */
async function openPanel(panel) {
  await emitEvent("ui_panel_requested", { panel });
}

async function emitEvent(name, payload = {}) {
  await page.evaluate(
    async ([n, p, src]) => {
      const bus = await eval(src)("/src/Game/EventBus.ts");
      bus.emit(n, p);
    },
    [name, payload, APP_MODULE],
  );
  /*
   * 2600ms 而不是 700：面板外壳的绽开仪式（entry 130 + spin 330 + expand 550）
   * 加起来就有 1 秒，700ms 截到的是印章还在转的那一帧。要评的是落定后的
   * 版式，就得等它落定——转场另有 shoot-preview.mjs 按毫秒切片专门拍。
   */
  await page.waitForTimeout(2600);
}

/** 敲一条命令行指令（window.__run 由 Game3D/index.tsx 挂上） */
async function run(cmd) {
  const result = await page.evaluate((c) => window.__run?.(c), cmd);
  await page.waitForTimeout(400);
  return result;
}

/**
 * 关掉当前面板。**只敲一次，而且必须在拍完之后敲。**
 *
 * EscArbiter 的规则是"栈非空关顶层、栈空开菜单"。所以
 *   - 敲两次 = 关掉面板再把 ESC 菜单开出来；
 *   - 开面板**之前**先清一遍 = 那时栈本来是空的，这一下直接开出菜单。
 * 两种写法都会让后面每一张照片都叠着一层 ESC 菜单，而看图的人会以为
 * "游戏里两个面板会并排显示"。第一版两个错都犯了，白诊断了一轮。
 */
async function closeTop() {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await settleToGame();
}

/**
 * 敲到"什么都没开着"为止。
 *
 * 需要它是因为有些面板会**自己关掉**（行动面板点完「保存行动」就收了）。
 * 那时栈已经空了，再敲一下 Escape 敲出来的是 ESC 菜单，它盖住右上角的
 * 按钮，后面每一步点击都被拦下来——表现成"日记本怎么点都不开"。
 *
 * **判据必须是元素，不能是 `innerText`。** 第一版按文字里有没有"关闭菜单"
 * 来判断，结果菜单的退场动画还没播完、文字还在，脚本以为没关掉又敲了一下
 * ——而那一下正好把它重新开了出来，来回抖。`.esc-layer` / `.modal-stage`
 * 是真实节点，动画播完就没了。
 */
async function settleToGame() {
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(900);
    const busy = await page.evaluate(() =>
      Boolean(
        /*
         * **正在关的不算开着。** `Modal` 关闭时会把 `.modal-stage` 留到
         * exit 动画播完（约 550ms + 遮罩 250ms），只查 `.modal-stage`
         * 会把"正在关"读成"还开着"，于是补敲一下 Escape——那时栈已经空了，
         * 这一下正好把 ESC 菜单开出来。相位写在 `data-phase` 上，排掉它。
         */
        document.querySelector('.esc-layer, .modal-stage:not([data-phase="exit"])'),
      ),
    );
    if (!busy) return;
    await page.keyboard.press("Escape");
  }
}

// ================= 走一遍 =================

await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await shot("title");

// 标题屏 → 开始游戏
await page.getByText("开始游戏").first().click().catch(() => {});
await page.waitForTimeout(2500);
await shot("entry-choice");

// 登录门槛：走游客
await page.getByText("游客游玩").first().click().catch(() => {});
await page.waitForTimeout(4000);
await shot("after-guest");

// 捏人屏。默认长相直接出发——这一步拍的是"第一次进游戏的人看到什么"，
// 不是"捏得好不好看"
await page.getByText("出发").first().click().catch(() => {});
await page.waitForTimeout(9000);
await shot("in-game");

// 走到这儿还没进游戏就别往下拍了——后面全是同一张标题屏，白拍
const inGame = await page.evaluate(() => Boolean(window.__run));
if (!inGame) {
  console.log("!! 没能进到游戏里，__run 不存在。当前文字：");
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 400)));
  console.log(logs.slice(0, 30).join("\n"));
  await browser.close();
  process.exit(1);
}

/*
 * 播种：摆一件家具、写两条行动、记一笔已完成。
 *
 * **空存档是最没信息量的状态。** 全新档里每张分类卡都是锁着的灰块、
 * 今日小结整条不渲染——照着它调版式，等于对着一个玩家只在第一分钟
 * 见过的画面做设计。种下几条之后看到的才是常态。
 *
 * 走 `replayPlaceFurniture` 而不是正常的摆放流程：后者要过占用校验和
 * 房间几何，而这里只是要一件"能支撑学习行动"的家具存在。
 */
if (process.env.SEED !== "0") {
  await page.evaluate(async () => {
    /*
     * **不能直接 `import("/src/xxx.ts")`。**
     *
     * 被 Vite HMR 更新过的模块，应用里引用的 URL 带 `?t=时间戳`；裸路径
     * 会**新建一份孤立实例**，状态和应用不通——写进去的行动条目落在第二份
     * 副本的数组里，界面上一条也看不到。实测就是这样：dayRecord 和 world
     * 那两个没被改过（无 HMR），种进去了；而 actions.ts 这一轮改了好几次，
     * 三条行动全丢了，而且不报任何错。
     *
     * 办法是从 performance 的资源表里捞**最后一个**含该路径的 URL——
     * 那个才是应用正在用的那份。
     */
    const appModule = (path) => {
      const hit = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.includes(path))
        .pop();
      return import(/* @vite-ignore */ hit ?? path);
    };

    const world = await appModule("/src/Game/State/world/index.ts");
    const record = await appModule("/src/Game/Systems/dayRecord.ts");
    /*
       * **不能 `import("core")`。** 裸包名在页面运行时解析不了——Vite 只在
       * 转译源码时把它换成真实路径，而这段是从 evaluate 里跑的原生 import。
       * 枚举值直接写字面量（Facing.North === "north" 等），反正播种脚本
       * 本来就只在开发时跑。
       */

    world.replayPlaceFurniture({
      instanceId: "shoot:desk#1",
      furnitureId: "furniture_study_desk",
      placement: {
        kind: "floor",
        roomId: "living",
        gridPosition: { x: 3, y: 3 },
        facing: "north",
      },
      state: {},
    });

    /*
     * 行动条目**不在这儿种，改由 UI 走一遍真实流程**（见下面的深层屏）。
     *
     * 从 evaluate 里调 `addActionEntry` 试过两版都不行：裸路径 import 拿到
     * HMR 之后的孤立副本，条目写进了第二份数组；改成从 performance 里捞
     * 带 `?t=` 的 URL 也没通。而这是个只在开发期跑的截图台，为了绕过模块
     * 实例问题去猜 Vite 的内部行为不值得——点按钮一定是应用那一份。
     */
    record.recordActionFact("跑了三公里", 30, "wood");
    record.recordActionFact("写完周报", 60, "plank");
  });
  await page.waitForTimeout(600);
}

// 主界面各处（HUD、快捷栏、时钟、需求条）都在上面那张里。下面逐个开面板。
for (const [panel, label] of [
  ["actions", "panel-actions"],
  ["backpack", "panel-backpack"],
  ["chat", "panel-chat"],
  ["settings", "panel-settings"],
]) {
  await openPanel(panel);
  await shot(label);
  await closeTop();
}

/*
 * 行动面板的**深层屏**：分类网格 → 某类的清单 → 添加表单。
 *
 * 这几屏只能靠点进去（面板栈没有直达它们的事件），而它们恰恰是内容最多、
 * 最容易出版式问题的地方——只拍第一屏等于没拍。
 */
await openPanel("actions");
await page.getByText("工作或学习任务").first().click().catch(() => {});
await page.waitForTimeout(900);
await shot("panel-actions-list-empty");

await page.getByText("添加行动").first().click().catch(() => {});
await page.waitForTimeout(900);
await shot("panel-actions-form");

// 填一条再存回去，好拍到"有内容的清单"——空态和有内容是两种版式
await page.getByPlaceholder("例如：写作业").first().fill("写完 assignment2").catch(() => {});
await page.waitForTimeout(300);
await shot("panel-actions-form-filled");
await page.getByText("保存行动").first().click().catch(() => {});
await page.waitForTimeout(1200);
await shot("panel-actions-list");
await closeTop();

// 日记本：右上角第三个按钮
await page.getByLabel("日记本").first().click().catch(() => {});
await page.waitForTimeout(2000);
await shot("panel-diary");

/*
 * 翻页也要拍。翻页是这块面板唯一的转场，而它坏起来是**只在翻的那 0.6 秒里**
 * 坏——溢出的滚动条、被裁掉的页角、翻到头还亮着的箭头，停下来之后一个都
 * 看不见。所以拍三张：翻之前、翻到一半、翻完。
 */
await page.getByLabel("Previous Page").first().click().catch(() => {});
/*
 * 连拍两张，中间不等。翻页动画默认 1 秒，但 `page.screenshot` 自己就要
 * 一两百毫秒——先 waitForTimeout(260) 再拍那一版，拍到的已经是翻完的终态
 * （两张图像素级一样，白拍一轮）。贴着点击连发才截得到中间态。
 */
await shot("panel-diary-flip-a");
await shot("panel-diary-flip-b");
await page.waitForTimeout(1600);
await shot("panel-diary-prev");

// 箭头必须站在书外面：重叠了就说明它又踩回书页上了
const geom = await page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right) };
  };
  return {
    card: box(".modal-card"),
    arrow: box('.modal-overlay [aria-label="Previous Page"]'),
  };
});
console.log("几何:", JSON.stringify(geom));

// 溢出是量得出来的，不用靠眼睛在图里找那条一像素的灰条
const overflow = await page.evaluate(() => {
  const el = document.querySelector(".modal-content");
  if (!el) return "no .modal-content";
  return {
    x: el.scrollWidth - el.clientWidth,
    y: el.scrollHeight - el.clientHeight,
  };
});
console.log("modal-content 溢出:", JSON.stringify(overflow));

await closeTop();

// 每日任务板：走它自己的事件
await emitEvent("daily_board_open_requested");
await shot("panel-daily");
await closeTop();

// ESC 菜单：这会儿栈是空的，敲一下正好把它开出来
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
await shot("panel-esc");
await settleToGame();

/*
 * 专注模式**放在最后拍**：一开始专注，行动按钮会收起来、倒计时卡和全屏
 * 暗角会盖上去——那之后再拍任何别的面板，拍到的都是"专注中"的变体，
 * 不是常态。
 */
await page.getByLabel("日记本").first().click().catch(() => {});
await page.waitForTimeout(2000);
/*
 * **必须挑可见的那个。** page-flip 会为每一页留一份模板副本（`.stf__item`
 * 那套），同一个 aria-label 在 DOM 里因此不止一个；`.first()` 很可能选中
 * 藏起来的那份，Playwright 等它可交互等到超时，`catch` 再把超时吞掉——
 * 表现成"点了没反应"，而截图里那一行还带着 hover 的绿边，看着像点到了。
 */
await page.locator('[aria-label="开始专注"]:visible').first().click().catch(() => {});
await page.waitForTimeout(1800);
await shot("focus-from-diary");
console.log(
  "专注后:",
  JSON.stringify(
    await page.evaluate(() => ({
      书合上了: !document.querySelector(".modal-stage"),
      报错: document.body.innerText.includes("开始不了"),
      有倒计时卡: Boolean(document.querySelector(".focus-card, [data-focus-card]")),
      正文: document.body.innerText.replace(/\s+/g, " ").slice(0, 120),
    })),
  ),
);

console.log("\n---- console (前 30 条) ----");
console.log(logs.slice(0, 30).join("\n"));

await browser.close();
