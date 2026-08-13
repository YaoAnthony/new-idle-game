import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBug,
  FaCloudSun,
  FaCompass,
  FaExclamationTriangle,
  FaGamepad,
  FaGlobe,
  FaKeyboard,
  FaListOl,
  FaPlay,
  FaRandom,
  FaRedo,
  FaSearch,
  FaTerminal,
  FaTimes,
  FaUndo,
  FaVolumeUp,
} from 'react-icons/fa';
import type { GameSettingsState, GameWeatherSetting, MusicPlaybackMode } from '../../../../../Redux/Features/gameSlice';
import type { CommandInfo } from '../systems/CommandSystem';
import { MINS_PER_DAY } from '../time/GameTime';
import {
  DEFAULT_INPUT_BINDINGS,
  INPUT_ACTIONS,
  inputBindingFromKeyboardEvent,
  normalizeInputBindings,
  type InputAction,
  type InputBindingsState,
} from '../features/input/InputBindingDefinitions';
import { MotionSwitch } from './MotionSwitch';

interface GameSettingsModalProps {
  open: boolean;
  settings: GameSettingsState;
  currentTimeMinute?: number;
  commands?: CommandInfo[];
  controls: InputBindingsState;
  onChange: (patch: Partial<GameSettingsState>) => void;
  onControlsChange?: (controls: InputBindingsState) => void | Promise<void>;
  onNextMusicTrack?: () => void;
  onClose: () => void;
}

type SettingsTab = 'world' | 'audio' | 'interface' | 'controls' | 'debug';

const tabs: Array<{
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'world', label: '世界', icon: FaCloudSun },
  { id: 'audio', label: '声音', icon: FaVolumeUp },
  { id: 'interface', label: '界面', icon: FaGlobe },
  { id: 'controls', label: '控制', icon: FaGamepad },
  { id: 'debug', label: '调试', icon: FaTerminal },
];

function createHotkeyGroups(controls: InputBindingsState) {
  return [
  {
    title: '移动与交互',
    entries: [
      { actionId: 'moveUp' as InputAction, keys: controls.moveUp.labels, action: '向上移动', scope: '游戏世界' },
      { actionId: 'moveDown' as InputAction, keys: controls.moveDown.labels, action: '向下移动', scope: '游戏世界' },
      { actionId: 'moveLeft' as InputAction, keys: controls.moveLeft.labels, action: '向左移动', scope: '游戏世界' },
      { actionId: 'moveRight' as InputAction, keys: controls.moveRight.labels, action: '向右移动', scope: '游戏世界' },
      { actionId: 'interact' as InputAction, keys: controls.interact.labels, action: '使用工具、NPC 交易、建筑/宠物交互', scope: '游戏世界' },
      { actionId: 'chat' as InputAction, keys: controls.chat.labels, action: '和附近 NPC 对话', scope: '未打开聊天时' },
      { actionId: 'command' as InputAction, keys: controls.command.labels, action: '打开命令输入', scope: '未打开聊天时' },
    ],
  },
  {
    title: '背包与物品',
    entries: [
      { keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], action: '选择快捷栏 1 - 9', scope: '游戏世界' },
      { keys: ['0'], action: '选择快捷栏第 10 格', scope: '游戏世界' },
      { keys: ['B'], action: '打开背包', scope: '无其它游戏面板时' },
      { actionId: 'drop' as InputAction, keys: controls.drop.labels, action: '丢弃当前快捷栏物品', scope: '当前格有物品时' },
    ],
  },
  {
    title: '游戏菜单',
    entries: [
      { keys: ['P'], action: '打开游戏商店', scope: '未打开聊天时' },
      { keys: ['J'], action: '打开系列任务', scope: '未打开聊天时' },
      { keys: ['F3'], action: '打开祈愿', scope: '未打开聊天时' },
      { actionId: 'settings' as InputAction, keys: controls.settings.labels, action: '打开系统设置界面', scope: '未打开聊天时' },
      { actionId: 'profilePanel' as InputAction, keys: controls.profilePanel.labels, action: '打开个人面板', scope: '未打开聊天时' },
      { keys: ['Esc'], action: '关闭当前面板，或打开/关闭右侧菜单', scope: '游戏界面' },
    ],
  },
  ];
}

const quickTimes = [
  { label: '清晨', minute: 330, icon: '🌅' },
  { label: '上午', minute: 540, icon: '☀️' },
  { label: '正午', minute: 720, icon: '👑' },
  { label: '黄昏', minute: 1080, icon: '🌇' },
  { label: '夜晚', minute: 1260, icon: '🌙' },
];

const weatherOptions: Array<{
  value: GameWeatherSetting;
  icon: string;
  label: string;
  desc: string;
}> = [
  { value: 'clear', icon: '☀️', label: '晴朗', desc: '风和日丽，微粒漂浮' },
  { value: 'rain', icon: '🌧️', label: '小雨', desc: '静谧中雨，水汽弥漫' },
  { value: 'storm', icon: '⛈️', label: '暴雨', desc: '雷电交加，狂风大作' },
  { value: 'fog', icon: '🌫️', label: '迷雾', desc: '浓厚雾气，视线受阻' },
];

const languageOptions: Array<{
  value: GameSettingsState['uiLanguage'];
  key: 'system' | 'zh' | 'en';
  title: string;
  subtitle: string;
  icon: string;
}> = [
  {
    value: 'system',
    key: 'system',
    title: '跟随系统',
    subtitle: '根据浏览器或电脑系统语言自动选择。',
    icon: '🛰️',
  },
  {
    value: 'zh',
    key: 'zh',
    title: '中文（简体）',
    subtitle: '界面优先显示中文，使用更贴近游戏习惯的本土化术语。',
    icon: '中',
  },
  {
    value: 'en',
    key: 'en',
    title: '英文',
    subtitle: '界面优先使用英文显示。',
    icon: '英',
  },
];

