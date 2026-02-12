'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  dashboard,
  transactions as txApi,
  accounts,
  categories,
  type AccountItem,
  type CategoryItem,
  type FixedItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';
import VoiceInputButton from '@/components/VoiceInputButton';
import { useToast } from '@/components/Toast';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/* ──────────────────────────────────────────────────────── */
/*  Helpers                                                 */
/* ──────────────────────────────────────────────────────── */

function formatCurrency(n: number, locale: string, currency = 'ILS') {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function getCatName(name: string, slug: string | undefined, t: (k: string) => string) {
  if (slug) {
    const tr = t('categories.' + slug);
    if (tr !== 'categories.' + slug) return tr;
  }
  return name || (slug ? slug.replace(/_/g, ' ') : '');
}

function getMonthRange(offset: number): { from: string; to: string; label: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    from: d.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    label: d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
  };
}

type PeriodFilter = 'month' | 'quarter' | 'year' | 'custom';

/* ──────────────────────────────────────────────────────── */
/*  Skeleton                                                */
/* ──────────────────────────────────────────────────────── */

function CardSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
      <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  Main Page Component                                     */
/* ──────────────────────────────────────────────────────── */

export default function IncomePage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();

  /* ── Period filter ── */
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const getDateRange = useCallback((): { from: string; to: string } => {
    const now = new Date();
    switch (periodFilter) {
      case 'month':
        return getMonthRange(0);
      case 'quarter': {
        const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
        return { from: qStart.toISOString().slice(0, 10), to: qEnd.toISOString().slice(0, 10) };
      }
      case 'year': {
        const yStart = new Date(now.getFullYear(), 0, 1);
        return { from: yStart.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
      }
      case 'custom':
        return {
          from: customFrom || now.toISOString().slice(0, 10),
          to: customTo || now.toISOString().slice(0, 10),
        };
    }
  }, [periodFilter, customFrom, customTo]);

  /* ── Data state ── */
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof dashboard.summary>> | null>(null);
  const [fixedIncomeList, setFixedIncomeList] = useState<FixedItem[]>([]);
  const [trendData, setTrendData] = useState<Array<{ period: string; income: number; expenses: number }>>([]);
  const [incomeCategories, setIncomeCategories] = useState<CategoryItem[]>([]);
  const [accountsList, setAccountsList] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Form state ── */
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    accountId: '',
    categoryId: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    isRecurring: false,
  });
  const [saving, setSaving] = useState(false);
  const [suggestingCat, setSuggestingCat] = useState(false);

  /* ── Load data ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange();
    try {
      const [summaryData, fixedIncome, trends, cats, accts] = await Promise.all([
        dashboard.summary(from, to),
        dashboard.fixedIncome().catch(() => []),
        dashboard.trends(
          new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
          new Date().toISOString().slice(0, 10),
          'month'
        ).catch(() => []),
        categories.list(true).catch(() => []),
        accounts.list().catch(() => []),
      ]);
      setSummary(summaryData);
      setFixedIncomeList(fixedIncome);
      setTrendData(trends);
      setIncomeCategories(cats);
      setAccountsList(accts);
    } catch {
      toast(t('common.failedToLoad'), 'error');
    } finally {
      setLoading(false);
    }
  }, [getDateRange, t, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Suggest category ── */
  async function handleSuggestCategory() {
    if (!form.description.trim()) return;
    setSuggestingCat(true);
    try {
      const res = await txApi.suggestCategory(form.description.trim());
      if (res.categoryId) setForm((f) => ({ ...f, categoryId: res.categoryId! }));
    } finally {
      setSuggestingCat(false);
    }
  }

  /* ── Add income ── */
  async function handleAddIncome(e: React.FormEvent) {
    e.preventDefault();
    if (!form.accountId || !form.description || !form.amount) return;
    setSaving(true);
    try {
      await txApi.create({
        accountId: form.accountId,
        categoryId: form.categoryId || undefined,
        date: form.date,
        description: form.description,
        amount: Math.abs(parseFloat(form.amount) || 0),
        isRecurring: form.isRecurring,
      });
      toast(t('income.incomeAdded'), 'success');
      setForm((f) => ({ ...f, description: '', amount: '', isRecurring: false }));
      setShowForm(false);
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.failedToLoad'), 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ── Calculations ── */
  const totalFixedIncome = fixedIncomeList.reduce((s, f) => s + f.amount, 0);
  const monthlyIncome = summary?.income ?? 0;
  const annualEstimate = monthlyIncome * 12;
  const netIncome = (summary?.income ?? 0) - (summary?.expenses ?? 0);

  /* ── Income by category ── */
  const incomeByCategory = summary?.incomeByCategory ?? [];

  /* ── Period options ── */
  const periodOptions: { key: PeriodFilter; label: string }[] = [
    { key: 'month', label: t('income.thisMonth') },
    { key: 'quarter', label: t('income.thisQuarter') },
    { key: 'year', label: t('income.thisYear') },
    { key: 'custom', label: t('income.custom') },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t('income.title')} <HelpTooltip text={t('help.income')} className="ms-1" />
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('income.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('income.addIncomeEntry')}
        </button>
      </div>

      {/* ── Period filter ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          {periodOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPeriodFilter(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                periodFilter === opt.key
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {periodFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="input py-1.5 text-sm"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              className="input py-1.5 text-sm"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          {loading ? (
            <CardSkeleton />
          ) : (
            <>
              <p className="text-sm text-slate-500">{t('income.incomeThisPeriod')}</p>
              <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">
                {formatCurrency(monthlyIncome, locale)}
              </p>
            </>
          )}
        </div>
        <div className="card">
          {loading ? (
            <CardSkeleton />
          ) : (
            <>
              <p className="text-sm text-slate-500">{t('income.expensesThisPeriod')}</p>
              <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">
                {formatCurrency(summary?.expenses ?? 0, locale)}
              </p>
            </>
          )}
        </div>
        <div className="card">
          {loading ? (
            <CardSkeleton />
          ) : (
            <>
              <p className="text-sm text-slate-500">{t('income.netIncome')}</p>
              <p className={`text-2xl font-bold mt-1 ${netIncome >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(netIncome, locale)}
              </p>
            </>
          )}
        </div>
        <div className="card">
          {loading ? (
            <CardSkeleton />
          ) : (
            <>
              <p className="text-sm text-slate-500">{t('income.annualEstimate')}</p>
              <p className="text-2xl font-bold mt-1 text-indigo-600 dark:text-indigo-400">
                {formatCurrency(annualEstimate, locale)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Income Trend Chart ── */}
      {trendData.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-4">{t('income.trendChart')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => {
                    const d = new Date(v + '-01');
                    return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'short' });
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value, locale),
                    name === 'income' ? t('income.income') : t('income.expenses'),
                  ]}
                  labelFormatter={(label) => {
                    const d = new Date(label + '-01');
                    return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'long', year: 'numeric' });
                  }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#incomeGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#expenseGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              {t('income.income')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              {t('income.expenses')}
            </span>
          </div>
        </div>
      )}

      {/* ── Income by Category ── */}
      {incomeByCategory.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-4">{t('income.incomeByCategory')}</h2>
          <div className="space-y-3">
            {incomeByCategory.map((cat) => {
              const pct = monthlyIncome > 0 ? (cat.total / monthlyIncome) * 100 : 0;
              return (
                <div key={cat.categoryId} className="flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium shrink-0"
                    style={{
                      background: cat.category.color ? `${cat.category.color}20` : '#e2e8f0',
                      color: cat.category.color || '#64748b',
                    }}
                  >
                    {cat.category.name.charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium truncate">
                        {getCatName(cat.category.name, cat.category.slug, t)}
                      </span>
                      <span className="font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(cat.total, locale)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: cat.category.color || '#22c55e',
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 w-12 text-end">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Fixed / Recurring Income ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{t('income.fixedIncome')}</h2>
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            {t('income.totalFixed')}: {formatCurrency(totalFixedIncome, locale)}
          </span>
        </div>
        {fixedIncomeList.length === 0 ? (
          <div className="text-center py-8">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-300 dark:text-slate-600 mb-3">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            <p className="text-sm text-slate-500">{t('income.noFixedIncome')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('income.noFixedIncomeHint')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-start py-2 px-3 font-medium">{t('common.description')}</th>
                  <th className="text-start py-2 px-3 font-medium">{t('common.category')}</th>
                  <th className="text-start py-2 px-3 font-medium">{t('income.amountIls')}</th>
                  <th className="text-start py-2 px-3 font-medium">{t('income.installments')}</th>
                  <th className="text-start py-2 px-3 font-medium">{t('income.expectedEnd')}</th>
                </tr>
              </thead>
              <tbody>
                {fixedIncomeList.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium">{item.description}</td>
                    <td className="py-2.5 px-3 text-slate-500">{item.categoryName || '-'}</td>
                    <td className="py-2.5 px-3 text-green-600 dark:text-green-400 font-medium">
                      {formatCurrency(item.amount, locale)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {item.installmentCurrent != null && item.installmentTotal != null
                        ? `${item.installmentCurrent}/${item.installmentTotal}`
                        : t('income.ongoing')}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {item.expectedEndDate
                        ? new Date(item.expectedEndDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Income Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">{t('income.addIncome')}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddIncome} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.account')}</label>
                <select
                  className="input w-full"
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                  required
                >
                  <option value="">{t('common.chooseAccount')}</option>
                  {accountsList.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.description')}</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    className="input w-full pe-9"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder={t('income.descriptionPlaceholder')}
                    required
                  />
                  <div className="absolute end-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => setForm((f) => ({ ...f, description: text }))} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.category')}</label>
                <div className="flex gap-2">
                  <select
                    className="input flex-1"
                    value={form.categoryId}
                    onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  >
                    <option value="">{t('common.optional')}</option>
                    {incomeCategories.map((c) => (
                      <option key={c.id} value={c.id}>{getCatName(c.name, c.slug, t)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary text-sm whitespace-nowrap"
                    onClick={handleSuggestCategory}
                    disabled={!form.description.trim() || suggestingCat}
                  >
                    {suggestingCat ? '...' : t('transactionsPage.suggestCategory')}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.date')}</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('income.amountIls')}</label>
                  <input
                    type="number"
                    className="input w-full"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    required
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm">{t('income.markAsRecurring')}</span>
              </label>
              <button type="submit" className="btn-primary w-full" disabled={saving}>
                {saving ? t('common.loading') : t('common.save')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
