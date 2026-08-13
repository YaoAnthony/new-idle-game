import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../../../../Redux/store';
import { useSaveGameSaveMutation } from '../../../../api/profileStateRtkApi';
import {
  setGameAgentBrainEnabled,
  setGamePathLineEnabled,
  setGamePhysicsDebug,
  setGameSettings,
  setGameSleepThreshold,
  setGameTimeMinute,
  setGameWeather,
  type GameSettingsState,
  type MusicPlaybackMode,
  type GameWeatherSetting,
} from '../../../../Redux/Features/gameSlice';
import { MINS_PER_DAY, createDefaultGameTimeState, setMinuteOfDay } from '../SystemIdleGame/time/GameTime';

const quickTimes = [
  { label: '清晨', minute: 360 },
  { label: '上午', minute: 540 },
  { label: '中午', minute: 720 },
  { label: '傍晚', minute: 1080 },
  { label: '深夜', minute: 1320 },
];

const weatherOptions: Array<{ value: GameWeatherSetting; label: string }> = [
  { value: 'clear', label: '晴天' },
  { value: 'rain', label: '下雨' },
  { value: 'storm', label: '雷雨' },
  { value: 'fog', label: '雾天' },
];

const musicPlaybackModeOptions: Array<{ value: MusicPlaybackMode; label: string; hint: string }> = [
  { value: 'shuffle', label: '乱序', hint: '随机播放完整歌单' },
  { value: 'sequence', label: '顺序', hint: '按曲目列表推进' },
  { value: 'repeat-one', label: '单曲', hint: '循环当前音乐' },
];

function formatMinute(minute: number) {
  const safeMinute = Math.max(0, Math.min(MINS_PER_DAY - 1, Math.round(minute)));
  const hour = Math.floor(safeMinute / 60).toString().padStart(2, '0');
  const min = (safeMinute % 60).toString().padStart(2, '0');
  return `${hour}:${min}`;
}

const panelStyle: React.CSSProperties = {
  border: '2px solid var(--px-border)',
  borderRadius: 6,
  background: 'var(--px-surface)',
  boxShadow: '0 4px 0 rgba(0,0,0,0.35)',
};

