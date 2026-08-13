import React from 'react';
import { Spin } from 'antd';
import { CloseOutlined, LoadingOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StorylineDraft, StorylineMentionContext } from '../types';

interface StorylineChatProps {
  draft: StorylineDraft | null;
  value: string;
  sending: boolean;
  iterating: boolean;
  streamText: string;
  mention: StorylineMentionContext | null;
  onChange: (value: string) => void;
  onSend: () => void;
  onIterate: () => void;
  onClearMention: () => void;
}

export const StorylineChat: React.FC<StorylineChatProps> = ({
  draft,
  value,
  sending,
  iterating,
  streamText,
  mention,
  onChange,
  onSend,
  onIterate,
  onClearMention,
}) => {
  const messages = draft?.messages ?? [];

  return (
    <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: 'auto 1fr auto', ...selectableTextStyle }}>
      <header style={{ padding: '14px 18px', borderBottom: '2px solid var(--px-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <h1 style={{ color: 'var(--px-gold)', fontSize: 20, margin: 0, letterSpacing: 0 }}>剧情工作台</h1>
            <p style={{ color: 'var(--px-muted)', fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>
              聊天负责表达意图，更新会生成新版本并自动审查，右侧负责把 trigger、action、consequence 的问题挑出来。
            </p>
          </div>
          <button
            type="button"
            onClick={onIterate}
            disabled={!draft || iterating}
            title="更新剧情并自动审查"
            style={toolbarButtonStyle(Boolean(draft) && !iterating)}
          >
            <ThunderboltOutlined /> {iterating ? '更新中' : '更新'}
          </button>
        </div>
      </header>

      <div style={{ overflow: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!draft && (
          <div style={{ color: 'var(--px-muted)', lineHeight: 1.7 }}>
            左侧新建剧情，或者把已发布 JSON 导入成草稿继续修改。
          </div>
        )}
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div
              key={message.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: 'min(760px, 90%)',
                border: `2px solid ${isUser ? 'var(--px-border-gold)' : 'var(--px-border)'}`,
                borderRadius: 6,
                padding: 12,
                background: isUser ? 'rgba(255,215,0,0.1)' : 'var(--px-surface2)',
                color: 'var(--px-text)',
                lineHeight: 1.6,
                fontSize: 14,
                ...selectableTextStyle,
              }}
            >
              {message.contextLabel && (
                <div style={messageMentionStyle}>@{message.contextLabel}</div>
              )}
              <MarkdownBlock content={message.content} />
            </div>
          );
        })}
        {sending && !streamText && (
          <div style={assistantBubbleStyle}>
            <Spin indicator={<LoadingOutlined spin />} size="small" />
            <span style={{ marginLeft: 8, color: 'var(--px-muted)' }}>LLM 正在思考...</span>
          </div>
        )}
        {streamText && (
          <div style={assistantBubbleStyle}>
            <MarkdownBlock content={`${streamText}\n\n▌`} />
          </div>
        )}
      </div>

      <footer style={{ padding: 14, borderTop: '2px solid var(--px-border)', background: 'var(--px-surface)' }}>
        {mention && (
          <div style={inputMentionStyle}>
            <span>@{mention.label}</span>
            <button type="button" onClick={onClearMention} title="移除引用" style={mentionCloseStyle}>
              <CloseOutlined />
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={!draft || sending}
            placeholder="例如：把老李接猫这条主线改得更自然，猫要记住大巴、家门口和老李。"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              if (event.shiftKey) return;
              event.preventDefault();
              onSend();
            }}
            style={{
              flex: 1,
              minHeight: 104,
              resize: 'vertical',
              border: '2px solid var(--px-border)',
              borderRadius: 4,
              background: 'var(--px-surface2)',
              color: 'var(--px-text)',
              padding: 10,
              fontSize: 14,
              outline: 'none',
              lineHeight: 1.5,
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!draft || sending || !value.trim()}
            title="发送"
            style={{
              width: 68,
              border: '2px solid var(--px-border-gold)',
              borderRadius: 4,
              background: value.trim() ? 'rgba(255,215,0,0.12)' : 'rgba(0,0,0,0.08)',
              color: value.trim() ? 'var(--px-gold)' : 'var(--px-muted)',
              cursor: !draft || sending || !value.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 900,
              fontSize: 20,
            }}
          >
            <SendOutlined />
          </button>
        </div>
      </footer>
    </section>
  );
};

const MarkdownBlock: React.FC<{ content: string }> = ({ content }) => (
  <div style={{ whiteSpace: 'normal', ...selectableTextStyle }}>
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  </div>
);

const selectableTextStyle: React.CSSProperties = {
  userSelect: 'text',
  WebkitUserSelect: 'text',
};

const assistantBubbleStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  maxWidth: 'min(760px, 90%)',
  border: '2px solid var(--px-border)',
  borderRadius: 6,
  padding: 12,
  background: 'var(--px-surface2)',
  color: 'var(--px-text)',
  lineHeight: 1.6,
  fontSize: 14,
  opacity: 0.95,
  ...selectableTextStyle,
};

const inputMentionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: '100%',
  border: '1px solid var(--px-border-gold)',
  borderRadius: 999,
  padding: '4px 8px 4px 10px',
  marginBottom: 8,
  color: 'var(--px-gold)',
  background: 'rgba(255,215,0,0.1)',
  fontSize: 12,
  fontWeight: 900,
};

const messageMentionStyle: React.CSSProperties = {
  display: 'inline-flex',
  border: '1px solid var(--px-border-gold)',
  borderRadius: 999,
  padding: '2px 7px',
  marginBottom: 8,
  color: 'var(--px-gold)',
  background: 'rgba(255,215,0,0.08)',
  fontSize: 12,
  fontWeight: 900,
};

const mentionCloseStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--px-gold)',
  cursor: 'pointer',
  padding: 0,
  display: 'inline-flex',
};

function toolbarButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    minHeight: 34,
    border: '2px solid var(--px-border-gold)',
    borderRadius: 4,
    background: enabled ? 'rgba(255,215,0,0.12)' : 'rgba(0,0,0,0.08)',
    color: enabled ? 'var(--px-gold)' : 'var(--px-muted)',
    fontWeight: 900,
    cursor: enabled ? 'pointer' : 'not-allowed',
    padding: '0 12px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  };
}
