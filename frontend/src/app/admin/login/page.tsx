'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';

export default function AdminLoginPage() {
  const { t, dir } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already authenticated, redirect to admin dashboard
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      router.replace('/admin');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const raw = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
      const apiUrl = raw || '';

      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError((data as { message?: string }).message || t('admin.loginError'));
        setLoading(false);
        return;
      }

      const result = data as {
        accessToken?: string | null;
        user?: { isAdmin?: boolean } | null;
        requiresTwoFactor?: boolean;
      };

      // If 2FA is required, we cannot handle it in admin login for simplicity
      if (result.requiresTwoFactor) {
        setError(t('admin.loginError'));
        setLoading(false);
        return;
      }

      if (!result.user?.isAdmin) {
        setError(t('admin.notAdmin'));
        setLoading(false);
        return;
      }

      if (result.accessToken) {
        localStorage.setItem('admin_token', result.accessToken);
        router.replace('/admin');
      } else {
        setError(t('admin.loginError'));
      }
    } catch {
      setError(t('admin.loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir={dir} className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-md">
        {/* Header branding */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: '#1a1a2e' }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.loginTitle')}</h1>
          <p className="text-sm text-[var(--foreground)] opacity-60 mt-1">
            {t('admin.loginSubtitle')}
          </p>
        </div>

        {/* Login Card */}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                {t('admin.email')}
              </label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                {t('admin.password')}
              </label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '...' : t('admin.signIn')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
