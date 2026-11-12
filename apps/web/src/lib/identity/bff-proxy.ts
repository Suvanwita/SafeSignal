import type { NextRequest, NextResponse } from 'next/server';
import {
  proxyBackendRequest,
  type BackendProxyOptions,
} from '@/lib/auth/backend-proxy';

export function proxyIdentityRequest(
  request: NextRequest,
  backendPath: string,
  options: Omit<BackendProxyOptions, 'fallbackErrorCode' | 'fallbackErrorMessage'>,
): Promise<NextResponse> {
  return proxyBackendRequest(request, backendPath, {
    ...options,
    fallbackErrorCode: 'IDENTITY_REQUEST_FAILED',
    fallbackErrorMessage: 'Unable to complete official account request.',
  });
}
