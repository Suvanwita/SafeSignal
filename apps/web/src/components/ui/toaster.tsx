'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg font-sans',
          title: 'text-sm font-semibold text-slate-900',
          description: 'text-xs text-slate-500',
          success: 'border-emerald-200 bg-emerald-50/95 text-emerald-950',
          error: 'border-red-200 bg-red-50/95 text-red-950',
          warning: 'border-amber-200 bg-amber-50/95 text-amber-950',
          info: 'border-slate-200 bg-white text-slate-900',
          closeButton:
            'border-slate-200 bg-white text-slate-500 hover:text-slate-900',
        },
      }}
    />
  );
}

export const notify = {
  verified: (title: string, description?: string) =>
    toast.success(title, { description }),
  alert: (title: string, description?: string) =>
    toast.error(title, { description }),
  warning: (title: string, description?: string) =>
    toast.warning(title, { description }),
  info: (title: string, description?: string) =>
    toast.info(title, { description }),
};

export { toast };
