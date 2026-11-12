import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(request: NextRequest) {
  return proxyBackendRequest(request, '/intelligence/suspicious-profiles', {
    method: 'GET',
    wrapDataKey: 'profiles',
    fallbackErrorCode: 'INTELLIGENCE_REQUEST_FAILED',
    fallbackErrorMessage: 'Unable to load suspicious profiles.',
  });
}

export async function POST(request: NextRequest) {
  return proxyBackendRequest(request, '/intelligence/suspicious-profiles', {
    method: 'POST',
    requireCsrf: true,
    includeBody: true,
    wrapDataKey: 'profile',
    fallbackErrorCode: 'INTELLIGENCE_REQUEST_FAILED',
    fallbackErrorMessage: 'Unable to submit suspicious profile report.',
  });
}
