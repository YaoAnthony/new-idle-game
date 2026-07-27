/**
 * Registers in-game slash commands and keeps command handlers thin.
 */
import Phaser from 'phaser';
import { MINS_PER_DAY } from '../time/GameTime';
import { getAudioEntry, listMusicAudioEntries } from '../audio';
import { gameBus } from '../shared/EventBus';
import { GREEN_HOUSE_MAP_ID } from '../map/transition/MapTransitionSystem';
import { fetchStorylineRuntimePackages } from '../features/storyline';
import { getGameNpcCatalog } from '../shared/GameNpcCatalog';
import { getPetDefinitions } from '../features/pets/PetDefinitions';
import { getGameItemDefinition, getGameItems } from '../shared/gameItems';
import {
  ATTRIBUTE_DEFINITIONS,
  ATTRIBUTE_LABEL_BY_KEY,
  normalizeAttributeKey,
  type AttributeKey,
} from '../../../../../shared/core/protagonistAttributeProgression';

function setAgentBrainEnabled(scene: any, enabled: boolean) : void {
    scene.npcSystem?.setBrainEnabled(enabled);
  
}

function setPhysicsDebug(scene: any, enabled: boolean) : void {
    const world = scene.physics.world;
    scene.playerDebugOverlayEnabled = enabled;

    if (enabled) {
      // Ensure the debug graphic exists (createDebugGraphic also sets drawDebug=true)
      if (!world.debugGraphic) world.createDebugGraphic();
      world.drawDebug = true;
      world.defaults.debugShowBody         = true;
      world.defaults.debugShowStaticBody   = true;
      world.defaults.debugShowVelocity     = false;
      world.defaults.bodyDebugColor        = 0x2ee6a6; // cyan dynamic
      world.defaults.staticBodyDebugColor  = 0xff4d6d; // pink static/wall

      // Phaser sets body.debugShowBody at CREATION time from world.defaults.
      // Bodies created while debug=false have debugShowBody=false permanently
      // unless we patch them all here.
      world.bodies.iterate((body: Phaser.Physics.Arcade.Body) => {
        body.debugShowBody  = true;
        body.debugBodyColor = world.defaults.bodyDebugColor;
        return true;
      });
      (world.staticBodies as Phaser.Structs.Set<Phaser.Physics.Arcade.StaticBody>)
        .iterate((body: Phaser.Physics.Arcade.StaticBody) => {
          body.debugShowBody  = true;
          body.debugBodyColor = world.defaults.staticBodyDebugColor;
          return true;
        });

      world.debugGraphic!.setVisible(true);
      scene.collisionBlockers?.setDebugEnabled?.(true);
      scene.templeMaskDebugSystem?.setEnabled?.(true);
      scene.physicsDebugEnabled = true;
      return;
    }

    world.drawDebug = false;
    if (world.debugGraphic) {
      world.debugGraphic.clear();
      world.debugGraphic.setVisible(false);
    }
    scene.collisionBlockers?.setDebugEnabled?.(false);
    scene.templeMaskDebugSystem?.setEnabled?.(false);
    scene.physicsDebugEnabled = false;
  
}

function refreshAudioDirector(scene: any): void {
    scene.gameAudioSystem?.refreshAmbienceSoon?.(scene.time?.now ?? 0);
}

function setFogOfWarMaskEnabled(scene: any, enabled: boolean): void {
    scene.gameLightingSystem?.setFogOfWarEnabled?.(enabled);
    gameBus.emit('game:settings_patch_requested', { fogOfWarEnabled: enabled });
}

function parseChestCoins(raw: string | undefined): number | null {
    const coins = Number(raw);
    if (!Number.isFinite(coins) || coins <= 0) return null;
    return Math.floor(coins);
}

function parsePositiveInteger(raw: string | undefined): number | null {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) return null;
    return value;
}

function parsePositiveNumber(raw: string | undefined): number | null {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
}

function getMaskRadius(scene: any): number {
    return Math.max(0, Math.floor(Number(scene.initialGameSave?.worldStatus?.temple?.fog?.radius || 0)));
}

function getMaskProgress(scene: any): { level: number; progress: number; required: number } {
    const source = scene.initialGameSave?.worldStatus?.temple?.maskProgress;
    const level = Math.max(0, Math.floor(Number(source?.level || 0)));
    const required = Math.max(1, Math.floor(Number(source?.required || level + 1)));
    const progress = Math.max(0, Math.min(required, Number(source?.progress || 0)));
    return { level, progress, required };
}

const COMMON_TILE_OFFSET_ARGUMENTS = ['-3', '-2', '-1', '0', '1', '2', '3'];
const MAX_MINUTE_OF_DAY = MINS_PER_DAY - 1;

