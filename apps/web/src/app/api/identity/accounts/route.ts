import type { NextRequest } from 'next/server';
import { proxyIdentityRequest } from '@/lib/identity/bff-proxy';

export async function GET(request: NextRequest) {
  return proxyIdentityRequest(request, '/identity/accounts', {
    method: 'GET',
    wrapDataKey: 'accounts',
  });
}

export async function POST(request: NextRequest) {
  return proxyIdentityRequest(request, '/identity/accounts', {
    method: 'POST',
    requireCsrf: true,
    includeBody: true,
    wrapDataKey: 'account',
  });
}
