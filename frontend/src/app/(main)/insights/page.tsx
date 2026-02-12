'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { insights, type InsightSection } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';

// ─── Cache layer (session storage) ────────────────────────────
const CACHE_PREFIX = 'insights_';

function cacheKey(section: InsightSection, locale: string) {
  return `${CACHE_PREFIX}${section}_${locale}`;
}

function getCached(section: InsightSection, locale: string): { content: string; ts: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(section, locale));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { content: string; ts: number };
    // Cache expires after 10 minutes
    if (Date.now() - parsed.ts > 10 * 60 * 1000) {
      sessionStorage.removeItem(cacheKey(section, locale));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setCached(section: InsightSection, locale: string, content: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(cacheKey(section, locale), JSON.stringify({ content, ts: Date.now() }));
  } catch {
    // quota exceeded, ignore
  }
}

function clearAllCached(locale: string) {
  if (typeof window === 'undefined') return;
  SECTION_CONFIGS.forEach((s) => {
    try { sessionStorage.removeItem(cacheKey(s.id, locale)); } catch { /* ignore */ }
  });
}

// ─── Types ───────────────────────────────────────────────────
type Severity = 'good' | 'warning' | 'critical' | 'info';

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

// ─── Section config ──────────────────────────────────────────
type SectionConfig = {
  id: InsightSection;
  titleKey: string;
  descKey: string;
  icon: React.ReactNode;
  gradient: string;
  gradientBg: string;
  iconBg: string;
  severityFn: (content: string) => Severity;
};

// Icon components
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

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

const ClientIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const InvoiceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);

// Simple heuristic to determine severity from AI content
function detectSeverity(content: string): Severity {
  const lower = content.toLowerCase();
  const criticalSignals = ['critical', 'urgent', 'danger', 'negative', 'deficit', 'loss', 'overdue'];
  const warningSignals = ['warning', 'attention', 'caution', 'risk', 'concern', 'decline', 'decrease'];
  const goodSignals = ['excellent', 'great', 'healthy', 'positive', 'growth', 'improve', 'strong', 'stable'];

  const critCount = criticalSignals.filter((s) => lower.includes(s)).length;
  const warnCount = warningSignals.filter((s) => lower.includes(s)).length;
  const goodCount = goodSignals.filter((s) => lower.includes(s)).length;

  if (critCount >= 2) return 'critical';
  if (critCount >= 1 && warnCount >= 1) return 'critical';
  if (warnCount >= 2) return 'warning';
  if (goodCount >= 2) return 'good';
  if (goodCount >= 1 && warnCount === 0 && critCount === 0) return 'good';
  if (warnCount >= 1) return 'warning';
  return 'info';
}

const SECTION_CONFIGS: SectionConfig[] = [
  {
    id: 'monthlySummary',
    titleKey: 'monthlySummary',
    descKey: 'monthlySummaryDesc',
    icon: <CalendarIcon />,
    gradient: 'from-teal-500 to-cyan-500',
    gradientBg: 'from-teal-500/10 to-cyan-500/10',
    iconBg: 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400',
    severityFn: detectSeverity,
  },
  {
    id: 'balanceForecast',
    titleKey: 'balanceForecast',
    descKey: 'balanceForecastDesc',
    icon: <BalanceIcon />,
    gradient: 'from-blue-500 to-indigo-500',
    gradientBg: 'from-blue-500/10 to-indigo-500/10',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
    severityFn: detectSeverity,
  },
  {
    id: 'savingsRecommendation',
    titleKey: 'savingsRecommendation',
    descKey: 'savingsRecommendationDesc',
    icon: <SavingsIcon />,
    gradient: 'from-emerald-500 to-green-500',
    gradientBg: 'from-emerald-500/10 to-green-500/10',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
    severityFn: detectSeverity,
  },
  {
    id: 'investmentRecommendations',
    titleKey: 'investmentRecommendations',
    descKey: 'investmentRecommendationsDesc',
    icon: <InvestIcon />,
    gradient: 'from-purple-500 to-violet-500',
    gradientBg: 'from-purple-500/10 to-violet-500/10',
    iconBg: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
    severityFn: detectSeverity,
  },
  {
    id: 'taxTips',
    titleKey: 'taxTips',
    descKey: 'taxTipsDesc',
    icon: <TaxIcon />,
    gradient: 'from-amber-500 to-orange-500',
    gradientBg: 'from-amber-500/10 to-orange-500/10',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    severityFn: detectSeverity,
  },
  {
    id: 'spendingInsights',
    titleKey: 'spendingInsights',
    descKey: 'spendingInsightsDesc',
    icon: <SpendingIcon />,
    gradient: 'from-rose-500 to-pink-500',
    gradientBg: 'from-rose-500/10 to-pink-500/10',
    iconBg: 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400',
    severityFn: detectSeverity,
  },
  {
    id: 'clientInsights',
    titleKey: 'clientInsights',
    descKey: 'clientInsightsDesc',
    icon: <ClientIcon />,
    gradient: 'from-indigo-500 to-blue-500',
    gradientBg: 'from-indigo-500/10 to-blue-500/10',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
    severityFn: detectSeverity,
  },
  {
    id: 'invoiceInsights',
    titleKey: 'invoiceInsights',
    descKey: 'invoiceInsightsDesc',
    icon: <InvoiceIcon />,
    gradient: 'from-cyan-500 to-blue-500',
    gradientBg: 'from-cyan-500/10 to-blue-500/10',
    iconBg: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400',
    severityFn: detectSeverity,
  },
];

