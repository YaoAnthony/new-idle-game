import StorePanel from '../../../../SystemManagement/StorePanel';
import type { OwnerPlayerSystemToolPartProps } from '../types';

export default function StorePart({ systemId }: OwnerPlayerSystemToolPartProps) {
  return <StorePanel systemId={systemId} variant="embedded" />;
}
