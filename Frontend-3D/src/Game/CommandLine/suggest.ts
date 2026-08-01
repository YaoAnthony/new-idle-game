import { listCommands, type CommandSuggestion } from "./commands";

/**
 * 命令补全。
 *
 * 解析和打分都放在这里，**不放组件里**——Oldfrontend 那版把两百行解析
 * 塞进了 ChatInput.tsx，于是"补全怎么算"和"补全长什么样"绑死在一起，
 * 想换个 UI 就得把算法一起搬走。这里只吐候选，渲染是别人的事。
 */

export type Completion = {
  /** 选中它之后整行变成什么 */
  replacement: string;
  /** 列表里显示的主文本 */
  label: string;
  description: string;
};

type Parsed = {
  commandName: string;
  args: string[];
  /** 光标正在填第几个参数 */
  currentIndex: number;
  currentArg: string;
  /** 命令名本身还没打完（后面没有空格） */
  completingName: boolean;
};

function parse(input: string): Parsed | null {
  if (!input.startsWith("/")) return null;

  const body = input.slice(1);
  const hasTrailingSpace = /\s$/.test(body);
  const parts = body.trim().length === 0 ? [] : body.trim().split(/\s+/);

  const commandName = (parts[0] ?? "").toLowerCase();
  const args = parts.slice(1);

  return {
    commandName,
    args,
    currentIndex: hasTrailingSpace ? args.length : Math.max(0, args.length - 1),
    currentArg: hasTrailingSpace ? "" : (args[args.length - 1] ?? ""),
    completingName: parts.length <= 1 && !hasTrailingSpace,
  };
}

/**
 * 打分。前缀匹配 > 包含 > 子序列模糊，描述里命中给个低分兜底。
 *
 * 要模糊匹配是因为命令名是英文而玩家未必记得全拼——`tst` 能翻出
 * `testroom` 比"必须打对前几个字母"友好得多。
 */
function score(value: string, description: string, query: string): number {
  if (!query) return 1;

  const name = value.toLowerCase();
  const desc = description.toLowerCase();

  if (name === query) return 1000;
  if (name.startsWith(query)) return 800 - (name.length - query.length);
  if (name.includes(query)) return 500;
  if (desc.includes(query)) return 100;

  // 子序列：查询里的字符按顺序都能在候选里找到，连着出现的加更多分
  let matched = 0;
  let position = -1;
  let fuzzy = 0;
  for (const char of query) {
    const next = name.indexOf(char, position + 1);
    if (next < 0) return 0;
    matched += 1;
    fuzzy += next === position + 1 ? 3 : 1;
    position = next;
  }
  return matched === query.length ? fuzzy + matched * 4 : 0;
}

/** 一次最多列几条。再多列表就比游戏画面还高了 */
const MAX_COMPLETIONS = 8;

export function completionsFor(input: string): Completion[] {
  const parsed = parse(input);
  if (!parsed) return [];

  if (parsed.completingName) {
    const query = parsed.commandName;
    return listCommands()
      .map((command) => ({
        command,
        weight: score(command.name, command.description, query),
      }))
      .filter((entry) => entry.weight > 0)
      .sort(
        (a, b) =>
          b.weight - a.weight || a.command.name.localeCompare(b.command.name),
      )
      .slice(0, MAX_COMPLETIONS)
      .map(({ command }) => ({
        replacement: `/${command.name} `,
        label: `/${command.name}`,
        description: command.description,
      }));
  }

  const command = listCommands().find(
    (entry) => entry.name === parsed.commandName,
  );
  const argument = command?.arguments?.[parsed.currentIndex];
  if (!argument?.suggest) return [];

  const query = parsed.currentArg.toLowerCase();
  const head = `/${parsed.commandName}`;
  const before = parsed.args.slice(0, parsed.currentIndex);

  return argument
    .suggest()
    .map((suggestion: CommandSuggestion) => ({
      suggestion,
      weight: score(suggestion.value, suggestion.description ?? "", query),
    }))
    .filter((entry) => entry.weight > 0)
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        a.suggestion.value.localeCompare(b.suggestion.value),
    )
    .slice(0, MAX_COMPLETIONS)
    .map(({ suggestion }) => ({
      replacement: [head, ...before, suggestion.value].join(" ") + " ",
      label: suggestion.value,
      description: suggestion.description ?? argument.name,
    }));
}

/** 还没开始打参数时，把这条命令的用法显示出来当提示 */
export function usageHintFor(input: string): string | null {
  const parsed = parse(input);
  if (!parsed || parsed.completingName) return null;

  const command = listCommands().find(
    (entry) => entry.name === parsed.commandName,
  );
  return command ? `/${command.usage} — ${command.description}` : null;
}
