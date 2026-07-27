import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RefObject } from 'react';
import type { RootState } from '../../../../../Redux/store';
import {
  useNpcChatMutation,
  useNpcDispatchReturnMutation,
} from '../../../../../api/profileStateRtkApi';
import { gameBus, type GameEventMap } from '../shared/EventBus';
import type { GameScene } from '../GameScene';
import { registerGameSceneCommands } from '../runtime/GameSceneCommands';

const NPC_PERF_PREFIX = '[NPC_PERF]';
const NPC_DIALOG_AUTO_HIDE_MS = 5000;
const SYSTEM_DIALOG_AUTO_HIDE_MS = 4000;

export interface DialogState {
  visible: boolean;
  text: string;
  npcName: string;
}

export interface ChatState {
  open: boolean;
  npcName: string;
  initialValue: string;
}

export type StorylineChoiceState = GameEventMap['storyline:choice_requested'];

function isSystemDialogName(npcName: string): boolean {
  const normalized = npcName.trim().toLowerCase();
  return normalized === 'system' || normalized === '系统';
}

type NpcChatContextMode = 'minimal' | 'fast' | 'situated' | 'action';
type NpcChatSource = 'targeted' | 'broadcast';

function classifyNpcChatContextMode(text: string): NpcChatContextMode {
  const normalized = text.trim();
  if (!normalized) return 'fast';
  if (/你是谁|你叫什么|叫什么名字|介绍.*自己|自我介绍|who\s+are\s+you|what'?s\s+your\s+name/i.test(normalized)) {
    return 'minimal';
  }
  if (/^(你好|您好|嗨|哈喽|早|早上好|晚上好|hello|hi)\b|在吗|听得到吗/i.test(normalized)) {
    return 'minimal';
  }
  if (/买|卖|商店|商品|货单|货|交易|shop|trade|store/i.test(normalized)) {
    return 'minimal';
  }
  if (/看见|看到|观察|附近|周围|这里|这儿|在哪|哪里|地上|屋里|房间|里面|外面|what.*see|nearby|around|where|observe|look/i.test(normalized)
    && !/记住|记着|记下|农田|种|播|浇|收|翻地|技能|房子|家|进屋|捡|拿|放下|砍|摘/i.test(normalized)) {
    return 'situated';
  }
  if (/记住|记着|记下|坐标|位置|以后|捡|拿|拾|放下|丢|扔|砍|摘|果树|苹果|果子|食物|农田|种|播|浇|收|翻地|技能|学会|工具|背包|库存|身上|房子|屋子|家|进屋|睡觉|委托|派遣|找.*聊|和.*聊|remember|pickup|drop|farm|house|home|skill|tool|inventory|dispatch|talk with/i.test(normalized)) {
    return 'action';
  }
  return 'fast';
}

