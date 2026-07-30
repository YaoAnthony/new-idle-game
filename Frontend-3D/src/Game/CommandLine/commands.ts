/**
 * 命令行系统（V0.3）。调试用的斜杠指令。
 *
 * 这一层不依赖任何渲染器：只负责解析和分发，具体动作由各系统注册处理器。
 * 调 3D 时切昼夜、切天气全靠它——否则要等真实时间或改代码。
 */

export type CommandResult = {
  ok: boolean;
  message: string;
};

export type CommandHandler = (args: string[]) => CommandResult;

export type CommandDefinition = {
  name: string;
  usage: string;
  description: string;
  handler: CommandHandler;
};

const registry = new Map<string, CommandDefinition>();

export function registerCommand(definition: CommandDefinition): () => void {
  registry.set(definition.name, definition);
  return () => registry.delete(definition.name);
}

export function listCommands(): CommandDefinition[] {
  return [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function runCommand(input: string): CommandResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, message: "" };

  const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const [name, ...args] = withoutSlash.split(/\s+/);

  if (name === "help") {
    const lines = listCommands().map(
      (command) => `/${command.usage} — ${command.description}`,
    );
    return {
      ok: true,
      message: lines.length > 0 ? lines.join("\n") : "还没有注册任何指令",
    };
  }

  const command = registry.get(name);
  if (!command) {
    return { ok: false, message: `未知指令：/${name}（试试 /help）` };
  }

  try {
    return command.handler(args);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "指令执行失败",
    };
  }
}

/** 把字符串解析成枚举值，失败时给出可选值提示 */
export function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string,
): T {
  if (value && (allowed as readonly string[]).includes(value)) return value as T;

  throw new Error(`${label} 需要是：${allowed.join(" / ")}`);
}
