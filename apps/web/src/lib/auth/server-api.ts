import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_COOKIE } from './cookies';
import type { ApiSuccessEnvelope, AuthUser } from './types';

export function getBackendApiBaseUrl(): string {
  const raw =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3001';
  return raw.replace(/\/+$/, '');
}

export async function getServerSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(`${getBackendApiBaseUrl()}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiSuccessEnvelope<AuthUser>;
    if (!payload?.success || !payload.data?.id) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

export async function requireServerSession(
  redirectTarget = '/dashboard',
): Promise<AuthUser> {
  const user = await getServerSession();
  if (!user) {
    const nextParam = encodeURIComponent(redirectTarget);
    redirect(`/login?next=${nextParam}`);
  }
  return user;
}
