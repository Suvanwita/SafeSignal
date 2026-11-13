'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  className?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  identity: 'Identity Protection',
  abuse: 'Abuse Reporting',
  evidence: 'Evidence Vault',
  privacy: 'Privacy Protection',
  incidents: 'Incident Management',
  intelligence: 'Safety Intelligence',
  settings: 'Settings',
  new: 'New',
  reports: 'Reports',
};

function generateBreadcrumbsFromPath(pathname: string): BreadcrumbItem[] {
  if (pathname === '/' || pathname === '/dashboard') {
    return [{ label: 'Dashboard' }];
  }

  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/dashboard' }];

  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    currentPath += `/${seg}`;
    const isLast = i === segments.length - 1;

    // Check known route labels or format UUIDs
    let label = ROUTE_LABELS[seg.toLowerCase()];
    if (!label) {
      if (seg.length > 20 && seg.includes('-')) {
        // Likely UUID
        label = `Case ${seg.slice(0, 8)}`;
      } else {
        label = seg.charAt(0).toUpperCase() + seg.slice(1);
      }
    }

    if (isLast) {
      items.push({ label });
    } else {
      items.push({ label, href: currentPath });
    }
  }

  return items;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const pathname = usePathname();
  const breadcrumbs = items && items.length > 0
    ? (items[0].label === 'Dashboard' ? items : [{ label: 'Dashboard', href: '/dashboard' }, ...items])
    : generateBreadcrumbsFromPath(pathname);

  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center text-xs text-slate-500', className)}
    >
      <ol className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {breadcrumbs.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === breadcrumbs.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5 sm:gap-2">
              {!isFirst && (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
              )}

              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1 transition-colors hover:text-slate-900 hover:underline"
                >
                  {isFirst && <Home className="h-3 w-3" aria-hidden="true" />}
                  <span className="truncate max-w-[150px] sm:max-w-[200px]">{item.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(
                    'truncate max-w-[180px] sm:max-w-[260px]',
                    isLast ? 'font-medium text-slate-900' : 'text-slate-600',
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
