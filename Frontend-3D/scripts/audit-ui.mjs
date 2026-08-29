/**
 * UI 体检：逐个面板量"功能性"毛病，不管好不好看。
 *
 * 和 `shoot-ui.mjs` 分工明确——那个负责出图给人看（美不美只能人判断），
 * 这个负责查**机器能查出来的硬伤**，而且每一条都是"点不到 / 看不见"
 * 这类功能问题，不是审美问题：
 *
 *   1. **溢出视口** —— 元素跑到屏幕外，在基准机上根本够不着。
 *      每日任务面板的输入框就是这么丢的（667×375 下被切在屏幕下方）。
 *   2. **被盖住的可点元素** —— 按钮在 DOM 里在、在屏幕上被别的东西压着。
 *      用 elementFromPoint 打中心点，命中的不是自己就是被盖了。
 *   3. **触摸目标过小** —— 44×44 是 iOS/Android 通行下限。这是横屏手游，
 *      手指不是鼠标。
 *   4. **静止态带 transform** —— 项目里 hover/active 写了 transform 的类，
 *      定位若也用 translate 会被顶掉，鼠标一放上去元素当场弹走。
 *
 * 判据都用 getBoundingClientRect / elementFromPoint，不依赖页面合成，
 * 所以浏览器面板显不显示都能跑。
 */
import { chromium } from "playwright";

const URL_BASE = process.env.GAME_URL || "http://localhost:5174";
const VIEWPORT = { width: 667, height: 375 };
/** iOS/Android 通行的最小触摸目标 */
const MIN_TOUCH = 44;

const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader", "--use-gl=swiftshader"],
});
const page = await browser.newPage({ viewport: VIEWPORT });

await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.getByText("开始游戏").first().click().catch(() => {});
await page.waitForTimeout(2500);
await page.getByText("游客游玩").first().click().catch(() => {});
await page.waitForTimeout(4000);
await page.getByText("出发").first().click().catch(() => {});
await page.waitForTimeout(9000);

if (!(await page.evaluate(() => Boolean(window.__run)))) {
  console.log("!! 没进到游戏里");
  await browser.close();
  process.exit(1);
}

/**
 * 关掉当前面板。**只敲一次 ESC，不能敲两次。**
 *
 * EscArbiter 的规则是"栈非空关顶层、栈空开菜单"——所以多敲的那一下会把
 * ESC 菜单**开出来**，下一个面板于是和它叠着拍。第一版就是这么误判出
 * "两个面板并排"的，那张截图是脚本自己造的，不是游戏的毛病。
 */
