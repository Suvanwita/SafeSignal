import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(request: NextRequest) {
  return proxyBackendRequest(request, '/privacy/scan', {
    method: 'POST',
    requireCsrf: true,
    includeBody: true,
    fallbackErrorCode: 'PRIVACY_SCAN_FAILED',
    fallbackErrorMessage: 'Unable to scan text for sensitive information.',
  });
}
