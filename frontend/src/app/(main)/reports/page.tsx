'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reports } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import DateRangePicker, { getQuickRangeDates } from '@/components/DateRangePicker';
import HelpTooltip from '@/components/HelpTooltip';
import { useToast } from '@/components/Toast';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────
type ReportTab = 'pnl' | 'cashflow' | 'clients' | 'categories' | 'tax' | 'forecast';

type PnlData = Awaited<ReturnType<typeof reports.getProfitLoss>>;
type CashFlowData = Awaited<ReturnType<typeof reports.getCashFlow>>;
type ClientRevenueData = Awaited<ReturnType<typeof reports.getClientRevenue>>;
type CategoryData = Awaited<ReturnType<typeof reports.getCategoryBreakdown>>;
type TaxData = Awaited<ReturnType<typeof reports.getTaxSummary>>;
type ForecastData = Awaited<ReturnType<typeof reports.getForecast>>;

// ─── Constants ───────────────────────────────────────────────
const PIE_COLORS = [
  '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e',
  '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899',
  '#8b5cf6', '#a855f7', '#06b6d4', '#d946ef', '#f43f5e',
];

const BAR_INCOME_COLOR = '#22c55e';
const BAR_EXPENSE_COLOR = '#ef4444';

// ─── Helpers ─────────────────────────────────────────────────
function fmtCurrency(n: number, locale: string, compact = false) {
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: compact ? 0 : 2,
    ...(compact && Math.abs(n) >= 10000 ? { notation: 'compact' } : {}),
  };
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', opts).format(n);
}

function fmtPercent(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtMonth(monthStr: string, locale: string) {
  try {
    const d = new Date(monthStr + '-01');
    return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'short', year: '2-digit' });
  } catch {
    return monthStr;
  }
}

function fmtQuarter(q: number) {
  return `Q${q}`;
}

// ─── Icons ───────────────────────────────────────────────────
const ChartBarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const CashFlowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
  </svg>
);

const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const PieChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);

const TaxIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 15h0M2 9.5h20" />
  </svg>
);

const ForecastIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const PrintIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const TrendUp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
);

const TrendDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
  </svg>
);

const CheckCircle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const XCircle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

// ─── Tab Config ──────────────────────────────────────────────
type TabConfig = {
  id: ReportTab;
  labelKey: string;
  icon: React.ReactNode;
};

const TABS: TabConfig[] = [
  { id: 'pnl', labelKey: 'reports.tabs.pnl', icon: <ChartBarIcon /> },
  { id: 'cashflow', labelKey: 'reports.tabs.cashflow', icon: <CashFlowIcon /> },
  { id: 'clients', labelKey: 'reports.tabs.clients', icon: <UsersIcon /> },
  { id: 'categories', labelKey: 'reports.tabs.categories', icon: <PieChartIcon /> },
  { id: 'tax', labelKey: 'reports.tabs.tax', icon: <TaxIcon /> },
  { id: 'forecast', labelKey: 'reports.tabs.forecast', icon: <ForecastIcon /> },
];

