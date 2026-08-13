/**
 * CommandSystem — extensible in-game slash-command registry.
 *
 * Usage:
 *   commands.register('weather', 'set weather: clear | rain | storm | fog', (args) => { ... });
 *   const feedback = commands.execute('/weather rain');
 *
 * All handlers receive a string[] of arguments (everything after the command name).
 * Returning a string shows it as player feedback; returning void uses a default ack.
 *
 * Already registered by GameScene:
 *   /weather <clear|rain|storm|fog>   — change weather
 *   /time set <minute>      — jump to in-game minute
 *   /debug <on|off>         — toggle Arcade Physics debug view
 *   /help                   — list all commands
 */

export type CommandHandler = (args: string[]) => string | void;

export interface CommandArgumentSuggestion {
  value: string;
  description?: string;
  argumentIndex?: number;
  after?: string[];
}

export interface CommandInfo {
  name: string;
  description: string;
  argumentSuggestions?: CommandArgumentSuggestion[];
}

interface CommandDef {
  description: string;
  handler: CommandHandler;
  argumentSuggestions: CommandArgumentSuggestion[];
}

export interface CommandRegisterOptions {
  argumentSuggestions?: CommandArgumentSuggestion[];
}

export class CommandSystem {
  private readonly registry = new Map<string, CommandDef>();

  /** Register a command. `name` is case-insensitive; omit the leading slash. */
  register(name: string, description: string, handler: CommandHandler, options: CommandRegisterOptions = {}): void {
    this.registry.set(name.toLowerCase(), {
      description,
      handler,
      argumentSuggestions: options.argumentSuggestions ?? [],
    });
  }

  /**
   * Parse and execute a command string (leading `/` is optional).
   * Returns a player-facing feedback string.
   */
  execute(input: string): string {
    const clean = input.trim().replace(/^\//, '');
    const parts = clean.split(/\s+/);
    const name  = parts[0]?.toLowerCase() ?? '';
    const args  = parts.slice(1);

    if (!name) return '';

    const cmd = this.registry.get(name);
    if (!cmd) {
      return `未知命令: /${name}。输入 /help 查看可用命令。`;
    }

    try {
      return cmd.handler(args) ?? `✓ /${name}`;
    } catch (e) {
      return `命令错误: ${String(e)}`;
    }
  }

  /** Used by /help. */
  listHelp(): string {
    const lines: string[] = ['── 可用命令 ──'];
    for (const [name, def] of this.registry) {
      lines.push(`  /${name}  —  ${def.description}`);
    }
    return lines.join('\n');
  }

  listCommands(): CommandInfo[] {
    return [...this.registry.entries()]
      .map(([name, def]) => ({
        name,
        description: def.description,
        argumentSuggestions: def.argumentSuggestions,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  searchCommands(query: string): CommandInfo[] {
    const needle = query.trim().replace(/^\//, '').toLowerCase();
    const commands = this.listCommands();
    if (!needle) return commands;

    return commands
      .map((command) => ({ command, score: this.matchScore(command, needle) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
      .map(({ command }) => command);
  }

  suggest(input: string): CommandInfo | null {
    const commandText = input.trim().replace(/^\//, '').split(/\s+/)[0] ?? '';
    return this.searchCommands(commandText)[0] ?? null;
  }

  private matchScore(command: CommandInfo, needle: string): number {
    const name = command.name.toLowerCase();
    const description = command.description.toLowerCase();
    if (name === needle) return 100;
    if (name.startsWith(needle)) return 80 - Math.max(0, name.length - needle.length);
    if (name.includes(needle)) return 50;
    if (description.includes(needle)) return 20;
    const fuzzyNameScore = this.fuzzyScore(name, needle);
    if (fuzzyNameScore > 0) return fuzzyNameScore;
    return 0;
  }

  private fuzzyScore(value: string, needle: string): number {
    if (!needle) return 1;
    let matched = 0;
    let position = -1;
    let score = value[0] === needle[0] ? 10 : 0;

    for (const char of needle) {
      const nextPosition = value.indexOf(char, position + 1);
      if (nextPosition < 0) continue;
      matched += 1;
      score += nextPosition === position + 1 ? 3 : 1;
      position = nextPosition;
    }

    return matched > 0 ? score + matched * 4 - value.length * 0.2 : 0;
  }
}
