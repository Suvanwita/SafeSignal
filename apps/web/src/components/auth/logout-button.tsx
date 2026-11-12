'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notify } from '@/components/ui/toaster';
import { logoutAccount } from '@/lib/auth/client-api';

export interface LogoutButtonProps {
  variant?: 'outline' | 'ghost' | 'secondary';
  size?: 'sm' | 'default';
}

export function LogoutButton({
  variant = 'outline',
  size = 'sm',
}: LogoutButtonProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logoutAccount();
      notify.info('Signed out', 'Your session has been securely revoked.');
      router.replace('/login');
      router.refresh();
    } catch {
      notify.alert('Logout failed', 'Unable to revoke session cleanly.');
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      loading={isLoggingOut}
      onClick={handleLogout}
    >
      {!isLoggingOut && <LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
    </Button>
  );
}
