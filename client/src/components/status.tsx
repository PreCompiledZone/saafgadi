import { LABELS, type DisplayStatus } from '@shared/enums';
import { Badge } from './ui';

export function StatusBadge({ status, daysLeft }: { status: DisplayStatus; daysLeft?: number }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge tone="active" dot>
          Active
        </Badge>
      );
    case 'EXPIRING':
      return (
        <Badge tone="warn" dot>
          {daysLeft === 1 ? 'Ends today' : `Expiring in ${daysLeft} days`}
        </Badge>
      );
    case 'EXPIRED':
      return <Badge tone="danger">Expired</Badge>;
    case 'UPCOMING':
      return <Badge tone="accent">Upcoming</Badge>;
    case 'CANCELLED':
      return <Badge tone="muted">Cancelled</Badge>;
    default:
      return <Badge tone="neutral">{LABELS.displayStatus[status]}</Badge>;
  }
}
