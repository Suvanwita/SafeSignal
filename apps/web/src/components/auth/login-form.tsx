'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { notify } from '@/components/ui/toaster';
import {
  AuthApiError,
  ensureCsrfToken,
  loginAccount,
  sanitizeRedirectPath,
} from '@/lib/auth/client-api';
import { AuthLayout } from './auth-layout';

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeRedirectPath(searchParams.get('next'));

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<LoginFieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    void ensureCsrfToken().catch(() => {
      // Token will be retried on form submission if needed
    });
  }, []);

  function validate(): boolean {
    const errors: LoginFieldErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { user } = await loginAccount({
        email: email.trim().toLowerCase(),
        password,
      });

      notify.verified(
        'Signed in to SafeSignal',
        `Welcome back${user.displayName ? `, ${user.displayName}` : ''}.`,
      );

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      if (error instanceof AuthApiError) {
        if (error.details) {
          const mapped: LoginFieldErrors = {};
          for (const detail of error.details) {
            if (detail.field === 'email') {
              mapped.email = detail.messages[0];
            } else if (detail.field === 'password') {
              mapped.password = detail.messages[0];
            }
          }
          setFieldErrors(mapped);
        }
        setFormError(error.message);
      } else {
        setFormError('Unable to sign in right now. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in to SafeSignal"
      description="Access your protected safety workspace and evidence vault."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-slate-900 underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span>{formError}</span>
          </div>
        )}

        <FormField
          id="login-email"
          label="Email address"
          required
          error={fieldErrors.email}
        >
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@organization.org"
            value={email}
            error={Boolean(fieldErrors.email)}
            disabled={isSubmitting}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) {
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
          />
        </FormField>

        <FormField
          id="login-password"
          label="Password"
          required
          error={fieldErrors.password}
        >
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            error={Boolean(fieldErrors.password)}
            disabled={isSubmitting}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) {
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }
            }}
          />
        </FormField>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={isSubmitting}
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
