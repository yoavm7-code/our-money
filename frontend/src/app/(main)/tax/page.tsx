'use client';

import { useEffect, useMemo, useState } from 'react';
import { tax, type TaxPeriod, type TaxSummary, type VatReport } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

/* ──────────────────────────────────────────────────────────────
   Types & helpers
   ────────────────────────────────────────────────────────────── */

type ViewMode = 'overview' | 'detail' | 'vat-report' | 'yearly';

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string | null, locale: string) {
  if (!d) return '--';
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(d));
}

function getPeriodLabel(p: TaxPeriod, locale: string): string {
  const months = locale === 'he'
    ? ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (p.periodType === 'annual') {
    return `${p.year}`;
  }
  if (p.periodType === 'quarterly' && p.quarter != null) {
    return `Q${p.quarter} ${p.year}`;
  }
  if (p.periodType === 'bimonthly' && p.month != null) {
    const startMonth = p.month;
    const endMonth = Math.min(p.month + 1, 12);
    return `${months[startMonth - 1]}-${months[endMonth - 1]} ${p.year}`;
  }
  if (p.periodType === 'monthly' && p.month != null) {
    return `${months[p.month - 1]} ${p.year}`;
  }
  return `${p.year}`;
}

function getPeriodTypeLabel(p: TaxPeriod, locale: string): string {
  if (p.periodType === 'bimonthly') return locale === 'he' ? 'מע"מ דו-חודשי' : 'VAT Bi-monthly';
  if (p.periodType === 'quarterly') return locale === 'he' ? 'מס הכנסה רבעוני' : 'Income Tax Quarterly';
  if (p.periodType === 'annual') return locale === 'he' ? 'שנתי' : 'Annual';
  if (p.periodType === 'monthly') return locale === 'he' ? 'חודשי' : 'Monthly';
  return p.periodType;
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'open': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    case 'calculated': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    case 'filed': return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  }
}

function getAutoDateRange(periodType: string, year: number): { month?: number; quarter?: number } {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  if (periodType === 'bimonthly') {
    // current bimonthly period: Jan-Feb=1, Mar-Apr=3, etc.
    const bimonthStart = currentMonth % 2 === 0 ? currentMonth - 1 : currentMonth;
    return { month: bimonthStart };
  }
  if (periodType === 'quarterly') {
    const q = Math.ceil(currentMonth / 3);
    return { quarter: q };
  }
  return {};
}

/* Israeli tax brackets (2024 approximate) */
const TAX_BRACKETS = [
  { upTo: 84120, rate: 10 },
  { upTo: 120720, rate: 14 },
  { upTo: 193800, rate: 20 },
  { upTo: 269280, rate: 31 },
  { upTo: 560280, rate: 35 },
  { upTo: 721560, rate: 47 },
  { upTo: Infinity, rate: 50 },
];

function estimateTaxBracket(taxableIncome: number): { bracket: number; effectiveRate: number } {
  let totalTax = 0;
  let prevUpTo = 0;
  let bracket = 10;
  for (const b of TAX_BRACKETS) {
    if (taxableIncome <= prevUpTo) break;
    const taxable = Math.min(taxableIncome, b.upTo) - prevUpTo;
    totalTax += taxable * (b.rate / 100);
    bracket = b.rate;
    prevUpTo = b.upTo;
  }
  const effectiveRate = taxableIncome > 0 ? (totalTax / taxableIncome) * 100 : 0;
  return { bracket, effectiveRate: Math.round(effectiveRate * 10) / 10 };
}

/* ══════════════════════════════════════════════════════════════
   STAT CARD
   ══════════════════════════════════════════════════════════════ */

