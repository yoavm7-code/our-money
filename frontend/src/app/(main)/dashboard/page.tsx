'use client';

import { useCallback, useEffect, useState } from 'react';
import { dashboard, accounts, categories, type FixedItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import DateRangePicker from '@/components/DateRangePicker';
import SmartTip from '@/components/SmartTip';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const CATEGORY_COLORS: Record<string, string> = {
  credit_charges: '#ef4444',
  transfers: '#f97316',
  standing_order: '#f59e0b',
  loan_payment: '#eab308',
  loan_interest: '#d97706',
  pension: '#84cc16',
  insurance: '#22c55e',
  utilities: '#14b8a6',
  groceries: '#06b6d4',
  transport: '#0ea5e9',
  healthcare: '#3b82f6',
  dining: '#6366f1',
  shopping: '#8b5cf6',
  entertainment: '#a855f7',
  education: '#d946ef',
  bank_fees: '#ec4899',
  subscriptions: '#f43f5e',
  childcare: '#fb923c',
  pets: '#a3e635',
  gifts: '#2dd4bf',
  savings: '#38bdf8',
  investment: '#818cf8',
  salary: '#34d399',
  income: '#4ade80',
  rent: '#fb7185',
  online_shopping: '#c084fc',
  other: '#94a3b8',
};
const FALLBACK_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#ec4899', '#f43f5e', '#0ea5e9', '#d946ef',
];

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function DashboardPage() {
  const { t, locale } = useTranslation();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof dashboard.summary>> | null>(null);
  const [trends, setTrends] = useState<Awaited<ReturnType<typeof dashboard.trends>> | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountsList, setAccountsList] = useState<Array<{ id: string; name: string }>>([]);
  const [categoriesList, setCategoriesList] = useState<Array<{ id: string; name: string; slug?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fixedExpensesOpen, setFixedExpensesOpen] = useState(false);
  const [fixedIncomeOpen, setFixedIncomeOpen] = useState(false);
  const [fixedExpensesList, setFixedExpensesList] = useState<FixedItem[] | null>(null);
  const [fixedIncomeList, setFixedIncomeList] = useState<FixedItem[] | null>(null);
  const [fixedExpensesLoading, setFixedExpensesLoading] = useState(false);
  const [fixedIncomeLoading, setFixedIncomeLoading] = useState(false);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    setFrom(start.toISOString().slice(0, 10));
    setTo(now.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    accounts.list().then((a) => setAccountsList(a)).catch(() => {});
    categories.list().then((c) => setCategoriesList(c)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    Promise.all([
      dashboard.summary(from, to, accountId || undefined, categoryId || undefined),
      dashboard.trends(from, to, 'month', accountId || undefined, categoryId || undefined),
    ])
      .then(([s, tr]) => {
        setSummary(s);
        setTrends(tr);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.failedToLoad')))
      .finally(() => setLoading(false));
  }, [from, to, accountId, categoryId, t]);

  const handleDateRangeChange = useCallback((f: string, t2: string) => {
    setFrom(f);
    setTo(t2);
  }, []);

  useEffect(() => {
    if (!fixedExpensesOpen || fixedExpensesList !== null) return;
    setFixedExpensesLoading(true);
    dashboard.fixedExpenses()
      .then(setFixedExpensesList)
      .catch(() => {})
      .finally(() => setFixedExpensesLoading(false));
  }, [fixedExpensesOpen, fixedExpensesList]);

  useEffect(() => {
    if (!fixedIncomeOpen || fixedIncomeList !== null) return;
    setFixedIncomeLoading(true);
    dashboard.fixedIncome()
      .then(setFixedIncomeList)
      .catch(() => {})
      .finally(() => setFixedIncomeLoading(false));
  }, [fixedIncomeOpen, fixedIncomeList]);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300 animate-fadeIn">
        {error}
      </div>
    );
  }

  const getCatName = (name: string | undefined, slug: string | undefined) => {
    if (slug) {
      const tr = t('categories.' + slug);
      if (tr !== 'categories.' + slug) return tr;
    }
    if (!name) return slug ? slug.replace(/_/g, ' ') : t('common.other');
    return name;
  };
  const pieData =
    summary?.spendingByCategory?.map((c, i) => {
      const slug = (c.category as { slug?: string })?.slug;
      const color = c.category?.color
        ?? (slug ? CATEGORY_COLORS[slug] : undefined)
        ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      return { name: getCatName(c.category?.name, slug), value: c.total, color };
    }) ?? [];

  const incomePieData =
    summary?.incomeByCategory?.map((c, i) => {
      const slug = c.category?.slug;
      const color = c.category?.color
        ?? (slug ? CATEGORY_COLORS[slug] : undefined)
        ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      return { name: getCatName(c.category?.name, slug), value: c.total, color };
    }) ?? [];

  const barData = trends ?? [];

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker from={from} to={to} onChange={handleDateRangeChange} />
          <select
            className="input w-auto min-w-[160px]"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            title={t('common.accounts')}
          >
            <option value="">{t('common.allAccounts')}</option>
            {accountsList.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            className="input w-auto min-w-[140px]"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            title={t('common.categories')}
          >
            <option value="">{t('common.allCategories')}</option>
            {categoriesList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {summary && (
        <>
          {/* Summary cards with gradient accents */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card animate-slideUp stagger-1 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('dashboard.totalBalance')}</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(summary.totalBalance, locale)}</p>
            </div>
            <div className="card animate-slideUp stagger-2 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-green-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('dashboard.incomePeriod')}</p>
              <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">
                {formatCurrency(summary.income, locale)}
              </p>
            </div>
            <div className="card animate-slideUp stagger-3 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 to-rose-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('dashboard.expensesPeriod')}</p>
              <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">
                {formatCurrency(summary.expenses, locale)}
              </p>
            </div>
          </div>

          {/* Fixed expenses / income */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card">
              <button
                type="button"
                className="w-full flex items-center justify-between text-right"
                onClick={() => setFixedExpensesOpen((o) => !o)}
                aria-expanded={fixedExpensesOpen}
              >
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.fixedExpenses')}</p>
                  <p className="text-xl font-bold mt-1 text-red-600 dark:text-red-400">
                    {formatCurrency(summary.fixedExpensesSum ?? 0, locale)}
                  </p>
                </div>
                <span className={`shrink-0 transition-transform duration-300 ${fixedExpensesOpen ? 'rotate-180' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </button>
              {fixedExpensesOpen && (
                <div className="mt-4 pt-4 border-t border-[var(--border)] animate-slideDown">
                  {fixedExpensesLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-slate-500">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span>{t('common.loading')}</span>
                    </div>
                  ) : fixedExpensesList && fixedExpensesList.length > 0 ? (
                    <ul className="space-y-2 max-h-60 overflow-y-auto">
                      {fixedExpensesList.map((item) => (
                        <li key={item.id} className="text-sm py-2 border-b border-[var(--border)] last:border-0">
                          <span className="font-medium">{item.description}</span>
                          {item.categoryName && <span className="text-slate-500 dark:text-slate-400"> · {item.categoryName}</span>}
                          <span className="block text-slate-600 dark:text-slate-300 mt-0.5">
                            {formatCurrency(item.amount, locale)}
                            {item.installmentCurrent != null && item.installmentTotal != null && (
                              <span className="text-slate-500 dark:text-slate-400">
                                {' '}({t('dashboard.installmentOf', { current: item.installmentCurrent, total: item.installmentTotal })})
                                {item.expectedEndDate && ` · ${t('dashboard.expectedEnd', { date: new Date(item.expectedEndDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL') })}`}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-sm py-2">{t('dashboard.noSpendingData')}</p>
                  )}
                </div>
              )}
            </div>
            <div className="card">
              <button
                type="button"
                className="w-full flex items-center justify-between text-right"
                onClick={() => setFixedIncomeOpen((o) => !o)}
                aria-expanded={fixedIncomeOpen}
              >
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t('dashboard.fixedIncome')}</p>
                  <p className="text-xl font-bold mt-1 text-green-600 dark:text-green-400">
                    {formatCurrency(summary.fixedIncomeSum ?? 0, locale)}
                  </p>
                </div>
                <span className={`shrink-0 transition-transform duration-300 ${fixedIncomeOpen ? 'rotate-180' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </button>
              {fixedIncomeOpen && (
                <div className="mt-4 pt-4 border-t border-[var(--border)] animate-slideDown">
                  {fixedIncomeLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-slate-500">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span>{t('common.loading')}</span>
                    </div>
                  ) : fixedIncomeList && fixedIncomeList.length > 0 ? (
                    <ul className="space-y-2 max-h-60 overflow-y-auto">
                      {fixedIncomeList.map((item) => (
                        <li key={item.id} className="text-sm py-2 border-b border-[var(--border)] last:border-0">
                          <span className="font-medium">{item.description}</span>
                          {item.categoryName && <span className="text-slate-500 dark:text-slate-400"> · {item.categoryName}</span>}
                          <span className="block text-slate-600 dark:text-slate-300 mt-0.5">{formatCurrency(item.amount, locale)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-sm py-2">{t('dashboard.noSpendingData')}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Trends chart */}
          <div className="card">
            <h2 className="font-semibold mb-4">{t('dashboard.trendsOverTime')}</h2>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v, locale)}
                    labelFormatter={(l) => l}
                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)' }}
                  />
                  <Bar dataKey="income" fill="#22c55e" name={t('dashboard.income')} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" fill="#ef4444" name={t('dashboard.expenses')} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 py-8 text-center">{t('dashboard.noTrendData')}</p>
            )}
          </div>

          {/* Pie charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-semibold mb-4">{t('dashboard.spendingByCategory')}</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={pieData} cx="40%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} dataKey="value" nameKey="name">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v, locale)} contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)' }} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ paddingRight: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 py-8 text-center">{t('dashboard.noSpendingData')}</p>
              )}
            </div>
            <div className="card">
              <h2 className="font-semibold mb-4">{t('dashboard.incomeByCategory')}</h2>
              {incomePieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={incomePieData} cx="40%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} dataKey="value" nameKey="name">
                      {incomePieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v, locale)} contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)' }} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ paddingRight: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 py-8 text-center">{t('dashboard.noIncomeData')}</p>
              )}
            </div>
          </div>

          {/* Accounts list */}
          {summary.accounts?.length > 0 && (
            <div className="card">
              <h2 className="font-semibold mb-4">{t('common.accounts')}</h2>
              <ul className="space-y-2">
                {summary.accounts.map((a) => (
                  <li key={a.id} className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0">
                    <span>{a.name}</span>
                    <span className="font-medium">
                      {a.balance != null ? formatCurrency(Number(a.balance), locale) : '–'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <SmartTip />
    </div>
  );
}
