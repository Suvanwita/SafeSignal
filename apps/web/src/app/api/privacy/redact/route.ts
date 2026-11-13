import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(request: NextRequest) {
  return proxyBackendRequest(request, '/privacy/redact', {
    method: 'POST',
    requireCsrf: true,
    includeBody: true,
    fallbackErrorCode: 'PRIVACY_REDACT_FAILED',
    fallbackErrorMessage: 'Unable to redact sensitive information.',
  });
}