const GameSettings: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const rawSettings = useSelector((state: RootState) => state.game.settings);
  const settings: GameSettingsState = {
    ...rawSettings,
    masterVolume: typeof rawSettings.masterVolume === 'number' ? rawSettings.masterVolume : 1,
    audioEnabled: rawSettings.audioEnabled !== false,
    audioVolume: typeof rawSettings.audioVolume === 'number' ? rawSettings.audioVolume : 0.6,
    musicEnabled: rawSettings.musicEnabled !== false,
    musicVolume: typeof rawSettings.musicVolume === 'number' ? rawSettings.musicVolume : 0.1,
    musicPlaybackMode: rawSettings.musicPlaybackMode ?? 'shuffle',
    pathLineEnabled: Boolean(rawSettings.pathLineEnabled),
    agentBrainEnabled: rawSettings.agentBrainEnabled !== false,
  };
  const savedGameSave = useSelector((state: RootState) => state.profile.profile?.gameSave ?? null);
  const [saveGameSave] = useSaveGameSaveMutation();

  const persistSettings = useCallback((next: GameSettingsState, patch: Partial<GameSettingsState> = {}) => {
    if (!savedGameSave) return;
    const gameSave = structuredClone(savedGameSave);
    gameSave.worldStatus.settings = {
      ...gameSave.worldStatus.settings,
      ...next,
    };
    if (typeof patch.timeMinute === 'number') {
      const currentTime = gameSave.worldStatus.time ?? createDefaultGameTimeState();
      gameSave.worldStatus.time = {
        ...currentTime,
        absoluteGameMinutes: setMinuteOfDay(currentTime.absoluteGameMinutes, patch.timeMinute),
      };
    }
    saveGameSave({ gameSave, roomId: gameSave.worldStatus.roomId }).catch(() => {});
  }, [saveGameSave, savedGameSave]);

  const updateSettings = useCallback((patch: Partial<GameSettingsState>) => {
    const next: GameSettingsState = {
      ...settings,
      ...patch,
    };
    dispatch(setGameSettings(next));
    persistSettings(next, patch);
  }, [dispatch, persistSettings, settings]);

  const commandPreview = [
    `/time set ${settings.timeMinute}`,
    `/weather ${settings.weather}`,
    `/audio ${settings.audioEnabled ? 'on' : 'off'}`,
    `/audio volume ${settings.audioVolume.toFixed(2)}`,
    `/music ${settings.musicEnabled ? 'on' : 'off'}`,
    `/music volume ${settings.musicVolume.toFixed(2)}`,
    `/debug ${settings.physicsDebug ? 'on' : 'off'}`,
    `/pathline ${settings.pathLineEnabled ? 'on' : 'off'}`,
    `/sleep threshold ${settings.sleepThreshold.toFixed(2)}`,
    `/agent brain ${settings.agentBrainEnabled ? 'on' : 'off'}`,
  ];

  const setWeather = (weather: GameWeatherSetting) => {
    dispatch(setGameWeather(weather));
    persistSettings({ ...settings, weather }, { weather });
  };

  return (
    <div
      style={{
        minHeight: '100%',
        padding: 24,
        color: 'var(--px-text)',
        fontFamily: '"Courier New", monospace',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: 'var(--px-gold)', letterSpacing: 0 }}>
              游戏设置
            </h1>
            <p style={{ margin: '6px 0 0', color: 'var(--px-muted)', fontSize: 13 }}>
              这些选项会通过游戏里的 command system 应用到挂机培养场景。
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/idle-game')}
            style={{
              border: '2px solid var(--px-border-gold)',
              borderRadius: 4,
              background: 'var(--px-surface2)',
              color: 'var(--px-gold)',
              padding: '9px 14px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            进入挂机培养
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, 0.65fr)', gap: 16 }}>
          <section style={{ ...panelStyle, padding: 18 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16 }}>世界控制</h2>

            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <label htmlFor="game-time" style={{ fontWeight: 700 }}>时间</label>
                <span style={{ color: 'var(--px-gold)', fontWeight: 700 }}>{formatMinute(settings.timeMinute)}</span>
              </div>
              <input
                id="game-time"
                type="range"
                min={0}
                max={MINS_PER_DAY - 1}
                step={15}
                value={settings.timeMinute}
                onChange={(event) => {
                  const timeMinute = Number(event.target.value);
                  dispatch(setGameTimeMinute(timeMinute));
                  updateSettings({ timeMinute });
                }}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {quickTimes.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      dispatch(setGameTimeMinute(item.minute));
                      updateSettings({ timeMinute: item.minute });
                    }}
                    style={{
                      border: '1px solid var(--px-border)',
                      borderRadius: 4,
                      background: settings.timeMinute === item.minute ? 'rgba(255,215,0,0.14)' : 'var(--px-surface2)',
                      color: settings.timeMinute === item.minute ? 'var(--px-gold)' : 'var(--px-text)',
                      padding: '7px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ marginBottom: 10, fontWeight: 700 }}>天气</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {weatherOptions.map(({ value: weather, label }) => (
                  <button
                    key={weather}
                    type="button"
                    onClick={() => setWeather(weather)}
                    style={{
                      minHeight: 44,
                      border: `2px solid ${settings.weather === weather ? 'var(--px-border-gold)' : 'var(--px-border)'}`,
                      borderRadius: 4,
                      background: settings.weather === weather ? 'rgba(255,215,0,0.12)' : 'var(--px-surface2)',
                      color: settings.weather === weather ? 'var(--px-gold)' : 'var(--px-text)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 22, padding: 12, border: '1px solid var(--px-border)', borderRadius: 4, background: 'var(--px-surface2)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--px-gold)' }}>声音</h3>
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>总体音量</strong>
                    <span style={{ color: 'var(--px-gold)', fontWeight: 700 }}>
                      {Math.round(settings.masterVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.masterVolume}
                    onChange={(event) => {
                      const masterVolume = Number(event.target.value);
                      updateSettings({ masterVolume });
                    }}
                    style={{ width: '100%' }}
                  />
                  <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 4 }}>
                    所有背景音乐、环境声和音效都会先经过这一层。
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>Audio</strong>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--px-gold)' }}>
                      <input
                        type="checkbox"
                        checked={settings.audioEnabled}
                        onChange={(event) => updateSettings({ audioEnabled: event.target.checked })}
                      />
                      {settings.audioEnabled ? 'ON' : 'OFF'} · {Math.round(settings.audioVolume * 100)}%
                    </label>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.audioVolume}
                    disabled={!settings.audioEnabled}
                    onChange={(event) => {
                      const audioVolume = Number(event.target.value);
                      updateSettings({ audioVolume });
                    }}
                    style={{ width: '100%' }}
                  />
                  <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 4 }}>
                    雨声、环境声、对白提示、车辆和 UI 音效。
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>Music</strong>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--px-gold)' }}>
                      <input
                        type="checkbox"
                        checked={settings.musicEnabled}
                        onChange={(event) => updateSettings({ musicEnabled: event.target.checked })}
                      />
                      {settings.musicEnabled ? 'ON' : 'OFF'} · {Math.round(settings.musicVolume * 100)}%
                    </label>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.musicVolume}
                    disabled={!settings.musicEnabled}
                    onChange={(event) => {
                      const musicVolume = Number(event.target.value);
                      updateSettings({ musicVolume });
                    }}
                    style={{ width: '100%' }}
                  />
                  <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 4 }}>
                    只控制纯背景音乐，不影响雨声和音效
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong>播放模式</strong>
                      <span style={{ color: 'var(--px-muted)', fontSize: 12 }}>
                        {musicPlaybackModeOptions.find((option) => option.value === settings.musicPlaybackMode)?.hint}
                      </span>
                    </div>
                    <div
                      style={{
                        position: 'relative',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 0,
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
                          background: 'rgba(245,158,11,0.18)',
                          transform: `translateX(${Math.max(0, musicPlaybackModeOptions.findIndex((option) => option.value === settings.musicPlaybackMode)) * 100}%)`,
                          transition: 'transform 180ms ease',
                        }}
                      />
                      {musicPlaybackModeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateSettings({ musicPlaybackMode: option.value })}
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            border: 0,
                            borderRadius: 5,
                            background: 'transparent',
                            color: settings.musicPlaybackMode === option.value ? 'var(--px-gold)' : 'var(--px-muted)',
                            padding: '8px 6px',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: 12,
                  border: '1px solid var(--px-border)',
                  borderRadius: 4,
                  background: 'var(--px-surface2)',
                }}
              >
                <span>
                  <strong>Physics Debug</strong>
                  <span style={{ display: 'block', color: 'var(--px-muted)', fontSize: 12, marginTop: 3 }}>
                    对应 /debug on | off，显示碰撞体调试线。
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.physicsDebug}
                  onChange={(event) => {
                    const physicsDebug = event.target.checked;
                    dispatch(setGamePhysicsDebug(physicsDebug));
                    updateSettings({ physicsDebug });
                  }}
                  style={{ width: 22, height: 22 }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: 12,
                  border: '1px solid var(--px-border)',
                  borderRadius: 4,
                  background: 'var(--px-surface2)',
                }}
              >
                <span>
                  <strong>Path Lines</strong>
                  <span style={{ display: 'block', color: 'var(--px-muted)', fontSize: 12, marginTop: 3 }}>
                    对应 /pathline on | off，显示 NPC 当前寻路路线。
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.pathLineEnabled}
                  onChange={(event) => {
                    const pathLineEnabled = event.target.checked;
                    dispatch(setGamePathLineEnabled(pathLineEnabled));
                    updateSettings({ pathLineEnabled });
                  }}
                  style={{ width: 22, height: 22 }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: 12,
                  border: '1px solid var(--px-border)',
                  borderRadius: 4,
                  background: 'var(--px-surface2)',
                }}
              >
                <span>
                  <strong>Agent Brain</strong>
                  <span style={{ display: 'block', color: 'var(--px-muted)', fontSize: 12, marginTop: 3 }}>
                    对应 /agent brain on | off，控制 NPC 自主思考、日程和需求驱动。
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.agentBrainEnabled}
                  onChange={(event) => {
                    const agentBrainEnabled = event.target.checked;
                    dispatch(setGameAgentBrainEnabled(agentBrainEnabled));
                    updateSettings({ agentBrainEnabled });
                  }}
                  style={{ width: 22, height: 22 }}
                />
              </label>

              <div style={{ padding: 12, border: '1px solid var(--px-border)', borderRadius: 4, background: 'var(--px-surface2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>睡眠跳过比例</strong>
                  <span style={{ color: 'var(--px-gold)' }}>{Math.round(settings.sleepThreshold * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sleepThreshold}
                  onChange={(event) => {
                    const sleepThreshold = Number(event.target.value);
                    dispatch(setGameSleepThreshold(sleepThreshold));
                    updateSettings({ sleepThreshold });
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </section>

          <aside style={{ ...panelStyle, padding: 18 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Command Preview</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {commandPreview.map(command => (
                <code
                  key={command}
                  style={{
                    display: 'block',
                    padding: '9px 10px',
                    border: '1px solid var(--px-border)',
                    borderRadius: 4,
                    background: '#0d1117',
                    color: '#d7f7a8',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    overflow: 'auto',
                  }}
                >
                  {command}
                </code>
              ))}
            </div>
            <p style={{ color: 'var(--px-muted)', fontSize: 12, lineHeight: 1.6, marginTop: 14 }}>
              设置会保存在当前前端会话里。进入挂机培养后，场景 ready 时会自动执行这些命令。
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default GameSettings;
