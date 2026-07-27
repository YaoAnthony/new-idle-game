/** HUD — save button, mask progress, controls hint. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { getInputLabels } from '../features/input/InputBindings';
import { gameBus, type MaskProgressRewardAnimation } from '../shared/EventBus';

interface HUDProps {
  isSaving: boolean;
  username: string;
  onSave:   () => void;
  showHints?: boolean;
  maskRadius?: number;
  maskProgress?: {
    level: number;
    progress: number;
    required: number;
  };
  maskProgressBarDisplay?: boolean;
}

export const HUD: React.FC<HUDProps> = ({
  isSaving,
  username,
  onSave,
  showHints = true,
  maskRadius = 0,
  maskProgress = { level: 0, progress: 0, required: 1 },
  maskProgressBarDisplay = false,
}) => {
  const targetProgress = useMemo(
    () => normalizeHudMaskProgress(maskProgress, maskRadius),
    [maskProgress?.level, maskProgress?.progress, maskProgress?.required, maskRadius],
  );
  const [displayProgress, setDisplayProgress] = useState(targetProgress);
  const [progressVisible, setProgressVisible] = useState(maskProgressBarDisplay);
  const displayProgressRef = useRef(displayProgress);
  const progressVisibleRef = useRef(progressVisible);
  const animationTimersRef = useRef<number[]>([]);
  const rewardAnimationActiveRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    displayProgressRef.current = displayProgress;
  }, [displayProgress]);

  useEffect(() => {
    progressVisibleRef.current = progressVisible;
  }, [progressVisible]);

  useEffect(() => {
    return () => {
      animationTimersRef.current.forEach(window.clearTimeout);
      animationTimersRef.current = [];
    };
  }, []);

  const clearAnimationTimers = () => {
    animationTimersRef.current.forEach(window.clearTimeout);
    animationTimersRef.current = [];
  };

  useEffect(() => {
    clearAnimationTimers();

    const current = displayProgressRef.current;
    if (!mountedRef.current) {
      mountedRef.current = true;
      setDisplayProgress(targetProgress);
      setProgressVisible(maskProgressBarDisplay);
      return;
    }

    if (rewardAnimationActiveRef.current) return;

    if (!maskProgressBarDisplay) {
      setProgressVisible(false);
      setDisplayProgress(targetProgress);
      return;
    }

    if (!progressVisibleRef.current) {
      const fallbackTimer = window.setTimeout(() => {
        if (rewardAnimationActiveRef.current) return;
        setDisplayProgress(targetProgress);
        setProgressVisible(true);
      }, 160);
      animationTimersRef.current.push(fallbackTimer);
      return;
    }

    runProgressSequence({
      from: current,
      to: targetProgress,
      revealMask: null,
      includeFadeIn: false,
      clearTimers: false,
    });
  }, [targetProgress, maskProgressBarDisplay]);

  const runProgressSequence = ({
    from,
    to,
    revealMask,
    includeFadeIn,
    clearTimers = true,
  }: {
    from: ReturnType<typeof normalizeHudMaskProgress>;
    to: ReturnType<typeof normalizeHudMaskProgress>;
    revealMask: MaskProgressRewardAnimation['mask'] | null;
    includeFadeIn: boolean;
    clearTimers?: boolean;
  }) => {
    if (clearTimers) clearAnimationTimers();

    const fillDurationMs = 720;
    const levelPauseMs = 260;
    const fadeDurationMs = 900;
    const revealPauseMs = 260;
    let elapsedMs = includeFadeIn ? fadeDurationMs : 0;
    let cursor = { ...from };

    const queue = (delayMs: number, update: () => void) => {
      const timer = window.setTimeout(update, delayMs);
      animationTimersRef.current.push(timer);
    };

    setDisplayProgress(from);
    if (includeFadeIn) {
      setProgressVisible(true);
    }

    if (cursor.level < to.level && cursor.progress < cursor.required) {
      queue(elapsedMs, () => setDisplayProgress(prev => ({ ...prev, progress: prev.required })));
      elapsedMs += fillDurationMs;
    }

    while (cursor.level < to.level) {
      const nextLevel = cursor.level + 1;
      const levelsRemainingAfterThis = to.level - nextLevel;
      const nextRequired = nextLevel === to.level
        ? to.required
        : Math.max(1, nextLevel + 1);
      const nextRadius = Math.max(
        0,
        to.radius - levelsRemainingAfterThis,
      );

      queue(elapsedMs + levelPauseMs, () => {
        setDisplayProgress({
          level: nextLevel,
          progress: 0,
          required: nextRequired,
          radius: nextRadius,
        });
      });
      elapsedMs += levelPauseMs;

      cursor = {
        level: nextLevel,
        progress: 0,
        required: nextRequired,
        radius: nextRadius,
      };

      const shouldFillThisLevel = nextLevel < to.level || to.progress > 0;
      if (shouldFillThisLevel) {
        const nextProgress = nextLevel < to.level ? nextRequired : to.progress;
        queue(elapsedMs, () => {
          setDisplayProgress(prev => ({
            ...prev,
            progress: Math.max(0, Math.min(prev.required, nextProgress)),
          }));
        });
        elapsedMs += fillDurationMs;
        cursor.progress = nextProgress;
      }
    }

    if (cursor.level === to.level && cursor.progress !== to.progress) {
      queue(elapsedMs, () => {
        setDisplayProgress(prev => ({
          ...prev,
          progress: Math.max(0, Math.min(prev.required, to.progress)),
        }));
      });
      elapsedMs += fillDurationMs;
    }

    if (revealMask) {
      queue(elapsedMs + revealPauseMs, () => {
        gameBus.emit('game:mask_progress_reveal_ready', {
          mask: revealMask,
          radius: Math.max(0, Number(revealMask.radius || 0)),
        });
      });
      elapsedMs += revealPauseMs;
    }

    queue(elapsedMs + 80, () => {
      rewardAnimationActiveRef.current = false;
    });
  };

  useEffect(() => {
    const unsubscribe = gameBus.on('game:mask_progress_rewarded', (reward) => {
      rewardAnimationActiveRef.current = true;
      const from = normalizeHudMaskProgress(reward.previousMaskProgress, Number(reward.previousMask?.radius ?? displayProgressRef.current.radius));
      const to = normalizeHudMaskProgress(reward.maskProgress, Number(reward.mask?.radius ?? targetProgress.radius));
      const shouldFadeIn = reward.previousConfiguration?.maskProgressBarDisplay !== true
        || !progressVisibleRef.current;
      const shouldRevealMask = (reward.levelUps || 0) > 0 && reward.mask ? reward.mask : null;
      runProgressSequence({
        from,
        to,
        revealMask: shouldRevealMask,
        includeFadeIn: shouldFadeIn,
      });
    });
    return unsubscribe;
  }, [targetProgress.radius]);

  const required = displayProgress.required;
  const progress = displayProgress.progress;
  const progressPct = `${Math.round((progress / required) * 100)}%`;
  const progressLabel = formatProgressValue(progress);

  return (
  <>
    {/* ── Mask progress ── */}
    <AnimatePresence>
      {progressVisible && (
        <motion.div
          key="mask-progress"
          initial={{ opacity: 0, y: -8, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -8, x: '-50%' }}
          transition={{ duration: 0.9, ease: [0.22, 0.86, 0.32, 1] }}
          style={{
            position:      'absolute',
            top:           10,
            left:          '50%',
            display:       'grid',
            gridTemplateColumns: 'auto minmax(110px, 160px) auto',
            alignItems:    'center',
            gap:           8,
            width:         'min(360px, calc(100vw - 24px))',
            background:    'rgba(36, 20, 9, 0.78)',
            color:         '#ffe9a8',
            border:        '2px solid #d7a44d',
            boxShadow:     '0 2px 0 #573414, inset 0 0 0 1px rgba(255,239,173,0.32)',
            padding:       '5px 8px',
            borderRadius:  4,
            fontFamily:    '"Courier New", monospace',
            fontSize:      11,
            pointerEvents: 'none',
            userSelect:    'none',
            zIndex:        10,
          }}
        >
          <span style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>Lv.{displayProgress.level}</span>
          <span style={{
            position:      'relative',
            display:       'block',
            height:        10,
            background:    '#2a1708',
            border:        '1px solid #8f6a33',
            boxShadow:     'inset 0 1px 0 rgba(0,0,0,0.55)',
            overflow:      'hidden',
          }}>
            <span style={{
              position:   'absolute',
              inset:      0,
              width:      progressPct,
              background: 'linear-gradient(90deg, #d79a32, #ffe078)',
              boxShadow:  'inset 0 -2px 0 rgba(96,45,7,0.35)',
              transition: 'width 700ms cubic-bezier(0.22, 0.86, 0.32, 1)',
            }} />
          </span>
          <span style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{progressLabel}/{required}</span>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── Save ── */}
    <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 10 }}>
      <button
        onClick={onSave}
        disabled={isSaving}
        style={{
          background:   isSaving ? '#444' : '#2a5c2a',
          color:        '#cfc',
          border:       '1px solid #4a8a4a',
          borderRadius: 6,
          padding:      '4px 12px',
          fontSize:     12,
          cursor:       isSaving ? 'wait' : 'pointer',
          fontFamily:   '"Courier New", monospace',
        }}
      >
        {isSaving ? '保存中…' : '💾 保存'}
      </button>
    </div>

    <AnimatePresence>
      {showHints && (
        <motion.div
          key="controls-hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{
            position:      'absolute',
            bottom:        68,   // above the hotbar
            left:          12,
            background:    'rgba(0,0,0,0.45)',
            color:         '#aaa',
            padding:       '3px 10px',
            borderRadius:  6,
            fontSize:      11,
            fontFamily:    '"Courier New", monospace',
            pointerEvents: 'none',
            userSelect:    'none',
            zIndex:        10,
          }}
        >
          {getInputLabels('moveUp')[0]}{getInputLabels('moveLeft')[0]}{getInputLabels('moveDown')[0]}{getInputLabels('moveRight')[0]} / ↑↓←→ 移动 · {getInputLabels('interact').join('/')} 使用工具/交易/交互 · {getInputLabels('chat').join('/')} 和NPC对话
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── Player name ── */}
    <AnimatePresence>
      {showHints && username && (
        <motion.div
          key="player-name"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{
            position:      'absolute',
            bottom:        68,
            right:         12,
            background:    'rgba(0,0,0,0.45)',
            color:         '#cfc',
            padding:       '3px 10px',
            borderRadius:  6,
            fontSize:      11,
            fontFamily:    '"Courier New", monospace',
            pointerEvents: 'none',
            userSelect:    'none',
            zIndex:        10,
          }}
        >
          {username}
        </motion.div>
      )}
    </AnimatePresence>
  </>
  );
};

function normalizeHudMaskProgress(
  maskProgress: HUDProps['maskProgress'],
  maskRadius: number,
): { level: number; progress: number; required: number; radius: number } {
  const level = Math.max(0, Math.floor(Number(maskProgress?.level || 0)));
  const required = Math.max(1, Math.floor(Number(maskProgress?.required || level + 1)));
  const progress = Math.max(0, Math.min(required, Number(maskProgress?.progress || 0)));
  const radius = Math.max(0, Math.floor(Number(maskRadius || 0)));
  return { level, progress, required, radius };
}

function formatProgressValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, '');
}
