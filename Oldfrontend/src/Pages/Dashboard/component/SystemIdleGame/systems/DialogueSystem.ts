import Phaser from 'phaser';
import type { Npc } from '../entities/Npc';
import { gameBus } from '../shared/EventBus';
import type { Direction } from '../types';

interface NpcRegistration {
  id: string;
  npc: Npc;
}

interface DialogueSystemOptions {
  scene: Phaser.Scene;
  getNpcRegistrations: () => NpcRegistration[];
  getPlayerPosition: () => { x: number; y: number } | null;
  getPlayerFacing?: () => Direction | null | undefined;
  getAbsoluteGameMinutes: () => number;
  pauseNpc?: (npcId: string, absoluteGameMinutes: number, seconds?: number, reason?: string) => void;
  onPlayerAssignedHome?: (npcId: string, text: string, absoluteGameMinutes: number) => void;
  hearingRadius?: number;
  playerHearingRadius?: number;
  playerHearingLateralTolerance?: number;
  maxReplies?: number;
}

interface HeardNpc {
  id: string;
  npc: Npc;
  distance: number;
}

const DEFAULT_HEARING_RADIUS = 260;
const DEFAULT_PLAYER_HEARING_RADIUS = 96;
const DEFAULT_PLAYER_HEARING_LATERAL_TOLERANCE = 48;
const PLAYER_HEARING_BACK_TOLERANCE = 12;
const DEFAULT_MAX_REPLIES = 2;
const REPLY_COOLDOWN_MS = 9000;
const PLAYER_BUBBLE_OFFSET_Y = 42;
const PLAYER_SPEECH_SECONDS = 4.5;

const NPC_REPLY_LINES = [
  '我也听见了。',
  '这倒是有意思。',
  '你们在聊这个啊。',
  '我有点在意这件事。',
  '嗯，我明白。',
];

function hash(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = ((value << 5) - value) + input.charCodeAt(i);
    value |= 0;
  }
  return Math.abs(value);
}

function pickStable<T>(items: T[], seed: string): T {
  return items[hash(seed) % items.length];
}

function hasHomeAssignmentIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, '');
  return (
    /(?:这是|这个是|这里是|这间是|这屋子是|这个屋子是|这房子是|这个房子是).{0,10}(?:你的|你自己的).{0,10}(?:房子|屋子|家)/.test(compact)
    || /(?:以后|往后|今后)?.{0,8}(?:住这|住这里|住这儿|住在这|住在这里|住在这儿)/.test(compact)
    || /\b(?:this is|here is|this place is)\s+your\s+(?:house|home)\b/.test(normalized)
    || /\byour\s+new\s+(?:house|home)\b/.test(normalized)
    || /\b(?:live|stay)\s+here\b/.test(normalized)
  );
}

function isQuestion(text: string): boolean {
  return /[?？吗呢]|\bwhat\b|\bwhy\b|\bhow\b|\bwhere\b|\bwhen\b/i.test(text);
}

/**
 * Shared world dialogue bus.
 *
 * Any NPC speech is shown above that NPC through Npc.say(), then this system
 * broadcasts the utterance to nearby NPCs. Player speech also enters here so
 * the input box no longer needs to target a single nearest NPC.
 */
export class DialogueSystem {
  private readonly scene: Phaser.Scene;
  private readonly getNpcRegistrations: () => NpcRegistration[];
  private readonly getPlayerPosition: () => { x: number; y: number } | null;
  private readonly getPlayerFacing?: () => Direction | null | undefined;
  private readonly getAbsoluteGameMinutes: () => number;
  private readonly pauseNpc?: DialogueSystemOptions['pauseNpc'];
  private readonly onPlayerAssignedHome?: DialogueSystemOptions['onPlayerAssignedHome'];
  private readonly hearingRadius: number;
  private readonly playerHearingRadius: number;
  private readonly playerHearingLateralTolerance: number;
  private readonly maxReplies: number;
  private readonly replyCooldowns = new Map<string, number>();
  private unsubscribeNpcSpeech?: () => void;
  private playerBubbleText?: Phaser.GameObjects.Text;
  private playerSpeechTimer = 0;

