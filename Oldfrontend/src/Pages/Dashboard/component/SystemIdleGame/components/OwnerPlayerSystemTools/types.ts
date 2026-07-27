import type { ReactNode } from 'react';

export type OwnerPlayerSystemToolPart =
  | 'task-chain'
  | 'store'
  | 'lottery'
  | 'daily-quests';

export type OwnerPlayerSystemToolsProps = {
  systemId: string;
  systemName?: string;
  initialPart?: OwnerPlayerSystemToolPart | null;
  overview?: ReactNode;
};

export type OwnerPlayerSystemToolPartProps = {
  systemId: string;
};
