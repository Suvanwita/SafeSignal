import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { validateCsrfRequest } from '@/lib/auth/csrf';
import { buildCsrfErrorResponse } from '@/lib/auth/route-helpers';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';

export async function POST(request: NextRequest) {
  const csrfCheck = validateCsrfRequest(request);
  if (!csrfCheck.valid) {
    return buildCsrfErrorResponse(csrfCheck.reason);
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_FORM_DATA',
          message: 'Expected multipart/form-data with evidence file.',
        },
      },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${getBackendApiBaseUrl()}/api/v1/evidence/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const payload = await res.json().catch(() => null);
    return NextResponse.json(payload, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EVIDENCE_UPLOAD_FAILED',
          message: 'Unable to reach backend evidence vault service.',
        },
      },
      { status: 503 },
    );
  }
}