export function useNpcChat(
  sceneRef: RefObject<GameScene | null>,
  chatOpenRef: RefObject<boolean>,
) {
  const npcInventories = useSelector((s: RootState) => s.game.npcInventories);
  const gameInventory = useSelector((s: RootState) => s.game.gameInventory);
  const npcInventoriesRef = useRef(npcInventories);
  const gameInventoryRef = useRef(gameInventory);
  npcInventoriesRef.current = npcInventories;
  gameInventoryRef.current = gameInventory;
  const storylineChoiceTimeoutRef = useRef<number | null>(null);
  const dialogAutoHideTimeoutRef = useRef<number | null>(null);

  const [dialog, setDialog] = useState<DialogState>({
    visible: false,
    text: '',
    npcName: '',
  });

  const [chat, setChat] = useState<ChatState>({
    open: false,
    npcName: '',
    initialValue: '',
  });

  const [npcConfirm, setNpcConfirm] = useState<{
    npcName: string;
    question: string;
  } | null>(null);

  const [storylineChoice, setStorylineChoice] = useState<StorylineChoiceState | null>(null);

  const [npcChat] = useNpcChatMutation();
  const [npcDispatchReturn] = useNpcDispatchReturnMutation();

  const sendNpcChatMessage = useCallback(async (
    npcName: string,
    text: string,
    source: NpcChatSource,
  ) => {
    const scene = sceneRef.current;
    if (!scene || !npcName || !text.trim()) return;
    const traceId = `npc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = performance.now();
    const contextMode = classifyNpcChatContextMode(text);
    const mark = (stage: string, extra: Record<string, unknown> = {}) => {
      console.log(NPC_PERF_PREFIX, {
        traceId,
        npcName,
        source,
        contextMode,
        stage,
        elapsedMs: Math.round(performance.now() - startedAt),
        ...extra,
      });
    };
    mark('frontend:heard', { textLength: text.length });
    if (scene.npcSystem?.isBrainEnabled?.() === false) {
      scene.npcSystem?.makeSay?.(npcName, 'Agent brain is off. Use /agent brain on to let me think again.');
      mark('frontend:brain-disabled');
      return;
    }

    const needsPerception = contextMode === 'situated' || contextMode === 'action';
    const needsMind = contextMode !== 'minimal';
    const needsInventory = contextMode !== 'minimal';

    scene.npcSystem?.setThinking?.(npcName, true);
    if (source === 'targeted') {
      scene.npcSystem?.addPlayerMessage?.(npcName, text);
      scene.npcSystem?.faceNpcTowardPlayer?.(npcName);
      scene.npcSystem?.pauseNpc?.(npcName, scene.getAbsoluteGameMinutes(), 5, 'targeted_player_dialogue');
    }
    mark('frontend:thinking-on');
    try {
      const contextStartedAt = performance.now();
      const absoluteGameMinutes = scene.getAbsoluteGameMinutes();
      const playerPos = needsPerception
        ? scene.playerSystem?.getPosition?.() ?? { x: 480, y: 350 }
        : undefined;
      let perception = '';
      let perceptionContext: Record<string, unknown> | null = null;
      let perceptionMs = 0;
      let perceptionContextMs = 0;
      if (needsPerception) {
        const perceptionStartedAt = performance.now();
        perception = scene.npcSystem?.getPerceptionReport?.(npcName, traceId) ?? '';
        perceptionMs = Math.round(performance.now() - perceptionStartedAt);
        const perceptionContextStartedAt = performance.now();
        perceptionContext = scene.npcSystem?.getPerceptionContext?.(npcName, traceId) ?? null;
        perceptionContextMs = Math.round(performance.now() - perceptionContextStartedAt);
      }
      const npcMindContext = needsMind
        ? scene.npcSystem?.getMindState?.(npcName) as Record<string, unknown> | null
        : null;
      const familiarity = needsMind ? scene.npcSystem?.getFamiliarity?.(npcName) ?? 0 : 0;
      const chatCount = needsMind ? scene.npcSystem?.getChatCount?.(npcName) ?? 0 : 0;
      mark('frontend:context-ready', {
        contextMs: Math.round(performance.now() - contextStartedAt),
        perceptionMs,
        perceptionContextMs,
        perceptionLength: perception.length,
        hasMind: Boolean(npcMindContext),
      });
      mark('frontend:request-start');
      const result = await npcChat({
        traceId,
        npcName,
        playerMessage: text,
        source,
        contextMode,
        allowAsyncMemory: true,
        absoluteGameMinutes,
        playerX: playerPos?.x,
        playerY: playerPos?.y,
        perception: needsPerception ? perception : undefined,
        perceptionContext: needsPerception ? perceptionContext : undefined,
        npcMindContext,
        playerInventory: contextMode === 'action' ? gameInventoryRef.current : undefined,
        npcInventory: needsInventory ? npcInventoriesRef.current[npcName] ?? {} : undefined,
        familiarity,
        chatCount,
        agentBrainEnabled: scene.npcSystem?.isBrainEnabled?.() !== false,
      }).unwrap();
      mark('frontend:response-received', {
        replyLength: String(result.reply ?? '').length,
        actionCount: result.actions?.length ?? 0,
        routing: result.routing,
      });

      scene.npcSystem?.reply?.(npcName, result.reply ?? '……');
      if (result.actions?.length) {
        scene.npcSystem?.executeActions?.(npcName, result.actions);
      }
      mark('frontend:reply-applied', { totalMs: Math.round(performance.now() - startedAt) });
    } catch (error) {
      mark('frontend:error', {
        error: error instanceof Error ? error.message : String(error),
      });
      scene.npcSystem?.setThinking?.(npcName, false);
      scene.npcSystem?.makeSay?.(npcName, '……我刚才没想清楚。');
    }
  }, [npcChat, sceneRef]);

  useEffect(() => {
    if (dialogAutoHideTimeoutRef.current !== null) {
      window.clearTimeout(dialogAutoHideTimeoutRef.current);
      dialogAutoHideTimeoutRef.current = null;
    }

    if (!dialog.visible || !dialog.text) return undefined;

    const timeoutMs = isSystemDialogName(dialog.npcName)
      ? SYSTEM_DIALOG_AUTO_HIDE_MS
      : NPC_DIALOG_AUTO_HIDE_MS;
    dialogAutoHideTimeoutRef.current = window.setTimeout(() => {
      setDialog((current) => (
        current.visible && current.text === dialog.text && current.npcName === dialog.npcName
          ? { ...current, visible: false }
          : current
      ));
      dialogAutoHideTimeoutRef.current = null;
    }, timeoutMs);

    return () => {
      if (dialogAutoHideTimeoutRef.current !== null) {
        window.clearTimeout(dialogAutoHideTimeoutRef.current);
        dialogAutoHideTimeoutRef.current = null;
      }
    };
  }, [dialog.npcName, dialog.text, dialog.visible]);

  useEffect(() => {
    const unsubs = [
      gameBus.on('npc:speak', ({ text, npcName }) => {
        setDialog({ visible: true, text, npcName });
      }),

      gameBus.on('npc:interact', ({ npcName, initialValue }) => {
        chatOpenRef.current = true;
        setChat({ open: true, npcName, initialValue: initialValue ?? '' });
        sceneRef.current?.pauseInput();
      }),

      gameBus.on('npc:ask_confirm', ({ npcName, question }) => {
        setNpcConfirm({ npcName, question });
      }),

      gameBus.on('storyline:choice_requested', (payload) => {
        if (storylineChoiceTimeoutRef.current !== null) {
          window.clearTimeout(storylineChoiceTimeoutRef.current);
          storylineChoiceTimeoutRef.current = null;
        }
        chatOpenRef.current = true;
        setChat({ open: false, npcName: '', initialValue: '' });
        setStorylineChoice({
          ...payload,
          choices: payload.choices.slice(0, 4),
        });
        sceneRef.current?.pauseInput();
        if (typeof payload.timeoutMs === 'number' && payload.timeoutMs > 0) {
          storylineChoiceTimeoutRef.current = window.setTimeout(() => {
            chatOpenRef.current = false;
            setStorylineChoice((current) => (
              current?.requestId === payload.requestId ? null : current
            ));
            sceneRef.current?.resumeInput();
            storylineChoiceTimeoutRef.current = null;
          }, payload.timeoutMs);
        }
      }),

      gameBus.on('dialogue:player_heard', async ({ npcName, text, shouldReply }) => {
        if (!shouldReply) return;
        await sendNpcChatMessage(npcName, text, 'broadcast');
      }),

      gameBus.on('npc:chop_tree', ({ treeId }) => {
        sceneRef.current?.treeSystem?.chopTreeById(treeId);
      }),

      gameBus.on('npc:dispatch', ({ npcName, carriedItems }) => {
        console.log(`[Dispatch] ${npcName} started`, carriedItems);
      }),

      gameBus.on('npc:dispatch_return', async ({ npcName, carriedItems }) => {
        console.log(`[Dispatch] ${npcName} returned`, carriedItems);
        try {
          const absoluteGameMinutes = sceneRef.current?.getAbsoluteGameMinutes?.() ?? 0;
          const result = await npcDispatchReturn({ npcName, carriedItems, absoluteGameMinutes }).unwrap();
          sceneRef.current?.npcSystem?.makeSay?.(npcName, result.story);
          const playerPos = sceneRef.current?.playerSystem?.getPosition?.() ?? { x: 480, y: 350 };
          result.items.forEach((item: any, i: number) => {
            sceneRef.current?.spawnWorldItem(
              playerPos.x + (i % 3) * 20 - 20,
              playerPos.y + 30,
              item.itemId,
            );
          });
        } catch {
          sceneRef.current?.npcSystem?.makeSay?.(npcName, '跑了一趟，没带回啥东西，下次再说吧。');
        }
      }),
    ];

    return () => {
      if (storylineChoiceTimeoutRef.current !== null) {
        window.clearTimeout(storylineChoiceTimeoutRef.current);
        storylineChoiceTimeoutRef.current = null;
      }
      unsubs.forEach((unsub) => unsub());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelChat = useCallback(() => {
    chatOpenRef.current = false;
    setChat({ open: false, npcName: '', initialValue: '' });
    sceneRef.current?.resumeInput();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNpcConfirmYes = useCallback(() => {
    if (!npcConfirm) return;
    sceneRef.current?.npcSystem?.confirmAction?.(npcConfirm.npcName, true);
    setNpcConfirm(null);
  }, [npcConfirm, sceneRef]);

  const handleNpcConfirmNo = useCallback(() => {
    if (!npcConfirm) return;
    sceneRef.current?.npcSystem?.confirmAction?.(npcConfirm.npcName, false);
    setNpcConfirm(null);
  }, [npcConfirm, sceneRef]);

  const handleStorylineChoiceSelect = useCallback((choiceId: string) => {
    if (!storylineChoice) return;
    if (storylineChoiceTimeoutRef.current !== null) {
      window.clearTimeout(storylineChoiceTimeoutRef.current);
      storylineChoiceTimeoutRef.current = null;
    }
    gameBus.emit('storyline:choice_resolved', {
      requestId: storylineChoice.requestId,
      choiceId,
    });
    chatOpenRef.current = false;
    setStorylineChoice(null);
    sceneRef.current?.resumeInput();
  }, [chatOpenRef, sceneRef, storylineChoice]);

  const handleSendMessage = useCallback(async (text: string) => {
    const { npcName } = chat;
    if (!sceneRef.current) return;

    if (text.startsWith('/')) {
      chatOpenRef.current = false;
      setChat({ open: false, npcName, initialValue: '' });
      sceneRef.current.resumeInput();
      registerGameSceneCommands(sceneRef.current);
      const feedback = sceneRef.current.commands?.execute(text) ?? '';
      if (feedback) {
        setDialog({ visible: true, text: feedback, npcName: '系统' });
      }
      return;
    }

    chatOpenRef.current = false;
    setChat({ open: false, npcName, initialValue: '' });
    sceneRef.current.resumeInput();
    if (npcName) {
      sceneRef.current.dialogueSystem?.showPlayerSpeechLine(text);
      await sendNpcChatMessage(npcName, text, 'targeted');
      return;
    }
    sceneRef.current.dialogueSystem?.broadcastFromPlayer(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, sendNpcChatMessage]);

  return {
    dialog,
    setDialog,
    chat,
    setChat,
    npcConfirm,
    storylineChoice,
    npcInventoriesRef,
    handleSendMessage,
    handleCancelChat,
    handleNpcConfirmYes,
    handleNpcConfirmNo,
    handleStorylineChoiceSelect,
  };
}
