'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

export default function VerifyEmailContent() {
  const { t, locale, setLocale } = useTranslation();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [resent, setResent] = useState(false);

  const isLoggedIn = typeof window !== 'undefined' && !!localStorage.getItem('accessToken');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    auth.verifyEmail(token)
      .then((res) => {
        setStatus(res.verified ? 'success' : 'error');
      })
      .catch(() => {
        setStatus('error');
      });
  }, [token]);

  async function handleResend() {
    try {
      await auth.resendVerification();
      setResent(true);
    } catch {
      // silently fail
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="card w-full max-w-md relative animate-scaleIn text-center">
        <button
          type="button"
          onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
          className="absolute top-4 end-4 text-xs font-medium px-2 py-1 rounded border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {locale === 'he' ? 'EN' : 'HE'}
        </button>

        <h1 className="text-2xl font-semibold mb-6">{t('verifyEmail.title')}</h1>

        {status === 'verifying' && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
              <svg className="animate-spin text-blue-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <p className="text-slate-600 dark:text-slate-300">{t('verifyEmail.verifying')}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-lg font-medium text-green-700 dark:text-green-300">{t('verifyEmail.success')}</p>
            {isLoggedIn ? (
              <Link href="/dashboard" className="btn-primary inline-block w-full">
                {t('verifyEmail.goToDashboard')}
              </Link>
            ) : (
              <Link href="/login" className="btn-primary inline-block w-full">
                {t('verifyEmail.goToLogin')}
              </Link>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <p className="text-lg font-medium text-red-700 dark:text-red-300">{t('verifyEmail.error')}</p>

            {isLoggedIn && !resent && (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={handleResend}
              >
                {t('verifyEmail.resend')}
              </button>
            )}
            {resent && (
              <p className="text-sm text-green-600">{t('verifyEmail.resent')}</p>
            )}

            {isLoggedIn ? (
              <Link href="/dashboard" className="btn-primary inline-block w-full">
                {t('verifyEmail.goToDashboard')}
              </Link>
            ) : (
              <Link href="/login" className="btn-primary inline-block w-full">
                {t('verifyEmail.goToLogin')}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
