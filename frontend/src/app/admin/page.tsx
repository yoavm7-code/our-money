'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/i18n/context';
import { adminApi } from '@/lib/adminApi';

type Stats = {
  totalUsers: number;
  totalHouseholds: number;
  totalTransactions: number;
  totalAccounts: number;
  usersToday: number;
  usersThisMonth: number;
};

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi<Stats>('/api/admin/stats')
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const statCards: { key: keyof Stats; label: string; color: string; icon: React.ReactNode }[] = [
    {
      key: 'totalUsers',
      label: t('admin.totalUsers'),
      color: '#6366f1',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      key: 'totalHouseholds',
      label: t('admin.totalHouseholds'),
      color: '#8b5cf6',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      ),
    },
    {
      key: 'totalTransactions',
      label: t('admin.totalTransactions'),
      color: '#22c55e',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      key: 'totalAccounts',
      label: t('admin.totalAccounts'),
      color: '#f59e0b',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M6 8h.01" />
          <path d="M10 8h.01" />
          <path d="M14 8h.01" />
        </svg>
      ),
    },
    {
      key: 'usersToday',
      label: t('admin.usersToday'),
      color: '#06b6d4',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
      ),
    },
    {
      key: 'usersThisMonth',
      label: t('admin.usersThisMonth'),
      color: '#ec4899',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.dashboard')}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-3" />
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.dashboard')}</h1>
        <div className="card text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.dashboard')}</h1>
        <p className="text-sm text-[var(--foreground)] opacity-60 mt-1">{t('admin.systemStats')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div key={card.key} className="card flex items-center gap-4">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-xl"
              style={{ background: `${card.color}15`, color: card.color }}
            >
              {card.icon}
            </div>
            <div>
              <p className="text-sm text-[var(--foreground)] opacity-60">{card.label}</p>
              <p className="text-2xl font-bold text-[var(--foreground)]">
                {stats ? stats[card.key].toLocaleString() : '--'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="card">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">{t('admin.quickLinks')}</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/users"
            className="btn-primary inline-flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {t('admin.manageUsers')}
          </Link>
        </div>
      </div>
    </div>
  );
}
