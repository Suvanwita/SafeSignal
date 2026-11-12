import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  return proxyBackendRequest(request, `/abuse/reports${search}`, {
    method: 'GET',
    wrapDataKey: 'reports',
    fallbackErrorCode: 'ABUSE_REQUEST_FAILED',
    fallbackErrorMessage: 'Unable to load abuse reports.',
  });
}

export async function POST(request: NextRequest) {
  return proxyBackendRequest(request, '/abuse/reports', {
    method: 'POST',
    requireCsrf: true,
    includeBody: true,
    wrapDataKey: 'report',
    fallbackErrorCode: 'ABUSE_REQUEST_FAILED',
    fallbackErrorMessage: 'Unable to create abuse report.',
  });
}