type CommandUsageDoc = {
  usage: string;
  explanation: string;
  arguments: string[];
};

const MAX_MINUTE_OF_DAY = MINS_PER_DAY - 1;

const knownCommandDocs: Record<string, CommandUsageDoc> = {
  weather: {
    usage: '/weather clear | /weather rain | /weather storm | /weather fog',
    explanation: '切换当前地图天气，并刷新环境音乐。',
    arguments: ['clear: 晴天', 'rain: 下雨', 'storm: 雷雨', 'fog: 雾天'],
  },
  music: {
    usage: '/music list | /music play <key> | /music auto | /music stop',
    explanation: '查看、指定、恢复自动播放或停止背景音乐。',
    arguments: ['list: 查看曲目', 'play <key>: 播放指定音乐', 'auto: 恢复自动音乐', 'stop: 停止音乐'],
  },
  time: {
    usage: `/time set <0-${MAX_MINUTE_OF_DAY}>`,
    explanation: '跳转到指定游戏内分钟数。例：480 是 08:00。',
    arguments: ['set: 设置时间', `<0-${MAX_MINUTE_OF_DAY}>: 一天内的分钟数`],
  },
  debug: {
    usage: '/debug on | /debug off',
    explanation: '开关 Phaser 物理碰撞调试显示。',
    arguments: ['on: 显示物理框', 'off: 隐藏物理框'],
  },
  pathline: {
    usage: '/pathline on | /pathline off | /pathline status',
    explanation: '开关 NPC 寻路路线显示，方便看智能移动路径。',
    arguments: ['on: 显示路径', 'off: 隐藏路径', 'status: 查看状态'],
  },
  shadow: {
    usage: '/shadow on | /shadow off | /shadow status',
    explanation: '开关光照和阴影系统。',
    arguments: ['on: 开启阴影', 'off: 关闭阴影', 'status: 查看状态'],
  },
  agent: {
    usage: '/agent brain start | /agent brain stop | /agent brain status',
    explanation: '控制 NPC 自主思考系统。',
    arguments: ['brain: NPC 大脑模块', 'start/on: 启动', 'stop/off: 暂停', 'status: 查看状态'],
  },
  event: {
    usage: '/event <storyline> [event]',
    explanation: '直接启动一个已加载剧情事件，用于调试不明显或不易自然触发的剧情。',
    arguments: ['<storyline>: 选择剧情', '[event]: 可选章节'],
  },
  bus: {
    usage: '/bus arrive | /bus open | /bus close | /bus leave | /bus loop | /bus remove',
    explanation: '调试大巴到站、开门、离站和循环演出。',
    arguments: ['arrive: 到站', 'open: 开门', 'close: 关门', 'leave: 离站', 'loop: 播放完整循环', 'remove: 移除大巴'],
  },
  saving: {
    usage: '/saving delete',
    explanation: '删除当前世界存档并重新载入新世界。',
    arguments: ['delete: 删除存档'],
  },
  sleep: {
    usage: '/sleep | /sleep threshold <0-1>',
    explanation: '夜晚尝试跳到早晨，或设置多人睡觉跳夜阈值。',
    arguments: ['无参数: 夜晚跳到早晨', 'threshold <0-1>: 设置跳夜比例'],
  },
  help: {
    usage: '/help',
    explanation: '列出所有可用指令。',
    arguments: ['无参数'],
  },
  getinventory: {
    usage: '/getInventory <npc name>',
    explanation: '查看指定 NPC 当前背包内容；不填名称时查看默认 NPC。',
    arguments: ['<npc name>: NPC 名称，可省略'],
  },
};

const fallbackCommandNames = ['time', 'weather', 'agent', 'debug', 'pathline', 'sleep', 'music', 'help'];

const musicPlaybackModeOptions: Array<{
  value: MusicPlaybackMode;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'shuffle', label: '乱序', hint: '随机播放完整歌单', icon: FaRandom },
  { value: 'sequence', label: '顺序', hint: '按曲目列表推进', icon: FaListOl },
  { value: 'repeat-one', label: '单曲', hint: '循环当前音乐', icon: FaRedo },
];

function formatMinute(minute: number) {
  const safeMinute = Math.max(0, Math.min(MAX_MINUTE_OF_DAY, Math.round(minute)));
  const hour = Math.floor(safeMinute / 60).toString().padStart(2, '0');
  const min = (safeMinute % 60).toString().padStart(2, '0');
  return `${hour}:${min}`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getWeatherLabel(value: GameWeatherSetting) {
  return weatherOptions.find((weather) => weather.value === value)?.label ?? '晴朗';
}

function commandScore(command: CommandInfo, query: string): number {
  const name = command.name.toLowerCase();
  const description = command.description.toLowerCase();
  if (!query) return 1;
  if (name === query) return 100;
  if (name.startsWith(query)) return 80 - Math.max(0, name.length - query.length);
  if (name.includes(query)) return 50;
  if (description.includes(query)) return 20;
  return fuzzyScore(name, query);
}

function fuzzyScore(value: string, query: string): number {
  let matched = 0;
  let position = -1;
  let score = value[0] === query[0] ? 10 : 0;

  for (const char of query) {
    const nextPosition = value.indexOf(char, position + 1);
    if (nextPosition < 0) continue;
    matched += 1;
    score += nextPosition === position + 1 ? 3 : 1;
    position = nextPosition;
  }

  return matched > 0 ? score + matched * 4 - value.length * 0.2 : 0;
}

function deriveArgumentHints(usage: string, fallbackText: string): string[] {
  const angleArgs = [...usage.matchAll(/<([^>]+)>/g)].map((match) => `<${match[1]}>`);
  const options = usage.includes('|')
    ? usage
        .split('|')
        .map((part) => part.trim().replace(/^\/[a-z][\w-]*/i, '').trim())
        .filter(Boolean)
    : [];
  const plainFallback = fallbackText && !fallbackText.includes('/')
    ? fallbackText.split('|').map((part) => part.trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...options, ...angleArgs, ...plainFallback]));
}