// ─── Severity badge ──────────────────────────────────────────
function SeverityBadge({ severity, t }: { severity: Severity; t: (key: string) => string }) {
  const config: Record<Severity, { bg: string; text: string; label: string; dot: string }> = {
    good: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-300',
      label: t('insights.good'),
      dot: 'bg-green-500',
    },
    warning: {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-700 dark:text-amber-300',
      label: t('insights.warning'),
      dot: 'bg-amber-500',
    },
    critical: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-300',
      label: t('insights.critical'),
      dot: 'bg-red-500',
    },
    info: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-300',
      label: t('insights.info'),
      dot: 'bg-blue-500',
    },
  };
  const c = config[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Formatted AI content ────────────────────────────────────
function FormattedContent({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        // Numbered list item
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
        const bulletMatch = trimmed.match(/^[*\-]\s+(.*)/);
        if (bulletMatch) {
          return (
            <div key={i} className="flex gap-2 items-start ps-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 shrink-0 mt-2" />
              <span className="flex-1"><FormattedLine text={bulletMatch[1]} /></span>
            </div>
          );
        }

        // Header lines
        if (trimmed.startsWith('###')) {
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1"><FormattedLine text={trimmed.replace(/^#{1,4}\s*/, '')} /></h4>;
        }
        if (trimmed.startsWith('##')) {
          return <h3 key={i} className="font-semibold mt-3 mb-1"><FormattedLine text={trimmed.replace(/^#{1,4}\s*/, '')} /></h3>;
        }

        // Tip / recommendation highlight
        if (
          trimmed.toLowerCase().startsWith('tip:') ||
          trimmed.toLowerCase().startsWith('recommendation:')
        ) {
          return (
            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800/40">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-primary-500">
                <path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>
              </svg>
              <span className="text-sm"><FormattedLine text={trimmed} /></span>
            </div>
          );
        }

        // Regular paragraph
        return <p key={i}><FormattedLine text={trimmed} /></p>;
      })}
    </div>
  );
}

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

