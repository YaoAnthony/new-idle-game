import { getEnv } from '../../../../../config/env';
import type {
  StorylineDefinition,
  StorylineDraft,
  StorylineDraftSummary,
  StorylineMentionContext,
  StorylineReview,
  StorylineSkill,
  StorylineSummary,
} from '../types';

const { backendUrl } = getEnv();

type AuthHeadersInput = {
  token?: string | null;
};

type StreamEvent =
  | { event: 'draft'; data: { draft: StorylineDraft } }
  | { event: 'token'; data: { content: string } }
  | { event: 'done'; data: { ok: boolean } }
  | { event: 'error'; data: { message: string } };

type StreamHandlers = {
  onDraft?: (draft: StorylineDraft) => void;
  onToken?: (content: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

function buildHeaders({ token }: AuthHeadersInput): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || 'Storyline request failed');
  }
  return data as T;
}

export async function fetchStorylineHome(token?: string | null): Promise<{
  storylines: StorylineSummary[];
  skills: StorylineSkill[];
}> {
  const response = await fetch(`${backendUrl}/storyline/storylines`, {
    credentials: 'include',
    headers: buildHeaders({ token }),
  });
  const data = await parseResponse<{ storylines: StorylineSummary[]; skills: StorylineSkill[] }>(response);
  return {
    storylines: data.storylines ?? [],
    skills: data.skills ?? [],
  };
}

export async function fetchStorylineDrafts(token?: string | null): Promise<StorylineDraftSummary[]> {
  const response = await fetch(`${backendUrl}/storyline/drafts`, {
    credentials: 'include',
    headers: buildHeaders({ token }),
  });
  const data = await parseResponse<{ drafts: StorylineDraftSummary[] }>(response);
  return data.drafts ?? [];
}

export async function fetchStorylineDraft(draftId: string, token?: string | null): Promise<StorylineDraft> {
  const response = await fetch(`${backendUrl}/storyline/drafts/${encodeURIComponent(draftId)}`, {
    credentials: 'include',
    headers: buildHeaders({ token }),
  });
  const data = await parseResponse<{ draft: StorylineDraft }>(response);
  return data.draft;
}

export async function createStorylineDraft(token?: string | null): Promise<StorylineDraft> {
  const response = await fetch(`${backendUrl}/storyline/drafts`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders({ token }),
    body: JSON.stringify({ title: '新剧情' }),
  });
  const data = await parseResponse<{ draft: StorylineDraft }>(response);
  return data.draft;
}

export async function importStorylineDraft(storylineId: string, token?: string | null): Promise<StorylineDraft> {
  const response = await fetch(`${backendUrl}/storyline/storylines/${encodeURIComponent(storylineId)}/import-draft`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders({ token }),
  });
  const data = await parseResponse<{ draft: StorylineDraft }>(response);
  return data.draft;
}

export async function deleteStoryline(storylineId: string, token?: string | null): Promise<StorylineSummary[]> {
  const response = await fetch(`${backendUrl}/storyline/storylines/${encodeURIComponent(storylineId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: buildHeaders({ token }),
  });
  const data = await parseResponse<{ storylines: StorylineSummary[] }>(response);
  return data.storylines ?? [];
}

export async function deleteStorylineDraft(draftId: string, token?: string | null): Promise<StorylineDraftSummary[]> {
  const response = await fetch(`${backendUrl}/storyline/drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: buildHeaders({ token }),
  });
  const data = await parseResponse<{ drafts: StorylineDraftSummary[] }>(response);
  return data.drafts ?? [];
}

export async function sendStorylineMessage(
  draftId: string,
  content: string,
  token?: string | null,
): Promise<StorylineDraft> {
  const response = await fetch(`${backendUrl}/storyline/drafts/${draftId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders({ token }),
    body: JSON.stringify({ content }),
  });
  const data = await parseResponse<{ draft: StorylineDraft }>(response);
  return data.draft;
}

export async function streamStorylineMessage(
  draftId: string,
  content: string,
  token: string | null | undefined,
  mention: StorylineMentionContext | null,
  handlers: StreamHandlers,
): Promise<void> {
  const response = await fetch(`${backendUrl}/storyline/drafts/${draftId}/messages/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders({ token }),
    body: JSON.stringify({
      content,
      contextLabel: mention?.label,
      context: mention?.context,
    }),
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || 'Storyline stream failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) dispatchStreamEvent(parseSsePart(part), handlers);
  }
  if (buffer.trim()) dispatchStreamEvent(parseSsePart(buffer), handlers);
}

export async function iterateStorylineDraft(
  draftId: string,
  note: string,
  token?: string | null,
): Promise<{ draft: StorylineDraft; definition: StorylineDefinition; review: StorylineReview }> {
  const response = await fetch(`${backendUrl}/storyline/drafts/${draftId}/iterate`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders({ token }),
    body: JSON.stringify({ note }),
  });
  return parseResponse(response);
}

export async function reviewStorylineDraft(
  draftId: string,
  definition: StorylineDefinition | null,
  token?: string | null,
): Promise<{ draft: StorylineDraft; review: StorylineReview }> {
  const response = await fetch(`${backendUrl}/storyline/drafts/${draftId}/review`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders({ token }),
    body: JSON.stringify({ definition }),
  });
  return parseResponse(response);
}

export async function saveStorylineDefinition(
  draftId: string,
  definition: StorylineDefinition,
  token?: string | null,
): Promise<StorylineDraft> {
  const response = await fetch(`${backendUrl}/storyline/drafts/${draftId}/definition`, {
    method: 'PUT',
    credentials: 'include',
    headers: buildHeaders({ token }),
    body: JSON.stringify({ definition }),
  });
  const data = await parseResponse<{ draft: StorylineDraft }>(response);
  return data.draft;
}

export async function publishStorylineDraft(
  draftId: string,
  definition: StorylineDefinition | null,
  token?: string | null,
): Promise<{
  draftId: string;
  storyline: StorylineDefinition;
  storylines: StorylineSummary[];
  drafts: StorylineDraftSummary[];
}> {
  const response = await fetch(`${backendUrl}/storyline/drafts/${draftId}/publish`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders({ token }),
    body: JSON.stringify({ definition }),
  });
  return parseResponse(response);
}

function parseSsePart(part: string): StreamEvent | null {
  const lines = part.split('\n');
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
  const dataLine = lines.find((line) => line.startsWith('data:'))?.slice(5).trim();
  if (!dataLine) return null;
  return { event, data: JSON.parse(dataLine) } as StreamEvent;
}

function dispatchStreamEvent(
  event: StreamEvent | null,
  handlers: StreamHandlers,
) {
  if (!event) return;
  if (event.event === 'draft') handlers.onDraft?.(event.data.draft);
  if (event.event === 'token') handlers.onToken?.(event.data.content);
  if (event.event === 'done') handlers.onDone?.();
  if (event.event === 'error') handlers.onError?.(event.data.message);
}
