import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type { NpcGoalState } from '../../../shared/worldStateTypes';

export class NpcAppraisalSystem {
  constructor(private readonly worldStateManager: WorldStateManager) {}

  appraisePlayerSpeech(npcId: string, text: string, absoluteGameMinutes: number, actorId = 'player'): void {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return;
    const tags = tagsForSpeech(text);
    if (tags.length === 0) return;
    const key = `speech:${actorId}:${absoluteGameMinutes}`;
    const recentMemories = {
      ...mind.recentMemories,
      [key]: {
        key,
        kind: 'action' as const,
        type: 'player_speech',
        label: text.slice(0, 80),
        x: 0,
        y: 0,
        lastSeenGameMinute: absoluteGameMinutes,
        meta: { actorId, text, tags },
      },
    };
    const goals: NpcGoalState[] = [...mind.goals];
    if (tags.includes('help_request')) {
      goals.push({
        id: `speech_help:${actorId}:${absoluteGameMinutes}`,
        kind: 'respond_to_help',
        label: '回应求助',
        urgency: 0.75,
        status: 'active',
        reason: 'player_requested_help',
        targetId: actorId,
        createdAtGameMinute: absoluteGameMinutes,
        updatedAtGameMinute: absoluteGameMinutes,
      });
    }
    this.worldStateManager.patchNpcMindState(npcId, {
      recentMemories,
      goals: goals.slice(-24),
      body: {
        ...mind.body,
        confusion: tags.includes('future_event') ? Math.min(100, mind.body.confusion + 18) : mind.body.confusion,
        fear: tags.includes('threat') ? Math.min(100, mind.body.fear + 20) : mind.body.fear,
        lastUpdatedGameMinute: absoluteGameMinutes,
      },
    });
  }
}

function tagsForSpeech(text: string): string[] {
  const tags: string[] = [];
  if (/救|帮|help|please/i.test(text)) tags.push('help_request');
  if (/未来|明天|之后|会发生|提前|预言|future/i.test(text)) tags.push('future_event');
  if (/威胁|杀|打|别逼|threat|kill/i.test(text)) tags.push('threat');
  if (/谢谢|感谢|thank/i.test(text)) tags.push('thanks');
  if (/必须|命令|现在去|马上/i.test(text)) tags.push('command');
  if (/小心|危险|别去|警告|warning|danger/i.test(text)) tags.push('warning');
  return tags;
}