  constructor(options: DialogueSystemOptions) {
    this.scene = options.scene;
    this.getNpcRegistrations = options.getNpcRegistrations;
    this.getPlayerPosition = options.getPlayerPosition;
    this.getPlayerFacing = options.getPlayerFacing;
    this.getAbsoluteGameMinutes = options.getAbsoluteGameMinutes;
    this.pauseNpc = options.pauseNpc;
    this.onPlayerAssignedHome = options.onPlayerAssignedHome;
    this.hearingRadius = options.hearingRadius ?? DEFAULT_HEARING_RADIUS;
    this.playerHearingRadius = options.playerHearingRadius ?? DEFAULT_PLAYER_HEARING_RADIUS;
    this.playerHearingLateralTolerance = options.playerHearingLateralTolerance ?? DEFAULT_PLAYER_HEARING_LATERAL_TOLERANCE;
    this.maxReplies = options.maxReplies ?? DEFAULT_MAX_REPLIES;
  }

  start(): void {
    if (this.unsubscribeNpcSpeech) return;
    this.unsubscribeNpcSpeech = gameBus.on('dialogue:npc_spoke', ({ npcName, text, x, y }) => {
      this.broadcastFromNpc(npcName, text, x, y);
    });
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stop());
  }

  stop(): void {
    this.unsubscribeNpcSpeech?.();
    this.unsubscribeNpcSpeech = undefined;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.playerBubbleText?.destroy();
    this.playerBubbleText = undefined;
    this.playerSpeechTimer = 0;
  }

  broadcastFromPlayer(text: string): number {
    const normalized = text.trim();
    if (!normalized) return 0;
    const speaker = this.getPlayerPosition();
    if (!speaker) return 0;

    this.showPlayerSpeech(normalized, speaker);

    const listeners = this.findPlayerListeners(speaker.x, speaker.y);
    if (listeners.length === 0) {
      gameBus.emit('ui:show_message', { text: '附近没有人听到你说话。' });
      return 0;
    }

    const absoluteGameMinutes = this.getAbsoluteGameMinutes();
    const homeAssignmentTarget = hasHomeAssignmentIntent(normalized)
      ? listeners.find((listener) => !listener.npc.isOnDispatch() && !listener.npc.isAwaitingConfirm()) ?? listeners[0]
      : null;
    for (const listener of listeners) {
      listener.npc.addMemory(`玩家说：“${normalized}”`, 'player', absoluteGameMinutes);
      listener.npc.faceToward?.(speaker.x, speaker.y);
      this.pauseNpc?.(listener.id, absoluteGameMinutes, 5, 'heard_player_dialogue');
    }

    if (homeAssignmentTarget) {
      this.onPlayerAssignedHome?.(homeAssignmentTarget.id, normalized, absoluteGameMinutes);
    }

    this.emitPlayerHeardEvents(normalized, listeners);
    return listeners.length;
  }

  showPlayerSpeechLine(text: string): boolean {
    const normalized = text.trim();
    if (!normalized) return false;
    const speaker = this.getPlayerPosition();
    if (!speaker) return false;
    this.showPlayerSpeech(normalized, speaker);
    return true;
  }

  private update(_time: number, deltaMs: number): void {
    if (!this.playerBubbleText?.visible) return;
    this.positionPlayerBubble();
    this.playerSpeechTimer -= deltaMs / 1000;
    if (this.playerSpeechTimer <= 0) {
      this.playerBubbleText.setVisible(false);
    }
  }

  private showPlayerSpeech(text: string, position: { x: number; y: number }): void {
    const bubble = this.ensurePlayerBubble(position);
    bubble
      .setText(text)
      .setPosition(position.x, position.y - PLAYER_BUBBLE_OFFSET_Y)
      .setVisible(true);
    this.playerSpeechTimer = PLAYER_SPEECH_SECONDS;
  }

  private ensurePlayerBubble(position: { x: number; y: number }): Phaser.GameObjects.Text {
    if (this.playerBubbleText?.active) return this.playerBubbleText;
    this.playerBubbleText = this.scene.add.text(position.x, position.y - PLAYER_BUBBLE_OFFSET_Y, '', {
      fontSize:        '9px',
      color:           '#1f2937',
      backgroundColor: '#e0f2fedd',
      padding:         { x: 6, y: 4 },
      wordWrap:        { width: 132 },
    }).setOrigin(0.5, 1).setDepth(10000).setVisible(false);
    return this.playerBubbleText;
  }

  private positionPlayerBubble(): void {
    if (!this.playerBubbleText?.active) return;
    const position = this.getPlayerPosition();
    if (!position) {
      this.playerBubbleText.setVisible(false);
      return;
    }
    this.playerBubbleText.setPosition(position.x, position.y - PLAYER_BUBBLE_OFFSET_Y);
  }

  private emitPlayerHeardEvents(text: string, listeners: HeardNpc[]): void {
    const now = this.scene.time?.now ?? Date.now();
    const shouldFavorReply = isQuestion(text);
    const forcedListener = listeners.find((listener) => (
      !listener.npc.isOnDispatch()
      && !listener.npc.isAwaitingConfirm()
    )) ?? null;
    const replyCandidates = listeners
      .filter((listener) => this.canReplyToPlayer(listener, now, shouldFavorReply))
      .filter((listener, index) => {
        if (index === 0) return true;
        const chance = shouldFavorReply ? 0.72 : 0.34;
        const roll = (hash(`player:${listener.id}:${text}:${Math.floor(now / 3000)}`) % 100) / 100;
        return roll <= chance;
      })
      .slice(0, this.maxReplies);
    if (forcedListener && !replyCandidates.some((listener) => listener.id === forcedListener.id)) {
      replyCandidates.unshift(forcedListener);
      replyCandidates.length = Math.min(replyCandidates.length, this.maxReplies);
    }
    const replyIds = new Set(replyCandidates.map((listener) => listener.id));

    listeners.forEach((listener) => {
      if (replyIds.has(listener.id)) {
        this.replyCooldowns.set(listener.id, now);
      }
      gameBus.emit('dialogue:player_heard', {
        npcName: listener.id,
        text,
        distance: listener.distance,
        listenerCount: listeners.length,
        shouldReply: replyIds.has(listener.id),
      });
    });
  }

  private broadcastFromNpc(speakerId: string, text: string, x: number, y: number): void {
    const listeners = this.findListeners(x, y, speakerId);
    if (listeners.length === 0) return;

    const absoluteGameMinutes = this.getAbsoluteGameMinutes();
    for (const listener of listeners) {
      listener.npc.addMemory(`${speakerId}说：“${text}”`, 'event', absoluteGameMinutes);
      this.pauseNpc?.(listener.id, absoluteGameMinutes, 4, 'heard_npc_dialogue');
    }

    this.queueReplies({
      speakerId,
      speakerLabel: speakerId,
      text,
      listeners,
      source: 'npc',
    });
  }

  private findListeners(x: number, y: number, excludeId?: string): HeardNpc[] {
    return this.getNpcRegistrations()
      .filter(({ id, npc }) => (
        id !== excludeId
        && npc.isAlive()
        && !npc.isOnDispatch()
        && !npc.isAwaitingConfirm()
      ))
      .map(({ id, npc }) => ({
        id,
        npc,
        distance: Phaser.Math.Distance.Between(x, y, npc.sprite.x, npc.sprite.y),
      }))
      .filter((entry) => entry.distance <= this.hearingRadius)
      .sort((a, b) => a.distance - b.distance);
  }

  private findPlayerListeners(x: number, y: number): HeardNpc[] {
    const facing = normalizeFacing(this.getPlayerFacing?.());
    return this.getNpcRegistrations()
      .filter(({ npc }) => (
        npc.isAlive()
        && !npc.isOnDispatch()
        && !npc.isAwaitingConfirm()
      ))
      .map(({ id, npc }) => {
        const dx = npc.sprite.x - x;
        const dy = npc.sprite.y - y;
        const projection = projectOntoFacing(dx, dy, facing);
        return {
          id,
          npc,
          distance: Phaser.Math.Distance.Between(x, y, npc.sprite.x, npc.sprite.y),
          forward: projection.forward,
          lateral: projection.lateral,
        };
      })
      .filter((entry) => (
        entry.forward >= -PLAYER_HEARING_BACK_TOLERANCE
        && entry.forward <= this.playerHearingRadius
        && Math.abs(entry.lateral) <= this.playerHearingLateralTolerance
      ))
      .sort((a, b) => (
        Math.max(0, a.forward) - Math.max(0, b.forward)
        || Math.abs(a.lateral) - Math.abs(b.lateral)
        || a.distance - b.distance
      ));
  }

  private queueReplies(options: {
    speakerId: string;
    speakerLabel: string;
    text: string;
    listeners: HeardNpc[];
    source: 'npc';
  }): void {
    const now = this.scene.time?.now ?? Date.now();
    const shouldFavorReply = isQuestion(options.text);
    const candidates = options.listeners
      .filter((listener) => this.canReply(listener, now))
      .filter((listener) => {
        const baseChance = 0.24;
        const chance = Math.min(0.9, baseChance + (shouldFavorReply ? 0.22 : 0));
        const roll = (hash(`${options.speakerId}:${listener.id}:${options.text}:${Math.floor(now / 3000)}`) % 100) / 100;
        return roll <= chance;
      })
      .slice(0, this.maxReplies);

    candidates.forEach((listener, index) => {
      const delay = 650 + index * 650 + (hash(`${listener.id}:${options.text}`) % 360);
      this.replyCooldowns.set(listener.id, now);
      listener.npc.setThinking(true);
      this.scene.time.delayedCall(delay, () => {
        if (!this.isSceneUsable() || !listener.npc.isAlive()) return;
        if (!this.canReply(listener, this.scene.time?.now ?? Date.now(), false, true)) {
          listener.npc.setThinking(false);
          return;
        }
        const line = this.buildReplyLine(listener.id, options);
        listener.npc.say(line, this.getAbsoluteGameMinutes());
      });
    });
  }

  private canReply(listener: HeardNpc, now: number, enforceCooldown = true, allowOwnThinking = false): boolean {
    if (!listener.npc.isAlive()) return false;
    if (listener.npc.isOnDispatch()) return false;
    if (listener.npc.isAwaitingConfirm()) return false;
    if (listener.npc.isThinking() && !allowOwnThinking) return false;
    if (listener.npc.isSpeaking() && !(allowOwnThinking && listener.npc.isThinking())) return false;
    if (listener.npc.hasPlannedActions()) return false;
    if (listener.npc.isNavigating()) return false;
    if (enforceCooldown && now - (this.replyCooldowns.get(listener.id) ?? 0) < REPLY_COOLDOWN_MS) return false;
    return true;
  }

  private canReplyToPlayer(listener: HeardNpc, now: number, urgentQuestion: boolean): boolean {
    if (!listener.npc.isAlive()) return false;
    if (listener.npc.isOnDispatch()) return false;
    if (listener.npc.isAwaitingConfirm()) return false;
    if (listener.npc.hasPlannedActions()) return false;
    if (listener.npc.isNavigating()) return false;
    if (urgentQuestion) return true;
    return this.canReply(listener, now);
  }

  private buildReplyLine(listenerId: string, options: {
    speakerLabel: string;
    text: string;
    source: 'npc';
  }): string {
    const picked = pickStable(NPC_REPLY_LINES, `${listenerId}:${options.speakerLabel}:${options.text}`);
    if (hash(`${listenerId}:${options.text}`) % 3 === 0) {
      return `${options.speakerLabel}，${picked}`;
    }
    return picked;
  }

  private isSceneUsable(): boolean {
    const sys = this.scene?.sys as unknown as { settings?: { status?: number | string } } | undefined;
    return Boolean(sys?.settings && sys.settings.status !== Phaser.Scenes.DESTROYED);
  }
}

function normalizeFacing(value: Direction | null | undefined): Direction {
  return value === 'up' || value === 'left' || value === 'right' ? value : 'down';
}

function projectOntoFacing(dx: number, dy: number, facing: Direction): { forward: number; lateral: number } {
  switch (facing) {
    case 'up':
      return { forward: -dy, lateral: dx };
    case 'left':
      return { forward: -dx, lateral: dy };
    case 'right':
      return { forward: dx, lateral: dy };
    case 'down':
    default:
      return { forward: dy, lateral: dx };
  }
}
