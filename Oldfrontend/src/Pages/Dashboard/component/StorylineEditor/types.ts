export type StorylineSummary = {
  id: string;
  title: string;
  status: 'draft' | 'enabled' | 'archived' | string;
  version: number;
  summary: string;
  tags: string[];
  updatedAt: string;
};

export type StorylineSkill = {
  id: string;
  kind: string;
  description: string;
  argsSchema: Record<string, string>;
  usage?: string;
  example?: unknown;
};

export type StorylineStep = {
  skill: string;
  args: Record<string, unknown>;
};

export type StorylineTrigger = {
  id: string;
  fromState?: string;
  when?: StorylineStep[];
  then?: StorylineStep[];
};

export type StorylineDefinition = {
  schemaVersion?: number;
  id: string;
  title: string;
  status: string;
  version: number;
  summary: string;
  startState: string;
  states: string[];
  tags: string[];
  updatedAt: string;
  triggers: StorylineTrigger[];
  events: Record<string, StorylineStep[]>;
};

export type StorylineReviewFinding = {
  severity: 'error' | 'warning' | 'info' | string;
  area: string;
  message: string;
};

export type StorylineReview = {
  score: number;
  verdict: 'ready' | 'needs_polish' | 'blocked' | string;
  findings: StorylineReviewFinding[];
  strengths: string[];
  risks: string[];
  checkedAt: string;
};

export type StorylineRevision = {
  id: string;
  source: string;
  definition: StorylineDefinition;
  review: StorylineReview | null;
  score: number | null;
  createdAt: string;
};

export type StorylineDraftMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contextLabel?: string;
  createdAt: string;
};

export type StorylineMentionContext = {
  id: string;
  label: string;
  context: string;
};

export type StorylineDraftSummary = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  currentRevisionId: string | null;
  revisionCount: number;
  score: number | null;
};

export type StorylineDraft = StorylineDraftSummary & {
  messages: StorylineDraftMessage[];
  revisions: StorylineRevision[];
};
