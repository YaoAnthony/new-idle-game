import { getEnv } from '../../../../../../config/env';
import type { StorylinePackage, StorylineRuntimeResponse } from './StorylineTypes';

export async function fetchStorylineRuntimePackages(token: string | null): Promise<StorylinePackage[]> {
  const { backendUrl } = getEnv();
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${backendUrl}/storyline/runtime`, {
    cache: 'no-store',
    credentials: 'include',
    headers,
  });
  if (!response.ok) throw new Error(`storyline_runtime_http_${response.status}`);

  const payload = await response.json() as StorylineRuntimeResponse;
  return Array.isArray(payload.storylines) ? payload.storylines : [];
}