function npcArgumentSuggestions(argumentIndex: number) {
  return getGameNpcCatalog().map((npc) => ({
    value: npc.id,
    description: npc.name,
    argumentIndex,
  }));
}
const BASE_GENERATED_ENTITY_ARGUMENTS = [
  { value: 'bed_pink', description: '粉色床' },
  { value: 'bed_blue', description: '蓝色床' },
  { value: 'nest', description: '鸡窝' },
  { value: 'chicken', description: '鸡' },
  { value: 'chest', description: '奖励箱' },
  { value: 'golem', description: '石傀儡' },
  { value: 'stone_golem', description: '石傀儡' },
  { value: 'cow', description: '牛' },
  { value: 'path', description: '小路' },
  { value: 'slime-green', description: '绿色史莱姆' },
  { value: 'slime-orange', description: '橙色史莱姆' },
  { value: 'slime-blue', description: '蓝色史莱姆' },
  { value: 'apple', description: '苹果掉落物' },
  { value: 'drop:apple', description: '显式生成苹果掉落物' },
  { value: 'debug_projectile', description: '调试投射物' },
  { value: 'debug_blaster', description: '调试武器' },
];

function generatedEntityArgumentSuggestions() {
  return [
    ...BASE_GENERATED_ENTITY_ARGUMENTS,
    ...getPetDefinitions().map((pet) => ({ value: pet.id, description: pet.displayName })),
  ];
}

function gameItemArgumentSuggestions() {
  return Object.values(getGameItems()).map((item) => ({
    value: item.id,
    description: item.nameZh || item.name || item.description || item.id,
    argumentIndex: 0,
  }));
}

function abilityAttributeArgumentSuggestions() {
  return ATTRIBUTE_DEFINITIONS.map((definition) => ({
    value: definition.key,
    description: definition.label,
    argumentIndex: 0,
  }));
}

function abilityActionArgumentSuggestions() {
  return ATTRIBUTE_DEFINITIONS.flatMap((definition) => [
    { value: 'add', description: `增加${definition.label}经验`, argumentIndex: 1, after: [definition.key] },
    { value: 'remove', description: `减少${definition.label}经验`, argumentIndex: 1, after: [definition.key] },
  ]);
}

function formatAbilityCommandUsage(): string {
  const abilities = ATTRIBUTE_DEFINITIONS
    .map((definition) => `${definition.key}(${definition.label})`)
    .join(', ');
  return `Usage: /ability <ability> add|remove <exp>. Abilities: ${abilities}`;
}

function getAbilityLabel(attributeKey: AttributeKey): string {
  return ATTRIBUTE_LABEL_BY_KEY[attributeKey] ?? attributeKey;
}

function getStorylineEventArgumentSuggestions(scene: any) {
  const events = (scene.storylineRuntimeSystem?.listEventRefs?.() ?? []) as Array<{
    key: string;
    storylineId: string;
    storylineTitle: string;
    eventId: string;
    stepCount: number;
  }>;
  const storylines = new Map<string, { storylineId: string; storylineTitle: string; eventCount: number }>();
  for (const eventRef of events) {
    const existing = storylines.get(eventRef.storylineId);
    storylines.set(eventRef.storylineId, {
      storylineId: eventRef.storylineId,
      storylineTitle: eventRef.storylineTitle,
      eventCount: (existing?.eventCount ?? 0) + 1,
    });
  }

  return [
    ...[...storylines.values()].map((storyline) => ({
      value: storyline.storylineId,
      description: `剧情 · ${storyline.storylineTitle} · ${storyline.eventCount} 段`,
      argumentIndex: 0,
    })),
    ...events.map((eventRef) => ({
      value: eventRef.eventId,
      description: `章节 · ${eventRef.eventId} · ${eventRef.stepCount} 步`,
      argumentIndex: 1,
      after: [eventRef.storylineId],
    })),
  ];
}

function resolveStorylineEventCommandArgs(args: string[]): string | undefined {
  if (args.length >= 2) return `${args[0]}.${args[1]}`;
  return args[0];
}