// ─── Shimmer skeleton ────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>
      <div className="card">
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────
function StatCard({
  label,
  value,
  subValue,
  colorClass = '',
  cardClass = '',
}: {
  label: string;
  value: string;
  subValue?: string;
  colorClass?: string;
  cardClass?: string;
}) {
  return (
    <div className={`card ${cardClass}`}>
      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1.5 ${colorClass}`}>{value}</p>
      {subValue && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subValue}</p>
      )}
    </div>
  );
}

// ─── Custom Recharts tooltip ─────────────────────────────────
function CustomTooltip({ active, payload, label, locale }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  locale: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-lg p-3 text-sm">
      <p className="font-medium text-slate-600 dark:text-slate-300 mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-500 dark:text-slate-400">{entry.name}:</span>
          <span className="font-semibold">{fmtCurrency(entry.value, locale)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Custom Pie Label ────────────────────────────────────────
function renderPieLabel({
  cx, cy, midAngle, innerRadius, outerRadius, percent, name,
}: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number; name: string;
}) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"
      className="fill-slate-600 dark:fill-slate-300 text-xs">
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}

// ═════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════
export default function ReportsPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  // Date range
  const defaultRange = getQuickRangeDates('thisYear');
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);

  // Active tab
  const [activeTab, setActiveTab] = useState<ReportTab>('pnl');

  // Data states
  const [pnlData, setPnlData] = useState<PnlData | null>(null);
  const [cashFlowData, setCashFlowData] = useState<CashFlowData | null>(null);
  const [clientData, setClientData] = useState<ClientRevenueData | null>(null);
  const [catExpenseData, setCatExpenseData] = useState<CategoryData | null>(null);
  const [catIncomeData, setCatIncomeData] = useState<CategoryData | null>(null);
  const [taxData, setTaxData] = useState<TaxData | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Tax year derived from the date range
  const taxYear = useMemo(() => {
    return new Date(from).getFullYear();
  }, [from]);

  // ─── Data fetching ──────────────────────────────────────
  const fetchData = useCallback(async (tab: ReportTab) => {
    setLoading(true);
    setError('');
    try {
      switch (tab) {
        case 'pnl': {
          const data = await reports.getProfitLoss({ from, to });
          setPnlData(data);
          break;
        }
        case 'cashflow': {
          const data = await reports.getCashFlow({ from, to });
          setCashFlowData(data);
          break;
        }
        case 'clients': {
          const data = await reports.getClientRevenue({ from, to });
          setClientData(data);
          break;
        }
        case 'categories': {
          const [exp, inc] = await Promise.all([
            reports.getCategoryBreakdown({ from, to, type: 'expense' }),
            reports.getCategoryBreakdown({ from, to, type: 'income' }),
          ]);
          setCatExpenseData(exp);
          setCatIncomeData(inc);
          break;
        }
        case 'tax': {
          const data = await reports.getTaxSummary({ year: taxYear });
          setTaxData(data);
          break;
        }
        case 'forecast': {
          const data = await reports.getForecast({ months: 6 });
          setForecastData(data);
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.failedToLoad');
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, taxYear, t, toast]);

  // Fetch on tab change or date change
  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab, fetchData]);

  // ─── Handlers ───────────────────────────────────────────
  function handleDateChange(f: string, t2: string) {
    setFrom(f);
    setTo(t2);
  }

  function handleTabChange(tab: ReportTab) {
    setActiveTab(tab);
  }

  function handlePrint() {
    window.print();
  }

  function handleExportCSV() {
    // Simple CSV export based on active tab data
    let csvContent = '';
    const BOM = '\uFEFF';

    if (activeTab === 'pnl' && pnlData) {
      csvContent = `${t('reports.month')},${t('reports.income')},${t('reports.expenses')},${t('reports.netProfit')}\n`;
      pnlData.byMonth.forEach((m) => {
        csvContent += `${m.month},${m.income},${m.expenses},${m.net}\n`;
      });
    } else if (activeTab === 'cashflow' && cashFlowData) {
      csvContent = `${t('reports.month')},${t('reports.inflows')},${t('reports.outflows')},${t('reports.net')}\n`;
      cashFlowData.byMonth.forEach((m) => {
        csvContent += `${m.month},${m.inflows},${m.outflows},${m.net}\n`;
      });
    } else if (activeTab === 'clients' && clientData) {
      csvContent = `${t('reports.clientName')},${t('reports.invoiceCount')},${t('reports.totalInvoiced')},${t('reports.totalPaid')},${t('reports.outstanding')}\n`;
      clientData.forEach((c) => {
        csvContent += `${c.clientName},${c.invoiceCount},${c.totalInvoiced},${c.totalPaid},${c.outstanding}\n`;
      });
    } else if (activeTab === 'categories' && catExpenseData) {
      csvContent = `${t('common.category')},${t('common.amount')},${t('reports.percentage')},${t('reports.transactionCount')}\n`;
      catExpenseData.forEach((c) => {
        csvContent += `${c.categoryName},${c.total},${c.percentage},${c.transactionCount}\n`;
      });
    } else if (activeTab === 'tax' && taxData) {
      csvContent = `${t('reports.quarter')},${t('reports.income')},${t('reports.expenses')},${t('reports.tax')}\n`;
      taxData.quarterlyBreakdown.forEach((q) => {
        csvContent += `Q${q.quarter},${q.income},${q.expenses},${q.tax}\n`;
      });
    } else if (activeTab === 'forecast' && forecastData) {
      csvContent = `${t('reports.month')},${t('reports.income')},${t('reports.expenses')},${t('reports.net')},${t('reports.confidence')}\n`;
      forecastData.monthlyForecast.forEach((m) => {
        csvContent += `${m.month},${m.income},${m.expenses},${m.net},${(m.confidence * 100).toFixed(0)}%\n`;
      });
    }

    if (!csvContent) return;

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report-${activeTab}-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast(t('reports.exportSuccess'), 'success');
  }

  // ─── Previous period comparison for P&L ─────────────────
  const pnlPrevComparison = useMemo(() => {
    if (!pnlData) return null;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const durationMs = toDate.getTime() - fromDate.getTime();
    const prevFrom = new Date(fromDate.getTime() - durationMs);
    const prevTo = new Date(fromDate.getTime() - 1);
    return {
      prevFrom: prevFrom.toISOString().slice(0, 10),
      prevTo: prevTo.toISOString().slice(0, 10),
    };
  }, [pnlData, from, to]);

  // P&L derived metrics
  const pnlMetrics = useMemo(() => {
    if (!pnlData) return null;
    const grossProfit = pnlData.income - pnlData.expenses;
    const margin = pnlData.income > 0 ? (grossProfit / pnlData.income) * 100 : 0;
    return { grossProfit, margin };
  }, [pnlData]);

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {t('reports.title')}
            <HelpTooltip text={t('help.reports')} />
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('reports.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button type="button" className="btn-secondary flex items-center gap-1.5 text-sm" onClick={handleExportCSV}>
            <DownloadIcon /> {t('reports.exportCsv')}
          </button>
          <button type="button" className="btn-secondary flex items-center gap-1.5 text-sm" onClick={handlePrint}>
            <PrintIcon /> {t('reports.print')}
          </button>
        </div>
      </div>

      {/* Date Range + Tabs */}
      <div className="card no-print space-y-4">
        {/* Date Range */}
        <DateRangePicker from={from} to={to} onChange={handleDateChange} />

        {/* Tab navigation */}
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`
                flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                ${activeTab === tab.id
                  ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }
              `}
            >
              {tab.icon}
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="card border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Report Content */}
      <div ref={printRef}>
        {loading ? (
          <ReportSkeleton />
        ) : (
          <>
            {activeTab === 'pnl' && pnlData && <PnLReport data={pnlData} metrics={pnlMetrics!} locale={locale} t={t} from={from} to={to} />}
            {activeTab === 'cashflow' && cashFlowData && <CashFlowReport data={cashFlowData} locale={locale} t={t} />}
            {activeTab === 'clients' && clientData && <ClientRevenueReport data={clientData} locale={locale} t={t} />}
            {activeTab === 'categories' && (catExpenseData || catIncomeData) && (
              <CategoryReport expenseData={catExpenseData} incomeData={catIncomeData} locale={locale} t={t} />
            )}
            {activeTab === 'tax' && taxData && <TaxReport data={taxData} locale={locale} t={t} year={taxYear} />}
            {activeTab === 'forecast' && forecastData && <ForecastReport data={forecastData} locale={locale} t={t} />}

            {/* Empty state */}
            {!loading && !error && (
              (activeTab === 'pnl' && !pnlData) ||
              (activeTab === 'cashflow' && !cashFlowData) ||
              (activeTab === 'clients' && !clientData) ||
              (activeTab === 'categories' && !catExpenseData && !catIncomeData) ||
              (activeTab === 'tax' && !taxData) ||
              (activeTab === 'forecast' && !forecastData)
            ) && (
              <div className="card text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-4">
                  <ChartBarIcon />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{t('reports.noData')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// P&L REPORT
// ═════════════════════════════════════════════════════════════
function PnLReport({
  data, metrics, locale, t, from, to,
}: {
  data: PnlData;
  metrics: { grossProfit: number; margin: number };
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  from: string;
  to: string;
}) {
  const chartData = data.byMonth.map((m) => ({
    month: fmtMonth(m.month, locale),
    [t('reports.income')]: m.income,
    [t('reports.expenses')]: Math.abs(m.expenses),
    [t('reports.netProfit')]: m.net,
  }));

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label={t('reports.totalRevenue')}
          value={fmtCurrency(data.income, locale)}
          colorClass="text-green-600 dark:text-green-400"
          cardClass="stat-card-green"
        />
        <StatCard
          label={t('reports.totalExpenses')}
          value={fmtCurrency(Math.abs(data.expenses), locale)}
          colorClass="text-red-600 dark:text-red-400"
          cardClass="stat-card-red"
        />
        <StatCard
          label={t('reports.netProfit')}
          value={fmtCurrency(data.netProfit, locale)}
          colorClass={data.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
          cardClass={data.netProfit >= 0 ? 'stat-card-green' : 'stat-card-red'}
        />
        <StatCard
          label={t('reports.profitMargin')}
          value={`${metrics.margin.toFixed(1)}%`}
          subValue={metrics.margin >= 20 ? t('reports.healthy') : metrics.margin >= 0 ? t('reports.moderate') : t('reports.negative')}
          colorClass={metrics.margin >= 20 ? 'text-green-600 dark:text-green-400' : metrics.margin >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}
          cardClass={metrics.margin >= 20 ? 'stat-card-green' : metrics.margin >= 0 ? 'stat-card-amber' : 'stat-card-red'}
        />
      </div>

      {/* Monthly Bar Chart */}
      <div className="card">
        <h3 className="text-base font-semibold mb-4">{t('reports.monthlyBreakdown')}</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--border)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--border)" tickFormatter={(v) => fmtCurrency(v, locale, true)} />
              <RTooltip content={<CustomTooltip locale={locale} />} />
              <Legend />
              <Bar dataKey={t('reports.income')} fill={BAR_INCOME_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('reports.expenses')} fill={BAR_EXPENSE_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">{t('reports.noData')}</div>
        )}
      </div>

      {/* Revenue by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income Categories */}
        <div className="card">
          <h3 className="text-base font-semibold mb-4">{t('reports.revenueBySource')}</h3>
          {data.incomeByCategory.length > 0 ? (
            <div className="space-y-3">
              {data.incomeByCategory
                .sort((a, b) => b.total - a.total)
                .map((cat, i) => {
                  const pct = data.income > 0 ? (cat.total / data.income) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{cat.category}</span>
                        <span className="text-green-600 dark:text-green-400 font-semibold">{fmtCurrency(cat.total, locale)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="h-full rounded-full transition-all duration-700 animate-progressFill"
                          style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">{t('reports.noData')}</p>
          )}
        </div>

        {/* Expense Categories */}
        <div className="card">
          <h3 className="text-base font-semibold mb-4">{t('reports.expensesByCategory')}</h3>
          {data.expensesByCategory.length > 0 ? (
            <div className="space-y-3">
              {data.expensesByCategory
                .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
                .map((cat, i) => {
                  const absTotal = Math.abs(cat.total);
                  const absExpenses = Math.abs(data.expenses);
                  const pct = absExpenses > 0 ? (absTotal / absExpenses) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{cat.category}</span>
                        <span className="text-red-600 dark:text-red-400 font-semibold">{fmtCurrency(absTotal, locale)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="h-full rounded-full transition-all duration-700 animate-progressFill"
                          style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">{t('reports.noData')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// CASH FLOW REPORT
// ═════════════════════════════════════════════════════════════
function CashFlowReport({
  data, locale, t,
}: {
  data: CashFlowData;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  // Waterfall chart data: each month shows cumulative balance
  const waterfallData = useMemo(() => {
    let cumulative = 0;
    return data.byMonth.map((m) => {
      cumulative += m.net;
      return {
        month: fmtMonth(m.month, locale),
        [t('reports.inflows')]: m.inflows,
        [t('reports.outflows')]: Math.abs(m.outflows),
        [t('reports.net')]: m.net,
        cumulative,
      };
    });
  }, [data, locale, t]);

  const netColor = data.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Summary Flow */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 py-4">
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{t('reports.totalInflows')}</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{fmtCurrency(data.inflows, locale)}</p>
          </div>
          <div className="text-2xl text-slate-300 dark:text-slate-600 font-light">-</div>
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{t('reports.totalOutflows')}</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{fmtCurrency(Math.abs(data.outflows), locale)}</p>
          </div>
          <div className="text-2xl text-slate-300 dark:text-slate-600 font-light">=</div>
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{t('reports.netCashFlow')}</p>
            <p className={`text-xl font-bold ${netColor}`}>{fmtCurrency(data.net, locale)}</p>
          </div>
        </div>
      </div>

      {/* Monthly Cash Flow Chart */}
      <div className="card">
        <h3 className="text-base font-semibold mb-4">{t('reports.monthlyCashFlow')}</h3>
        {waterfallData.length > 0 ? (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={waterfallData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--border)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--border)" tickFormatter={(v) => fmtCurrency(v, locale, true)} />
              <RTooltip content={<CustomTooltip locale={locale} />} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey={t('reports.inflows')} fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('reports.outflows')} fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">{t('reports.noData')}</div>
        )}
      </div>

      {/* Cumulative Cash Flow Line */}
      <div className="card">
        <h3 className="text-base font-semibold mb-4">{t('reports.cumulativeCashFlow')}</h3>
        {waterfallData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={waterfallData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--border)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--border)" tickFormatter={(v) => fmtCurrency(v, locale, true)} />
              <RTooltip content={<CustomTooltip locale={locale} />} />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="cumulative" stroke="#6366f1" strokeWidth={2.5} fill="url(#cashGradient)" name={t('reports.balance')} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">{t('reports.noData')}</div>
        )}
      </div>

      {/* Monthly Breakdown Table */}
      <div className="card overflow-x-auto">
        <h3 className="text-base font-semibold mb-4">{t('reports.monthlyBreakdown')}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="text-start pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.month')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.inflows')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.outflows')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.net')}</th>
            </tr>
          </thead>
          <tbody>
            {data.byMonth.map((m, i) => (
              <tr key={i} className="table-row">
                <td className="py-2.5 font-medium">{fmtMonth(m.month, locale)}</td>
                <td className="py-2.5 text-end text-green-600 dark:text-green-400">{fmtCurrency(m.inflows, locale)}</td>
                <td className="py-2.5 text-end text-red-600 dark:text-red-400">{fmtCurrency(Math.abs(m.outflows), locale)}</td>
                <td className={`py-2.5 text-end font-semibold ${m.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {fmtCurrency(m.net, locale)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border)] font-bold">
              <td className="py-3">{t('reports.total')}</td>
              <td className="py-3 text-end text-green-600 dark:text-green-400">{fmtCurrency(data.inflows, locale)}</td>
              <td className="py-3 text-end text-red-600 dark:text-red-400">{fmtCurrency(Math.abs(data.outflows), locale)}</td>
              <td className={`py-3 text-end ${data.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {fmtCurrency(data.net, locale)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// CLIENT REVENUE REPORT
// ═════════════════════════════════════════════════════════════
function ClientRevenueReport({
  data, locale, t,
}: {
  data: ClientRevenueData;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const sortedData = useMemo(() => [...data].sort((a, b) => b.totalInvoiced - a.totalInvoiced), [data]);

  const barData = sortedData.slice(0, 10).map((c) => ({
    name: c.clientName.length > 15 ? c.clientName.slice(0, 15) + '...' : c.clientName,
    [t('reports.revenue')]: c.totalInvoiced,
    [t('reports.paid')]: c.totalPaid,
  }));

  const pieData = sortedData.filter((c) => c.totalInvoiced > 0).map((c) => ({
    name: c.clientName,
    value: c.totalInvoiced,
  }));

  const totalRevenue = sortedData.reduce((s, c) => s + c.totalInvoiced, 0);
  const totalOutstanding = sortedData.reduce((s, c) => s + c.outstanding, 0);
  const totalPaid = sortedData.reduce((s, c) => s + c.totalPaid, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('reports.totalInvoiced')}
          value={fmtCurrency(totalRevenue, locale)}
          colorClass="text-primary-600 dark:text-primary-400"
          cardClass="stat-card-indigo"
        />
        <StatCard
          label={t('reports.totalPaid')}
          value={fmtCurrency(totalPaid, locale)}
          colorClass="text-green-600 dark:text-green-400"
          cardClass="stat-card-green"
        />
        <StatCard
          label={t('reports.totalOutstanding')}
          value={fmtCurrency(totalOutstanding, locale)}
          colorClass="text-amber-600 dark:text-amber-400"
          cardClass="stat-card-amber"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart */}
        <div className="card">
          <h3 className="text-base font-semibold mb-4">{t('reports.revenueByClient')}</h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--border)" tickFormatter={(v) => fmtCurrency(v, locale, true)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="var(--border)" width={110} />
                <RTooltip content={<CustomTooltip locale={locale} />} />
                <Legend />
                <Bar dataKey={t('reports.revenue')} fill="#6366f1" radius={[0, 4, 4, 0]} />
                <Bar dataKey={t('reports.paid')} fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">{t('reports.noData')}</div>
          )}
        </div>

        {/* Pie chart */}
        <div className="card">
          <h3 className="text-base font-semibold mb-4">{t('reports.revenueDistribution')}</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  dataKey="value"
                  label={renderPieLabel}
                  labelLine={false}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip formatter={(value: number) => fmtCurrency(value, locale)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">{t('reports.noData')}</div>
          )}
        </div>
      </div>

      {/* Client Table */}
      <div className="card overflow-x-auto">
        <h3 className="text-base font-semibold mb-4">{t('reports.clientDetails')}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="text-start pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.clientName')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.invoiceCount')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.totalInvoiced')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.avgInvoice')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.totalPaid')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.outstanding')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((c) => {
              const avg = c.invoiceCount > 0 ? c.totalInvoiced / c.invoiceCount : 0;
              return (
                <tr key={c.clientId} className="table-row">
                  <td className="py-2.5 font-medium">{c.clientName}</td>
                  <td className="py-2.5 text-end">{c.invoiceCount}</td>
                  <td className="py-2.5 text-end">{fmtCurrency(c.totalInvoiced, locale)}</td>
                  <td className="py-2.5 text-end text-slate-500 dark:text-slate-400">{fmtCurrency(avg, locale)}</td>
                  <td className="py-2.5 text-end text-green-600 dark:text-green-400">{fmtCurrency(c.totalPaid, locale)}</td>
                  <td className={`py-2.5 text-end font-semibold ${c.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                    {fmtCurrency(c.outstanding, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedData.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">{t('reports.noClients')}</p>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// CATEGORY BREAKDOWN REPORT
// ═════════════════════════════════════════════════════════════
function CategoryReport({
  expenseData, incomeData, locale, t,
}: {
  expenseData: CategoryData | null;
  incomeData: CategoryData | null;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [viewType, setViewType] = useState<'expense' | 'income'>('expense');
  const activeData = viewType === 'expense' ? expenseData : incomeData;
  const sortedData = useMemo(() => activeData ? [...activeData].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)) : [], [activeData]);

  const pieData = sortedData.filter((c) => c.total !== 0).map((c) => ({
    name: c.categoryName,
    value: Math.abs(c.total),
    color: c.categoryColor,
  }));

  const totalAmount = sortedData.reduce((s, c) => s + Math.abs(c.total), 0);
  const totalCount = sortedData.reduce((s, c) => s + c.transactionCount, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setViewType('expense')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            viewType === 'expense'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 ring-1 ring-red-300 dark:ring-red-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          {t('reports.expenses')}
        </button>
        <button
          type="button"
          onClick={() => setViewType('income')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            viewType === 'income'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 ring-1 ring-green-300 dark:ring-green-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          {t('reports.income')}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={viewType === 'expense' ? t('reports.totalExpenses') : t('reports.totalIncome')}
          value={fmtCurrency(totalAmount, locale)}
          colorClass={viewType === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}
          cardClass={viewType === 'expense' ? 'stat-card-red' : 'stat-card-green'}
        />
        <StatCard
          label={t('reports.categories')}
          value={String(sortedData.length)}
          cardClass="stat-card-indigo"
        />
        <StatCard
          label={t('reports.transactionCount')}
          value={String(totalCount)}
          cardClass="stat-card-blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="card">
          <h3 className="text-base font-semibold mb-4">
            {viewType === 'expense' ? t('reports.expenseDistribution') : t('reports.incomeDistribution')}
          </h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={45}
                  dataKey="value"
                  label={renderPieLabel}
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip formatter={(value: number) => fmtCurrency(value, locale)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">{t('reports.noData')}</div>
          )}
        </div>

        {/* Bar chart */}
        <div className="card">
          <h3 className="text-base font-semibold mb-4">{t('reports.byCategory')}</h3>
          {sortedData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={sortedData.slice(0, 8).map((c) => ({
                  name: c.categoryName.length > 12 ? c.categoryName.slice(0, 12) + '...' : c.categoryName,
                  [t('common.amount')]: Math.abs(c.total),
                  color: c.categoryColor,
                }))}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--border)" tickFormatter={(v) => fmtCurrency(v, locale, true)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="var(--border)" width={100} />
                <RTooltip content={<CustomTooltip locale={locale} />} />
                <Bar dataKey={t('common.amount')} fill={viewType === 'expense' ? '#ef4444' : '#22c55e'} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">{t('reports.noData')}</div>
          )}
        </div>
      </div>

      {/* Detail Table */}
      <div className="card overflow-x-auto">
        <h3 className="text-base font-semibold mb-4">{t('reports.detailedBreakdown')}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="text-start pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('common.category')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('common.amount')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.percentage')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.transactionCount')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.avgTransaction')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((cat) => {
              const avg = cat.transactionCount > 0 ? Math.abs(cat.total) / cat.transactionCount : 0;
              return (
                <tr key={cat.categoryId} className="table-row">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.categoryColor || '#94a3b8' }}
                      />
                      <span className="font-medium">{cat.categoryName}</span>
                    </div>
                  </td>
                  <td className={`py-2.5 text-end font-semibold ${viewType === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {fmtCurrency(Math.abs(cat.total), locale)}
                  </td>
                  <td className="py-2.5 text-end">
                    <span className="badge-primary">{cat.percentage.toFixed(1)}%</span>
                  </td>
                  <td className="py-2.5 text-end">{cat.transactionCount}</td>
                  <td className="py-2.5 text-end text-slate-500 dark:text-slate-400">{fmtCurrency(avg, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedData.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">{t('reports.noData')}</p>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// TAX SUMMARY REPORT
// ═════════════════════════════════════════════════════════════
function TaxReport({
  data, locale, t, year,
}: {
  data: TaxData;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  year: number;
}) {
  const quarterData = data.quarterlyBreakdown.map((q) => ({
    quarter: fmtQuarter(q.quarter),
    [t('reports.income')]: q.income,
    [t('reports.expenses')]: Math.abs(q.expenses),
    [t('reports.tax')]: q.tax,
  }));

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Year Badge */}
      <div className="flex items-center gap-3">
        <span className="badge-primary text-base px-4 py-1.5 font-bold">{t('reports.taxYear', { year })}</span>
      </div>

      {/* Annual Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label={t('reports.annualRevenue')}
          value={fmtCurrency(data.income, locale)}
          colorClass="text-green-600 dark:text-green-400"
          cardClass="stat-card-green"
        />
        <StatCard
          label={t('reports.deductions')}
          value={fmtCurrency(data.deductions, locale)}
          colorClass="text-blue-600 dark:text-blue-400"
          cardClass="stat-card-blue"
        />
        <StatCard
          label={t('reports.taxableIncome')}
          value={fmtCurrency(data.taxableIncome, locale)}
          colorClass="text-primary-600 dark:text-primary-400"
          cardClass="stat-card-indigo"
        />
        <StatCard
          label={t('reports.estimatedTax')}
          value={fmtCurrency(data.estimatedTax, locale)}
          colorClass="text-amber-600 dark:text-amber-400"
          cardClass="stat-card-amber"
        />
      </div>

      {/* VAT Summary */}
      <div className="card">
        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
          {t('reports.vatSummary')}
          <HelpTooltip text={t('reports.vatSummaryHelp')} />
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="text-center p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{t('reports.vatCollected')}</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{fmtCurrency(data.vatCollected, locale)}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{t('reports.vatDeductible')}</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{fmtCurrency(data.vatDeductible, locale)}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{t('reports.vatPayable')}</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{fmtCurrency(data.vatPayable, locale)}</p>
          </div>
        </div>
      </div>

      {/* Quarterly Breakdown Chart */}
      <div className="card">
        <h3 className="text-base font-semibold mb-4">{t('reports.quarterlyBreakdown')}</h3>
        {quarterData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={quarterData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="quarter" tick={{ fontSize: 13 }} stroke="var(--border)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--border)" tickFormatter={(v) => fmtCurrency(v, locale, true)} />
              <RTooltip content={<CustomTooltip locale={locale} />} />
              <Legend />
              <Bar dataKey={t('reports.income')} fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('reports.expenses')} fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey={t('reports.tax')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">{t('reports.noData')}</div>
        )}
      </div>

      {/* Quarterly Table */}
      <div className="card overflow-x-auto">
        <h3 className="text-base font-semibold mb-4">{t('reports.quarterlyDetails')}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="text-start pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.quarter')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.income')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.expenses')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.profit')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.tax')}</th>
            </tr>
          </thead>
          <tbody>
            {data.quarterlyBreakdown.map((q) => (
              <tr key={q.quarter} className="table-row">
                <td className="py-2.5 font-medium">{fmtQuarter(q.quarter)}</td>
                <td className="py-2.5 text-end text-green-600 dark:text-green-400">{fmtCurrency(q.income, locale)}</td>
                <td className="py-2.5 text-end text-red-600 dark:text-red-400">{fmtCurrency(Math.abs(q.expenses), locale)}</td>
                <td className={`py-2.5 text-end ${q.income + q.expenses >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {fmtCurrency(q.income + q.expenses, locale)}
                </td>
                <td className="py-2.5 text-end font-semibold text-amber-600 dark:text-amber-400">{fmtCurrency(q.tax, locale)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border)] font-bold">
              <td className="py-3">{t('reports.total')}</td>
              <td className="py-3 text-end text-green-600 dark:text-green-400">{fmtCurrency(data.income, locale)}</td>
              <td className="py-3 text-end text-red-600 dark:text-red-400">
                {fmtCurrency(data.quarterlyBreakdown.reduce((s, q) => s + Math.abs(q.expenses), 0), locale)}
              </td>
              <td className="py-3 text-end">{fmtCurrency(data.taxableIncome, locale)}</td>
              <td className="py-3 text-end text-amber-600 dark:text-amber-400">{fmtCurrency(data.estimatedTax, locale)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Tax Deductions Info */}
      <div className="card bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-950/30 dark:to-accent-950/20 border-primary-200 dark:border-primary-800/40">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-400">
            <CheckCircle />
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-1">{t('reports.taxDeductionTip')}</h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('reports.taxDeductionTipDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// FORECAST REPORT
// ═════════════════════════════════════════════════════════════
function ForecastReport({
  data, locale, t,
}: {
  data: ForecastData;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const chartData = data.monthlyForecast.map((m) => ({
    month: fmtMonth(m.month, locale),
    [t('reports.income')]: m.income,
    [t('reports.expenses')]: Math.abs(m.expenses),
    [t('reports.net')]: m.net,
    confidenceHigh: m.income * (1 + (1 - m.confidence) * 0.5),
    confidenceLow: m.income * (1 - (1 - m.confidence) * 0.5),
  }));

  const avgConfidence = data.monthlyForecast.length > 0
    ? data.monthlyForecast.reduce((s, m) => s + m.confidence, 0) / data.monthlyForecast.length
    : 0;

  const netPositive = data.projectedNet >= 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label={t('reports.projectedIncome')}
          value={fmtCurrency(data.projectedIncome, locale)}
          colorClass="text-green-600 dark:text-green-400"
          cardClass="stat-card-green"
        />
        <StatCard
          label={t('reports.projectedExpenses')}
          value={fmtCurrency(Math.abs(data.projectedExpenses), locale)}
          colorClass="text-red-600 dark:text-red-400"
          cardClass="stat-card-red"
        />
        <StatCard
          label={t('reports.projectedNet')}
          value={fmtCurrency(data.projectedNet, locale)}
          colorClass={netPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
          cardClass={netPositive ? 'stat-card-green' : 'stat-card-red'}
        />
        <StatCard
          label={t('reports.avgConfidence')}
          value={`${(avgConfidence * 100).toFixed(0)}%`}
          subValue={avgConfidence >= 0.7 ? t('reports.highConfidence') : avgConfidence >= 0.4 ? t('reports.medConfidence') : t('reports.lowConfidence')}
          colorClass={avgConfidence >= 0.7 ? 'text-green-600 dark:text-green-400' : avgConfidence >= 0.4 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}
          cardClass={avgConfidence >= 0.7 ? 'stat-card-green' : avgConfidence >= 0.4 ? 'stat-card-amber' : 'stat-card-red'}
        />
      </div>

      {/* Projection Line Chart */}
      <div className="card">
        <h3 className="text-base font-semibold mb-4">{t('reports.sixMonthProjection')}</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--border)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--border)" tickFormatter={(v) => fmtCurrency(v, locale, true)} />
              <RTooltip content={<CustomTooltip locale={locale} />} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey={t('reports.income')} stroke="#22c55e" strokeWidth={2.5} fill="url(#incomeGradient)" />
              <Area type="monotone" dataKey={t('reports.expenses')} stroke="#ef4444" strokeWidth={2.5} fill="url(#expenseGradient)" />
              <Line type="monotone" dataKey={t('reports.net')} stroke="#6366f1" strokeWidth={2.5} strokeDasharray="8 4" dot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">{t('reports.noData')}</div>
        )}
      </div>

      {/* Monthly Forecast Table */}
      <div className="card overflow-x-auto">
        <h3 className="text-base font-semibold mb-4">{t('reports.monthlyForecast')}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="text-start pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.month')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.income')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.expenses')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.net')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.trend')}</th>
              <th className="text-end pb-3 font-semibold text-slate-500 dark:text-slate-400">{t('reports.confidence')}</th>
            </tr>
          </thead>
          <tbody>
            {data.monthlyForecast.map((m, i) => (
              <tr key={i} className="table-row">
                <td className="py-2.5 font-medium">{fmtMonth(m.month, locale)}</td>
                <td className="py-2.5 text-end text-green-600 dark:text-green-400">{fmtCurrency(m.income, locale)}</td>
                <td className="py-2.5 text-end text-red-600 dark:text-red-400">{fmtCurrency(Math.abs(m.expenses), locale)}</td>
                <td className={`py-2.5 text-end font-semibold ${m.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {fmtCurrency(m.net, locale)}
                </td>
                <td className="py-2.5 text-end">
                  {m.net >= 0 ? <TrendUp /> : <TrendDown />}
                </td>
                <td className="py-2.5 text-end">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${m.confidence * 100}%`,
                          backgroundColor: m.confidence >= 0.7 ? '#22c55e' : m.confidence >= 0.4 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 min-w-[36px] text-end">
                      {(m.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assumptions / Disclaimer */}
      <div className="card bg-gradient-to-br from-slate-50 to-primary-50/50 dark:from-slate-900/50 dark:to-primary-950/20 border-slate-200 dark:border-slate-700">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-2">{t('reports.forecastAssumptions')}</h4>
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
              <li className="flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary-400 shrink-0 mt-1.5" />
                {t('reports.assumptionHistory')}
              </li>
              <li className="flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary-400 shrink-0 mt-1.5" />
                {t('reports.assumptionRecurring')}
              </li>
              <li className="flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary-400 shrink-0 mt-1.5" />
                {t('reports.assumptionInvoices')}
              </li>
              <li className="flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary-400 shrink-0 mt-1.5" />
                {t('reports.assumptionDisclaimer')}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
