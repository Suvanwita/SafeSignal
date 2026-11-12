import type { NextRequest } from 'next/server';
import { handleCredentialAuthRoute } from '@/lib/auth/route-helpers';

export function POST(request: NextRequest) {
  return handleCredentialAuthRoute(request, '/api/v1/auth/login', 200);
}
