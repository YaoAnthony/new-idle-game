#!/usr/bin/env node
/**
 * 事件总线体检：`npm run bus:report`
 *
 * 读 src/Game/EventBus.ts 里的两张表（GameEvents 通知、GameCommands 命令），
 * 再扫全 src 数每条的发送点 / 监听点，打印矩阵并标出：
 *
 * - 死名字：没人发也没人听 → 该删
 * - 没人发的通知 / 命令：多半是改名后漏了一边
 * - 命令有 0 个或 2 个以上接手人：命令只许一个（运行时开发期也会抓，
 *   但那要等页面跑到那儿；这里静态先看一眼）
 * - 一发一听的通知：提醒一下，它可能其实是命令、或者该直接调函数
 *
 * 只做字符串扫描（`emit("x"` / `on("x"` / `request("x"` / `handle("x"`），
 * 动态拼名字的不算——总线的类型化也不允许那样写。
 *
 * `--json` 输出机器可读的结果。带 `--strict` 时有死名字或命令接手人数
 * 不等于 1 就以非零码退出，可以挂到 CI。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src");
const BUS = join(SRC, "Game", "EventBus.ts");

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const strict = args.has("--strict");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

/** 从 `export type X = { ... };` 里抠出顶层键名（两层花括号以内的不算） */
function keysOfType(source, typeName) {
  const start = source.indexOf(`export type ${typeName} = {`);
  if (start < 0) throw new Error(`EventBus.ts 里找不到 ${typeName}`);
  let i = source.indexOf("{", start) + 1;
  let depth = 1;
  let body = "";
  for (; i < source.length && depth > 0; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth > 0) body += ch;
  }
  // 去掉注释，再取"行首两个空格 + 标识符 + 冒号"的键
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const keys = [];
  for (const line of stripped.split("\n")) {
    const m = /^ {2}([a-z][a-z0-9_]*)\??:/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

const busSource = readFileSync(BUS, "utf8");
const events = keysOfType(busSource, "GameEvents");
const commands = keysOfType(busSource, "GameCommands");

const tally = new Map();
const ensure = (name) => {
  if (!tally.has(name)) tally.set(name, { emit: [], on: [], request: [], handle: [] });
  return tally.get(name);
};
for (const name of [...events, ...commands]) ensure(name);

const CALL = /\b(emit|on|request|handle)\(\s*"([a-z][a-z0-9_]*)"/g;
for (const file of walk(SRC)) {
  if (file === BUS) continue;
  const text = readFileSync(file, "utf8");
  const rel = relative(SRC, file);
  for (const m of text.matchAll(CALL)) {
    const [, verb, name] = m;
    ensure(name)[verb].push(rel);
  }
}

const eventSet = new Set(events);
const commandSet = new Set(commands);
const problems = [];
const notes = [];

const rows = [];
for (const [name, t] of [...tally.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const kind = eventSet.has(name) ? "event" : commandSet.has(name) ? "command" : "unknown";
  const senders = kind === "command" ? t.request.length : t.emit.length;
  const receivers = kind === "command" ? t.handle.length : t.on.length;
  const flags = [];

  if (kind === "unknown") {
    flags.push("不在 EventBus.ts 的两张表里");
    problems.push(`${name}: 代码里用了，类型表里没有`);
  }
  if (kind === "event" && (t.request.length || t.handle.length)) {
    flags.push("通知却被当命令用");
    problems.push(`${name}: 是通知，却有 request/handle 调用`);
  }
  if (kind === "command" && (t.emit.length || t.on.length)) {
    flags.push("命令却被当通知用");
    problems.push(`${name}: 是命令，却有 emit/on 调用`);
  }
  if (senders === 0 && receivers === 0) {
    flags.push("死名字");
    problems.push(`${name}: 没人发也没人听，该删`);
  } else if (senders === 0) {
    flags.push("没人发");
    notes.push(`${name}: 有人听、没人发（改名漏了一边？）`);
  } else if (receivers === 0) {
    flags.push(kind === "command" ? "没人接手" : "没人听");
    if (kind === "command") problems.push(`${name}: 命令没人接手`);
  }
  if (kind === "command" && receivers > 1) {
    flags.push(`${receivers} 个接手人`);
    problems.push(`${name}: 命令有 ${receivers} 个接手人（${t.handle.join(", ")}）`);
  }
  if (kind === "event" && senders === 1 && receivers === 1) {
    flags.push("一发一听");
  }

  rows.push({ name, kind, senders, receivers, flags, sites: t });
}

if (asJson) {
  console.log(JSON.stringify({ rows, problems, notes }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`通知 ${events.length} 条，命令 ${commands.length} 条\n`);
  console.log(`${pad("名字", 36)}${pad("类型", 9)}${pad("发", 5)}${pad("听/接", 7)}备注`);
  console.log("-".repeat(90));
  for (const r of rows) {
    console.log(
      `${pad(r.name, 36)}${pad(r.kind === "event" ? "通知" : r.kind === "command" ? "命令" : "??", 9)}${pad(r.senders, 5)}${pad(r.receivers, 7)}${r.flags.join("；")}`,
    );
  }
  const top = (verb) =>
    rows
      .filter((r) => r.kind === "event")
      .sort((a, b) => b[verb] - a[verb])
      .slice(0, 6)
      .map((r) => `${r.name}(${r[verb]})`)
      .join("  ");
  console.log(`\n发得最多：${top("senders")}`);
  console.log(`听得最多：${top("receivers")}`);
  if (notes.length) console.log(`\n提醒：\n  ${notes.join("\n  ")}`);
  if (problems.length) console.log(`\n问题：\n  ${problems.join("\n  ")}`);
  else console.log("\n没有问题。");
}

if (strict && problems.length) process.exit(1);
