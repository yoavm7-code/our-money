'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { insights, type InsightSection } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

const CACHE_PREFIX = 'insights_';

// Icons for each section
const BalanceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

const SavingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/>
  </svg>
);

const InvestIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
  </svg>
);

const TaxIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/>
  </svg>
);

const SpendingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
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

function cacheKey(section: InsightSection, locale: string) {
  return `${CACHE_PREFIX}${section}_${locale}`;
}

function getCached(section: InsightSection, locale: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(section, locale));
    return raw ? (JSON.parse(raw) as string) : null;
  } catch {
    return null;
  }
}

function setCached(section: InsightSection, locale: string, content: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(cacheKey(section, locale), JSON.stringify(content));
}

function clearCached(section: InsightSection, locale: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(cacheKey(section, locale));
}

type SectionConfig = {
  id: InsightSection;
  titleKey: string;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
};

const SECTIONS: SectionConfig[] = [
  { id: 'monthlySummary', titleKey: 'monthlySummary', icon: <CalendarIcon />, gradient: 'from-teal-500 to-cyan-500', iconBg: 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400' },
  { id: 'balanceForecast', titleKey: 'balanceForecast', icon: <BalanceIcon />, gradient: 'from-blue-500 to-indigo-500', iconBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' },
  { id: 'savingsRecommendation', titleKey: 'savingsRecommendation', icon: <SavingsIcon />, gradient: 'from-emerald-500 to-green-500', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' },
  { id: 'investmentRecommendations', titleKey: 'investmentRecommendations', icon: <InvestIcon />, gradient: 'from-purple-500 to-violet-500', iconBg: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400' },
  { id: 'taxTips', titleKey: 'taxTips', icon: <TaxIcon />, gradient: 'from-amber-500 to-orange-500', iconBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' },
  { id: 'spendingInsights', titleKey: 'spendingInsights', icon: <SpendingIcon />, gradient: 'from-rose-500 to-pink-500', iconBg: 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400' },
];

/** Render AI content with basic formatting (bold, bullets, numbered lists) */
function FormattedContent({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        // Numbered list item (e.g., "1. text" or "1) text")
        const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)/);
        if (numberedMatch) {
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 min-w-[1.5rem] text-end shrink-0">{numberedMatch[1]}.</span>
              <span className="flex-1"><FormattedLine text={numberedMatch[2]} /></span>
            </div>
          );
        }

        // Bullet list item
        const bulletMatch = trimmed.match(/^[•\-*]\s+(.*)/);
        if (bulletMatch) {
          return (
            <div key={i} className="flex gap-2 items-start ps-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 shrink-0 mt-2" />
              <span className="flex-1"><FormattedLine text={bulletMatch[1]} /></span>
            </div>
          );
        }

        // Header-like line (### or ##)
        if (trimmed.startsWith('###')) {
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1"><FormattedLine text={trimmed.replace(/^#{1,4}\s*/, '')} /></h4>;
        }
        if (trimmed.startsWith('##')) {
          return <h3 key={i} className="font-semibold mt-3 mb-1"><FormattedLine text={trimmed.replace(/^#{1,4}\s*/, '')} /></h3>;
        }

        // Regular paragraph
        return <p key={i}><FormattedLine text={trimmed} /></p>;
      })}
    </div>
  );
}

/** Render inline formatting: **bold** */
function FormattedLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function InsightsPage() {
  const { t, locale } = useTranslation();
  const [sectionData, setSectionData] = useState<Record<string, SectionState>>(() =>
    SECTIONS.reduce(
      (acc, s) => {
        acc[s.id] = { ...initialSectionState };
        return acc;
      },
      {} as Record<string, SectionState>,
    ),
  );
  const [expandedId, setExpandedId] = useState<InsightSection | null>(null);

  const loadSection = useCallback(
    async (section: InsightSection, forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = getCached(section, locale);
        if (cached !== null) {
          setSectionData((prev) => ({
            ...prev,
            [section]: { content: cached, loading: false, error: '' },
          }));
          return;
        }
      } else {
        clearCached(section, locale);
      }

      setSectionData((prev) => ({
        ...prev,
        [section]: { ...prev[section], loading: true, error: '' },
      }));

      try {
        const res = await insights.getSection(section, locale);
        const content = res.content ?? '';
        setCached(section, locale, content);
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
    [t, locale],
  );

  const toggleExpanded = useCallback((section: InsightSection) => {
    setExpandedId((prev) => (prev === section ? null : section));
  }, []);

  // When locale changes, clear section content
  useEffect(() => {
    setSectionData(
      SECTIONS.reduce(
        (acc, s) => {
          acc[s.id] = { ...initialSectionState };
          return acc;
        },
        {} as Record<string, SectionState>,
      ),
    );
    setExpandedId(null);
  }, [locale]);

  // When a section is expanded and has no content, load it
  useEffect(() => {
    if (!expandedId) return;
    const state = sectionData[expandedId];
    if (state?.content !== null || state?.loading) return;
    loadSection(expandedId, false);
  }, [expandedId, loadSection, sectionData]);

  const handleRefreshSection = useCallback(
    (e: React.MouseEvent, section: InsightSection) => {
      e.stopPropagation();
      loadSection(section, true);
    },
    [loadSection],
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center mb-2">
        <h1 className="text-2xl font-bold">{t('insightsPage.title')}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">
          {t('insightsPage.subtitle')}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {SECTIONS.map((sec) => (
          <InsightBlock
            key={sec.id}
            section={sec}
            state={sectionData[sec.id] ?? initialSectionState}
            isExpanded={expandedId === sec.id}
            onToggle={() => toggleExpanded(sec.id)}
            onRefresh={(e) => handleRefreshSection(e, sec.id)}
            t={t}
          />
        ))}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-4 pb-2">
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
  section: SectionConfig;
  state: SectionState;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: (e: React.MouseEvent) => void;
  t: (key: string) => string;
}) {
  const { content, loading, error } = state;
  const title = t(`insightsPage.${section.titleKey}`);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentHeight(entry.contentRect.height);
      }
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`
        rounded-xl border border-[var(--border)] bg-[var(--card)]
        transition-all duration-300 ease-out
        ${isExpanded ? 'shadow-lg ring-1 ring-black/5 dark:ring-white/5' : 'shadow-sm hover:shadow-md'}
      `}
    >
      {/* Header button */}
      <button
        type="button"
        className="w-full flex items-center gap-3 p-4 bg-transparent border-0 cursor-pointer text-start"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        {/* Icon with gradient background */}
        <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${section.iconBg} transition-transform duration-300 ${isExpanded ? 'scale-110' : ''}`}>
          {section.icon}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-[0.95rem]">{title}</h2>
          {!isExpanded && content && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 max-w-sm">
              {content.split('\n')[0]?.replace(/[#*•\-]/g, '').trim().slice(0, 80)}
              {(content.split('\n')[0]?.length ?? 0) > 80 ? '...' : ''}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {isExpanded && (
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              onClick={onRefresh}
              disabled={loading}
              title={t('insightsPage.refresh')}
              aria-label={t('insightsPage.refresh')}
            >
              {loading ? (
                <span className="h-4 w-4 block animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>
                </svg>
              )}
            </button>
          )}
          <span
            className={`shrink-0 transition-transform duration-300 ease-out text-slate-400 ${isExpanded ? 'rotate-180' : ''}`}
            aria-hidden
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </div>
      </button>

      {/* Collapsible content */}
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
        style={{
          maxHeight: isExpanded ? `${contentHeight + 32}px` : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div ref={contentRef}>
          <div className="px-4 pb-4">
            {/* Gradient divider */}
            <div className={`h-0.5 rounded-full bg-gradient-to-r ${section.gradient} opacity-20 mb-4`} />

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-red-700 dark:text-red-300 text-sm mb-3">
                {error}
              </div>
            )}

            {loading && !content && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${section.gradient} opacity-20 animate-ping absolute inset-0`} />
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${section.gradient} opacity-30 animate-pulse`} />
                </div>
                <span className="text-sm text-slate-500 dark:text-slate-400">{t('insightsPage.loading')}</span>
              </div>
            )}

            {content && (
              <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <FormattedContent text={content} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
