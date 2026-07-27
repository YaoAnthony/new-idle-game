import React from 'react';
import { FaListOl, FaRandom, FaRedo } from 'react-icons/fa';
import type { GameSettingsState, MusicPlaybackMode } from '../../../../../Redux/Features/gameSlice';

type AudioSettingsPatch = Pick<
  GameSettingsState,
  'masterVolume' | 'audioEnabled' | 'audioVolume' | 'musicEnabled' | 'musicVolume' | 'musicPlaybackMode' | 'musicBackgroundPlayback'
>;

interface AudioSettingsModalProps {
  open: boolean;
  settings: GameSettingsState;
  onChange: (patch: Partial<AudioSettingsPatch>) => void;
  onNextMusicTrack?: () => void;
  onClose: () => void;
}

const buttonStyle: React.CSSProperties = {
  border: '2px solid var(--px-border)',
  borderRadius: 6,
  background: 'var(--px-surface2)',
  color: 'var(--px-text)',
  padding: '7px 12px',
  fontFamily: '"Courier New", monospace',
  fontWeight: 900,
  cursor: 'pointer',
};

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function VolumeRow({
  title,
  hint,
  enabled,
  volume,
  onToggle,
  onVolume,
  actionLabel,
  onAction,
  extraControl,
}: {
  title: string;
  hint: string;
  enabled?: boolean;
  volume: number;
  onToggle?: (enabled: boolean) => void;
  onVolume: (volume: number) => void;
  actionLabel?: string;
  onAction?: () => void;
  extraControl?: React.ReactNode;
}) {
  const isEnabled = enabled !== false;

  return (
    <section
      style={{
        border: '1px solid var(--px-border)',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.04)',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: 'var(--px-gold)', fontSize: 14, fontWeight: 900 }}>{title}</div>
          <div style={{ marginTop: 4, color: 'var(--px-muted)', fontSize: 12, lineHeight: 1.45 }}>
            {hint}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {onAction && (
            <button
              type="button"
              onClick={onAction}
              disabled={!isEnabled}
              style={{
                ...buttonStyle,
                minWidth: 74,
                borderColor: isEnabled ? 'var(--px-border-gold)' : 'var(--px-border)',
                color: isEnabled ? 'var(--px-gold)' : 'var(--px-muted)',
                opacity: isEnabled ? 1 : 0.55,
              }}
            >
              {actionLabel ?? 'Next'}
            </button>
          )}
          {onToggle && (
            <button
              type="button"
              onClick={() => onToggle(!isEnabled)}
              style={{
                ...buttonStyle,
                minWidth: 72,
                borderColor: isEnabled ? 'var(--px-border-gold)' : 'var(--px-border)',
                color: isEnabled ? 'var(--px-gold)' : 'var(--px-muted)',
              }}
            >
              {isEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          {extraControl}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={!isEnabled}
          onChange={(event) => onVolume(clampVolume(Number(event.target.value)))}
          style={{ flex: 1 }}
        />
        <span
          style={{
            width: 48,
            textAlign: 'right',
            color: isEnabled ? 'var(--px-gold)' : 'var(--px-muted)',
            fontWeight: 900,
          }}
        >
          {Math.round(volume * 100)}%
        </span>
      </div>
    </section>
  );
}

const musicPlaybackModeOptions: Array<{
  value: MusicPlaybackMode;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { value: 'shuffle', label: '乱序', icon: FaRandom },
  { value: 'sequence', label: '顺序', icon: FaListOl },
  { value: 'repeat-one', label: '单曲', icon: FaRedo },
];

function MusicPlaybackModeRow({
  value,
  onChange,
}: {
  value: MusicPlaybackMode;
  onChange: (value: MusicPlaybackMode) => void;
}) {
  const selectedIndex = Math.max(0, musicPlaybackModeOptions.findIndex((option) => option.value === value));

  return (
    <section
      style={{
        border: '1px solid var(--px-border)',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.04)',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--px-gold)', fontSize: 14, fontWeight: 900 }}>播放模式</div>
          <div style={{ marginTop: 4, color: 'var(--px-muted)', fontSize: 12, lineHeight: 1.45 }}>
            乱序、顺序或单曲循环。
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          marginTop: 12,
          padding: 4,
          border: '1px solid var(--px-border)',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 4,
            width: 'calc((100% - 8px) / 3)',
            border: '1px solid var(--px-border-gold)',
            borderRadius: 5,
            background: 'rgba(245, 158, 11, 0.18)',
            transform: `translateX(${selectedIndex * 100}%)`,
            transition: 'transform 180ms ease',
          }}
        />
        {musicPlaybackModeOptions.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                minWidth: 0,
                border: 0,
                borderRadius: 5,
                background: 'transparent',
                color: selected ? 'var(--px-gold)' : 'var(--px-muted)',
                padding: '8px 4px',
                fontFamily: '"Courier New", monospace',
                fontSize: 12,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              <Icon size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AudioSettingsModal({
  open,
  settings,
  onChange,
  onNextMusicTrack,
  onClose,
}: AudioSettingsModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="声音设置"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 420,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0,0,0,0.38)',
        fontFamily: '"Courier New", monospace',
        color: 'var(--px-text)',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(430px, calc(100vw - 32px))',
          border: '3px solid var(--px-border-gold)',
          borderRadius: 8,
          background: 'var(--px-surface)',
          boxShadow: '0 8px 0 rgba(0,0,0,0.35), 0 20px 48px rgba(0,0,0,0.45)',
          padding: 16,
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--px-gold)', letterSpacing: 0 }}>
              声音设置
            </h2>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--px-muted)' }}>
              先调总体音量，再分别调音效和音乐。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭声音设置"
            style={{
              ...buttonStyle,
              width: 36,
              height: 34,
              padding: 0,
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <VolumeRow
            title="总体音量"
            hint="同时影响背景音乐、环境声、UI、对话和交互音效。"
            volume={typeof settings.masterVolume === 'number' ? settings.masterVolume : 1}
            onVolume={(masterVolume) => onChange({ masterVolume })}
            extraControl={(
              <button
                type="button"
                onClick={() => onChange({ musicBackgroundPlayback: !settings.musicBackgroundPlayback })}
                style={{
                  ...buttonStyle,
                  minWidth: 86,
                  borderColor: settings.musicBackgroundPlayback ? 'var(--px-border-gold)' : 'var(--px-border)',
                  color: settings.musicBackgroundPlayback ? 'var(--px-gold)' : 'var(--px-muted)',
                }}
              >
                后台 {settings.musicBackgroundPlayback ? 'ON' : 'OFF'}
              </button>
            )}
          />
          <VolumeRow
            title="音效"
            hint="雨声、海浪、UI、对话、车辆和交互音效。"
            enabled={settings.audioEnabled !== false}
            volume={typeof settings.audioVolume === 'number' ? settings.audioVolume : 0.6}
            onToggle={(audioEnabled) => onChange({ audioEnabled })}
            onVolume={(audioVolume) => onChange({ audioVolume })}
          />
          <VolumeRow
            title="音乐"
            hint="纯背景音乐，不影响雨声和其他音效。"
            enabled={settings.musicEnabled !== false}
            volume={typeof settings.musicVolume === 'number' ? settings.musicVolume : 0.1}
            onToggle={(musicEnabled) => onChange({ musicEnabled })}
            onVolume={(musicVolume) => onChange({ musicVolume })}
            actionLabel="Next"
            onAction={onNextMusicTrack}
          />
          <MusicPlaybackModeRow
            value={settings.musicPlaybackMode ?? 'shuffle'}
            onChange={(musicPlaybackMode) => onChange({ musicPlaybackMode })}
          />
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...buttonStyle,
              borderColor: 'var(--px-border-gold)',
              color: 'var(--px-gold)',
            }}
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
