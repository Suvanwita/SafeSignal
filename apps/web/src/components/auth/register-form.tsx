'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { notify } from '@/components/ui/toaster';
import {
  AuthApiError,
  ensureCsrfToken,
  registerAccount,
} from '@/lib/auth/client-api';
import { cn } from '@/lib/utils';
import { AuthLayout } from './auth-layout';

interface RegisterFieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_POLICY_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

export function RegisterForm() {
  const router = useRouter();

  const [displayName, setDisplayName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<RegisterFieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    void ensureCsrfToken().catch(() => {
      // Token will be retried on form submission if needed
    });
  }, []);

  const passwordChecks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
  ];

  function validate(): boolean {
    const errors: RegisterFieldErrors = {};
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length > 100) {
      errors.displayName = 'Display name must not exceed 100 characters.';
    }

    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (!PASSWORD_POLICY_PATTERN.test(password)) {
      errors.password =
        'Password must be 8–128 characters and include uppercase, lowercase, and a number.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    } else if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match.';
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
      const trimmedName = displayName.trim();
      await registerAccount({
        email: email.trim().toLowerCase(),
        password,
        ...(trimmedName ? { displayName: trimmedName } : {}),
      });

      notify.verified(
        'SafeSignal account created',
        'Your protected session is now active.',
      );

      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      if (error instanceof AuthApiError) {
        if (error.details) {
          const mapped: RegisterFieldErrors = {};
          for (const detail of error.details) {
            if (detail.field === 'email') {
              mapped.email = detail.messages[0];
            } else if (detail.field === 'password') {
              mapped.password = detail.messages[0];
            } else if (detail.field === 'displayName') {
              mapped.displayName = detail.messages[0];
            }
          }
          setFieldErrors(mapped);
        }
        setFormError(error.message);
      } else {
        setFormError('Unable to create your account right now. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your SafeSignal account"
      description="Start documenting threats and protecting your digital identity."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-slate-900 underline-offset-4 hover:underline"
          >
            Sign in
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
          id="register-display-name"
          label="Display name"
          description="Optional name shown in your workspace."
          error={fieldErrors.displayName}
        >
          <Input
            id="register-display-name"
            name="displayName"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={displayName}
            error={Boolean(fieldErrors.displayName)}
            disabled={isSubmitting}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (fieldErrors.displayName) {
                setFieldErrors((prev) => ({ ...prev, displayName: undefined }));
              }
            }}
          />
        </FormField>

        <FormField
          id="register-email"
          label="Email address"
          required
          error={fieldErrors.email}
        >
          <Input
            id="register-email"
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
          id="register-password"
          label="Password"
          required
          error={fieldErrors.password}
        >
          <PasswordInput
            id="register-password"
            name="password"
            autoComplete="new-password"
            placeholder="Create a strong password"
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

        <ul
          aria-label="Password requirements"
          className="grid grid-cols-2 gap-1.5 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs"
        >
          {passwordChecks.map((rule) => (
            <li
              key={rule.label}
              className={cn(
                'flex items-center gap-1.5',
                rule.met ? 'text-emerald-700' : 'text-slate-500',
              )}
            >
              <CheckCircle2
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  rule.met ? 'text-emerald-600' : 'text-slate-300',
                )}
                aria-hidden="true"
              />
              <span>{rule.label}</span>
            </li>
          ))}
        </ul>

        <FormField
          id="register-confirm-password"
          label="Confirm password"
          required
          error={fieldErrors.confirmPassword}
        >
          <PasswordInput
            id="register-confirm-password"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            error={Boolean(fieldErrors.confirmPassword)}
            disabled={isSubmitting}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (fieldErrors.confirmPassword) {
                setFieldErrors((prev) => ({
                  ...prev,
                  confirmPassword: undefined,
                }));
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
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
