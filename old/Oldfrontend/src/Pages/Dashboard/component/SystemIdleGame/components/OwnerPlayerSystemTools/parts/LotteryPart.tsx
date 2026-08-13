import LotteryPanel from '../../../../SystemManagement/LotteryPanel';
import type { OwnerPlayerSystemToolPartProps } from '../types';

export default function LotteryPart({ systemId }: OwnerPlayerSystemToolPartProps) {
  return <LotteryPanel systemId={systemId} variant="embedded" />;
}
