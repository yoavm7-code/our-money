'use client';

import { useCallback, useEffect, useState } from 'react';
import { recurring, type RecurringPatternItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import { useToast } from '@/components/Toast';

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

type Tab = 'detected' | 'confirmed';

export default function RecurringPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const [patterns, setPatterns] = useState<RecurringPatternItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('detected');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPatterns = useCallback(() => {
    setLoading(true);
    recurring.list()
      .then(setPatterns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPatterns(); }, [fetchPatterns]);

  const detectedPatterns = patterns.filter((p) => !p.isConfirmed);
  const confirmedPatterns = patterns.filter((p) => p.isConfirmed);

  async function handleDetect() {
    setDetecting(true);
    try {
      const res = await recurring.detect();
      if (res.detected > 0) {
        toast(t('recurring.detectSuccess').replace('{count}', String(res.detected)), 'success');
      } else {
        toast(t('recurring.detectNone'), 'info');
      }
      fetchPatterns();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setDetecting(false);
    }
  }

  async function handleConfirm(id: string) {
    setActionLoading(id);
    try {
      await recurring.confirm(id);
      setPatterns((prev) => prev.map((p) => p.id === id ? { ...p, isConfirmed: true } : p));
      toast(t('recurring.confirmed'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDismiss(id: string) {
    setActionLoading(id);
    try {
      await recurring.dismiss(id);
      setPatterns((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  function formatFrequency(freq: string) {
    if (freq === 'monthly') return t('recurring.monthly');
    if (freq === 'weekly') return t('recurring.weekly');
    return freq;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(
      locale === 'he' ? 'he-IL' : 'en-IL',
      { day: 'numeric', month: 'short', year: 'numeric' },
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  const currentList = activeTab === 'detected' ? detectedPatterns : confirmedPatterns;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('recurring.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('recurring.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={handleDetect}
          disabled={detecting}
        >
          {detecting ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1 animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              {t('recurring.detecting')}
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {t('recurring.detect')}
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('detected')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'detected'
              ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t('recurring.detectedPatterns')}
          {detectedPatterns.length > 0 && (
            <span className="ms-2 px-2 py-0.5 rounded-full text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
              {detectedPatterns.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('confirmed')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'confirmed'
              ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t('recurring.confirmedPatterns')}
          {confirmedPatterns.length > 0 && (
            <span className="ms-2 px-2 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
              {confirmedPatterns.length}
            </span>
          )}
        </button>
      </div>

      {/* Pattern list */}
      {currentList.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-300 dark:text-slate-600">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <p className="text-slate-500">{t('recurring.noPatterns')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentList.map((pattern) => (
            <div key={pattern.id} className="card animate-scaleIn relative overflow-hidden">
              {/* Top color accent */}
              <div className={`absolute inset-x-0 top-0 h-1 ${pattern.type === 'income' ? 'bg-green-500' : 'bg-red-500'}`} />

              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Type badge */}
                  <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    pattern.type === 'income'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  }`}>
                    {pattern.type === 'income' ? t('recurring.income') : t('recurring.expense')}
                  </span>
                  {/* Confirmed badge */}
                  {pattern.isConfirmed && (
                    <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="me-1">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {t('recurring.confirmed')}
                    </span>
                  )}
                </div>
                <span className={`text-lg font-bold whitespace-nowrap ${
                  pattern.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {pattern.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(pattern.amount), locale)}
                </span>
              </div>

              {/* Description */}
              <h3 className="font-semibold text-lg mb-3 truncate">{pattern.description}</h3>

              {/* Details */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500 mb-4">
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  {t('recurring.frequency')}: <b>{formatFrequency(pattern.frequency)}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  </svg>
                  {t('recurring.occurrences')}: <b>{pattern.occurrences}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {t('recurring.lastSeen')}: <b>{formatDate(pattern.lastSeenDate)}</b>
                </span>
              </div>

              {/* Action buttons */}
              {!pattern.isConfirmed ? (
                <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    onClick={() => handleConfirm(pattern.id)}
                    disabled={actionLoading === pattern.id}
                  >
                    {actionLoading === pattern.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {t('common.loading')}
                      </span>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline -mt-0.5 me-1">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {t('recurring.confirm')}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={() => handleDismiss(pattern.id)}
                    disabled={actionLoading === pattern.id}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    {t('recurring.dismiss')}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    className="text-sm text-red-500 hover:text-red-700 transition-colors"
                    onClick={() => handleDismiss(pattern.id)}
                    disabled={actionLoading === pattern.id}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    {t('recurring.removePattern')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
