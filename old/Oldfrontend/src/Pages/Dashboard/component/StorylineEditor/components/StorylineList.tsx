import React from 'react';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { StorylineDraft, StorylineDraftSummary, StorylineSummary } from '../types';

interface StorylineListProps {
  storylines: StorylineSummary[];
  drafts: StorylineDraftSummary[];
  activeDraft: StorylineDraft | null;
  creating: boolean;
  onCreateDraft: () => void;
  onSelectDraft: (draftId: string) => void;
  onImportStoryline: (storylineId: string) => void;
  onDeleteStoryline: (storylineId: string) => void;
  onDeleteDraft: (draftId: string) => void;
}

export const StorylineList: React.FC<StorylineListProps> = ({
  storylines,
  drafts,
  activeDraft,
  creating,
  onCreateDraft,
  onSelectDraft,
  onImportStoryline,
  onDeleteStoryline,
  onDeleteDraft,
}) => {
  return (
    <aside
      style={{
        height: '100%',
        minWidth: 0,
        borderRight: '1px solid var(--px-border)',
        background: 'var(--px-surface)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: 14, borderBottom: '2px solid var(--px-border)' }}>
        <div style={{ color: 'var(--px-gold)', fontWeight: 900, fontSize: 18 }}>剧情</div>
        <button
          type="button"
          onClick={onCreateDraft}
          disabled={creating}
          style={{
            marginTop: 12,
            width: '100%',
            minHeight: 36,
            border: '2px solid var(--px-border-gold)',
            borderRadius: 4,
            background: 'rgba(255,215,0,0.12)',
            color: 'var(--px-gold)',
            fontWeight: 900,
            cursor: creating ? 'wait' : 'pointer',
          }}
        >
          <PlusOutlined /> {creating ? '创建中' : '添加剧情'}
        </button>
      </div>

      <div style={{ padding: 12, overflow: 'auto', display: 'grid', gap: 14 }}>
        <section>
          <SectionTitle text="草稿" count={drafts.length} />
          <div style={{ display: 'grid', gap: 8 }}>
            {drafts.map((draft) => (
              <article
                key={draft.id}
                onClick={() => onSelectDraft(draft.id)}
                style={{
                  border: `2px solid ${activeDraft?.id === draft.id ? 'var(--px-border-gold)' : 'var(--px-border)'}`,
                  borderRadius: 6,
                  padding: 10,
                  background: 'var(--px-surface2)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ color: 'var(--px-text)', fontWeight: 900 }}>{draft.title}</div>
                  <button
                    type="button"
                    title="删除草稿"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteDraft(draft.id);
                    }}
                    style={iconButtonStyle}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
                <div style={{ marginTop: 6, color: 'var(--px-muted)', fontSize: 12 }}>
                  {draft.revisionCount} 个版本{typeof draft.score === 'number' ? ` · ${draft.score} 分` : ''}
                </div>
              </article>
            ))}
            {drafts.length === 0 && <EmptyText text="还没有草稿" />}
          </div>
        </section>

        <section>
          <SectionTitle text="已发布 JSON" count={storylines.length} />
          <div style={{ display: 'grid', gap: 8 }}>
            {storylines.map((storyline) => (
              <article
                key={storyline.id}
                style={{
                  border: '2px solid var(--px-border)',
                  borderRadius: 6,
                  padding: 10,
                  background: 'var(--px-surface2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ color: 'var(--px-text)', fontWeight: 900 }}>{storyline.title}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" title="导入编辑" onClick={() => onImportStoryline(storyline.id)} style={iconButtonStyle}>
                      <EditOutlined />
                    </button>
                    <button type="button" title="删除已发布剧情" onClick={() => onDeleteStoryline(storyline.id)} style={iconButtonStyle}>
                      <DeleteOutlined />
                    </button>
                  </div>
                </div>
                <p style={{ color: 'var(--px-muted)', fontSize: 12, lineHeight: 1.5, margin: '8px 0' }}>
                  {storyline.summary}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {storyline.tags.map((tag) => (
                    <span key={tag} style={tagStyle}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
            {storylines.length === 0 && <EmptyText text="没有启用剧情" />}
          </div>
        </section>
      </div>
    </aside>
  );
};

const SectionTitle: React.FC<{ text: string; count: number }> = ({ text, count }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--px-gold)', fontWeight: 900, fontSize: 13, marginBottom: 8 }}>
    <span>{text}</span>
    <span>{count}</span>
  </div>
);

const EmptyText: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ color: 'var(--px-muted)', fontSize: 12, border: '1px dashed var(--px-border)', padding: 10 }}>{text}</div>
);

const iconButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid var(--px-border)',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.08)',
  color: 'var(--px-gold)',
  cursor: 'pointer',
};

const tagStyle: React.CSSProperties = {
  color: 'var(--px-gold)',
  border: '1px solid var(--px-border)',
  padding: '2px 6px',
  fontSize: 11,
};
