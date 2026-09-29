import { Badge } from '@/components/ui';
import type { VehicleStatusConfig, VehicleStatus } from '@/types';

export function StatusBadge({
  status,
  configs,
}: {
  status: VehicleStatus;
  configs: VehicleStatusConfig[];
}) {
  const config = configs.find((c) => c.slug === status);
  const color = config?.color ?? 'slate';
  const label = config?.name ?? status;
  return <Badge color={color}>{label}</Badge>;
}
