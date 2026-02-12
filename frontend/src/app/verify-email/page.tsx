'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

export default function VerifyEmailPage() {
  const { t, locale, setLocale } = useTranslation();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [resent, setResent] = useState(false);

  const isLoggedIn = typeof window !== 'undefined' && !!localStorage.getItem('accessToken');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setStatus('error');
      return;
    }
    auth.verifyEmail(token)
      .then((res) => setStatus(res.verified ? 'success' : 'error'))
      .catch(() => setStatus('error'));
  }, []);

  async function handleResend() {
    try {
      await auth.resendVerification();
      setResent(true);
    } catch {
      // silently fail
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-700 px-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-8 relative text-center">
        <button
          type="button"
          onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
          className="absolute top-4 end-4 text-xs font-medium px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
        >
          {locale === 'he' ? 'EN' : 'HE'}
        </button>

        <h1 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">{t('verifyEmail.title')}</h1>

        {status === 'verifying' && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto">
              <svg className="animate-spin text-indigo-500" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <p className="text-slate-600 dark:text-slate-300">{t('verifyEmail.verifying')}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-green-700 dark:text-green-300">{t('verifyEmail.success')}</p>
            {isLoggedIn ? (
              <Link href="/dashboard" className="block w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold text-sm text-center shadow-lg">
                {t('verifyEmail.goToDashboard')}
              </Link>
            ) : (
              <Link href="/" className="block w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold text-sm text-center shadow-lg">
                {t('verifyEmail.goToLogin')}
              </Link>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 dark:text-red-400">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-red-700 dark:text-red-300">{t('verifyEmail.error')}</p>
            {isLoggedIn && !resent && (
              <button type="button" onClick={handleResend} className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                {t('verifyEmail.resend')}
              </button>
            )}
            {resent && <p className="text-sm text-green-600">{t('verifyEmail.resent')}</p>}
            {isLoggedIn ? (
              <Link href="/dashboard" className="block w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold text-sm text-center shadow-lg">
                {t('verifyEmail.goToDashboard')}
              </Link>
            ) : (
              <Link href="/" className="block w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold text-sm text-center shadow-lg">
                {t('verifyEmail.goToLogin')}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