function StatCard({ label, value, colorClass, icon }: { label: string; value: string; colorClass: string; icon: React.ReactNode }) {
  return (
    <div className={`card border ${colorClass} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <div className="w-9 h-9 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function TaxPage() {
  const { t, locale } = useTranslation();

  /* ── State ── */
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [periods, setPeriods] = useState<TaxPeriod[]>([]);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedPeriod, setSelectedPeriod] = useState<TaxPeriod | null>(null);
  const [msg, setMsg] = useState('');

  /* Create period modal */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    periodType: 'bimonthly' as string,
    year: currentYear,
    month: 1,
    quarter: 1,
  });
  const [creating, setCreating] = useState(false);

  /* VAT Report state */
  const [vatReport, setVatReport] = useState<VatReport | null>(null);
  const [vatLoading, setVatLoading] = useState(false);
  const [vatYear, setVatYear] = useState(currentYear);
  const [vatMonth, setVatMonth] = useState<number | undefined>(undefined);

  /* Yearly summary state */
  const [yearlyData, setYearlyData] = useState<{
    income: number; deductions: number; taxableIncome: number; estimatedTax: number;
    vatCollected: number; vatDeductible: number; vatPayable: number;
    quarterlyBreakdown: Array<{ quarter: number; income: number; expenses: number; tax: number }>;
  } | null>(null);
  const [yearlyLoading, setYearlyLoading] = useState(false);

  /* Action loading states */
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [filingId, setFilingId] = useState<string | null>(null);

  /* ── Data loading ── */
  useEffect(() => {
    setLoading(true);
    Promise.all([
      tax.getPeriods(year),
      tax.getSummary(year),
    ])
      .then(([p, s]) => {
        setPeriods(p);
        setSummary(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year]);

  /* ── Derived values ── */
  const ytdRevenue = summary?.totalIncome ?? 0;
  const ytdExpenses = summary?.totalExpenses ?? 0;
  const netVatDue = summary?.totalVatPaid ?? 0;
  const estimatedIncomeTax = summary?.totalTaxPaid ?? 0;

  const totalAdvancesPaid = useMemo(() => {
    return periods
      .filter((p) => p.status === 'filed')
      .reduce((sum, p) => sum + p.totalTax, 0);
  }, [periods]);

  /* ── Handlers ── */

  async function handleCreatePeriod(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMsg('');
    try {
      const body: Parameters<typeof tax.createPeriod>[0] = {
        year: createForm.year,
        periodType: createForm.periodType,
      };
      if (createForm.periodType === 'bimonthly' || createForm.periodType === 'monthly') {
        body.month = createForm.month;
      }
      if (createForm.periodType === 'quarterly') {
        body.quarter = createForm.quarter;
      }
      const created = await tax.createPeriod(body);
      setPeriods((prev) => [...prev, created]);
      setShowCreateModal(false);
      setMsg(t('settings.savedSuccessfully'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setCreating(false);
    }
  }

  async function handleCalculate(id: string) {
    setCalculatingId(id);
    try {
      const updated = await tax.calculatePeriod(id);
      setPeriods((prev) => prev.map((p) => (p.id === id ? updated : p)));
      // Refresh summary
      tax.getSummary(year).then(setSummary).catch(() => {});
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setCalculatingId(null);
    }
  }

  async function handleMarkFiled(id: string) {
    setFilingId(id);
    try {
      const updated = await tax.markFiled(id, new Date().toISOString().slice(0, 10));
      setPeriods((prev) => prev.map((p) => (p.id === id ? updated : p)));
      tax.getSummary(year).then(setSummary).catch(() => {});
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setFilingId(null);
    }
  }

  function openPeriodDetail(p: TaxPeriod) {
    setSelectedPeriod(p);
    setViewMode('detail');
  }

  async function loadVatReport() {
    setVatLoading(true);
    try {
      const params: Parameters<typeof tax.getVatReport>[0] = { year: vatYear };
      if (vatMonth != null) params.month = vatMonth;
      const report = await tax.getVatReport(params);
      setVatReport(report);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setVatLoading(false);
    }
  }

  async function loadYearlySummary() {
    setYearlyLoading(true);
    try {
      const { reports } = await import('@/lib/api');
      const data = await reports.getTaxSummary({ year });
      setYearlyData(data);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setYearlyLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  /* ══════════════════════════════════════════════════════════════
     LOADING STATE
     ══════════════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('tax.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {locale === 'he' ? 'ניהול מיסים, מע"מ ומקדמות מס הכנסה' : 'Manage taxes, VAT, and income tax advances'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Year selector */}
          <select
            className="input w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* View mode buttons */}
          <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
            {[
              { key: 'overview' as ViewMode, label: locale === 'he' ? 'סקירה' : 'Overview' },
              { key: 'vat-report' as ViewMode, label: locale === 'he' ? 'דו"ח מע"מ' : 'VAT Report' },
              { key: 'yearly' as ViewMode, label: locale === 'he' ? 'שנתי' : 'Yearly' },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => {
                  setViewMode(v.key);
                  if (v.key === 'vat-report' && !vatReport) loadVatReport();
                  if (v.key === 'yearly' && !yearlyData) loadYearlySummary();
                }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  viewMode === v.key
                    ? 'bg-primary-500 text-white'
                    : 'bg-[var(--card)] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30 px-4 py-3 text-sm text-primary-700 dark:text-primary-300 flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="text-primary-500 hover:text-primary-700 ms-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         OVERVIEW MODE
         ════════════════════════════════════════════════════════ */}
      {viewMode === 'overview' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={locale === 'he' ? 'סה"כ הכנסות (YTD)' : 'Total Revenue (YTD)'}
              value={formatCurrency(ytdRevenue, locale)}
              colorClass="stat-card-green"
              icon={<svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>}
            />
            <StatCard
              label={locale === 'he' ? 'סה"כ הוצאות (YTD)' : 'Total Expenses (YTD)'}
              value={formatCurrency(ytdExpenses, locale)}
              colorClass="stat-card-red"
              icon={<svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>}
            />
            <StatCard
              label={locale === 'he' ? 'מע"מ נטו לתשלום' : 'Net VAT Due'}
              value={formatCurrency(netVatDue, locale)}
              colorClass="stat-card-blue"
              icon={<svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>}
            />
            <StatCard
              label={locale === 'he' ? 'מס הכנסה משוער' : 'Est. Income Tax'}
              value={formatCurrency(estimatedIncomeTax, locale)}
              colorClass="stat-card-purple"
              icon={<svg className="w-5 h-5 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>}
            />
          </div>

          {/* Tax Periods Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{locale === 'he' ? 'תקופות מס' : 'Tax Periods'}</h2>
              <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary text-sm">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {t('tax.createPeriod')}
                </span>
              </button>
            </div>

            {periods.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <p className="font-medium text-slate-500">{t('tax.noTaxPeriods')}</p>
                <p className="text-sm text-slate-400 mt-1">{t('tax.noTaxPeriodsDesc')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-start py-3 px-3 font-medium text-slate-500">{t('tax.period')}</th>
                      <th className="text-start py-3 px-3 font-medium text-slate-500">{t('common.type')}</th>
                      <th className="text-start py-3 px-3 font-medium text-slate-500">{t('tax.revenue')}</th>
                      <th className="text-start py-3 px-3 font-medium text-slate-500">{t('tax.expenses')}</th>
                      <th className="text-start py-3 px-3 font-medium text-slate-500">{t('tax.vatPayable')}</th>
                      <th className="text-start py-3 px-3 font-medium text-slate-500">{t('tax.advancePayments')}</th>
                      <th className="text-start py-3 px-3 font-medium text-slate-500">{t('common.status')}</th>
                      <th className="text-start py-3 px-3 font-medium text-slate-500">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => (
                      <tr
                        key={p.id}
                        className="table-row cursor-pointer"
                        onClick={() => openPeriodDetail(p)}
                      >
                        <td className="py-3 px-3 font-medium">{getPeriodLabel(p, locale)}</td>
                        <td className="py-3 px-3">
                          <span className="text-xs text-slate-500">{getPeriodTypeLabel(p, locale)}</span>
                        </td>
                        <td className="py-3 px-3 text-green-600 dark:text-green-400 font-medium">
                          {formatCurrency(p.income, locale)}
                        </td>
                        <td className="py-3 px-3 text-red-600 dark:text-red-400">
                          {formatCurrency(p.expenses, locale)}
                        </td>
                        <td className="py-3 px-3 font-medium">{formatCurrency(p.vatPayable, locale)}</td>
                        <td className="py-3 px-3">{formatCurrency(p.totalTax, locale)}</td>
                        <td className="py-3 px-3">
                          <span className={`badge ${getStatusBadgeClass(p.status)}`}>
                            {p.status === 'open' && t('tax.statusOpen')}
                            {p.status === 'calculated' && t('tax.statusCalculated')}
                            {p.status === 'filed' && t('tax.statusFiled')}
                          </span>
                        </td>
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1.5">
                            {p.status === 'open' && (
                              <button
                                type="button"
                                onClick={() => handleCalculate(p.id)}
                                disabled={calculatingId === p.id}
                                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                              >
                                {calculatingId === p.id ? (
                                  <span className="flex items-center gap-1">
                                    <div className="w-3 h-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
                                  </span>
                                ) : t('tax.calculate')}
                              </button>
                            )}
                            {p.status === 'calculated' && (
                              <button
                                type="button"
                                onClick={() => handleMarkFiled(p.id)}
                                disabled={filingId === p.id}
                                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                              >
                                {filingId === p.id ? (
                                  <span className="flex items-center gap-1">
                                    <div className="w-3 h-3 animate-spin rounded-full border border-green-500 border-t-transparent" />
                                  </span>
                                ) : t('tax.markFiled')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openPeriodDetail(p)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                              {t('common.viewDetails')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════
         PERIOD DETAIL VIEW
         ════════════════════════════════════════════════════════ */}
      {viewMode === 'detail' && selectedPeriod && (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => { setViewMode('overview'); setSelectedPeriod(null); }}
            className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            <svg className="w-4 h-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            {t('common.back')}
          </button>

          {/* Period header */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">{getPeriodLabel(selectedPeriod, locale)}</h2>
                <p className="text-sm text-slate-500">{getPeriodTypeLabel(selectedPeriod, locale)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${getStatusBadgeClass(selectedPeriod.status)}`}>
                  {selectedPeriod.status === 'open' && t('tax.statusOpen')}
                  {selectedPeriod.status === 'calculated' && t('tax.statusCalculated')}
                  {selectedPeriod.status === 'filed' && t('tax.statusFiled')}
                </span>
                {selectedPeriod.filedDate && (
                  <span className="text-xs text-slate-500">
                    {locale === 'he' ? 'הוגש: ' : 'Filed: '}{formatDate(selectedPeriod.filedDate, locale)}
                  </span>
                )}
              </div>
            </div>

            {/* Revenue breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold mb-3 text-green-600 dark:text-green-400 flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /></svg>
                  {t('tax.revenue')}
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{t('tax.totalIncome')}</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(selectedPeriod.income, locale)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{t('tax.vatCollected')}</span>
                    <span className="font-medium">{formatCurrency(selectedPeriod.vatCollected, locale)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 text-red-600 dark:text-red-400 flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /></svg>
                  {t('tax.expenses')}
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{t('tax.totalExpenses')}</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(selectedPeriod.expenses, locale)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{t('tax.vatDeductible')}</span>
                    <span className="font-medium">{formatCurrency(selectedPeriod.vatDeductible, locale)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* VAT calculation */}
          <div className="card">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
              {locale === 'he' ? 'חישוב מע"מ' : 'VAT Calculation'}
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">{t('tax.vatCollected')}</span>
                <span className="font-medium">{formatCurrency(selectedPeriod.vatCollected, locale)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">{locale === 'he' ? 'מע"מ תשומות (ששולם)' : 'Input VAT (Paid)'}</span>
                <span className="font-medium text-red-500">-{formatCurrency(selectedPeriod.vatDeductible, locale)}</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between items-center">
                <span className="font-semibold">{t('tax.netVat')}</span>
                <span className={`text-lg font-bold ${selectedPeriod.vatPayable >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(selectedPeriod.vatPayable, locale)}
                </span>
              </div>
            </div>
          </div>

          {/* Income tax advance */}
          <div className="card">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              {locale === 'he' ? 'חישוב מקדמת מס הכנסה' : 'Income Tax Advance'}
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">{t('tax.taxableIncome')}</span>
                <span className="font-medium">{formatCurrency(selectedPeriod.taxableIncome, locale)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">{t('tax.incomeTaxAmount')}</span>
                <span className="font-medium">{formatCurrency(selectedPeriod.incomeTax, locale)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">{t('tax.nationalInsurance')}</span>
                <span className="font-medium">{formatCurrency(selectedPeriod.nationalInsurance, locale)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">{t('tax.healthTax')}</span>
                <span className="font-medium">{formatCurrency(selectedPeriod.healthTax, locale)}</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between items-center">
                <span className="font-semibold">{t('tax.totalTax')}</span>
                <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                  {formatCurrency(selectedPeriod.totalTax, locale)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {selectedPeriod.status === 'open' && (
              <button
                type="button"
                onClick={() => handleCalculate(selectedPeriod.id)}
                disabled={calculatingId === selectedPeriod.id}
                className="btn-primary"
              >
                {calculatingId === selectedPeriod.id ? t('common.loading') : t('tax.calculate')}
              </button>
            )}
            {selectedPeriod.status === 'calculated' && (
              <button
                type="button"
                onClick={() => handleMarkFiled(selectedPeriod.id)}
                disabled={filingId === selectedPeriod.id}
                className="btn-primary"
              >
                {filingId === selectedPeriod.id ? t('common.loading') : t('tax.markFiled')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         VAT REPORT VIEW
         ════════════════════════════════════════════════════════ */}
      {viewMode === 'vat-report' && (
        <div className="space-y-6">
          {/* Date range filter */}
          <div className="card no-print">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('tax.year')}</label>
                <select
                  className="input w-28"
                  value={vatYear}
                  onChange={(e) => setVatYear(Number(e.target.value))}
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('tax.month')}</label>
                <select
                  className="input w-36"
                  value={vatMonth ?? ''}
                  onChange={(e) => setVatMonth(e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">{locale === 'he' ? 'כל השנה' : 'Full Year'}</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2024, m - 1).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={loadVatReport} className="btn-primary text-sm" disabled={vatLoading}>
                {vatLoading ? t('common.loading') : (locale === 'he' ? 'הפק דו"ח' : 'Generate Report')}
              </button>
              <button type="button" onClick={handlePrint} className="btn-secondary text-sm">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                  {t('common.print')}
                </span>
              </button>
            </div>
          </div>

          {vatLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : vatReport ? (
            <>
              {/* Net VAT summary */}
              <div className="card">
                <h2 className="font-semibold mb-4">{t('tax.vatReport')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-600 dark:text-green-400 mb-1">{t('tax.vatOnSales')}</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-300">{formatCurrency(vatReport.vatOnSales, locale)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400 mb-1">{t('tax.vatOnPurchases')}</p>
                    <p className="text-xl font-bold text-red-700 dark:text-red-300">{formatCurrency(vatReport.vatOnPurchases, locale)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">{t('tax.netVat')}</p>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(vatReport.netVat, locale)}</p>
                  </div>
                </div>

                {/* Output VAT - sales/invoices */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-3 text-green-600 dark:text-green-400">
                    {locale === 'he' ? 'מע"מ עסקאות (מחשבוניות)' : 'Output VAT (from Invoices)'}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-start py-2 px-2 font-medium text-slate-500">{t('common.date')}</th>
                          <th className="text-start py-2 px-2 font-medium text-slate-500">{t('common.description')}</th>
                          <th className="text-start py-2 px-2 font-medium text-slate-500">{t('common.amount')}</th>
                          <th className="text-start py-2 px-2 font-medium text-slate-500">{locale === 'he' ? 'מע"מ' : 'VAT'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vatReport.transactions
                          .filter((tx) => tx.type === 'sale')
                          .map((tx, i) => (
                            <tr key={i} className="table-row">
                              <td className="py-2 px-2">{formatDate(tx.date, locale)}</td>
                              <td className="py-2 px-2">{tx.description}</td>
                              <td className="py-2 px-2 text-green-600">{formatCurrency(tx.amount, locale)}</td>
                              <td className="py-2 px-2 font-medium">{formatCurrency(tx.vat, locale)}</td>
                            </tr>
                          ))}
                        {vatReport.transactions.filter((tx) => tx.type === 'sale').length === 0 && (
                          <tr><td colSpan={4} className="text-center py-4 text-slate-400">{t('common.noData')}</td></tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[var(--border)] font-semibold">
                          <td colSpan={2} className="py-2 px-2">{t('common.total')}</td>
                          <td className="py-2 px-2 text-green-600">{formatCurrency(vatReport.sales, locale)}</td>
                          <td className="py-2 px-2">{formatCurrency(vatReport.vatOnSales, locale)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Input VAT - expenses */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-red-600 dark:text-red-400">
                    {locale === 'he' ? 'מע"מ תשומות (מהוצאות)' : 'Input VAT (from Expenses)'}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-start py-2 px-2 font-medium text-slate-500">{t('common.date')}</th>
                          <th className="text-start py-2 px-2 font-medium text-slate-500">{t('common.description')}</th>
                          <th className="text-start py-2 px-2 font-medium text-slate-500">{t('common.amount')}</th>
                          <th className="text-start py-2 px-2 font-medium text-slate-500">{locale === 'he' ? 'מע"מ' : 'VAT'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vatReport.transactions
                          .filter((tx) => tx.type === 'purchase')
                          .map((tx, i) => (
                            <tr key={i} className="table-row">
                              <td className="py-2 px-2">{formatDate(tx.date, locale)}</td>
                              <td className="py-2 px-2">{tx.description}</td>
                              <td className="py-2 px-2 text-red-600">{formatCurrency(Math.abs(tx.amount), locale)}</td>
                              <td className="py-2 px-2 font-medium">{formatCurrency(Math.abs(tx.vat), locale)}</td>
                            </tr>
                          ))}
                        {vatReport.transactions.filter((tx) => tx.type === 'purchase').length === 0 && (
                          <tr><td colSpan={4} className="text-center py-4 text-slate-400">{t('common.noData')}</td></tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[var(--border)] font-semibold">
                          <td colSpan={2} className="py-2 px-2">{t('common.total')}</td>
                          <td className="py-2 px-2 text-red-600">{formatCurrency(vatReport.purchases, locale)}</td>
                          <td className="py-2 px-2">{formatCurrency(vatReport.vatOnPurchases, locale)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Net VAT box */}
                <div className="mt-6 p-4 rounded-xl bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary-700 dark:text-primary-300">
                      {locale === 'he' ? 'מע"מ נטו לתשלום / להחזר' : 'Net VAT Due / Refund'}
                    </span>
                    <span className={`text-2xl font-bold ${vatReport.netVat >= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {formatCurrency(vatReport.netVat, locale)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {vatReport.netVat >= 0
                      ? (locale === 'he' ? 'יש לשלם למע"מ' : 'Amount due to VAT authorities')
                      : (locale === 'he' ? 'זכאי להחזר מע"מ' : 'VAT refund due')}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="card text-center py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <p className="text-sm text-slate-500">{locale === 'he' ? 'לחץ "הפק דו"ח" כדי לראות את נתוני המע"מ' : 'Click "Generate Report" to view VAT data'}</p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         YEARLY SUMMARY VIEW
         ════════════════════════════════════════════════════════ */}
      {viewMode === 'yearly' && (
        <div className="space-y-6">
          {yearlyLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : yearlyData ? (
            <>
              {/* Annual P&L */}
              <div className="card">
                <h2 className="font-semibold mb-4">{t('tax.annualSummary')} - {year}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-600 dark:text-green-400">{t('tax.totalIncome')}</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-300 mt-1">{formatCurrency(yearlyData.income, locale)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400">{t('tax.deductions')}</p>
                    <p className="text-xl font-bold text-red-700 dark:text-red-300 mt-1">{formatCurrency(yearlyData.deductions, locale)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-600 dark:text-blue-400">{t('tax.taxableIncome')}</p>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-1">{formatCurrency(yearlyData.taxableIncome, locale)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                    <p className="text-sm text-purple-600 dark:text-purple-400">{t('tax.estimatedTax')}</p>
                    <p className="text-xl font-bold text-purple-700 dark:text-purple-300 mt-1">{formatCurrency(yearlyData.estimatedTax, locale)}</p>
                  </div>
                </div>

                {/* VAT summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-sm">{t('tax.vatCollected')}</span>
                    <span className="font-semibold">{formatCurrency(yearlyData.vatCollected, locale)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-sm">{t('tax.vatDeductible')}</span>
                    <span className="font-semibold">{formatCurrency(yearlyData.vatDeductible, locale)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-sm">{t('tax.vatPayable')}</span>
                    <span className="font-semibold text-primary-600">{formatCurrency(yearlyData.vatPayable, locale)}</span>
                  </div>
                </div>
              </div>

              {/* Quarterly breakdown */}
              <div className="card">
                <h2 className="font-semibold mb-4">{t('tax.quarterlyBreakdown')}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-start py-3 px-3 font-medium text-slate-500">{t('tax.quarter')}</th>
                        <th className="text-start py-3 px-3 font-medium text-slate-500">{t('tax.revenue')}</th>
                        <th className="text-start py-3 px-3 font-medium text-slate-500">{t('tax.expenses')}</th>
                        <th className="text-start py-3 px-3 font-medium text-slate-500">{locale === 'he' ? 'רווח נטו' : 'Net Profit'}</th>
                        <th className="text-start py-3 px-3 font-medium text-slate-500">{t('tax.estimatedTax')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyData.quarterlyBreakdown.map((q) => (
                        <tr key={q.quarter} className="table-row">
                          <td className="py-3 px-3 font-medium">Q{q.quarter} {year}</td>
                          <td className="py-3 px-3 text-green-600 dark:text-green-400">{formatCurrency(q.income, locale)}</td>
                          <td className="py-3 px-3 text-red-600 dark:text-red-400">{formatCurrency(q.expenses, locale)}</td>
                          <td className="py-3 px-3 font-medium">{formatCurrency(q.income - q.expenses, locale)}</td>
                          <td className="py-3 px-3">{formatCurrency(q.tax, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--border)] font-semibold">
                        <td className="py-3 px-3">{t('common.total')}</td>
                        <td className="py-3 px-3 text-green-600">{formatCurrency(yearlyData.quarterlyBreakdown.reduce((s, q) => s + q.income, 0), locale)}</td>
                        <td className="py-3 px-3 text-red-600">{formatCurrency(yearlyData.quarterlyBreakdown.reduce((s, q) => s + q.expenses, 0), locale)}</td>
                        <td className="py-3 px-3">{formatCurrency(yearlyData.quarterlyBreakdown.reduce((s, q) => s + q.income - q.expenses, 0), locale)}</td>
                        <td className="py-3 px-3">{formatCurrency(yearlyData.quarterlyBreakdown.reduce((s, q) => s + q.tax, 0), locale)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Tax bracket estimation */}
              <div className="card">
                <h2 className="font-semibold mb-4">{t('tax.taxBrackets')}</h2>
                {(() => {
                  const { bracket, effectiveRate } = estimateTaxBracket(yearlyData.taxableIncome);
                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                          <p className="text-sm text-amber-600 dark:text-amber-400">{t('tax.marginalRate')}</p>
                          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300 mt-1">{bracket}%</p>
                        </div>
                        <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                          <p className="text-sm text-indigo-600 dark:text-indigo-400">{t('tax.effectiveRate')}</p>
                          <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-300 mt-1">{effectiveRate}%</p>
                        </div>
                      </div>

                      {/* Bracket table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)]">
                              <th className="text-start py-2 px-3 font-medium text-slate-500">{locale === 'he' ? 'עד' : 'Up to'}</th>
                              <th className="text-start py-2 px-3 font-medium text-slate-500">{locale === 'he' ? 'שיעור' : 'Rate'}</th>
                              <th className="text-start py-2 px-3 font-medium text-slate-500">{locale === 'he' ? 'סטטוס' : 'Status'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {TAX_BRACKETS.map((b, i) => {
                              const isCurrentBracket = yearlyData.taxableIncome > (i > 0 ? TAX_BRACKETS[i - 1].upTo : 0) && yearlyData.taxableIncome <= b.upTo;
                              const isPastBracket = yearlyData.taxableIncome > b.upTo;
                              return (
                                <tr
                                  key={i}
                                  className={`border-b border-[var(--border)] transition-colors ${isCurrentBracket ? 'bg-primary-50 dark:bg-primary-950/30' : ''}`}
                                >
                                  <td className="py-2 px-3">
                                    {b.upTo === Infinity ? (locale === 'he' ? 'מעל' : 'Above') : formatCurrency(b.upTo, locale)}
                                  </td>
                                  <td className="py-2 px-3 font-medium">{b.rate}%</td>
                                  <td className="py-2 px-3">
                                    {isCurrentBracket && <span className="badge badge-primary">{locale === 'he' ? 'מדרגה נוכחית' : 'Current'}</span>}
                                    {isPastBracket && <span className="badge badge-success">{locale === 'he' ? 'מלא' : 'Full'}</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Advances paid vs estimated */}
              <div className="card">
                <h2 className="font-semibold mb-4">{t('tax.advancePayments')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[var(--border)]">
                    <p className="text-sm text-slate-500 mb-1">{locale === 'he' ? 'סה"כ מקדמות ששולמו' : 'Total Advances Paid'}</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalAdvancesPaid, locale)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[var(--border)]">
                    <p className="text-sm text-slate-500 mb-1">{locale === 'he' ? 'מס שנתי משוער' : 'Estimated Annual Tax'}</p>
                    <p className="text-2xl font-bold">{formatCurrency(yearlyData.estimatedTax, locale)}</p>
                  </div>
                </div>
                {yearlyData.estimatedTax > totalAdvancesPaid && (
                  <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                      {locale === 'he'
                        ? `נותר לשלם: ${formatCurrency(yearlyData.estimatedTax - totalAdvancesPaid, locale)}`
                        : `Remaining balance: ${formatCurrency(yearlyData.estimatedTax - totalAdvancesPaid, locale)}`
                      }
                    </p>
                  </div>
                )}
                {yearlyData.estimatedTax <= totalAdvancesPaid && totalAdvancesPaid > 0 && (
                  <div className="mt-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                      {locale === 'he'
                        ? `צפוי החזר: ${formatCurrency(totalAdvancesPaid - yearlyData.estimatedTax, locale)}`
                        : `Expected refund: ${formatCurrency(totalAdvancesPaid - yearlyData.estimatedTax, locale)}`
                      }
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card text-center py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p className="text-sm text-slate-500">{locale === 'he' ? 'טוען סיכום שנתי...' : 'Loading yearly summary...'}</p>
              <button type="button" onClick={loadYearlySummary} className="btn-primary text-sm mt-4">
                {locale === 'he' ? 'טען שוב' : 'Reload'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         CREATE PERIOD MODAL
         ════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{t('tax.createPeriod')}</h3>
            <form onSubmit={handleCreatePeriod} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('tax.periodType')}</label>
                <select
                  className="input"
                  value={createForm.periodType}
                  onChange={(e) => {
                    const pt = e.target.value;
                    setCreateForm((f) => {
                      const auto = getAutoDateRange(pt, f.year);
                      return { ...f, periodType: pt, month: auto.month ?? f.month, quarter: auto.quarter ?? f.quarter };
                    });
                  }}
                >
                  <option value="bimonthly">{t('tax.bimonthly')} ({locale === 'he' ? 'מע"מ' : 'VAT'})</option>
                  <option value="quarterly">{t('tax.quarterly')} ({locale === 'he' ? 'מס הכנסה' : 'Income Tax'})</option>
                  <option value="annual">{t('tax.annual')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">{t('tax.year')}</label>
                <select
                  className="input w-28"
                  value={createForm.year}
                  onChange={(e) => setCreateForm((f) => ({ ...f, year: Number(e.target.value) }))}
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {(createForm.periodType === 'bimonthly' || createForm.periodType === 'monthly') && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('tax.month')}</label>
                  <select
                    className="input"
                    value={createForm.month}
                    onChange={(e) => setCreateForm((f) => ({ ...f, month: Number(e.target.value) }))}
                  >
                    {createForm.periodType === 'bimonthly'
                      ? [1, 3, 5, 7, 9, 11].map((m) => (
                          <option key={m} value={m}>
                            {new Date(2024, m - 1).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'long' })}
                            {' - '}
                            {new Date(2024, m).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'long' })}
                          </option>
                        ))
                      : Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>
                            {new Date(2024, m - 1).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'long' })}
                          </option>
                        ))}
                  </select>
                </div>
              )}

              {createForm.periodType === 'quarterly' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('tax.quarter')}</label>
                  <select
                    className="input"
                    value={createForm.quarter}
                    onChange={(e) => setCreateForm((f) => ({ ...f, quarter: Number(e.target.value) }))}
                  >
                    {[1, 2, 3, 4].map((q) => (
                      <option key={q} value={q}>
                        Q{q} ({locale === 'he' ? `חודשים ${(q - 1) * 3 + 1}-${q * 3}` : `Months ${(q - 1) * 3 + 1}-${q * 3}`})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Auto-calculated date range preview */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[var(--border)]">
                <p className="text-xs text-slate-500 mb-1">{locale === 'he' ? 'טווח תאריכים:' : 'Date range:'}</p>
                <p className="text-sm font-medium">
                  {(() => {
                    const y = createForm.year;
                    if (createForm.periodType === 'annual') return `01/01/${y} - 31/12/${y}`;
                    if (createForm.periodType === 'quarterly') {
                      const q = createForm.quarter;
                      const startMonth = (q - 1) * 3 + 1;
                      const endMonth = q * 3;
                      const endDay = new Date(y, endMonth, 0).getDate();
                      return `01/${String(startMonth).padStart(2, '0')}/${y} - ${endDay}/${String(endMonth).padStart(2, '0')}/${y}`;
                    }
                    if (createForm.periodType === 'bimonthly') {
                      const m = createForm.month;
                      const endMonth = m + 1;
                      const endDay = new Date(y, endMonth, 0).getDate();
                      return `01/${String(m).padStart(2, '0')}/${y} - ${endDay}/${String(endMonth).padStart(2, '0')}/${y}`;
                    }
                    const m = createForm.month;
                    const endDay = new Date(y, m, 0).getDate();
                    return `01/${String(m).padStart(2, '0')}/${y} - ${endDay}/${String(m).padStart(2, '0')}/${y}`;
                  })()}
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? t('common.loading') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
