import React, { useCallback, useEffect, useState } from 'react';
import { message, Splitter } from 'antd';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../../Redux/store';
import {
  createStorylineDraft,
  deleteStoryline,
  deleteStorylineDraft,
  fetchStorylineDraft,
  fetchStorylineDrafts,
  fetchStorylineHome,
  importStorylineDraft,
  iterateStorylineDraft,
  publishStorylineDraft,
  reviewStorylineDraft,
  streamStorylineMessage,
} from './api/storylineEditorApi';
import { StorylineChat } from './components/StorylineChat';
import { StorylineList } from './components/StorylineList';
import { StorylinePreview } from './components/StorylinePreview';
import type { StorylineDefinition, StorylineDraft, StorylineDraftSummary, StorylineMentionContext, StorylineSkill, StorylineSummary } from './types';

const StorylineEditor: React.FC = () => {
  const token = useSelector((state: RootState) => state.user.accessToken);
  const [storylines, setStorylines] = useState<StorylineSummary[]>([]);
  const [drafts, setDrafts] = useState<StorylineDraftSummary[]>([]);
  const [skills, setSkills] = useState<StorylineSkill[]>([]);
  const [activeDraft, setActiveDraft] = useState<StorylineDraft | null>(null);
  const [input, setInput] = useState('');
  const [streamText, setStreamText] = useState('');
  const [selectedMention, setSelectedMention] = useState<StorylineMentionContext | null>(null);
  const [previewTab, setPreviewTab] = useState('outline');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [iterating, setIterating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const refreshHome = useCallback(async () => {
    const [home, draftList] = await Promise.all([
      fetchStorylineHome(token),
      fetchStorylineDrafts(token),
    ]);
    setStorylines(home.storylines);
    setSkills(home.skills);
    setDrafts(draftList);
  }, [token]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    refreshHome()
      .catch((error) => message.error(error.message || '剧情列表加载失败'))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshHome]);

  const syncDraftSummary = (draft: StorylineDraft) => {
    setDrafts((current) => {
      const summary = toDraftSummary(draft);
      const next = [summary, ...current.filter((item) => item.id !== draft.id)];
      return next.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    });
  };

  const handleCreateDraft = async () => {
    try {
      setCreating(true);
      const draft = await createStorylineDraft(token);
      setActiveDraft(draft);
      syncDraftSummary(draft);
      setInput('');
      setStreamText('');
      setPreviewTab('outline');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建剧情草稿失败');
    } finally {
      setCreating(false);
    }
  };

  const handleSelectDraft = async (draftId: string) => {
    try {
      const draft = await fetchStorylineDraft(draftId, token);
      setActiveDraft(draft);
      setStreamText('');
      setPreviewTab('outline');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '草稿加载失败');
    }
  };

  const handleImportStoryline = async (storylineId: string) => {
    try {
      const draft = await importStorylineDraft(storylineId, token);
      setActiveDraft(draft);
      syncDraftSummary(draft);
      setPreviewTab('outline');
      message.success('已导入为可编辑草稿');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入剧情失败');
    }
  };

  const handleDeleteStoryline = async (storylineId: string) => {
    if (!window.confirm('确定删除这个已发布剧情 JSON？删除后读取世界时不会再加载它。')) return;
    try {
      const next = await deleteStoryline(storylineId, token);
      setStorylines(next);
      message.success('已删除剧情');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除剧情失败');
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!window.confirm('确定删除这个草稿？')) return;
    try {
      const next = await deleteStorylineDraft(draftId, token);
      setDrafts(next);
      if (activeDraft?.id === draftId) setActiveDraft(null);
      message.success('已删除草稿');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除草稿失败');
    }
  };

  const handleSend = async () => {
    if (!activeDraft || !input.trim()) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    setStreamText('');
    setActiveDraft({
      ...activeDraft,
      messages: [
        ...activeDraft.messages,
        {
          id: `local_user_${Date.now()}`,
          role: 'user',
          content,
          contextLabel: selectedMention?.label,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    try {
      await streamStorylineMessage(activeDraft.id, content, token, selectedMention, {
        onDraft: (draft) => {
          setActiveDraft(draft);
          syncDraftSummary(draft);
        },
        onToken: (chunk) => setStreamText((current) => current + chunk),
        onDone: () => setStreamText(''),
        onError: (text) => message.error(text),
      });
      setSelectedMention(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  const handleUpdate = async () => {
    if (!activeDraft) return;
    try {
      setIterating(true);
      setPreviewTab('review');
      const result = await iterateStorylineDraft(activeDraft.id, input.trim(), token);
      setActiveDraft(result.draft);
      syncDraftSummary(result.draft);
      setInput('');
      message.success(`已更新剧情，审查分数 ${result.review.score}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失败');
    } finally {
      setIterating(false);
    }
  };

  const handleReview = async (definition: StorylineDefinition | null) => {
    if (!activeDraft) return;
    try {
      setReviewing(true);
      setPreviewTab('review');
      const result = await reviewStorylineDraft(activeDraft.id, definition, token);
      setActiveDraft(result.draft);
      syncDraftSummary(result.draft);
      message.success(`审查完成：${result.review.score} 分`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '审查失败');
    } finally {
      setReviewing(false);
    }
  };

  const handlePublish = async (definition: StorylineDefinition | null) => {
    if (!activeDraft) return;
    try {
      setPublishing(true);
      const result = await publishStorylineDraft(activeDraft.id, definition, token);
      setActiveDraft(null);
      setDrafts(result.drafts);
      setInput('');
      setStreamText('');
      setSelectedMention(null);
      setStorylines(result.storylines);
      message.success(`已发布 ${result.storyline.title}，草稿已移除`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '发布失败');
    } finally {
      setPublishing(false);
    }
  };

  const handleAskWithContext = (mention: StorylineMentionContext) => {
    setSelectedMention(mention);
  };

  return (
    <div
      style={{
        height: '100%',
        minHeight: '100%',
        background: 'var(--px-bg)',
        color: 'var(--px-text)',
        fontFamily: '"Courier New", monospace',
      }}
    >
      <Splitter style={{ height: '100%', minHeight: 720 }}>
        <Splitter.Panel defaultSize={320} min={260} max={460}>
          <StorylineList
            storylines={storylines}
            drafts={drafts}
            activeDraft={activeDraft}
            creating={creating}
            onCreateDraft={handleCreateDraft}
            onSelectDraft={handleSelectDraft}
            onImportStoryline={handleImportStoryline}
            onDeleteStoryline={handleDeleteStoryline}
            onDeleteDraft={handleDeleteDraft}
          />
        </Splitter.Panel>

        <Splitter.Panel min={440}>
          <div style={{ height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {loading ? (
              <div style={{ padding: 24, color: 'var(--px-muted)' }}>Loading storyline core...</div>
            ) : (
              <StorylineChat
                draft={activeDraft}
                value={input}
                sending={sending}
                iterating={iterating}
                streamText={streamText}
                mention={selectedMention}
                onChange={setInput}
                onSend={handleSend}
                onIterate={handleUpdate}
                onClearMention={() => setSelectedMention(null)}
              />
            )}
            <div
              style={{
                borderTop: '1px solid var(--px-border)',
                padding: '8px 16px',
                color: 'var(--px-muted)',
                fontSize: 12,
              }}
            >
              已加载 {skills.length} 个运行时 skill，草稿保存在 backend/data/datasets/story/storylines/drafts，发布后写入 backend/data/datasets/story/storylines/enabled。
            </div>
          </div>
        </Splitter.Panel>

        <Splitter.Panel defaultSize={520} min={380} max="55%">
          <StorylinePreview
            draft={activeDraft}
            activeTab={previewTab}
            onTabChange={setPreviewTab}
            reviewing={reviewing}
            publishing={publishing}
            onReview={handleReview}
            onPublish={handlePublish}
            onAskWithContext={handleAskWithContext}
          />
        </Splitter.Panel>
      </Splitter>
    </div>
  );
};

function toDraftSummary(draft: StorylineDraft): StorylineDraftSummary {
  return {
    id: draft.id,
    title: draft.title,
    status: draft.status,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    currentRevisionId: draft.currentRevisionId,
    revisionCount: draft.revisionCount,
    score: draft.score,
  };
}

export default StorylineEditor;