function formatStorylineEventList(events: Array<{
  key: string;
  storylineId: string;
  storylineTitle: string;
  eventId: string;
  stepCount: number;
}>, storylineId?: string): string {
  const groups = new Map<string, typeof events>();
  for (const eventRef of events) {
    const groupKey = `${eventRef.storylineId}\n${eventRef.storylineTitle}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), eventRef]);
  }

  const lines = ['Usage: /event <storyline> [event]'];
  if (!storylineId) {
    lines.push(`Loaded ${groups.size} storylines:`);
    for (const [groupKey, refs] of groups) {
      const [groupStorylineId, storylineTitle] = groupKey.split('\n');
      lines.push(`- ${storylineTitle} (${groupStorylineId}) · ${refs.length} events`);
    }
    return lines.join('\n');
  }

  const filteredEvents = events.filter((eventRef) => eventRef.storylineId.toLowerCase() === storylineId.toLowerCase());
  if (filteredEvents.length === 0) return `Unknown storyline: ${storylineId}`;

  lines.push(`Events in ${storylineId}:`);
  const eventGroup = new Map<string, typeof filteredEvents>();
  for (const eventRef of filteredEvents) {
    const groupKey = `${eventRef.storylineId}\n${eventRef.storylineTitle}`;
    eventGroup.set(groupKey, [...(eventGroup.get(groupKey) ?? []), eventRef]);
  }
  for (const [groupKey, refs] of eventGroup) {
    const [groupStorylineId, storylineTitle] = groupKey.split('\n');
    lines.push(`- ${storylineTitle} (${groupStorylineId})`);
    for (const ref of refs) lines.push(`  · ${ref.eventId} (${ref.stepCount} steps)`);
  }
  return lines.join('\n');
}

function getPlayerTeleportState(scene: any): { x: number; y: number; worldId: string; facing: 'up' | 'down' | 'left' | 'right' } | null {
    const position = scene.playerSystem?.getPosition?.() ?? scene.player?.sprite ?? null;
    if (!position) return null;
    const facing = scene.playerSystem?.getPlayer?.()?.facing ?? scene.player?.facing ?? 'down';
    const normalizedFacing = ['up', 'down', 'left', 'right'].includes(facing) ? facing : 'down';
    return {
      x: position.x,
      y: position.y,
      worldId: scene.getWorldIdAt?.(position.x, position.y) ?? scene.currentMapDefinition?.ref?.worldId ?? 'world:main',
      facing: normalizedFacing,
    };
}

function setPlayerTeleportPosition(scene: any, x: number, y: number, facing?: 'up' | 'down' | 'left' | 'right'): void {
    scene.playerSystem?.clearNavigation?.();
    scene.playerSystem?.setPosition?.(x, y, facing);
    const worldId = scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
    const resolvedFacing = facing ?? scene.playerSystem?.getPlayer?.()?.facing ?? scene.player?.facing ?? 'down';
    scene.actorWorldPresence?.setActorWorld?.({
      actorId: 'player',
      actorKind: 'player',
      worldId,
      x,
      y,
      facing: resolvedFacing,
      visible: true,
    });
    gameBus.emit('mp:relay', {
      type: 'player_world_change',
      payload: {
        worldId,
        x,
        y,
        facing: resolvedFacing,
      },
    });
    const sprite = scene.playerSystem?.getSprite?.() ?? scene.player?.sprite ?? null;
    if (sprite) scene.cameras?.main?.startFollow?.(sprite, true, 0.1, 0.1);
}

export function registerGameSceneCommands(scene: any) : void {
    const musicArgumentSuggestions = [
      { value: 'list', description: '查看音乐列表', argumentIndex: 0 },
      { value: 'play', description: '播放指定音乐', argumentIndex: 0 },
      { value: 'auto', description: '恢复自动音乐', argumentIndex: 0 },
      { value: 'stop', description: '停止音乐', argumentIndex: 0 },
      ...listMusicAudioEntries().map((entry) => ({
        value: entry.id,
        description: entry.label,
        argumentIndex: 1,
        after: ['play'],
      })),
    ];

    // /weather <clear|rain|storm|fog>
    scene.commands.register(
      'weather',
      'set weather: clear | rain | storm | fog',
      (args: string[]) => {
        const w = args[0]?.toLowerCase();
        if (w === 'rain')  { scene.weather.setWeather('rain');  refreshAudioDirector(scene); return 'Weather set to rain'; }
        if (w === 'storm') { scene.weather.setWeather('storm'); refreshAudioDirector(scene); return 'Weather set to storm'; }
        if (w === 'fog')   { scene.weather.setWeather('fog');   refreshAudioDirector(scene); return 'Weather set to fog'; }
        if (w === 'clear') { scene.weather.setWeather('clear'); refreshAudioDirector(scene); return 'Weather set to clear'; }
        return `Usage: /weather clear | /weather rain | /weather storm | /weather fog`;
      },
      {
        argumentSuggestions: [
          { value: 'clear', description: '晴天', argumentIndex: 0 },
          { value: 'rain', description: '下雨', argumentIndex: 0 },
          { value: 'storm', description: '雷雨', argumentIndex: 0 },
          { value: 'fog', description: '雾天', argumentIndex: 0 },
        ],
      },
    );

    scene.commands.register(
      'music',
      'control music: /music list | /music play <key> | /music auto | /music stop',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        const tracks = listMusicAudioEntries();

        if (mode === 'list' || !mode) {
          return [
            'Music tracks:',
            ...tracks.map((entry) => `  ${entry.id} - ${entry.label}`),
            'Usage: /music play music.travelers',
          ].join('\n');
        }

        if (mode === 'play') {
          const rawKey = args.slice(1).join(' ').trim();
          if (!rawKey) return 'Usage: /music play <music key>';
          const key = rawKey.startsWith('music.') ? rawKey : `music.${rawKey}`;
          const entry = getAudioEntry(key);
          if (!entry || entry.channel !== 'music') {
            return `Unknown music key: ${key}\nUse /music list`;
          }
          scene.gameAudioSystem?.setMusic?.(key, 800);
          return `Playing ${entry.label} (${key})`;
        }

        if (mode === 'auto') {
          scene.gameAudioSystem?.useAutomaticMusic?.(800);
          return 'Automatic music enabled';
        }

        if (mode === 'stop') {
          scene.gameAudioSystem?.stopMusic?.(600);
          return 'Music stopped. Use /music auto to resume automatic music.';
        }

        return 'Usage: /music list | /music play <key> | /music auto | /music stop';
      },
      { argumentSuggestions: musicArgumentSuggestions },
    );

    // /time set <0-MAX_MINUTE_OF_DAY>
    scene.commands.register(
      'time',
      `set in-game time: /time set <0-${MAX_MINUTE_OF_DAY}>`,
      (args: string[]) => {
        if (args[0] === 'set') {
          const mins = parseInt(args[1] ?? '');
          if (!isNaN(mins) && mins >= 0 && mins <= MAX_MINUTE_OF_DAY) {
            scene.dayCycle.setTimeOfDay(mins);
            refreshAudioDirector(scene);
            const h = Math.floor(mins / 60).toString().padStart(2, '0');
            const m = (mins % 60).toString().padStart(2, '0');
            return `Time set to ${h}:${m}`;
          }
        }
        return `Usage: /time set <0-${MAX_MINUTE_OF_DAY}>, e.g. /time set 480`;
      },
      {
        argumentSuggestions: [
          { value: 'set', description: '设置游戏内时间', argumentIndex: 0 },
          { value: '360', description: '06:00 Dawn', argumentIndex: 1, after: ['set'] },
          { value: '540', description: '09:00 Morning', argumentIndex: 1, after: ['set'] },
          { value: '720', description: '12:00 Noon', argumentIndex: 1, after: ['set'] },
          { value: '1080', description: '18:00 Dusk', argumentIndex: 1, after: ['set'] },
          { value: '1320', description: '22:00 Night', argumentIndex: 1, after: ['set'] },
        ],
      },
    );

    scene.commands.register(
      'debug',
      'toggle physics and player debug: /debug on | /debug off',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'on') {
          setPhysicsDebug(scene, true);
          return 'Physics debug on';
        }
        if (mode === 'off') {
          setPhysicsDebug(scene, false);
          return 'Physics debug off';
        }
        return `Physics debug: ${scene.physicsDebugEnabled ? 'on' : 'off'}; mask overlay: ${scene.templeMaskDebugSystem?.isEnabled?.() ? 'on' : 'off'}; usage: /debug on | /debug off`;
      },
      {
        argumentSuggestions: [
          { value: 'on', description: '开启', argumentIndex: 0 },
          { value: 'off', description: '关闭', argumentIndex: 0 },
        ],
      },
    );

    scene.commands.register(
      'pathline',
      'toggle NPC path lines: /pathline on | off | status',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'on') {
          scene.pathDebugSystem?.setEnabled(true);
          return 'NPC path lines on';
        }
        if (mode === 'off') {
          scene.pathDebugSystem?.setEnabled(false);
          return 'NPC path lines off';
        }
        return `NPC path lines: ${scene.pathDebugSystem?.isEnabled() ? 'on' : 'off'}; usage: /pathline on | /pathline off`;
      },
      {
        argumentSuggestions: [
          { value: 'on', description: '开启路线显示', argumentIndex: 0 },
          { value: 'off', description: '关闭路线显示', argumentIndex: 0 },
          { value: 'status', description: '查看当前状态', argumentIndex: 0 },
        ],
      },
    );

    scene.commands.register(
      'shadow',
      'toggle lighting and shadows: /shadow on | off | status',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'on') {
          scene.gameLightingSystem?.setEnabled(true);
          return 'Shadow lighting on';
        }
        if (mode === 'off') {
          scene.gameLightingSystem?.setEnabled(false);
          return 'Shadow lighting off';
        }
        if (mode === 'status' || !mode) {
          return `Shadow lighting: ${scene.gameLightingSystem?.isEnabled() ? 'on' : 'off'}`;
        }
        return 'Usage: /shadow on | /shadow off | /shadow status';
      },
      {
        argumentSuggestions: [
          { value: 'on', description: '开启光照阴影', argumentIndex: 0 },
          { value: 'off', description: '关闭光照阴影', argumentIndex: 0 },
          { value: 'status', description: '查看当前状态', argumentIndex: 0 },
        ],
      },
    );

    scene.commands.register(
      'mask',
      'control gameplay visibility mask: /mask on | off | status | toggle | add <n> | drop <n>',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'add' || mode === 'drop') {
          const amount = parsePositiveInteger(args[1] ?? '1');
          if (amount == null) return `Usage: /mask ${mode} 1 (amount must be a positive integer)`;
          const payload = {
            roomId: scene.initialGameSave?.worldStatus?.roomId ?? null,
            amount,
            absoluteGameMinutes: scene.getAbsoluteGameMinutes?.() ?? scene.dayCycle?.absoluteGameMinutes,
          };
          if (mode === 'add') {
            gameBus.emit('game:mask_add_requested', payload);
            return `Mask radius add requested: +${amount}`;
          }
          gameBus.emit('game:mask_drop_requested', payload);
          return `Mask radius drop requested: -${amount}`;
        }
        if (mode === 'on') {
          setFogOfWarMaskEnabled(scene, true);
          return 'Visibility mask on';
        }
        if (mode === 'off') {
          setFogOfWarMaskEnabled(scene, false);
          return 'Visibility mask off';
        }
        if (mode === 'toggle') {
          const enabled = !scene.gameLightingSystem?.isFogOfWarEnabled?.();
          setFogOfWarMaskEnabled(scene, enabled);
          return `Visibility mask ${enabled ? 'on' : 'off'}`;
        }
        if (mode === 'status' || !mode) {
          return `Visibility mask: ${scene.gameLightingSystem?.isFogOfWarEnabled?.() ? 'on' : 'off'}; radius=${getMaskRadius(scene)}`;
        }
        return 'Usage: /mask on | /mask off | /mask status | /mask toggle | /mask add 1 | /mask drop 1';
      },
      {
        argumentSuggestions: [
          { value: 'on', description: '开启可见性遮罩', argumentIndex: 0 },
          { value: 'off', description: '关闭可见性遮罩', argumentIndex: 0 },
          { value: 'status', description: '查看当前状态', argumentIndex: 0 },
          { value: 'toggle', description: '切换当前状态', argumentIndex: 0 },
          { value: 'add', description: '增加 mask 半径', argumentIndex: 0 },
          { value: 'drop', description: '减少 mask 半径', argumentIndex: 0 },
          { value: '1', description: '半径变化量', argumentIndex: 1, after: ['add'] },
          { value: '1', description: '半径变化量', argumentIndex: 1, after: ['drop'] },
        ],
      },
    );

    scene.commands.register(
      'maskprogress',
      'add temple mask progress: /maskprogress add <n>',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'add') {
          const amount = parsePositiveNumber(args[1] ?? '1');
          if (amount == null) return 'Usage: /maskprogress add 0.5 (amount must be a positive number)';
          gameBus.emit('game:mask_progress_add_requested', {
            roomId: scene.initialGameSave?.worldStatus?.roomId ?? null,
            amount,
            absoluteGameMinutes: scene.getAbsoluteGameMinutes?.() ?? scene.dayCycle?.absoluteGameMinutes,
          });
          return `Mask progress add requested: +${amount}`;
        }
        if (mode === 'status' || !mode) {
          const progress = getMaskProgress(scene);
          return `Mask progress: Lv.${progress.level} ${progress.progress}/${progress.required}; radius=${getMaskRadius(scene)}`;
        }
        return 'Usage: /maskprogress add 0.5 | /maskprogress status';
      },
      {
        argumentSuggestions: [
          { value: 'add', description: '增加 mask 进度', argumentIndex: 0 },
          { value: 'status', description: '查看 mask 进度', argumentIndex: 0 },
          { value: '1', description: '进度变化量', argumentIndex: 1, after: ['add'] },
        ],
      },
    );

    scene.commands.register(
      'agent',
      'control NPC autonomy: /agent brain stop | start | status',
      (args: string[]) => {
        const scope = args[0]?.toLowerCase();
        const mode = args[1]?.toLowerCase();
        if (scope !== 'brain') {
          return 'Usage: /agent brain stop | /agent brain start | /agent brain status';
        }
        if (mode === 'stop' || mode === 'off') {
          setAgentBrainEnabled(scene, false);
          return 'Agent brain is off. NPC autonomous thinking is paused.';
        }
        if (mode === 'start' || mode === 'on') {
          setAgentBrainEnabled(scene, true);
          return 'Agent brain is on. NPC autonomous thinking resumed.';
        }
        if (mode === 'status' || !mode) {
          return `Agent brain: ${scene.npcSystem?.isBrainEnabled?.() ? 'on' : 'off'}`;
        }
        return 'Usage: /agent brain stop | /agent brain start | /agent brain status';
      },
      {
        argumentSuggestions: [
          { value: 'brain', description: 'NPC 自主思考模块', argumentIndex: 0 },
          { value: 'start', description: '启动 NPC 自主思考', argumentIndex: 1, after: ['brain'] },
          { value: 'stop', description: '暂停 NPC 自主思考', argumentIndex: 1, after: ['brain'] },
          { value: 'status', description: '查看当前状态', argumentIndex: 1, after: ['brain'] },
          { value: 'on', description: '启动 NPC 自主思考', argumentIndex: 1, after: ['brain'] },
          { value: 'off', description: '暂停 NPC 自主思考', argumentIndex: 1, after: ['brain'] },
        ],
      },
    );

    scene.commands.register(
      'event',
      'start storyline event: /event <storyline> [event]',
      (args: string[]) => {
        const events = scene.storylineRuntimeSystem?.listEventRefs?.() ?? [];
        if (events.length === 0) return 'No storyline events are loaded yet.';
        if (args.length === 0) return formatStorylineEventList(events);
        const eventKey = resolveStorylineEventCommandArgs(args);
        if (!eventKey) return formatStorylineEventList(events);
        return scene.storylineRuntimeSystem?.startEventByKey?.(eventKey)
          ?? 'Storyline runtime is not ready';
      },
      {
        argumentSuggestions: getStorylineEventArgumentSuggestions(scene),
      },
    );

    scene.commands.register(
      'storyline',
      'storyline debug: /storyline status | reload',
      (args: string[]) => {
        const action = (args[0] ?? 'status').toLowerCase();
        if (action === 'reload') {
          void fetchStorylineRuntimePackages(scene.npcSystem?.getAuthToken?.() ?? null)
            .then((storylines) => {
              scene.loadStorylinePackages?.(storylines);
              gameBus.emit('ui:show_message', { text: `剧情已重新加载：${storylines.length} 条` });
            })
            .catch((error) => {
              console.warn('[StorylineRuntime] manual reload failed', error);
              gameBus.emit('ui:show_message', { text: '剧情重新加载失败，查看 console。' });
            });
          return 'Reloading storyline runtime packages...';
        }
        if (action === 'status') {
          return scene.storylineRuntimeSystem?.getDebugStatus?.() ?? 'Storyline runtime is not ready';
        }
        return 'Usage: /storyline status | reload';
      },
      {
        argumentSuggestions: [
          { value: 'status', description: '查看剧情 runtime 状态', argumentIndex: 0 },
          { value: 'reload', description: '重新从后端加载剧情包', argumentIndex: 0 },
        ],
      },
    );

    scene.commands.register(
      'npc',
      'NPC helpers: /npc <name|id> claim-farm [dx] [dy]',
      (args: string[]) => {
        const npcName = args[0] ?? '';
        const mode = args[1]?.toLowerCase();
        if (!npcName || mode !== 'claim-farm') {
          return 'Usage: /npc <name|id> claim-farm [dx] [dy]';
        }
        const dx = args[2] == null ? 0 : Number(args[2]);
        const dy = args[3] == null ? 0 : Number(args[3]);
        if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
          return 'Usage: /npc <name|id> claim-farm [dx] [dy], with integer tile offsets';
        }
        if (args.length > 4) {
          return 'Usage: /npc <name|id> claim-farm [dx] [dy]; worldId is inferred automatically';
        }
        const playerPos = scene.playerSystem?.getPosition?.() ?? scene.player?.sprite;
        if (!playerPos) return 'Player position is unavailable';
        const cell = scene.worldGrid?.worldToCell?.(playerPos.x, playerPos.y);
        if (!cell) return 'World grid is unavailable';
        const tx = cell.col + dx;
        const ty = cell.row + dy;
        const worldId = scene.getWorldIdAt?.(playerPos.x, playerPos.y)
          ?? scene.currentMapDefinition?.ref?.worldId
          ?? 'world:main';
        return scene.npcSystem?.claimFarmPlotForNpc?.({
          npcName,
          tx,
          ty,
          worldId,
          absoluteGameMinutes: scene.getAbsoluteGameMinutes?.() ?? 0,
          source: 'command',
        })?.message ?? 'NPC system is not ready';
      },
      {
        argumentSuggestions: [
          ...npcArgumentSuggestions(0),
          { value: 'claim-farm', description: 'claim a farm plot near the player', argumentIndex: 1 },
          ...COMMON_TILE_OFFSET_ARGUMENTS.map((value) => ({ value, description: 'tile dx from player', argumentIndex: 2, after: ['claim-farm'] })),
          ...COMMON_TILE_OFFSET_ARGUMENTS.map((value) => ({ value, description: 'tile dy from player', argumentIndex: 3, after: ['claim-farm'] })),
        ],
      },
    );

    scene.commands.register(
      'bus',
      'debug bus route: /bus arrive | open | close | leave | loop | remove',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        const vehicleId = 'debug-bus';
        if (!scene.vehicleSystem) return 'Bus system is not ready';
        if (mode === 'arrive') {
          scene.vehicleSystem.spawnArrivalBus(vehicleId);
          void scene.vehicleSystem.moveToStation(vehicleId);
          return 'Bus arriving at current map route';
        }
        if (mode === 'open' || mode === 'close') {
          void scene.vehicleSystem.playDoor(vehicleId, mode);
          return `Bus door ${mode}`;
        }
        if (mode === 'leave') {
          void scene.vehicleSystem.moveOffscreen(vehicleId);
          return 'Bus leaving current map route';
        }
        if (mode === 'loop') {
          void scene.vehicleSystem.playArrivalCycle(vehicleId);
          return 'Bus arrival cycle started';
        }
        if (mode === 'remove') {
          scene.vehicleSystem.remove(vehicleId);
          return 'Bus removed';
        }
        return 'Usage: /bus arrive | open | close | leave | loop | remove';
      },
      {
        argumentSuggestions: [
          { value: 'arrive', description: '大巴到站', argumentIndex: 0 },
          { value: 'open', description: '开门', argumentIndex: 0 },
          { value: 'close', description: '关门', argumentIndex: 0 },
          { value: 'leave', description: '离站', argumentIndex: 0 },
          { value: 'loop', description: '播放完整循环', argumentIndex: 0 },
          { value: 'remove', description: '移除大巴', argumentIndex: 0 },
        ],
      },
    );

    scene.commands.register(
      'saving',
      'save management: /saving delete',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        console.log('[SavingDelete][Command] invoked', {
          args,
          mode,
          roomId: scene.initialGameSave?.worldStatus?.roomId ?? null,
          saveMeta: (scene.initialGameSave as any)?.saveMeta ?? null,
          saveVersion: scene.initialGameSave?.saveVersion ?? null,
        });
        if (mode !== 'delete') return 'Usage: /saving delete';
        gameBus.emit('game:save_delete_requested', {
          roomId: scene.initialGameSave?.worldStatus?.roomId ?? null,
        });
        return 'Deleting this world save. The game will reload into a fresh world...';
      },
      {
        argumentSuggestions: [
          { value: 'delete', description: '删除当前世界存档', argumentIndex: 0 },
        ],
      },
    );

    scene.commands.register(
      'tp',
      'teleport: /tp green-house | out | spawn | <x> <y>',
      (args: string[]) => {
        const target = args[0]?.toLowerCase().replace(/_/g, '-');
        if (!target) return 'Usage: /tp green-house | /tp out | /tp spawn | /tp <x> <y>';

        if (['green-house', 'greenhouse', 'gh', 'inside', 'room'].includes(target)) {
          const outside = getPlayerTeleportState(scene);
          if (!outside) return 'Player position is unavailable';
          if (scene.mapTransitionSystem?.isInsideInterior?.()) return 'Already inside green-house. Use /tp out to return.';
          const entered = scene.mapTransitionSystem?.enterGreenHouse?.({
            houseId: 'debug-green-house',
            outside,
          });
          return entered
            ? `TP -> ${GREEN_HOUSE_MAP_ID}`
            : 'Green-house transition system is not ready';
        }

        if (['out', 'outside', 'main', 'world'].includes(target)) {
          if (scene.mapTransitionSystem?.isInsideInterior?.()) {
            return scene.mapTransitionSystem.exitInterior()
              ? 'TP -> main world'
              : 'Could not leave green-house';
          }
          return 'Already in main world';
        }

        if (target === 'spawn') {
          const spawn = scene.currentMapDefinition?.spawn;
          if (!spawn) return 'Current map has no spawn marker';
          setPlayerTeleportPosition(scene, spawn.x, spawn.y, spawn.facing);
          return `TP -> spawn (${Math.round(spawn.x)}, ${Math.round(spawn.y)})`;
        }

        const x = Number(args[0]);
        const y = Number(args[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          setPlayerTeleportPosition(scene, x, y);
          return `TP -> (${Math.round(x)}, ${Math.round(y)})`;
        }

        return 'Usage: /tp green-house | /tp out | /tp spawn | /tp <x> <y>';
      },
      {
        argumentSuggestions: [
          { value: 'green-house', description: '进入 green-house.tmj 房间', argumentIndex: 0 },
          { value: 'out', description: '从房间返回主世界', argumentIndex: 0 },
          { value: 'spawn', description: '传送到当前地图 spawn', argumentIndex: 0 },
          { value: '240', description: '目标 X 坐标', argumentIndex: 0 },
          { value: '320', description: '目标 Y 坐标', argumentIndex: 1 },
        ],
      },
    );

    scene.commands.register(
      'nav',
      'navigate: /nav green-house [x] [y]',
      (args: string[]) => {
        const target = args[0]?.toLowerCase().replace(/_/g, '-');
        if (!target || !['green-house', 'greenhouse', 'gh'].includes(target)) {
          return 'Usage: /nav green-house [x] [y]';
        }

        const x = Number(args[1] ?? 464);
        const y = Number(args[2] ?? 544);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return 'Usage: /nav green-house [x] [y]';

        const ok = scene.mapTransitionSystem?.navigatePlayerToGreenHouse?.({ x, y });
        return ok
          ? `Navigating to ${GREEN_HOUSE_MAP_ID} (${Math.round(x)}, ${Math.round(y)})`
          : 'Could not plan route to green-house';
      },
      {
        argumentSuggestions: [
          { value: 'green-house', description: '走到温室并进入室内', argumentIndex: 0 },
          { value: '464', description: '默认室内 X', argumentIndex: 1, after: ['green-house'] },
          { value: '544', description: '默认室内 Y', argumentIndex: 2, after: ['green-house'] },
        ],
      },
    );

    scene.commands.register(
      'chest',
      'spawn a reward chest: /chest <coins> [random]',
      (args: string[]) => {
        const coins = parseChestCoins(args[0]);
        if (coins === null) return 'Usage: /chest 100 or /chest 100 random';
        const useRandomPlacement = args.slice(1).some((arg) => arg.toLowerCase() === 'random');
        return scene.debugGenerateSystem?.generateRewardChestInFront?.(coins, useRandomPlacement)
          ?? 'Debug generation system is not ready';
      },
      {
        argumentSuggestions: [
          { value: '25', description: '金币数量', argumentIndex: 0 },
          { value: '100', description: '金币数量', argumentIndex: 0 },
          { value: '500', description: '金币数量', argumentIndex: 0 },
          { value: 'random', description: '随机安全位置', argumentIndex: 1 },
        ],
      },
    );

    scene.commands.register(
      'generate',
      'debug spawn entity/item: /generate <entity> [color] [baby|adult] [dx dy]',
      (args: string[]) => {
        if (!args[0]) return 'Usage: /generate <entity> [color] [baby|adult] [dx dy], e.g. /generate cow purple adult';
        return scene.debugGenerateSystem?.generateFromCommandArgs?.(args)
          ?? 'Debug generation system is not ready';
      },
      {
        argumentSuggestions: [
          ...generatedEntityArgumentSuggestions().map((suggestion) => ({ ...suggestion, argumentIndex: 0 })),
          ...['light', 'brown', 'green', 'pink', 'purple'].map((value) => ({
            value,
            description: '牛的颜色',
            argumentIndex: 1,
            after: ['cow'],
          })),
          { value: 'baby', description: '幼年牛', argumentIndex: 1, after: ['cow'] },
          { value: 'adult', description: '成年牛', argumentIndex: 1, after: ['cow'] },
          { value: 'baby', description: '幼年牛', argumentIndex: 2, after: ['cow'] },
          { value: 'adult', description: '成年牛', argumentIndex: 2, after: ['cow'] },
        ],
      },
    );

    scene.commands.register(
      'getItem',
      'grant a registered item: /getItem <itemId> [quantity]',
      (args: string[]) => {
        const itemId = args[0];
        if (!itemId || args.length > 2) return 'Usage: /getItem <itemId> [quantity], e.g. /getItem apple 10';

        const item = getGameItemDefinition(itemId);
        if (!item) return `Unknown item: ${itemId}`;

        const quantity = args[1] == null ? 1 : parsePositiveInteger(args[1]);
        if (quantity === null) return 'Quantity must be a positive integer';

        gameBus.emit('player:item_pickup', { itemKey: item.id, quantity });
        return `Granted ${item.nameZh || item.name || item.id} ×${quantity}`;
      },
      {
        argumentSuggestions: gameItemArgumentSuggestions(),
      },
    );

    scene.commands.register(
      'ability',
      'add/remove protagonist ability EXP: /ability <ability> add|remove <exp>',
      (args: string[]) => {
        if (args.length !== 3) return formatAbilityCommandUsage();

        const attributeKey = normalizeAttributeKey(args[0]);
        if (!attributeKey) return `Unknown ability: ${args[0]}. ${formatAbilityCommandUsage()}`;

        const action = args[1]?.toLowerCase();
        if (action !== 'add' && action !== 'remove') return formatAbilityCommandUsage();

        const amount = parsePositiveInteger(args[2]);
        if (amount === null) return 'EXP amount must be a positive integer';

        const expDelta = action === 'remove' ? -amount : amount;
        gameBus.emit('profile:attribute_exp_delta_requested', { attributeKey, expDelta });
        const sign = expDelta >= 0 ? '+' : '';
        return `Requested ${getAbilityLabel(attributeKey)} EXP ${sign}${expDelta}`;
      },
      {
        argumentSuggestions: [
          ...abilityAttributeArgumentSuggestions(),
          ...abilityActionArgumentSuggestions(),
        ],
      },
    );

    // /help
    scene.commands.register('help', 'show available commands', () => scene.commands.listHelp());

    // /getInventory <name>
    scene.commands.register(
      'getInventory',
      'show NPC inventory: /getInventory <name>',
      (args: string[]) => {
        const requestedName = args.join(' ').trim();
        const sourceNpc = requestedName
          ? scene.npcSystem?.findByName?.(requestedName) ?? null
          : scene.npcSystem?.getPrimaryNpc?.() ?? scene.npcSystem?.getRegistrations?.()[0]?.npc ?? null;
        if (!sourceNpc) return 'No NPCs are loaded';
        const name = requestedName || sourceNpc.name;
        const inv = sourceNpc.getInventory(name);
        const entries = Object.entries(inv);
        if (entries.length === 0) return `${name} inventory is empty`;
        return `${name} inventory:\n${entries.map(([k, v]) => `  ${k} x${v}`).join('\n')}`;
      },
      {
        argumentSuggestions: npcArgumentSuggestions(0),
      },
    );
  
}