function getFallbackCommandDoc(command: CommandInfo): CommandUsageDoc {
  const name = command.name;
  const description = command.description.trim();
  const slashUsage = description.match(/\/[a-z][^.;\n]*/i)?.[0]?.trim();
  const afterColon = description.includes(':') ? description.split(':').slice(1).join(':').trim() : '';
  const usage = slashUsage || (afterColon ? `/${name} ${afterColon}` : `/${name}`);
  const argumentHints = deriveArgumentHints(usage, afterColon);

  return {
    usage,
    explanation: `执行 /${name} 指令。`,
    arguments: argumentHints.length > 0 ? argumentHints : ['无参数或未声明参数'],
  };
}

function getCommandDoc(command: CommandInfo): CommandUsageDoc {
  return knownCommandDocs[command.name.toLowerCase()] ?? getFallbackCommandDoc(command);
}

function fallbackCommands(): CommandInfo[] {
  return fallbackCommandNames.map((name) => ({
    name,
    description: knownCommandDocs[name]?.explanation ?? `/${name}`,
  }));
}

function PixelStyles() {
  return (
    <style>
      {`
        @import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');

        .game-settings-pixel {
          font-family: "Noto Sans SC", Inter, "Microsoft YaHei", system-ui, sans-serif;
        }

        .game-settings-pixel .font-pixel {
          font-family: "Silkscreen", "Courier New", Courier, monospace;
          letter-spacing: 0;
        }

        .game-settings-pixel .font-mono {
          font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
          letter-spacing: 0;
        }

        .game-settings-pixel > :not(.settings-bg-layer) {
          position: relative;
          z-index: 2;
        }

        .game-settings-pixel .settings-bg-layer {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
          background: linear-gradient(180deg, #0e0f14 0%, #12131a 48%, #181a24 100%);
        }

        .game-settings-pixel .settings-bg-layer::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.28;
          background-image:
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px);
          background-size: 32px 32px;
        }

        .game-settings-pixel .settings-bg-layer::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 24% 12%, rgba(88, 28, 135, 0.22), transparent 34%),
            radial-gradient(circle at 76% 88%, rgba(245, 158, 11, 0.10), transparent 38%),
            radial-gradient(circle at 88% 10%, rgba(250, 204, 21, 0.06), transparent 26%);
        }

        .game-settings-pixel input[type="range"] {
          accent-color: #f59e0b;
        }

        .game-settings-pixel .pixel-scrollbar::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        .game-settings-pixel .pixel-scrollbar::-webkit-scrollbar-track {
          background: #12131a;
          border: 2px solid #2d3748;
        }

        .game-settings-pixel .pixel-scrollbar::-webkit-scrollbar-thumb {
          background: #4b5563;
          border: 2px solid #1a1c26;
        }

        .game-settings-pixel .pixel-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #eab308;
        }
      `}
    </style>
  );
}

