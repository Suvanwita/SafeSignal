import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND_NAME, BRAND_TAGLINE } from './navigation.config';

export interface BrandMarkProps {
  showTagline?: boolean;
  className?: string;
}

export function BrandMark({
  showTagline = true,
  className,
}: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900 shadow-inner">
        <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden="true" />
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#0b1324]"
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold tracking-tight text-white">
            {BRAND_NAME}
          </span>
        </div>
        {showTagline && (
          <p className="truncate text-[11px] leading-tight text-slate-400">
            {BRAND_TAGLINE}
          </p>
        )}
      </div>
    </div>
  );
}
