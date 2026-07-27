export interface StorylineSkillStep {
  skill: string;
  args?: Record<string, unknown>;
}

export interface StorylineChoice {
  id: string;
  label: string;
  reply?: string;
  nextEvent?: string;
  effects?: StorylineSkillStep[];
}

export interface StorylineTrigger {
  id?: string;
  fromState?: string;
  when?: StorylineSkillStep[];
  then?: StorylineSkillStep[];
}

export interface StorylinePackage {
  id: string;
  title: string;
  status?: string;
  version?: number;
  schemaVersion?: number;
  startState?: string;
  states?: string[];
  triggers?: StorylineTrigger[];
  events?: Record<string, StorylineSkillStep[]>;
}

export interface StorylineEventRef {
  key: string;
  storylineId: string;
  storylineTitle: string;
  eventId: string;
  stepCount: number;
}

export interface StorylineRuntimeResponse {
  success: boolean;
  runtimeVersion: number;
  storylines: StorylinePackage[];
  skills?: unknown[];
}
