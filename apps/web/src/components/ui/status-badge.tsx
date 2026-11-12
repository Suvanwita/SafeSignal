import * as React from 'react';
import { Badge, type BadgeProps } from './badge';

export type SafeSignalStatus =
  | 'verified'
  | 'secure'
  | 'open'
  | 'in_review'
  | 'escalated'
  | 'resolved'
  | 'closed'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

const STATUS_CONFIG: Record<
  SafeSignalStatus,
  { label: string; variant: BadgeProps['variant'] }
> = {
  verified: { label: 'Verified', variant: 'verified' },
  secure: { label: 'Secure', variant: 'verified' },
  open: { label: 'Open', variant: 'info' },
  in_review: { label: 'In Review', variant: 'warning' },
  escalated: { label: 'Escalated', variant: 'alert' },
  resolved: { label: 'Resolved', variant: 'verified' },
  closed: { label: 'Closed', variant: 'neutral' },
  low: { label: 'Low', variant: 'neutral' },
  medium: { label: 'Medium', variant: 'warning' },
  high: { label: 'High', variant: 'alert' },
  critical: { label: 'Critical', variant: 'alert' },
};

export interface StatusBadgeProps {
  status: SafeSignalStatus;
  label?: string;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  label,
  dot = true,
  className,
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} dot={dot} className={className}>
      {label ?? config.label}
    </Badge>
  );
}
