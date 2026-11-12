'use client';

import * as React from 'react';
import { Bell, Menu, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface TopNavProps {
  title: string;
  subtitle?: string;
  alertCount?: number;
  onOpenMobileMenu?: () => void;
  onAlertClick?: () => void;
  actions?: React.ReactNode;
}

export function TopNav({
  title,
  subtitle,
  alertCount = 0,
  onOpenMobileMenu,
  onAlertClick,
  actions,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
            {title}
          </h1>
          {subtitle && (
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <Badge variant="verified" dot className="hidden sm:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Protected Session
        </Badge>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onAlertClick}
          aria-label={
            alertCount > 0
              ? `${alertCount} active safety alerts`
              : 'Safety alerts'
          }
          className="relative"
        >
          <Bell className="h-4 w-4 text-slate-700" />
          {alertCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
              aria-hidden="true"
            >
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </Button>

        {actions}
      </div>
    </header>
  );
}
