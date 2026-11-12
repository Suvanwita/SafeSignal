'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Activity,
  BadgeCheck,
  FileBarChart2,
  FolderLock,
  LayoutDashboard,
  Lock,
  Radar,
  ShieldAlert,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from './brand-mark';
import {
  SIDEBAR_NAVIGATION,
  type NavItem,
  type NavSection,
} from './navigation.config';

const NAV_ICONS: Record<NavItem['icon'], React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  identity: BadgeCheck,
  incidents: ShieldAlert,
  abuse: Activity,
  evidence: FolderLock,
  intelligence: Radar,
  reports: FileBarChart2,
  privacy: Lock,
};

export interface SidebarNavProps {
  sections?: NavSection[];
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  onNavigate?: (item: NavItem) => void;
}

function SidebarContent({
  sections = SIDEBAR_NAVIGATION,
  onNavigate,
}: {
  sections?: NavSection[];
  onNavigate?: (item: NavItem) => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
      <div className="flex h-16 items-center border-b border-[var(--sidebar-border)] px-5">
        <Link href="/" className="min-w-0 flex-1 focus:outline-none">
          <BrandMark />
        </Link>
      </div>

      <nav
        aria-label="Primary navigation"
        className="flex-1 space-y-6 overflow-y-auto px-3 py-5"
      >
        {sections.map((section) => (
          <div key={section.title} className="space-y-1.5">
            <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-400/80 uppercase">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);

                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={(event) => {
                        if (onNavigate) {
                          onNavigate(item);
                        }
                        if (
                          item.href !== '/dashboard' &&
                          item.href !== '/incidents' &&
                          item.href !== '/identity' &&
                          item.href !== '/intelligence' &&
                          item.href !== '/abuse' &&
                          item.href !== '/evidence' &&
                          item.href !== '/'
                        ) {
                          event.preventDefault();
                        }
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'group flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-[var(--sidebar-accent)] text-white shadow-2xs ring-1 ring-slate-700/70'
                          : 'text-slate-300 hover:bg-slate-800/60 hover:text-white',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            isActive
                              ? 'text-emerald-400'
                              : 'text-slate-400 group-hover:text-slate-200',
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge && (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                            item.badge.tone === 'alert' &&
                              'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
                            item.badge.tone === 'verified' &&
                              'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
                            item.badge.tone === 'neutral' &&
                              'bg-slate-700/60 text-slate-300',
                          )}
                        >
                          {item.badge.text}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--sidebar-border)] p-4">
        <div className="rounded-md border border-slate-800 bg-slate-900/80 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-200">
              Custody Integrity
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              Verified
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            End-to-end SHA-256 evidence verification enabled.
          </p>
        </div>
      </div>
    </div>
  );
}

export function SidebarNav({
  sections,
  mobileOpen = false,
  onMobileOpenChange,
  onNavigate,
}: SidebarNavProps) {
  return (
    <>
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-[var(--sidebar-border)]">
        <SidebarContent sections={sections} onNavigate={onNavigate} />
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px] lg:hidden" />
          <DialogPrimitive.Content
            aria-label="Mobile navigation"
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] shadow-2xl focus:outline-none lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">
              SafeSignal Navigation
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close navigation"
              className="absolute top-4 right-3 z-10 rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
            <SidebarContent
              sections={sections}
              onNavigate={(item) => {
                onNavigate?.(item);
                onMobileOpenChange?.(false);
              }}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