async function closeTop() {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

async function openPanel(panel) {
  await page.evaluate(async (name) => {
    const bus = await import("/src/Game/EventBus.ts");
    bus.emit("ui_panel_requested", { panel: name });
  }, panel);
  /*
   * **必须等仪式播完再量。**面板外壳的绽开动画约 1.8 秒（真游戏里比
   * 设计值慢，StrictMode 双渲染 + 软渲染），800ms 量到的是变形过程中的
   * 中间态——行动卡会被报成 30×352 这种谁看了都要愣一下的尺寸。
   * getBoundingClientRect 不区分"这是终态"还是"这是第 17 帧"。
   */
  await page.waitForTimeout(2600);
}

async function auditCurrentScreen(label) {
  const report = await page.evaluate(
    ([minTouch, vw, vh]) => {
      const out = { overflow: [], covered: [], tiny: [], transformed: [] };

      const describe = (el) => {
        const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
        return `<${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 2).join(".") : ""}> ${text.slice(0, 30)}`;
      };

      /*
       * 元素在视口外，是**够不着**还是**只是还没滚到**？
       *
       * 这两件事必须分开：滚动容器里排在下面的东西，rect 当然在视口外，
       * 但玩家滚一下就有了——那不是毛病。真正的毛病是**没有任何祖先能
       * 滚动**，那才叫永远够不着。
       *
       * 不做这个区分的话，设置面板会报出九条"溢出"，而它其实滚得好好的；
       * 而报告里假警报一多，真的那条（每日任务的输入框）就被淹了。
       */
      const canScrollTo = (el) => {
        let node = el.parentElement;
        while (node && node !== document.body) {
          const cs = getComputedStyle(node);
          const scrollable =
            /auto|scroll/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1;
          const scrollableX =
            /auto|scroll/.test(cs.overflowX) && node.scrollWidth > node.clientWidth + 1;
          if (scrollable || scrollableX) return true;
          node = node.parentElement;
        }
        return false;
      };

      const visible = (el) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        if (Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };

      /*
       * **只查玩家此刻真正在看的那一层。**
       *
       * 挡屏面板盖住底下的 HUD 按钮是设计本意，不是毛病。不做这个收敛的话
       * 每开一个面板都会报"行动按钮被面板压着""设置按钮被面板压着"，
       * 两条永远为真的噪音——而**被绕过的守卫等于没有**，报告里噪音一多，
       * 真的那条就被淹了。
       *
       * 判据：找铺满视口的那个遮罩（inset-0 那类），有就只查它里面的。
       */
      const overlay = [...document.querySelectorAll("div")].find((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width >= vw - 2 &&
          r.height >= vh - 2 &&
          r.top <= 1 &&
          (cs.position === "absolute" || cs.position === "fixed") &&
          Number(cs.zIndex) >= 10
        );
      });
      const root = overlay || document;

      // ---- 1 & 3 & 4：可交互元素 ----
      const clickable = [...root.querySelectorAll("button, input, [role='button'], a")];
      for (const el of clickable) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();

        // 溢出视口（留 1px 容差给亚像素）。滚一下就能看到的不算
        if (
          (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) &&
          !canScrollTo(el)
        ) {
          out.overflow.push({
            el: describe(el),
            rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
          });
          continue; // 跑到屏外的就别再判遮挡和尺寸了，那是同一个病
        }

        // 触摸目标
        if (r.width < minTouch || r.height < minTouch) {
          out.tiny.push({ el: describe(el), size: [Math.round(r.width), Math.round(r.height)] });
        }

        // 被盖住：打中心点，命中的应该是自己或自己的后代
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && hit !== el && !el.contains(hit)) {
          out.covered.push({ el: describe(el), by: describe(hit) });
        }

        // 静止态 transform（hover 里写了 transform 的类会被顶掉）
        const t = getComputedStyle(el).transform;
        if (t && t !== "none" && /ui-wood-btn|ui-green-btn|ui-chip|ui-action-card|ui-dialogue-choice/.test(el.className || "")) {
          out.transformed.push({ el: describe(el), transform: t });
        }
      }

      // ---- 2：非交互但重要的内容溢出（文字被切掉） ----
      for (const el of root.querySelectorAll("h1,h2,h3,p,span,li")) {
        if (!visible(el) || el.children.length > 0) continue;
        const r = el.getBoundingClientRect();
        if ((r.bottom > vh + 1 || r.right > vw + 1) && !canScrollTo(el)) {
          const text = (el.innerText || "").trim();
          if (text) out.overflow.push({ el: describe(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
        }
      }
      return out;
    },
    [MIN_TOUCH, VIEWPORT.width, VIEWPORT.height],
  );

  const lines = [`\n===== ${label} =====`];
  const section = (title, rows, fmt) => {
    if (rows.length === 0) return;
    lines.push(`  ${title}（${rows.length}）`);
    for (const r of rows.slice(0, 8)) lines.push(`    - ${fmt(r)}`);
    if (rows.length > 8) lines.push(`    … 另外 ${rows.length - 8} 条`);
  };
  section("溢出视口", report.overflow, (r) => `${r.el}  rect=${r.rect.join(",")}`);
  section("被盖住", report.covered, (r) => `${r.el}  ← 被 ${r.by} 压着`);
  section(`触摸目标 < ${MIN_TOUCH}px`, report.tiny, (r) => `${r.el}  ${r.size.join("×")}`);
  section("静止态带 transform", report.transformed, (r) => `${r.el}  ${r.transform}`);
  if (
    report.overflow.length + report.covered.length + report.tiny.length + report.transformed.length ===
    0
  ) {
    lines.push("  ✓ 干净");
  }
  console.log(lines.join("\n"));
  return report;
}

await auditCurrentScreen("主界面 HUD");

/*
 * 关闭放在体检**之后**，不能放前面。
 *
 * 栈空时敲 ESC 会把 ESC 菜单开出来（EscArbiter 的规则），所以"开面板前
 * 先清一遍"这个直觉写法，第一发就给每一屏都叠上了一层 ESC 菜单——
 * 体检报告里那一串"被 esc-layer 压着"全是脚本自己造的。
 * 现在的次序是：开 → 查 → 关，关的那一下正好把栈清空。
 */
for (const [panel, label] of [
  ["actions", "行动面板"],
  ["backpack", "背包"],
  ["chat", "消息"],
  ["settings", "设置"],
]) {
  await openPanel(panel);
  await auditCurrentScreen(label);
  await closeTop();
}

/*
 * 行动面板的**深层屏**。
 *
 * 体检一直只走顶层面板，而表单那屏（名字 / 时长 / 重要级 / 两个出口）
 * 是全项目内容最多的一屏——实拍里它下半截整个被切在屏幕外，而报告
 * 全绿。**没走到的地方，守卫等于不存在。**
 */
await openPanel("actions");
await page.getByText("工作或学习任务").first().click().catch(() => {});
await page.waitForTimeout(900);
await auditCurrentScreen("行动·某类清单");
await page.getByText("添加行动").first().click().catch(() => {});
await page.waitForTimeout(900);
await auditCurrentScreen("行动·添加表单");
await closeTop();

await page.evaluate(async () => {
  const bus = await import("/src/Game/EventBus.ts");
  bus.emit("daily_board_open_requested", {});
});
await page.waitForTimeout(2600);
await auditCurrentScreen("每日任务面板");
await closeTop();

await browser.close();
