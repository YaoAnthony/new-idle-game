/**
 * MultiplayPanel — floating overlay for multiplayer join/host UI.
 */
import React, { useState } from 'react';

export type MultiplayStatus = 'idle' | 'connecting' | 'hosting' | 'connected' | 'error';

interface MultiplayPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose?: () => void;
  showToggle?: boolean;
  status: MultiplayStatus;
  roomId: string | null;
  peerInfo: { displayName: string } | null;
  error: string | null;
  onHost: () => void;
  onJoin: (roomId: string) => void;
  onDisconnect: () => void;
}

const MultiplayPanel: React.FC<MultiplayPanelProps> = ({
  isOpen,
  onToggle,
  onClose,
  showToggle = true,
  status,
  roomId,
  peerInfo,
  error,
  onHost,
  onJoin,
  onDisconnect,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  const copyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColor = status === 'connected' ? '#4caf50'
    : status === 'hosting' ? '#4488ff'
    : status === 'error' ? '#f44336'
    : '#888';

  if (!showToggle && !isOpen) return null;

  return (
    <div style={{ position: 'absolute', top: 48, right: 16, zIndex: 260, fontFamily: '"Courier New", monospace' }}>
      {showToggle && (
        <button
          onClick={onToggle}
          style={{
            background: 'rgba(10,10,20,0.85)',
            border: `2px solid ${statusColor}`,
            color: '#eee',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: '11px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            whiteSpace: 'nowrap',
          }}
        >
          🌐
          {status === 'connected' ? '联机中' : status === 'hosting' ? '等待中' : status === 'connecting' ? '连接...' : '联机'}
        </button>
      )}

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: showToggle ? 34 : 0,
          right: 0,
          width: 230,
          background: 'rgba(8,8,18,0.95)',
          border: `2px solid ${statusColor}`,
          borderRadius: 6,
          padding: '12px 14px',
          color: '#ddd',
          fontSize: '11px',
          boxShadow: '0 4px 20px #000a',
        }}>
          {!showToggle && (
            <button
              type="button"
              onClick={onClose ?? onToggle}
              aria-label="关闭联机面板"
              style={{
                position: 'absolute',
                top: 6,
                right: 8,
                border: '1px solid #334',
                background: '#111827',
                color: '#bbb',
                borderRadius: 4,
                width: 22,
                height: 22,
                cursor: 'pointer',
                lineHeight: '18px',
              }}
            >
              x
            </button>
          )}

          {status === 'idle' && (
            <>
              <div style={{ marginBottom: 10, color: '#aaa' }}>🎮 多人联机</div>
              <button onClick={onHost} style={btnStyle('#0d2a52', '#4488ff')}>
                🏠 创建房间（你当主机）
              </button>
              <div style={{ margin: '10px 0 6px', textAlign: 'center', color: '#555' }}>── 或加入别人 ──</div>
              <input
                placeholder="粘贴好友的房间 ID"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && joinCode.trim() && onJoin(joinCode.trim())}
                style={inputStyle}
              />
              <button
                onClick={() => joinCode.trim() && onJoin(joinCode.trim())}
                disabled={!joinCode.trim()}
                style={btnStyle('#0d2a18', '#44aa44')}
              >
                🚪 加入房间
              </button>
            </>
          )}

          {status === 'connecting' && (
            <div style={{ textAlign: 'center', color: '#aaa', padding: '8px 0' }}>⏳ 连接中...</div>
          )}

          {(status === 'hosting' || status === 'connected') && roomId && (
            <>
              <div style={{ marginBottom: 6, color: '#aaa' }}>你的房间 ID（发给好友）：</div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 10, alignItems: 'center' }}>
                <span style={{
                  flex: 1,
                  background: '#111',
                  border: '1px solid #334',
                  padding: '3px 7px',
                  borderRadius: 3,
                  color: '#88aaff',
                  fontSize: '10px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {roomId}
                </span>
                <button onClick={copyRoomId} style={{ ...btnStyle('#222', '#555'), padding: '3px 8px', width: 'auto' }}>
                  {copied ? '✓' : '复制'}
                </button>
              </div>

              {status === 'hosting' && !peerInfo && (
                <div style={{ color: '#888', fontSize: '10px', marginBottom: 8 }}>
                  ⏳ 等待好友输入上面的 ID...
                </div>
              )}
              {peerInfo && (
                <div style={{ color: '#4caf50', fontSize: '10px', marginBottom: 8 }}>
                  ✓ {peerInfo.displayName} 已连接！
                </div>
              )}

              <button onClick={onDisconnect} style={btnStyle('#2a0d0d', '#aa4444')}>
                断开连接
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ color: '#f88', marginBottom: 8 }}>{error ?? '连接失败'}</div>
              <button onClick={onDisconnect} style={btnStyle('#2a0d0d', '#aa4444')}>重试</button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const btnStyle = (bg: string, border: string): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  background: bg,
  border: `1px solid ${border}`,
  color: '#ddd',
  padding: '5px 8px',
  cursor: 'pointer',
  fontSize: '11px',
  borderRadius: 4,
  marginTop: 4,
  textAlign: 'center' as const,
  boxSizing: 'border-box' as const,
});

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: '#050510',
  border: '1px solid #334',
  color: '#ddd',
  padding: '4px 7px',
  fontSize: '11px',
  borderRadius: 3,
  marginBottom: 4,
  boxSizing: 'border-box',
  outline: 'none',
};

export default MultiplayPanel;
