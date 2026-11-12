import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-slate-200 bg-slate-100 text-slate-700',
        verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        alert: 'border-red-200 bg-red-50 text-red-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        info: 'border-sky-200 bg-sky-50 text-sky-700',
        dark: 'border-slate-800 bg-slate-900 text-slate-100',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({
  className,
  variant,
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const dotColor =
    variant === 'verified'
      ? 'bg-emerald-500'
      : variant === 'alert'
        ? 'bg-red-500'
        : variant === 'warning'
          ? 'bg-amber-500'
          : variant === 'info'
            ? 'bg-sky-500'
            : variant === 'dark'
              ? 'bg-slate-300'
              : 'bg-slate-400';

  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', dotColor)}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export { badgeVariants };