function CommandChip({
  children,
  onClick,
  pulse = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  pulse?: boolean;
}) {
  const className = [
    'text-[10px] bg-zinc-900 text-green-400 border border-zinc-800 px-2 py-1 rounded-md transition duration-150 flex items-center gap-1',
    onClick ? 'hover:border-amber-500/70 cursor-pointer active:scale-95' : '',
    pulse ? 'animate-pulse' : '',
  ].join(' ');

  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

function SectionCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition duration-150 hover:border-zinc-700 ${className}`}>
      {children}
    </section>
  );
}

function SectionHeading({
  children,
  meta,
}: {
  children: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="font-pixel flex items-center gap-1.5 text-sm font-bold tracking-normal text-amber-400">
        <span className="block h-3 w-1.5 bg-amber-400" />
        {children}
      </h3>
      {meta && <span className="font-mono text-[9px] font-bold uppercase text-zinc-500">{meta}</span>}
    </div>
  );
}

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-7 min-w-8 items-center justify-center rounded-md border border-amber-500/25 bg-amber-950/20 px-2 py-1 font-mono text-[11px] font-bold text-amber-300 shadow-inner">
      {children}
    </span>
  );
}

function CommandUsagePill({ children }: { children: React.ReactNode }) {
  return (
    <code className="inline-flex rounded-md border border-amber-500/25 bg-amber-950/20 px-2 py-1 font-mono text-[11px] font-bold leading-tight text-amber-300">
      {children}
    </code>
  );
}

export function GameSettingsModal({
  open,
  settings,
  currentTimeMinute,
  commands = [],
  controls,
  onChange,
  onControlsChange,
  onNextMusicTrack,
  onClose,
}: GameSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('world');
  const [commandSearch, setCommandSearch] = useState('');
  const [controlsSearch, setControlsSearch] = useState('');
  const [capturingAction, setCapturingAction] = useState<InputAction | null>(null);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [controlsSaving, setControlsSaving] = useState(false);
  const [densityProfile, setDensityProfile] = useState(1);
  const normalizedControls = useMemo(() => normalizeInputBindings(controls), [controls]);

  const displayedTimeMinute = typeof currentTimeMinute === 'number'
    ? Math.max(0, Math.min(MAX_MINUTE_OF_DAY, Math.round(currentTimeMinute)))
    : settings.timeMinute;
  const masterVolumePercent = clampPercent((typeof settings.masterVolume === 'number' ? settings.masterVolume : 1) * 100);
  const audioVolumePercent = clampPercent((typeof settings.audioVolume === 'number' ? settings.audioVolume : 0.6) * 100);
  const musicVolumePercent = clampPercent((typeof settings.musicVolume === 'number' ? settings.musicVolume : 0.1) * 100);
  const musicPlaybackMode = settings.musicPlaybackMode ?? 'shuffle';
  const musicPlaybackModeIndex = Math.max(0, musicPlaybackModeOptions.findIndex((option) => option.value === musicPlaybackMode));
  const sleepSkipPercent = clampPercent((typeof settings.sleepThreshold === 'number' ? settings.sleepThreshold : 0) * 100);
  const commandSource = commands.length > 0 ? commands : fallbackCommands();
  const commandList = useMemo(() => {
    const query = commandSearch.trim().replace(/^\//, '').toLowerCase();
    return commandSource
      .map((command) => ({ command, score: commandScore(command, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
      .map(({ command }) => command);
  }, [commandSearch, commandSource]);

  const hotkeyRows = useMemo(() => (
    createHotkeyGroups(normalizedControls).flatMap((group) => (
      group.entries.map((entry, index) => ({ group: group.title, entry, index }))
    ))
  ), [normalizedControls]);

  const filteredHotkeyRows = useMemo(() => {
    const query = controlsSearch.trim().toLowerCase();
    if (!query) return hotkeyRows;
    return hotkeyRows.filter(({ group, entry }) => (
      group.toLowerCase().includes(query)
      || entry.action.toLowerCase().includes(query)
      || entry.scope.toLowerCase().includes(query)
      || entry.keys.some((key) => key.toLowerCase().includes(query))
    ));
  }, [controlsSearch, hotkeyRows]);

  const commitControls = useCallback(async (nextControls: InputBindingsState) => {
    if (!onControlsChange) return;
    setControlsSaving(true);
    setControlsError(null);
    try {
      await onControlsChange(nextControls);
    } catch (error) {
      console.warn('[GameSettingsModal] failed to save controls', error);
      setControlsError('键位保存失败，请稍后再试。');
    } finally {
      setControlsSaving(false);
    }
  }, [onControlsChange]);

  const rebindControl = useCallback(async (actionId: InputAction, event: KeyboardEvent) => {
    const binding = inputBindingFromKeyboardEvent(event);
    if (!binding) {
      setControlsError('这个按键暂时不能绑定。');
      return;
    }
    const code = binding.codes[0];
    const conflict = INPUT_ACTIONS.find((action) =>
      action !== actionId && normalizedControls[action].codes.includes(code),
    );
    if (conflict) {
      setControlsError(`这个按键已经绑定给 ${normalizedControls[conflict].labels.join('/')} 对应的其它动作。`);
      return;
    }
    const nextControls = normalizeInputBindings({
      ...normalizedControls,
      [actionId]: binding,
    });
    await commitControls(nextControls);
    setCapturingAction(null);
  }, [commitControls, normalizedControls]);

  useEffect(() => {
    if (!capturingAction) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setCapturingAction(null);
        setControlsError(null);
        return;
      }
      void rebindControl(capturingAction, event);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturingAction, rebindControl]);

  const resetControlsToDefault = useCallback(() => {
    void commitControls(normalizeInputBindings(DEFAULT_INPUT_BINDINGS));
    setCapturingAction(null);
  }, [commitControls]);

  const liveCommandPresets = [
    { label: `/time set ${displayedTimeMinute}`, action: () => onChange({ timeMinute: displayedTimeMinute }) },
    { label: `/weather ${settings.weather}`, action: () => onChange({ weather: settings.weather }) },
    { label: `/agent brain ${settings.agentBrainEnabled === false ? 'on' : 'off'}`, action: () => onChange({ agentBrainEnabled: settings.agentBrainEnabled === false }) },
    { label: `/sleep threshold ${settings.sleepThreshold.toFixed(2)}`, action: () => onChange({ sleepThreshold: settings.sleepThreshold }) },
    { label: `/debug ${settings.physicsDebug ? 'off' : 'on'}`, action: () => onChange({ physicsDebug: !settings.physicsDebug }) },
    { label: `/pathline ${settings.pathLineEnabled ? 'off' : 'on'}`, action: () => onChange({ pathLineEnabled: !settings.pathLineEnabled }) },
  ];

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="游戏设置"
      className="absolute inset-0 z-[430] grid place-items-center bg-black/60 text-slate-100"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <PixelStyles />
      <div className="game-settings-pixel relative flex h-[min(760px,calc(100vh-92px))] w-[min(1120px,calc(100vw-72px))] max-h-[820px] flex-col overflow-hidden rounded-xl border-4 border-zinc-900 bg-zinc-950 text-slate-100 shadow-2xl">
        <div className="settings-bg-layer" />

        <header className="relative border-b-4 border-zinc-900 bg-gradient-to-r from-zinc-900/88 via-zinc-900/78 to-zinc-950/70 px-6 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="font-pixel rounded border border-amber-800/40 bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-normal text-amber-500">
                  游戏配置
                </span>
                <span className="text-[10px] text-zinc-500">预览版 1.43.0</span>
              </div>
              <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-normal text-white md:text-3xl">
                <FaCompass className="h-7 w-7 rotate-12 text-amber-400" />
                <span>游戏设置</span>
                <span className="ml-2 hidden rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-normal text-zinc-400 md:inline">
                  像素冒险设置台
                </span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <CommandChip onClick={() => onChange({ timeMinute: displayedTimeMinute })}>
                时间 {formatMinute(displayedTimeMinute)}
              </CommandChip>
              <CommandChip onClick={() => onChange({ weather: settings.weather })}>
                天气 {getWeatherLabel(settings.weather)}
              </CommandChip>
              <CommandChip
                pulse
                onClick={() => onChange({ agentBrainEnabled: settings.agentBrainEnabled === false })}
              >
                智能 NPC {settings.agentBrainEnabled === false ? '关闭' : '开启'}
              </CommandChip>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭游戏设置"
            className="absolute right-4 top-4 rounded-lg border-2 border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 transition-all hover:border-red-600 hover:bg-red-950 hover:text-white active:scale-90"
          >
            <FaTimes className="h-3.5 w-3.5" />
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 border-b-2 border-zinc-800 bg-zinc-900/78 p-2.5" aria-label="游戏设置导航">
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative box-border flex min-w-[90px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all md:min-w-[124px] md:text-sm ${
                  selected
                    ? 'translate-y-[1px] border-2 border-amber-400 bg-zinc-950 text-amber-400 shadow-[inset_0_4px_0_0_#f2c94c]'
                    : 'border border-zinc-700/60 bg-zinc-800/80 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </span>
                {selected && <span className="absolute -bottom-1 left-12 right-12 h-1 rounded-full bg-amber-400" />}
              </button>
            );
          })}
        </nav>

        <main className="pixel-scrollbar min-h-0 flex-1 overflow-y-auto bg-zinc-950/24 p-5 md:p-6">
          {activeTab === 'world' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <SectionCard className="lg:col-span-7">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-pixel flex items-center gap-1.5 text-sm font-bold tracking-normal text-amber-400">
                    <span className="block h-3 w-1.5 bg-amber-400" />
                    时间设置
                  </h3>
                  <span className="rounded border border-amber-500/20 bg-zinc-950 px-3 py-1 font-mono text-base font-bold text-amber-400 shadow-inner">
                    {formatMinute(displayedTimeMinute)}
                  </span>
                </div>

                <div className="relative mb-6">
                  <input
                    type="range"
                    min={0}
                    max={MAX_MINUTE_OF_DAY}
                    step={15}
                    value={displayedTimeMinute}
                    onChange={(event) => onChange({ timeMinute: Number(event.target.value) })}
                    className="inline-block h-3 w-full cursor-pointer rounded-lg outline-none"
                    style={{
                      background: 'linear-gradient(to right, #6d28d9 0%, #a21caf 30%, #f59e0b 50%, #6d28d9 100%)',
                    }}
                  />
                  <div className="mt-2 flex justify-between px-1 font-mono text-[10px] text-zinc-500">
                    <span>00:00 夜</span>
                    <span>06:00 晨</span>
                    <span>12:00 午</span>
                    <span>18:00 暮</span>
                    <span>24:00 夜</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-5 gap-2">
                  {quickTimes.map((timePreset) => {
                    const active = Math.abs(displayedTimeMinute - timePreset.minute) <= 60;
                    return (
                      <button
                        key={timePreset.label}
                        type="button"
                        onClick={() => onChange({ timeMinute: timePreset.minute })}
                        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border px-1 py-3 transition duration-150 active:scale-95 ${
                          active
                            ? 'border-amber-400 bg-amber-950/70 font-bold text-amber-300 shadow-md'
                            : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        <span className="text-lg">{timePreset.icon}</span>
                        <span className="font-pixel text-[10px] text-slate-100">{timePreset.label}</span>
                        <span className="text-[9px] text-zinc-500">{formatMinute(timePreset.minute)}</span>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard className="lg:col-span-5">
                <SectionHeading meta="粒子效果">天气预览</SectionHeading>
                <div className="grid grid-cols-2 gap-3">
                  {weatherOptions.map((weather) => {
                    const active = settings.weather === weather.value;
                    return (
                      <button
                        key={weather.value}
                        type="button"
                        onClick={() => onChange({ weather: weather.value })}
                        className={`relative flex h-24 cursor-pointer flex-col justify-between rounded-xl border-2 p-3 text-left transition-all duration-150 active:scale-[0.98] ${
                          active
                            ? 'border-amber-400 bg-amber-950/50 shadow-md ring-1 ring-amber-500/20'
                            : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="text-2xl">{weather.icon}</span>
                          {active && (
                            <span className="font-pixel rounded bg-amber-400 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-950">
                              已选
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-white">
                            <span>{weather.label}</span>
                          </div>
                          <p className="mt-0.5 w-full truncate text-[9px] text-zinc-400">
                            {weather.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard className="md:col-span-6 lg:col-span-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex shrink-0 items-center justify-center rounded border border-indigo-800 bg-indigo-950 p-1">
                      <span className="text-sm">🧠</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-pixel text-xs font-bold text-indigo-400">智能 NPC</h3>
                    </div>
                  </div>
                  <MotionSwitch
                    checked={settings.agentBrainEnabled !== false}
                    onCheckedChange={(agentBrainEnabled) => onChange({ agentBrainEnabled })}
                    ariaLabel="切换智能 NPC"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[10px]">
                  <div className="flex gap-2 text-zinc-400">
                    <span className="text-amber-500">◆</span>
                    <span>当前状态：</span>
                  </div>
                  <div className="break-all text-right font-semibold text-zinc-200">
                    {settings.agentBrainEnabled !== false ? '已开启自主寻路' : '已暂停自主行动'}
                  </div>
                </div>
              </SectionCard>

              <SectionCard className="md:col-span-6 lg:col-span-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex shrink-0 items-center justify-center rounded border border-teal-800 bg-teal-950 p-1">
                      <span className="text-sm">💤</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-pixel text-xs font-bold text-teal-400">睡眠跳过比例</h3>
                    </div>
                  </div>
                  <span className="rounded border border-teal-800/40 bg-teal-950/60 px-2.5 py-0.5 font-mono text-xs font-bold text-teal-400">
                    {sleepSkipPercent}%
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={sleepSkipPercent}
                    onChange={(event) => onChange({ sleepThreshold: clamp01(Number(event.target.value) / 100) })}
                    className="h-2 flex-1 cursor-pointer rounded border border-zinc-800 bg-zinc-950 outline-none"
                  />
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => onChange({ sleepThreshold: 0 })}
                      className="font-pixel cursor-pointer rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[9px] text-zinc-400 hover:bg-zinc-900 active:scale-95"
                    >
                      最低
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange({ sleepThreshold: 1 })}
                      className="font-pixel cursor-pointer rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[9px] text-zinc-400 hover:bg-zinc-900 active:scale-95"
                    >
                      最高
                    </button>
                  </div>
                </div>
              </SectionCard>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-12">
              <SectionCard className="md:col-span-2 lg:col-span-12">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-pixel flex items-center gap-1.5 text-sm font-bold tracking-normal text-amber-400">
                    <span className="block h-3 w-1.5 bg-amber-400" />
                    总体音量
                  </h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded border border-amber-500/20 bg-zinc-950 px-3 py-1 font-mono text-sm font-bold text-amber-400 shadow-inner">
                      {masterVolumePercent}%
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange({ musicBackgroundPlayback: settings.musicBackgroundPlayback === false })}
                      className={`font-pixel cursor-pointer rounded-lg border px-2.5 py-1 text-[10px] transition active:scale-95 ${
                        settings.musicBackgroundPlayback !== false
                          ? 'border-amber-400 bg-amber-950/70 font-semibold text-amber-300'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-500'
                      }`}
                    >
                      后台：{settings.musicBackgroundPlayback !== false ? '开' : '关'}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="font-bold text-zinc-300">全局输出</span>
                    <span className="text-[10px] text-zinc-500">音乐和音效都会经过这一层；后台按钮控制离开页面后是否继续播放。</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl">🔈</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={masterVolumePercent}
                      onChange={(event) => onChange({ masterVolume: clamp01(Number(event.target.value) / 100) })}
                      className="h-2 flex-1 cursor-pointer rounded outline-none"
                      style={{ background: '#12131a' }}
                    />
                    <span className="text-xl">🔊</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard className="lg:col-span-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-pixel flex items-center gap-1.5 text-sm font-bold tracking-normal text-amber-400">
                    <span className="block h-3 w-1.5 bg-amber-400" />
                    音效设置
                  </h3>
                  <button
                    type="button"
                    onClick={() => onChange({ audioEnabled: settings.audioEnabled === false })}
                    className={`font-pixel cursor-pointer rounded-lg border px-2.5 py-1 text-[10px] transition active:scale-95 ${
                      settings.audioEnabled !== false
                        ? 'border-green-500 bg-green-950/70 font-semibold text-green-400'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-500'
                    }`}
                  >
                    状态：{settings.audioEnabled !== false ? '开启' : '关闭'}
                  </button>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="font-bold text-zinc-300">音效音量</span>
                    <span className="font-mono font-bold text-amber-400">{audioVolumePercent}%</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl">🔉</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      disabled={settings.audioEnabled === false}
                      value={audioVolumePercent}
                      onChange={(event) => onChange({ audioVolume: clamp01(Number(event.target.value) / 100) })}
                      className="h-2 flex-1 cursor-pointer rounded outline-none disabled:cursor-not-allowed disabled:opacity-30"
                      style={{ background: '#12131a' }}
                    />
                    <span className="text-xl">🔊</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard className="lg:col-span-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-pixel flex items-center gap-1.5 text-sm font-bold tracking-normal text-amber-400">
                    <span className="block h-3 w-1.5 bg-amber-400" />
                    音乐设置
                  </h3>
                  <button
                    type="button"
                    onClick={() => onChange({ musicEnabled: settings.musicEnabled === false })}
                    className={`font-pixel cursor-pointer rounded-lg border px-2.5 py-1 text-[10px] transition active:scale-95 ${
                      settings.musicEnabled !== false
                        ? 'border-green-500 bg-green-950/70 font-semibold text-green-400'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-500'
                    }`}
                  >
                    音乐：{settings.musicEnabled !== false ? '播放' : '静音'}
                  </button>
                </div>

                <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 md:flex-row">
                  <div
                    className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-zinc-800 bg-zinc-900 shadow-md ${
                      settings.musicEnabled !== false && musicVolumePercent > 0 ? 'animate-spin' : ''
                    }`}
                    style={{ animationDuration: '8s' }}
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-950 bg-amber-500">
                      <div className="h-1 w-1 rounded-full bg-zinc-950" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 self-stretch">
                    <div className="text-[9px] tracking-normal text-zinc-500">当前音乐</div>
                    <div className="max-w-[260px] truncate text-xs font-bold text-white">自动游戏音乐</div>
                    <div className="mt-0.5 text-[10px] text-zinc-400">通道：游戏音频系统</div>
                  </div>

                  <button
                    type="button"
                    onClick={onNextMusicTrack}
                    disabled={settings.musicEnabled === false}
                    className="font-pixel flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-2 border-amber-300 bg-amber-500 px-3.5 py-1.5 text-[10px] font-bold text-amber-950 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
                  >
                    <FaPlay className="h-3 w-3" />
                    下一首
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-zinc-300">播放模式</span>
                    <span className="truncate text-[10px] text-zinc-500">
                      {musicPlaybackModeOptions[musicPlaybackModeIndex]?.hint}
                    </span>
                  </div>
                  <div className="relative grid grid-cols-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                    <span
                      className="absolute bottom-1 top-1 rounded-md border border-amber-400 bg-amber-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-transform duration-200"
                      style={{
                        left: 4,
                        width: 'calc((100% - 8px) / 3)',
                        transform: `translateX(${musicPlaybackModeIndex * 100}%)`,
                      }}
                    />
                    {musicPlaybackModeOptions.map((option) => {
                      const selected = musicPlaybackMode === option.value;
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onChange({ musicPlaybackMode: option.value })}
                          className={`font-pixel relative z-10 flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[10px] font-bold transition active:scale-95 ${
                            selected ? 'text-amber-300' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="font-bold text-zinc-300">背景音乐音量</span>
                    <span className="font-mono font-bold text-amber-400">{musicVolumePercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    disabled={settings.musicEnabled === false}
                    value={musicVolumePercent}
                    onChange={(event) => onChange({ musicVolume: clamp01(Number(event.target.value) / 100) })}
                    className="h-2 w-full cursor-pointer rounded outline-none disabled:cursor-not-allowed disabled:opacity-30"
                    style={{ background: '#12131a' }}
                  />
                </div>
              </SectionCard>
            </div>
          )}

          {activeTab === 'interface' && (
            <div className="grid grid-cols-1 gap-4">
              <SectionCard>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-pixel flex items-center gap-1.5 text-sm font-bold tracking-normal text-amber-400">
                    <span className="block h-3 w-1.5 bg-amber-400" />
                    界面语言
                  </h3>
                  <span className="text-[9px] font-bold text-zinc-500">语言选择</span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {languageOptions.map((language) => {
                    const active = (settings.uiLanguage ?? 'system') === language.value;
                    return (
                      <button
                        key={language.value}
                        type="button"
                        onClick={() => onChange({ uiLanguage: language.value })}
                        className={`relative flex h-40 cursor-pointer flex-col justify-between rounded-xl border-2 p-4 text-left transition-all duration-150 hover:border-zinc-700 active:scale-[0.98] ${
                          active
                            ? 'border-amber-400 bg-amber-950/40 shadow-lg'
                            : 'border-zinc-800 bg-zinc-950/60'
                        }`}
                      >
                        <div className="mb-3 flex w-full items-center justify-between">
                          <span className="flex h-12 min-w-12 items-center justify-center rounded border border-zinc-800 bg-zinc-900/80 p-1.5 text-2xl font-black text-amber-300 shadow">
                            {language.icon}
                          </span>
                          {active && (
                            <div className="font-pixel rounded-md border-b-2 border-amber-600 bg-amber-400 px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-normal text-amber-950">
                              已启用
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="flex items-center gap-1.5 text-sm font-bold text-white">
                            <span>{language.title}</span>
                          </h4>
                          <p className="mt-1 line-clamp-3 text-[10px] leading-relaxed text-zinc-400">
                            {language.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard>
                <h4 className="font-pixel mb-3 text-xs font-bold text-amber-400">界面字体缩放</h4>
                <p className="mb-4 text-[10px] leading-relaxed text-zinc-400">
                  调节像素地图上信息文字、提示气泡及指令调试控制台的整体排版密度。
                </p>

                <div className="flex flex-col gap-2 md:flex-row">
                  {['紧凑像素', '规则标准', '复古大字'].map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setDensityProfile(index)}
                      className={`flex-1 cursor-pointer rounded-lg border py-2.5 text-center text-xs font-semibold transition active:scale-95 ${
                        densityProfile === index
                          ? 'border-amber-400 bg-amber-950/60 font-bold text-amber-300'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          {activeTab === 'controls' && (
            <div className="flex flex-col gap-4">
              <SectionCard className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex shrink-0 items-center justify-center rounded border border-zinc-800 bg-zinc-950 p-2 text-xl">
                    <FaKeyboard className="h-5 w-5 text-amber-400" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-pixel text-xs font-bold text-zinc-100">快捷键键位总览</h3>
                    <p className="text-[10px] text-zinc-400">
                      输入框、NPC 对话或者呼出控制台时，移动热键将自动避让。
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-amber-500/20 bg-amber-950/60 px-3 py-1 font-mono text-xs font-bold text-amber-400 shadow-inner">
                    {hotkeyRows.length} 个快捷键
                  </span>
                  <button
                    type="button"
                    onClick={() => setControlsSearch('')}
                    className="font-pixel flex cursor-pointer items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[9px] text-zinc-400 hover:text-white active:scale-95"
                  >
                    <FaUndo className="h-3 w-3 text-zinc-500" />
                    清空搜索
                  </button>
                  <button
                    type="button"
                    onClick={resetControlsToDefault}
                    disabled={controlsSaving || !onControlsChange}
                    className="font-pixel flex cursor-pointer items-center gap-1 rounded border border-amber-500/25 bg-amber-950/40 px-2.5 py-1 text-[9px] text-amber-200 hover:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95"
                  >
                    <FaRedo className="h-3 w-3" />
                    恢复默认
                  </button>
                </div>
              </SectionCard>

              {(capturingAction || controlsError) && (
                <div className={`rounded-lg border px-4 py-3 text-xs font-bold ${
                  controlsError
                    ? 'border-red-500/30 bg-red-950/40 text-red-200'
                    : 'border-amber-500/30 bg-amber-950/40 text-amber-200'
                }`}
                >
                  {controlsError ?? `正在重设 ${capturingAction}，请按下新的键位。按 Esc 取消。`}
                </div>
              )}

              <div className="relative">
                <FaSearch className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="search"
                  placeholder='搜索快捷键... 如："W" 或 "背包"'
                  value={controlsSearch}
                  onChange={(event) => setControlsSearch(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-4 text-xs text-zinc-200 outline-none selection:bg-amber-950 placeholder:text-zinc-500 focus:border-amber-400"
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
                <div className="pixel-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900 text-[10px] font-bold uppercase tracking-normal text-zinc-500">
                        <th className="font-pixel px-4 py-3">分组</th>
                        <th className="font-pixel px-4 py-3 text-center">绑定按键</th>
                        <th className="font-pixel px-4 py-3">作用</th>
                        <th className="font-pixel px-4 py-3">生效条件</th>
                        <th className="font-pixel px-4 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 font-mono text-zinc-300">
                      {filteredHotkeyRows.length > 0 ? (
                        filteredHotkeyRows.map(({ group, entry, index }) => (
                          <tr key={`${group}-${entry.keys.join('-')}`} className="transition hover:bg-zinc-800/35">
                            <td className="w-36 px-4 py-3 font-bold text-zinc-400">{index === 0 ? group : ''}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap justify-center gap-1.5">
                                {entry.keys.map((key) => <Keycap key={key}>{key}</Keycap>)}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-zinc-100">{entry.action}</div>
                            </td>
                            <td className="px-4 py-3 text-zinc-400">{entry.scope}</td>
                            <td className="px-4 py-3 text-right">
                              {'actionId' in entry && entry.actionId ? (
                                <button
                                  type="button"
                                  disabled={controlsSaving || !onControlsChange}
                                  onClick={() => {
                                    setControlsError(null);
                                    setCapturingAction(entry.actionId);
                                  }}
                                  className="font-pixel rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[9px] text-zinc-300 hover:border-amber-400 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {capturingAction === entry.actionId ? '按键中...' : '重设'}
                                </button>
                              ) : (
                                <span className="text-[10px] text-zinc-600">固定</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center font-bold text-zinc-500">
                            没有找到快捷键。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'debug' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SectionCard>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="rounded border border-red-800/50 bg-red-950/60 p-2 text-red-300">
                        <FaBug className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="font-pixel text-xs font-bold text-zinc-100">物理调试</h3>
                        <p className="text-[10px] text-zinc-400">显示 Phaser 物理碰撞框。</p>
                      </div>
                    </div>
                    <MotionSwitch
                      checked={settings.physicsDebug}
                      onCheckedChange={(physicsDebug) => onChange({ physicsDebug })}
                      ariaLabel="切换物理调试"
                      tone="red"
                    />
                  </div>
                </SectionCard>

                <SectionCard>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="rounded border border-amber-800/50 bg-amber-950/60 p-2 text-amber-300">
                        <FaGamepad className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="font-pixel text-xs font-bold text-zinc-100">路径线</h3>
                        <p className="text-[10px] text-zinc-400">显示 NPC 寻路路线。</p>
                      </div>
                    </div>
                    <MotionSwitch
                      checked={settings.pathLineEnabled}
                      onCheckedChange={(pathLineEnabled) => onChange({ pathLineEnabled })}
                      ariaLabel="切换路径线"
                      tone="amber"
                    />
                  </div>
                </SectionCard>
              </div>

              <SectionCard>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-pixel text-xs font-bold text-zinc-100">常用指令</h3>
                    <p className="text-[10px] text-zinc-400">点击即可应用常用调试设置。</p>
                  </div>
                  <span className="text-[9px] font-bold text-zinc-500">快捷设置</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {liveCommandPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={preset.action}
                      className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 font-mono text-[11px] font-bold text-green-400 transition hover:border-amber-500/70 active:scale-95"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </SectionCard>

              <div className="relative">
                <FaSearch className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="search"
                  value={commandSearch}
                  onChange={(event) => setCommandSearch(event.target.value)}
                  placeholder="搜索指令、说明或参数"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-20 text-xs text-zinc-200 outline-none selection:bg-amber-950 placeholder:text-zinc-500 focus:border-amber-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-amber-500/20 bg-amber-950/60 px-2.5 py-1 font-mono text-[10px] font-bold text-amber-400">
                  {commandList.length}/{commandSource.length}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
                <div className="pixel-scrollbar max-h-[360px] overflow-auto">
                  {commandList.length > 0 ? (
                    <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900 text-[10px] font-bold uppercase tracking-normal text-zinc-500">
                          <th className="font-pixel px-4 py-3">基础指令</th>
                          <th className="font-pixel px-4 py-3">怎么用</th>
                          <th className="font-pixel px-4 py-3">可用参数</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800 font-mono text-zinc-300">
                        {commandList.map((command) => {
                          const doc = getCommandDoc(command);
                          return (
                            <tr key={command.name} className="align-top transition hover:bg-zinc-800/35">
                              <td className="w-40 px-4 py-3">
                                <CommandUsagePill>/{command.name}</CommandUsagePill>
                              </td>
                              <td className="px-4 py-3">
                                <div className="grid gap-2">
                                  <strong className="text-xs text-zinc-100">{doc.explanation}</strong>
                                  <span className="text-[11px] leading-relaxed text-zinc-400">{doc.usage}</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {doc.usage.split('|').map((part) => (
                                      <CommandUsagePill key={`${command.name}-${part.trim()}`}>{part.trim()}</CommandUsagePill>
                                    ))}
                                  </div>
                                </div>
                              </td>
                              <td className="w-72 px-4 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {doc.arguments.map((argument) => (
                                    <span
                                      key={`${command.name}-${argument}`}
                                      className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2 py-1 text-[11px] font-bold leading-tight text-blue-300"
                                    >
                                      {argument}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="grid min-h-40 place-items-center text-xs font-bold text-zinc-500">没有找到指令。</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 text-[11px] text-zinc-300">
                <FaExclamationTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>这里显示的调试指令来自真实指令注册表；场景尚未注册的指令不会出现在列表中。</span>
              </div>
            </div>
          )}
        </main>

        <footer className="flex items-center justify-end border-t border-zinc-900 bg-zinc-950/82 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="font-pixel rounded-lg border-2 border-amber-300 bg-amber-500 px-5 py-2 text-[10px] font-bold text-amber-950 transition hover:bg-amber-600 active:scale-95"
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
