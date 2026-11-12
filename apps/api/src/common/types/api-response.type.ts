import type { Request } from 'express';

export interface ApiResponseMeta {
  timestamp: string;
  path: string;
  requestId?: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ApiResponseMeta;
}

export interface ApiErrorDetail {
  field?: string;
  messages: string[];
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | unknown;
  };
  meta: ApiResponseMeta & {
    statusCode: number;
  };
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JwtAccessPayload {
  sub: string;
  email: string;
  sid: string;
  jti: string;
}

export interface RequestWithContext extends Request {
  requestId?: string;
  user?: AuthenticatedUser;
  sessionId?: string;
}
