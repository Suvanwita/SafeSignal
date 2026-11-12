import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(request: NextRequest) {
  return proxyBackendRequest(request, '/incidents', {
    method: 'GET',
    wrapDataKey: 'incidents',
    fallbackErrorCode: 'INCIDENTS_REQUEST_FAILED',
    fallbackErrorMessage: 'Unable to load incidents.',
  });
}

export async function POST(request: NextRequest) {
  return proxyBackendRequest(request, '/incidents', {
    method: 'POST',
    requireCsrf: true,
    includeBody: true,
    wrapDataKey: 'incident',
    fallbackErrorCode: 'INCIDENTS_REQUEST_FAILED',
    fallbackErrorMessage: 'Unable to create incident.',
  });
}
