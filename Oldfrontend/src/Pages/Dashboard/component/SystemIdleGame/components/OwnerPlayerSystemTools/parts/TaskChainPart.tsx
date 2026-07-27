import TaskChainPanel from '../../../../SystemManagement/TaskChainPanel';
import type { OwnerPlayerSystemToolPartProps } from '../types';

export default function TaskChainPart({ systemId }: OwnerPlayerSystemToolPartProps) {
  return <TaskChainPanel systemId={systemId} variant="embedded" />;
}
