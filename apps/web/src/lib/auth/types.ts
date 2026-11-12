export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorDetail {
  field?: string;
  messages: string[];
}

export interface ApiFailureEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | unknown;
  };
  meta?: {
    statusCode: number;
    timestamp: string;
    path: string;
    requestId?: string;
  };
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    path: string;
    requestId?: string;
  };
}
