'use client';

import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import { useToast } from '@/components/Toast';

type ReportData = {
  month: string;
  income: number;
  expenses: number;
  balance: number;
  categories: Array<{ name: string; amount: number; percent: number }>;
  transactions: Array<{ date: string; description: string; amount: number; category: string; account: string }>;
};

type RangePreset = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'this-year' | 'last-year' | 'custom';

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getPresetDates(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case 'this-month':
      return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDateStr(now) };
    case 'last-month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toDateStr(start), to: toDateStr(end) };
    }
    case 'last-3': {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { from: toDateStr(start), to: toDateStr(now) };
    }
    case 'last-6': {
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return { from: toDateStr(start), to: toDateStr(now) };
    }
    case 'this-year':
      return { from: `${now.getFullYear()}-01-01`, to: toDateStr(now) };
    case 'last-year':
      return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
    default:
      return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDateStr(now) };
  }
}

function formatDateRange(from: string, to: string, locale: string) {
  const loc = locale === 'he' ? 'he-IL' : 'en-IL';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${new Date(from).toLocaleDateString(loc, opts)} – ${new Date(to).toLocaleDateString(loc, opts)}`;
}

export default function ReportsPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const [preset, setPreset] = useState<RangePreset>('this-month');
  const defaultDates = getPresetDates('this-month');
  const [fromDate, setFromDate] = useState(defaultDates.from);
  const [toDate, setToDate] = useState(defaultDates.to);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  function handlePresetChange(p: RangePreset) {
    setPreset(p);
    if (p !== 'custom') {
      const dates = getPresetDates(p);
      setFromDate(dates.from);
      setToDate(dates.to);
    }
  }

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ReportData>('/api/dashboard/report', { params: { from: fromDate, to: toDate } });
      setReport(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, toast]);

  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const isRtl = locale === 'he';
    const html = `<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${locale}">
<head>
  <meta charset="utf-8">
  <title>${t('reports.title')} - ${formatDateRange(fromDate, toDate, locale)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; padding: 40px; font-size: 13px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin: 24px 0 12px; border-bottom: 2px solid #22c55e; padding-bottom: 4px; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: start; padding: 8px; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #666; }
    td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
    .green { color: #16a34a; }
    .red { color: #dc2626; }
    .summary { display: flex; gap: 16px; margin: 20px 0; }
    .summary-card { flex: 1; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb; }
    .summary-card .label { font-size: 11px; color: #999; }
    .summary-card .value { font-size: 18px; font-weight: bold; margin-top: 4px; }
    .bar-bg { height: 8px; border-radius: 4px; background: #e5e7eb; }
    .bar-fill { height: 8px; border-radius: 4px; background: #22c55e; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  ${printRef.current.innerHTML}
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  }

  const presets: { key: RangePreset; label: string }[] = [
    { key: 'this-month', label: t('reports.thisMonth') },
    { key: 'last-month', label: t('reports.lastMonth') },
    { key: 'last-3', label: t('reports.last3Months') },
    { key: 'last-6', label: t('reports.last6Months') },
    { key: 'this-year', label: t('reports.thisYear') },
    { key: 'last-year', label: t('reports.lastYear') },
    { key: 'custom', label: t('reports.custom') },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('reports.subtitle')}</p>
      </div>

      {/* Controls */}
      <div className="card space-y-4">
        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePresetChange(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p.key
                  ? 'bg-primary-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date range inputs (always visible, editable when custom) */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('reports.from')}</label>
            <input
              type="date"
              className="input"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPreset('custom'); }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('reports.to')}</label>
            <input
              type="date"
              className="input"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPreset('custom'); }}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={generateReport}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
                {t('reports.generating')}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                {t('reports.generate')}
              </span>
            )}
          </button>
          {report && (
            <button type="button" className="btn-secondary flex items-center gap-1.5" onClick={handlePrint}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {t('reports.exportPdf')}
            </button>
          )}
        </div>
      </div>

      {/* Report content */}
      {report && (
        <div ref={printRef}>
          <h1>{t('reports.title')}</h1>
          <p className="subtitle text-sm text-slate-500 mb-6">{formatDateRange(fromDate, toDate, locale)}</p>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 summary">
            <div className="card summary-card">
              <p className="text-sm text-slate-500 label">{t('reports.income')}</p>
              <p className="text-xl font-bold mt-1 text-green-600 dark:text-green-400 value green">{formatCurrency(report.income, locale)}</p>
            </div>
            <div className="card summary-card">
              <p className="text-sm text-slate-500 label">{t('reports.expenses')}</p>
              <p className="text-xl font-bold mt-1 text-red-600 dark:text-red-400 value red">{formatCurrency(report.expenses, locale)}</p>
            </div>
            <div className="card summary-card">
              <p className="text-sm text-slate-500 label">{t('reports.balance')}</p>
              <p className={`text-xl font-bold mt-1 value ${report.balance >= 0 ? 'text-green-600 dark:text-green-400 green' : 'text-red-600 dark:text-red-400 red'}`}>
                {formatCurrency(report.balance, locale)}
              </p>
            </div>
          </div>

          {/* Category breakdown */}
          {report.categories.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mb-3 border-b-2 border-primary-500 pb-1">{t('reports.categoryBreakdown')}</h2>
              <div className="card mb-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-start pb-2 text-slate-500 font-medium">{t('common.category')}</th>
                      <th className="text-end pb-2 text-slate-500 font-medium">{t('common.amount')}</th>
                      <th className="text-end pb-2 text-slate-500 font-medium">%</th>
                      <th className="pb-2 w-32"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categories.map((cat) => (
                      <tr key={cat.name} className="border-t border-[var(--border)]">
                        <td className="py-2">{cat.name}</td>
                        <td className="py-2 text-end font-medium">{formatCurrency(cat.amount, locale)}</td>
                        <td className="py-2 text-end">{cat.percent}%</td>
                        <td className="py-2">
                          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 bar-bg">
                            <div className="h-full rounded-full bg-primary-500 bar-fill" style={{ width: `${cat.percent}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Transaction list */}
          <h2 className="text-lg font-semibold mb-3 border-b-2 border-primary-500 pb-1">{t('nav.transactions')} ({report.transactions.length})</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-start pb-2 text-slate-500 font-medium">{t('common.date')}</th>
                  <th className="text-start pb-2 text-slate-500 font-medium">{t('common.description')}</th>
                  <th className="text-start pb-2 text-slate-500 font-medium">{t('common.category')}</th>
                  <th className="text-end pb-2 text-slate-500 font-medium">{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {report.transactions.map((tx, i) => (
                  <tr key={i} className="border-t border-[var(--border)]">
                    <td className="py-1.5 whitespace-nowrap">{new Date(tx.date).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'short' })}</td>
                    <td className="py-1.5 truncate max-w-[200px]">{tx.description}</td>
                    <td className="py-1.5">{tx.category || '-'}</td>
                    <td className={`py-1.5 text-end font-medium ${tx.amount > 0 ? 'text-green-600 dark:text-green-400 green' : 'text-red-600 dark:text-red-400 red'}`}>
                      {formatCurrency(tx.amount, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
