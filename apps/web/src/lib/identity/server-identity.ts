import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';
import type { ApiSuccessEnvelope } from '@/lib/auth/types';
import type { OfficialAccount } from './types';

export async function getServerOfficialAccounts(): Promise<OfficialAccount[] | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(
      `${getBackendApiBaseUrl()}/api/v1/identity/accounts`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ApiSuccessEnvelope<
      OfficialAccount[]
    >;
    if (!payload?.success || !Array.isArray(payload.data)) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}
