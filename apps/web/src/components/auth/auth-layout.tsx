import * as React from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/components/layout/brand-mark';
import { BRAND_TAGLINE } from '@/components/layout/navigation.config';
import { Badge } from '@/components/ui/badge';

export interface AuthLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-12">
      <aside className="relative hidden flex-col justify-between bg-[#0b1324] p-10 text-slate-100 lg:col-span-5 lg:flex">
        <div>
          <BrandMark />
        </div>

        <div className="max-w-md space-y-6">
          <Badge
            variant="verified"
            dot
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            End-to-End Protected Sessions
          </Badge>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {BRAND_TAGLINE}
            </h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Document digital impersonation, preserve verifiable SHA-256
              evidence, and coordinate platform accountability from one secure
              workspace.
            </p>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <Lock className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                HttpOnly SameSite session cookies &amp; CSRF token protection
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                Argon2id password hashing with server-side session revocation
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Open-source digital safety &amp; accountability platform
        </p>
      </aside>

      <main className="flex flex-col justify-center px-4 py-10 sm:px-6 lg:col-span-7 lg:px-12">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="flex justify-center lg:hidden">
            <div className="rounded-lg bg-[#0b1324] px-4 py-2.5 shadow-sm">
              <BrandMark />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
            <div className="mb-6 space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                {title}
              </h1>
              <p className="text-sm text-slate-500">{description}</p>
            </div>

            {children}
          </div>

          {footer && (
            <div className="text-center text-sm text-slate-600">{footer}</div>
          )}
        </div>
      </main>
    </div>
  );
}
