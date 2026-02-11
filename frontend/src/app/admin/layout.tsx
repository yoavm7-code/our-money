'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale, dir } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token && pathname !== '/admin/login') {
      router.replace('/admin/login');
      setAuthenticated(false);
    } else {
      setAuthenticated(true);
    }
  }, [pathname, router]);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    router.replace('/admin/login');
  };

  const isLoginPage = pathname === '/admin/login';

  // On login page, skip header/nav
  if (isLoginPage) {
    return <div dir={dir}>{children}</div>;
  }

  // Wait for auth check
  if (authenticated === null || authenticated === false) {
    return (
      <div dir={dir} className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-[var(--foreground)] opacity-60">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-[var(--background)]">
      {/* Admin Header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-3"
        style={{ background: '#1a1a2e' }}
      >
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-white font-bold text-lg tracking-wide">
            {t('admin.title')}
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/admin"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/admin'
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('admin.dashboard')}
            </Link>
            <Link
              href="/admin/users"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith('/admin/users')
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('admin.users')}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Language toggle */}
          <button
            onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
            className="px-2 py-1 rounded text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            {locale === 'he' ? 'EN' : 'HE'}
          </button>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-300 hover:text-red-100 hover:bg-red-500/20 transition-colors"
          >
            {t('admin.logout')}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
