import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-lg border border-slate-200 bg-white text-slate-900 shadow-2xs',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-5 pb-3', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-base font-semibold tracking-tight text-slate-900',
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-slate-500', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-2', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5',
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export interface MetricCardProps {
  label: string;
  value: string | number;
  detail?: string;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'verified' | 'alert';
  className?: string;
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'neutral',
  className,
}: MetricCardProps) {
  const accentRing =
    tone === 'verified'
      ? 'border-l-2 border-l-emerald-500'
      : tone === 'alert'
        ? 'border-l-2 border-l-red-500'
        : '';

  return (
    <Card className={cn('p-5', accentRing, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {value}
          </p>
        </div>
        {icon && (
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md border',
              tone === 'verified'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : tone === 'alert'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600',
            )}
          >
            {icon}
          </div>
        )}
      </div>
      {detail && <p className="mt-2.5 text-xs text-slate-500">{detail}</p>}
    </Card>
  );
}

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