// ─── Shimmer card ────────────────────────────────────────────
function ShimmerCard({ gradient }: { gradient: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className={`h-1 bg-gradient-to-r ${gradient}`} />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="skeleton w-10 h-10 rounded-lg" />
          <div className="flex-1">
            <div className="skeleton h-4 w-32 mb-2" />
            <div className="skeleton h-3 w-48" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-3 w-5/6" />
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════
export default function InsightsPage() {
  const { t, locale } = useTranslation();

  const [sectionData, setSectionData] = useState<Record<string, SectionState>>(() =>
    SECTION_CONFIGS.reduce(
      (acc, s) => {
        acc[s.id] = { ...initialSectionState };
        return acc;
      },
      {} as Record<string, SectionState>,
    ),
  );
  const [expandedIds, setExpandedIds] = useState<Set<InsightSection>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // ─── Load single section ────────────────────────────────
  const loadSection = useCallback(
    async (section: InsightSection, forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = getCached(section, locale);
        if (cached) {
          setSectionData((prev) => ({
            ...prev,
            [section]: { content: cached.content, loading: false, error: '' },
          }));
          return;
        }
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
          [section]: { content: prev[section]?.content ?? null, loading: false, error: message },
        }));
      }
    },
    [t, locale],
  );

  // ─── Bulk load all sections ─────────────────────────────
  const loadAllSections = useCallback(
    async (forceRefresh = false) => {
      setRefreshingAll(true);
      if (forceRefresh) {
        clearAllCached(locale);
      }

      // Try bulk API first
      try {
        const bulkData = await insights.get(locale);
        if (bulkData) {
          const entries = Object.entries(bulkData) as [InsightSection, string | undefined][];
          const newData: Record<string, SectionState> = {};
          entries.forEach(([key, value]) => {
            if (value != null) {
              setCached(key, locale, value);
              newData[key] = { content: value, loading: false, error: '' };
            }
          });
          setSectionData((prev) => ({ ...prev, ...newData }));
          setLastUpdated(new Date());
          setRefreshingAll(false);
          setInitialLoading(false);
          return;
        }
      } catch {
        // Bulk API failed, fall back to individual loading
      }

      // Fallback: load each section individually
      await Promise.allSettled(
        SECTION_CONFIGS.map((s) => loadSection(s.id, forceRefresh)),
      );

      setLastUpdated(new Date());
      setRefreshingAll(false);
      setInitialLoading(false);
    },
    [locale, loadSection],
  );

  // Load all on mount
  useEffect(() => {
    loadAllSections(false);
  }, [loadAllSections]);

  // Reset when locale changes
  useEffect(() => {
    setSectionData(
      SECTION_CONFIGS.reduce(
        (acc, s) => {
          acc[s.id] = { ...initialSectionState };
          return acc;
        },
        {} as Record<string, SectionState>,
      ),
    );
    setExpandedIds(new Set());
    setInitialLoading(true);
  }, [locale]);

  // ─── Expand / Collapse ─────────────────────────────────
  const toggleExpanded = useCallback((section: InsightSection) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  // Load section on expand if not loaded
  useEffect(() => {
    expandedIds.forEach((id) => {
      const state = sectionData[id];
      if (state && state.content === null && !state.loading && !state.error) {
        loadSection(id, false);
      }
    });
  }, [expandedIds, sectionData, loadSection]);

  // ─── Refresh single section ─────────────────────────────
  const handleRefreshSection = useCallback(
    (e: React.MouseEvent, section: InsightSection) => {
      e.stopPropagation();
      loadSection(section, true);
    },
    [loadSection],
  );

  // ─── Refresh all ────────────────────────────────────────
  const handleRefreshAll = useCallback(() => {
    loadAllSections(true);
  }, [loadAllSections]);

  // ─── Expand all / Collapse all ──────────────────────────
  const allExpanded = expandedIds.size === SECTION_CONFIGS.length;
  const handleToggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(SECTION_CONFIGS.map((s) => s.id)));
    }
  }, [allExpanded]);

  // ─── Format last updated ───────────────────────────────
  const lastUpdatedStr = useMemo(() => {
    if (!lastUpdated) return null;
    const loc = locale === 'he' ? 'he-IL' : 'en-IL';
    return lastUpdated.toLocaleString(loc, {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    });
  }, [lastUpdated, locale]);

  // ─── Count loaded sections with severity ────────────────
  const severityCounts = useMemo(() => {
    const counts = { good: 0, warning: 0, critical: 0, info: 0 };
    SECTION_CONFIGS.forEach((sec) => {
      const state = sectionData[sec.id];
      if (state?.content) {
        const severity = sec.severityFn(state.content);
        counts[severity]++;
      }
    });
    return counts;
  }, [sectionData]);

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="text-center mb-2">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
          <span className="bg-gradient-to-r from-primary-600 to-accent-500 bg-clip-text text-transparent">
            {t('insightsPage.title')}
          </span>
          <HelpTooltip text={t('help.insights')} />
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">
          {t('insightsPage.subtitle')}
        </p>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        {/* Severity overview pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {severityCounts.good > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {severityCounts.good} {t('insights.good')}
            </span>
          )}
          {severityCounts.warning > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {severityCounts.warning} {t('insights.warning')}
            </span>
          )}
          {severityCounts.critical > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {severityCounts.critical} {t('insights.critical')}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            onClick={handleToggleAll}
          >
            {allExpanded ? t('insights.collapseAll') : t('insights.expandAll')}
          </button>
          <button
            type="button"
            className="btn-primary text-sm flex items-center gap-1.5"
            onClick={handleRefreshAll}
            disabled={refreshingAll}
          >
            {refreshingAll ? (
              <span className="h-4 w-4 block animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>
              </svg>
            )}
            {t('insightsPage.refreshAll')}
          </button>
        </div>
      </div>

      {/* Last updated */}
      {lastUpdatedStr && (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
          {t('insights.lastUpdated')}: {lastUpdatedStr}
        </p>
      )}

      {/* Loading state - shimmer grid */}
      {initialLoading && (
        <div className="flex flex-col gap-4">
          {SECTION_CONFIGS.slice(0, 4).map((sec) => (
            <ShimmerCard key={sec.id} gradient={sec.gradient} />
          ))}
        </div>
      )}

      {/* Insight cards */}
      {!initialLoading && (
        <div className="flex flex-col gap-3">
          {SECTION_CONFIGS.map((sec, index) => (
            <InsightCard
              key={sec.id}
              config={sec}
              state={sectionData[sec.id] ?? initialSectionState}
              isExpanded={expandedIds.has(sec.id)}
              onToggle={() => toggleExpanded(sec.id)}
              onRefresh={(e) => handleRefreshSection(e, sec.id)}
              t={t}
              index={index}
            />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-4 pb-2">
        {t('insightsPage.disclaimer')}
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// INSIGHT CARD
// ═════════════════════════════════════════════════════════════
function InsightCard({
  config,
  state,
  isExpanded,
  onToggle,
  onRefresh,
  t,
  index,
}: {
  config: SectionConfig;
  state: SectionState;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: (e: React.MouseEvent) => void;
  t: (key: string) => string;
  index: number;
}) {
  const { content, loading, error } = state;
  const title = t(`insightsPage.${config.titleKey}`);
  const desc = t(`insightsPage.${config.descKey}`);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // Determine severity from content
  const severity = useMemo<Severity>(() => {
    if (!content) return 'info';
    return config.severityFn(content);
  }, [content, config]);

  // Extract first meaningful line as highlight
  const highlight = useMemo(() => {
    if (!content) return null;
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstMeaningful = lines.find((l) =>
      !l.startsWith('#') && !l.startsWith('---') && l.length > 10
    );
    if (!firstMeaningful) return null;
    const cleaned = firstMeaningful.replace(/[#*\-]/g, '').trim();
    return cleaned.length > 100 ? cleaned.slice(0, 100) + '...' : cleaned;
  }, [content]);

  // Animate content height
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
        rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden
        transition-all duration-300 ease-out
        ${isExpanded ? 'shadow-lg ring-1 ring-black/5 dark:ring-white/5' : 'shadow-sm hover:shadow-md'}
        stagger-${Math.min(index + 1, 8)}
      `}
      style={{ animationName: 'fadeIn', animationDuration: '0.4s', animationFillMode: 'both' }}
    >
      {/* Gradient top line */}
      <div className={`h-1 bg-gradient-to-r ${config.gradient} transition-all duration-300 ${isExpanded ? 'opacity-100' : 'opacity-60'}`} />

      {/* Header button */}
      <button
        type="button"
        className="w-full flex items-center gap-3 p-4 bg-transparent border-0 cursor-pointer text-start"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        {/* Icon */}
        <div className={`
          shrink-0 w-11 h-11 rounded-xl flex items-center justify-center
          ${config.iconBg}
          transition-transform duration-300
          ${isExpanded ? 'scale-110' : ''}
        `}>
          {config.icon}
        </div>

        {/* Title & subtitle/highlight */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-[0.95rem]">{title}</h2>
            {content && <SeverityBadge severity={severity} t={t} />}
          </div>
          {!isExpanded && highlight && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 max-w-md">
              {highlight}
            </p>
          )}
          {!isExpanded && !highlight && !loading && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{desc}</p>
          )}
          {!isExpanded && loading && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-2 w-2 block animate-spin rounded-full border border-current border-t-transparent text-primary-400" />
              <span className="text-xs text-slate-400">{t('insightsPage.loading')}</span>
            </div>
          )}
        </div>

        {/* Right side: actions + chevron */}
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
          maxHeight: isExpanded ? `${contentHeight + 40}px` : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div ref={contentRef}>
          <div className="px-4 pb-5">
            {/* Gradient divider */}
            <div className={`h-0.5 rounded-full bg-gradient-to-r ${config.gradient} opacity-20 mb-4`} />

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-red-700 dark:text-red-300 text-sm mb-3 flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Loading state with shimmer */}
            {loading && !content && (
              <div className="space-y-4 py-4">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${config.gradient} opacity-20 animate-ping absolute inset-0`} />
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${config.gradient} opacity-30 animate-pulse`} />
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{t('insightsPage.loading')}</span>
                </div>
                <div className="space-y-2 max-w-md mx-auto">
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-4/5" />
                  <div className="skeleton h-3 w-3/5" />
                </div>
              </div>
            )}

            {/* Content */}
            {content && (
              <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <FormattedContent text={content} />
              </div>
            )}

            {/* Loading overlay on existing content */}
            {loading && content && (
              <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
                <span className="h-3 w-3 block animate-spin rounded-full border border-current border-t-transparent" />
                {t('insightsPage.refreshing')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
