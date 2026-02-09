'use client';

import { useCallback, useEffect, useState } from 'react';
import { insights, type InsightSection, INSIGHT_SECTIONS } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

type Tip = {
  id: string;
  section: InsightSection;
  content: string;
  read: boolean;
};

const SECTION_ICONS: Record<string, string> = {
  balanceForecast: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  savingsRecommendation: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  investmentRecommendations: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  taxTips: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
  spendingInsights: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z',
  monthlySummary: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
};

const STORAGE_KEY = 'our-money-read-tips';
const HIDDEN_KEY = 'our-money-tips-hidden';

function getReadTips(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveReadTips(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export default function TipsPanel() {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true); // start hidden, reveal after mount
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setReadIds(getReadTips());
    // Load hidden state from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(HIDDEN_KEY);
      setHidden(stored === 'true');
    } else {
      setHidden(false);
    }
  }, []);

  const fetchTips = useCallback(async (force = false) => {
    if (tips.length > 0 && !force) return;
    setLoading(true);
    const readSet = getReadTips();
    const fetched: Tip[] = [];
    try {
      // Fetch all sections in parallel with per-request timeout
      const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
        Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

      const results = await withTimeout(
        Promise.allSettled(
          INSIGHT_SECTIONS.map(async (section) => {
            const res = await withTimeout(insights.getSection(section, locale), 10000);
            return { section, content: res.content };
          }),
        ),
        30000, // overall 30s timeout
      );

      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value.content) continue;
        const { section, content } = result.value;
        const lines = content.split('\n').map((l: string) => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('#')) continue;
          if (line.endsWith(':')) continue;
          let cleaned = line.replace(/^[•\-*]\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/\*\*/g, '').trim();
          if (cleaned.length < 15) continue;
          if (cleaned.length > 250) {
            const sentenceEnd = cleaned.slice(0, 250).lastIndexOf('.');
            cleaned = sentenceEnd > 60 ? cleaned.slice(0, sentenceEnd + 1) : cleaned.slice(0, 247) + '...';
          }
          const id = `${section}-${fetched.length}`;
          fetched.push({ id, section, content: cleaned, read: readSet.has(id) });
        }
      }
    } catch { /* timeout or all failed */ }
    setTips(fetched);
    setReadIds(readSet);
    setLoading(false);
  }, [locale, tips.length]);

  const handleOpen = () => {
    setOpen(true);
    if (tips.length === 0) fetchTips();
  };

  const handleHide = () => {
    setHidden(true);
    if (typeof window !== 'undefined') localStorage.setItem(HIDDEN_KEY, 'true');
  };

  const handleShow = () => {
    setHidden(false);
    if (typeof window !== 'undefined') localStorage.setItem(HIDDEN_KEY, 'false');
  };

  const handleGenerate = async () => {
    setGenerating(true);
    // Clear session cache to force refresh
    if (typeof window !== 'undefined') {
      INSIGHT_SECTIONS.forEach((s) => {
        sessionStorage.removeItem(`insight_${s}_${locale}`);
      });
    }
    await fetchTips(true);
    setGenerating(false);
  };

  const markAsRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadTips(next);
      return next;
    });
    setTips((prev) => prev.map((tip) => (tip.id === id ? { ...tip, read: true } : tip)));
  };

  const markAllRead = () => {
    const allIds = new Set(tips.map((tip) => tip.id));
    setReadIds(allIds);
    saveReadTips(allIds);
    setTips((prev) => prev.map((tip) => ({ ...tip, read: true })));
  };

  const unreadCount = tips.filter((tip) => !tip.read && !readIds.has(tip.id)).length;

  return (
    <>
      {/* Floating button - full or minimized */}
      {hidden ? (
        /* Minimized tab - small vertical tab on the edge */
        <button
          type="button"
          onClick={handleShow}
          className="fixed bottom-6 end-0 z-30 px-1.5 py-3 rounded-s-lg bg-gradient-to-b from-primary-500 to-emerald-500 text-white shadow-md hover:shadow-lg hover:px-2 transition-all duration-200 flex flex-col items-center gap-1 opacity-70 hover:opacity-100"
          title={t('tips.show')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          {unreadCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      ) : (
        <div className="fixed bottom-6 end-6 z-30 flex items-center gap-1 group">
          <button
            type="button"
            onClick={handleOpen}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-emerald-500 text-white shadow-glow-lg hover:shadow-glow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center"
            title={t('tips.title')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center animate-bounce">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {/* Hide button - appears on hover */}
          <button
            type="button"
            onClick={handleHide}
            className="absolute -top-2 -start-2 w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600"
            title={t('tips.hide')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* Panel overlay */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease-out' }} />
          <div
            className="absolute bottom-0 end-0 top-0 w-full max-w-md bg-[var(--card)] shadow-2xl flex flex-col animate-slideInRight"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-emerald-500 flex items-center justify-center text-white">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-semibold text-lg">{t('tips.title')}</h2>
                  <p className="text-xs text-slate-500">{t('tips.subtitle')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 p-4 border-b border-[var(--border)]">
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                onClick={handleGenerate}
                disabled={generating}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={generating ? 'animate-spin' : ''}>
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {generating ? t('tips.generating') : t('tips.generateNew')}
              </button>
              {tips.length > 0 && unreadCount > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={markAllRead}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  {t('tips.markAllRead')}
                </button>
              )}
            </div>

            {/* Tips list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                  <span className="text-sm">{t('tips.loading')}</span>
                </div>
              ) : tips.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-40">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-sm">{t('tips.empty')}</p>
                  <p className="text-xs mt-1">{t('tips.emptyHint')}</p>
                </div>
              ) : (
                tips.map((tip) => {
                  const isRead = tip.read || readIds.has(tip.id);
                  const iconPath = SECTION_ICONS[tip.section] ?? SECTION_ICONS.monthlySummary;
                  return (
                    <div
                      key={tip.id}
                      className={`p-3 rounded-xl border transition-all duration-200 ${
                        isRead
                          ? 'border-[var(--border)] bg-slate-50/50 dark:bg-slate-800/30 opacity-70'
                          : 'border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                          isRead ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        }`}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d={iconPath} />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            {t(`insightsPage.${tip.section}`)}
                          </p>
                          <p className={`text-sm leading-relaxed ${isRead ? 'text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                            {tip.content}
                          </p>
                        </div>
                        {!isRead && (
                          <button
                            type="button"
                            onClick={() => markAsRead(tip.id)}
                            className="shrink-0 p-1.5 rounded-lg text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-900/20 transition-colors"
                            title={t('tips.markRead')}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
