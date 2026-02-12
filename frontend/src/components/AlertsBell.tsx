'use client';

import { useCallback, useEffect, useState } from 'react';
import { alerts, type AlertItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function AlertIcon({ type }: { type: AlertItem['type'] }) {
  switch (type) {
    case 'budget_exceeded':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
    case 'low_balance':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'goal_deadline':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case 'unusual_expense':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>;
    case 'recurring_missed':
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
    default:
      return null;
  }
}

function getSeverityStyles(severity: AlertItem['severity']) {
  switch (severity) {
    case 'critical': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300';
    case 'warning': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300';
    case 'info': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300';
  }
}

export default function AlertsBell() {
  const { t, locale } = useTranslation();
  const [alertList, setAlertList] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchAlerts = useCallback(() => {
    alerts.list().then(setAlertList).catch(() => {});
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Load dismissed from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('our-money-dismissed-alerts');
    if (stored) {
      try { setDismissed(new Set(JSON.parse(stored))); } catch { /* ignore */ }
    }
  }, []);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('our-money-dismissed-alerts', JSON.stringify([...next]));
      return next;
    });
  }

  function clearAll() {
    const allIds = activeAlerts.map((a) => a.id);
    setDismissed((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => next.add(id));
      localStorage.setItem('our-money-dismissed-alerts', JSON.stringify([...next]));
      return next;
    });
    setOpen(false);
  }

  function getDescription(alert: AlertItem): string {
    const d = alert.data;
    switch (alert.type) {
      case 'budget_exceeded':
        return t('alerts.budgetExceededDesc', {
          category: String(d.category || ''),
          spent: formatCurrency(Number(d.spent), locale),
          budget: formatCurrency(Number(d.budget), locale),
        });
      case 'low_balance':
        return t('alerts.lowBalanceDesc', {
          account: String(d.account || ''),
          balance: formatCurrency(Number(d.balance), locale),
        });
      case 'goal_deadline':
        return t('alerts.goalDeadlineDesc', {
          goal: String(d.goal || ''),
          days: String(d.days || ''),
          progress: String(d.progress || ''),
        });
      case 'unusual_expense':
        return t('alerts.unusualExpenseDesc', {
          amount: formatCurrency(Number(d.amount), locale),
          description: String(d.description || ''),
        });
      case 'recurring_missed':
        return t('alerts.recurringMissedDesc', {
          description: String(d.description || ''),
        });
      default:
        return '';
    }
  }

  function getTitle(alert: AlertItem): string {
    switch (alert.type) {
      case 'budget_exceeded': return t('alerts.budgetExceeded');
      case 'low_balance': return t('alerts.lowBalance');
      case 'goal_deadline': return t('alerts.goalDeadline');
      case 'unusual_expense': return t('alerts.unusualExpense');
      case 'recurring_missed': return t('alerts.recurringMissed');
      default: return '';
    }
  }

  const activeAlerts = alertList.filter((a) => !dismissed.has(a.id));
  const count = activeAlerts.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={t('alerts.title')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] z-50 animate-scaleIn">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="font-semibold text-sm">{t('alerts.title')}</h3>
              {count > 0 && (
                <button type="button" onClick={clearAll} className="text-xs text-primary-600 hover:text-primary-700">
                  {t('alerts.clearAll')}
                </button>
              )}
            </div>
            {activeAlerts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                {t('alerts.noAlerts')}
              </div>
            ) : (
              <div className="py-1">
                {activeAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`mx-2 my-1 p-3 rounded-xl border text-sm ${getSeverityStyles(alert.severity)}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 mt-0.5"><AlertIcon type={alert.type} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{getTitle(alert)}</p>
                        <p className="text-xs mt-0.5 opacity-80">{getDescription(alert)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismiss(alert.id)}
                        className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        title={t('alerts.markRead')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
