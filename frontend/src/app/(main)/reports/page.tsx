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

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function formatMonth(monthStr: string, locale: string) {
  const [y, m] = monthStr.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'long', year: 'numeric' });
}

function getMonthOptions() {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export default function ReportsPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(getMonthOptions()[0]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ReportData>('/api/dashboard/report', { params: { month: selectedMonth } });
      setReport(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, toast]);

  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const isRtl = locale === 'he';
    const html = `<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${locale}">
<head>
  <meta charset="utf-8">
  <title>${t('reports.title')} - ${formatMonth(report!.month, locale)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; padding: 40px; font-size: 13px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin: 24px 0 12px; border-bottom: 2px solid #22c55e; padding-bottom: 4px; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .summary-card { flex: 1; padding: 16px; border-radius: 12px; border: 1px solid #e5e7eb; }
    .summary-card .label { font-size: 12px; color: #666; }
    .summary-card .value { font-size: 20px; font-weight: bold; margin-top: 4px; }
    .green { color: #16a34a; }
    .red { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: start; padding: 8px; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #666; }
    td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
    .cat-bar { height: 8px; border-radius: 4px; background: #22c55e; display: inline-block; }
    .text-end { text-align: end; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  ${printRef.current.innerHTML}
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('reports.subtitle')}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('reports.selectMonth')}</label>
          <select
            className="input"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {getMonthOptions().map((m) => (
              <option key={m} value={m}>{formatMonth(m, locale)}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={generateReport}
          disabled={loading}
        >
          {loading ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1 animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              {t('reports.generating')}
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              {t('reports.summary')}
            </>
          )}
        </button>
        {report && (
          <button
            type="button"
            className="btn-secondary"
            onClick={handlePrint}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('reports.exportPdf')}
          </button>
        )}
      </div>

      {/* Report content */}
      {report && (
        <div ref={printRef}>
          <h1>{t('reports.title')} - {formatMonth(report.month, locale)}</h1>
          <p className="subtitle text-sm text-slate-500 mb-6">Our Money</p>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="card">
              <p className="text-sm text-slate-500">{t('reports.income')}</p>
              <p className="text-xl font-bold mt-1 text-green-600 dark:text-green-400">{formatCurrency(report.income, locale)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">{t('reports.expenses')}</p>
              <p className="text-xl font-bold mt-1 text-red-600 dark:text-red-400">{formatCurrency(report.expenses, locale)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">{t('reports.balance')}</p>
              <p className={`text-xl font-bold mt-1 ${report.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
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
                          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                            <div className="h-full rounded-full bg-primary-500" style={{ width: `${cat.percent}%` }} />
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
          <h2 className="text-lg font-semibold mb-3 border-b-2 border-primary-500 pb-1">{t('nav.transactions')}</h2>
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
                    <td className={`py-1.5 text-end font-medium ${tx.amount > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
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
