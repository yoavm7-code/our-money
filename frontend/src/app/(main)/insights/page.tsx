'use client';

import { useCallback, useEffect, useState } from 'react';
import { insights, type InsightSection } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

const CACHE_PREFIX = 'insights_';

// Icons for each section
const BalanceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

const SavingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
    <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/>
  </svg>
);

const InvestIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
  </svg>
);

const TaxIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/>
  </svg>
);

const SpendingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

type SectionState = {
  content: string | null;
  loading: boolean;
  error: string;
};

const initialSectionState: SectionState = {
  content: null,
  loading: false,
  error: '',
};

function getCached(section: InsightSection): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + section);
    return raw ? (JSON.parse(raw) as string) : null;
  } catch {
    return null;
  }
}

function setCached(section: InsightSection, content: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(CACHE_PREFIX + section, JSON.stringify(content));
}

function clearCached(section: InsightSection) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(CACHE_PREFIX + section);
}

const SECTIONS: Array<{
  id: InsightSection;
  titleKey: 'balanceForecast' | 'savingsRecommendation' | 'investmentRecommendations' | 'taxTips' | 'spendingInsights';
  icon: React.ReactNode;
  accentColor: string;
}> = [
  { id: 'balanceForecast', titleKey: 'balanceForecast', icon: <BalanceIcon />, accentColor: 'border-blue-500' },
  { id: 'savingsRecommendation', titleKey: 'savingsRecommendation', icon: <SavingsIcon />, accentColor: 'border-green-500' },
  { id: 'investmentRecommendations', titleKey: 'investmentRecommendations', icon: <InvestIcon />, accentColor: 'border-purple-500' },
  { id: 'taxTips', titleKey: 'taxTips', icon: <TaxIcon />, accentColor: 'border-amber-500' },
  { id: 'spendingInsights', titleKey: 'spendingInsights', icon: <SpendingIcon />, accentColor: 'border-rose-500' },
];

export default function InsightsPage() {
  const { t } = useTranslation();
  const [sectionData, setSectionData] = useState<Record<InsightSection, SectionState>>(() =>
    SECTIONS.reduce(
      (acc, s) => {
        acc[s.id] = { ...initialSectionState };
        return acc;
      },
      {} as Record<InsightSection, SectionState>,
    ),
  );
  const [expanded, setExpanded] = useState<Record<InsightSection, boolean>>(() =>
    SECTIONS.reduce((acc, s) => {
      acc[s.id] = false;
      return acc;
    }, {} as Record<InsightSection, boolean>),
  );

  const loadSection = useCallback(
    async (section: InsightSection, forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = getCached(section);
        if (cached !== null) {
          setSectionData((prev) => ({
            ...prev,
            [section]: { content: cached, loading: false, error: '' },
          }));
          return;
        }
      } else {
        clearCached(section);
      }

      setSectionData((prev) => ({
        ...prev,
        [section]: { ...prev[section], loading: true, error: '' },
      }));

      try {
        const res = await insights.getSection(section);
        const content = res.content ?? '';
        setCached(section, content);
        setSectionData((prev) => ({
          ...prev,
          [section]: { content, loading: false, error: '' },
        }));
      } catch (e) {
        const message = e instanceof Error ? e.message : t('common.failedToLoad');
        setSectionData((prev) => ({
          ...prev,
          [section]: { content: null, loading: false, error: message },
        }));
      }
    },
    [t],
  );

  const toggleExpanded = useCallback((section: InsightSection) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  // When a section is expanded and has no content yet, load from cache or API
  useEffect(() => {
    SECTIONS.forEach((sec) => {
      if (!expanded[sec.id]) return;
      const state = sectionData[sec.id];
      if (state.content !== null || state.loading) return;
      loadSection(sec.id, false);
    });
  }, [expanded, loadSection, sectionData]);

  const handleRefreshSection = useCallback(
    (e: React.MouseEvent, section: InsightSection) => {
      e.stopPropagation();
      loadSection(section, true);
    },
    [loadSection],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t('insightsPage.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          {t('insightsPage.subtitle')}
        </p>
      </div>

      <div className="space-y-3">
        {/* Main insights - first two in grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {SECTIONS.slice(0, 2).map((sec) => (
            <InsightBlock
              key={sec.id}
              section={sec}
              state={sectionData[sec.id]}
              isExpanded={expanded[sec.id]}
              onToggle={() => toggleExpanded(sec.id)}
              onRefresh={(e) => handleRefreshSection(e, sec.id)}
              t={t}
            />
          ))}
        </div>

        {/* Investment - full width */}
        {SECTIONS.slice(2, 3).map((sec) => (
          <InsightBlock
            key={sec.id}
            section={sec}
            state={sectionData[sec.id]}
            isExpanded={expanded[sec.id]}
            onToggle={() => toggleExpanded(sec.id)}
            onRefresh={(e) => handleRefreshSection(e, sec.id)}
            t={t}
          />
        ))}

        {/* Tax + Spending - grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {SECTIONS.slice(3, 5).map((sec) => (
            <InsightBlock
              key={sec.id}
              section={sec}
              state={sectionData[sec.id]}
              isExpanded={expanded[sec.id]}
              onToggle={() => toggleExpanded(sec.id)}
              onRefresh={(e) => handleRefreshSection(e, sec.id)}
              t={t}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-8">
        {t('insightsPage.disclaimer')}
      </p>
    </div>
  );
}

function InsightBlock({
  section,
  state,
  isExpanded,
  onToggle,
  onRefresh,
  t,
}: {
  section: (typeof SECTIONS)[0];
  state: SectionState;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: (e: React.MouseEvent) => void;
  t: (key: string) => string;
}) {
  const { content, loading, error } = state;
  const title = t(`insightsPage.${section.titleKey}`);

  return (
    <div className={`card border-s-4 ${section.accentColor} overflow-hidden transition-shadow duration-200 hover:shadow-md`}>
      <button
        type="button"
        className="w-full flex items-center gap-4 text-right p-0 bg-transparent border-0 cursor-pointer"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="shrink-0 py-4 pl-4">{section.icon}</div>
        <div className="flex-1 min-w-0 py-4">
          <h2 className="font-semibold text-lg">{title}</h2>
        </div>
        <div className="shrink-0 flex items-center gap-2 py-4 pr-4" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            onClick={onRefresh}
            disabled={loading}
            title={t('insightsPage.refresh')}
            aria-label={t('insightsPage.refresh')}
          >
            {loading ? (
              <span className="h-4 w-4 block animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>
              </svg>
            )}
          </button>
          <span
            className={`shrink-0 transition-transform duration-300 ease-out ${isExpanded ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </div>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        aria-hidden={!isExpanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-0 pb-4 px-4 border-t border-slate-100 dark:border-slate-700">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-red-700 dark:text-red-300 text-sm mb-3">
                {error}
              </div>
            )}
            {loading && !content && (
              <div className="flex items-center gap-3 py-6 text-slate-500">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                <span>{t('insightsPage.loading')}</span>
              </div>
            )}
            {content && (
              <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {content}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
