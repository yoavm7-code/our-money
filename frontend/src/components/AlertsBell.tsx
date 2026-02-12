'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { alerts, type AlertItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

const SEVERITY_COLORS: Record<string, { bg: string; text: string; icon: string; border: string }> = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-300',
    icon: 'text-red-500',
    border: 'border-red-200 dark:border-red-800',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    icon: 'text-amber-500',
    border: 'border-amber-200 dark:border-amber-800',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-500',
    border: 'border-blue-200 dark:border-blue-800',
  },
};

function SeverityIcon({ severity }: { severity: string }) {
  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.info;
  if (severity === 'critical') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={colors.icon}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  if (severity === 'warning') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={colors.icon}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={colors.icon}>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export default function AlertsBell() {
  const { t, locale } = useTranslation();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const data = await alerts.list();
      setItems(data);
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Click outside handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unreadCount = items.filter((a) => !a.isRead).length;

  async function handleDismiss(id: string) {
    try {
      await alerts.markRead(id);
      setItems((prev) => prev.map((a) => a.id === id ? { ...a, isRead: true } : a));
    } catch {
      // silent
    }
  }

  async function handleClearAll() {
    setLoading(true);
    try {
      await alerts.clearAll();
      setItems([]);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label={t('alerts.title')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-2 end-0 w-80 md:w-96 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h3 className="font-semibold text-sm">{t('alerts.title')}</h3>
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={loading}
                className="text-xs text-indigo-500 hover:underline disabled:opacity-50"
              >
                {t('alerts.clearAll')}
              </button>
            )}
          </div>

          {/* Items */}
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-8 text-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-slate-300 dark:text-slate-600">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
                </svg>
                <p className="text-sm text-slate-400">{t('alerts.empty')}</p>
              </div>
            ) : (
              items.map((alert) => {
                const colors = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0 ${
                      alert.isRead ? 'opacity-60' : ''
                    } hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors`}
                  >
                    <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-full ${colors.bg} flex items-center justify-center`}>
                      <SeverityIcon severity={alert.severity} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{alert.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{alert.description}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{formatDate(alert.createdAt)}</p>
                    </div>
                    {!alert.isRead && (
                      <button
                        type="button"
                        onClick={() => handleDismiss(alert.id)}
                        className="shrink-0 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title={t('alerts.dismiss')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
