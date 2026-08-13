import DailyQuestPanel from '../../../../SystemManagement/DailyQuestPanel';
import type { OwnerPlayerSystemToolPartProps } from '../types';

export default function DailyQuestPart({ systemId }: OwnerPlayerSystemToolPartProps) {
  return <DailyQuestPanel systemId={systemId} variant="embedded" />;
}
