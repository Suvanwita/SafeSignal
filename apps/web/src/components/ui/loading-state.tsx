import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({
  label = 'Loading SafeSignal data...',
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-6 py-12 text-center',
        className,
      )}
    >
      <Loader2
        className="h-6 w-6 animate-spin text-slate-600"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

export function TableSkeleton({
  rows = 4,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div
      role="status"
      aria-label="Loading table rows"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="grid grid-cols-4 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3">
        {Array.from({ length: columns }).map((_, idx) => (
          <Skeleton key={idx} className="h-3.5 w-20" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="grid grid-cols-4 items-center gap-4 px-4 py-3.5"
          >
            {Array.from({ length: columns }).map((__, colIdx) => (
              <Skeleton
                key={colIdx}
                className={cn('h-4', colIdx === 0 ? 'w-32' : 'w-24')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
