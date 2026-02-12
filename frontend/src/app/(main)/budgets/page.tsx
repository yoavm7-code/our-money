'use client';

import { useCallback, useEffect, useState } from 'react';
import { budgets, categories, type BudgetItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';
import { useToast } from '@/components/Toast';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

/* ──────────────────────────────────────────────────────── */
/*  Types & Helpers                                         */
/* ──────────────────────────────────────────────────────── */

type CategoryOption = { id: string; name: string; slug: string; isIncome: boolean };

type BudgetSummary = {
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
  budgetCount: number;
  overBudgetCount: number;
  overBudget: Array<{ categoryName: string; amount: number; spent: number }>;
};

function getCategoryDisplayName(name: string, slug: string | undefined, t: (k: string) => string): string {
  if (slug) {
    const translated = t('categories.' + slug);
    if (translated !== 'categories.' + slug) return translated;
  }
  return name;
}

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function getProgressColor(percent: number): string {
  if (percent > 90) return 'bg-red-500';
  if (percent > 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getProgressGradient(percent: number): string {
  if (percent > 90) return 'bg-gradient-to-r from-red-500 to-red-400';
  if (percent > 70) return 'bg-gradient-to-r from-amber-500 to-amber-400';
  return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
}

function getProgressTextColor(percent: number): string {
  if (percent > 90) return 'text-red-600 dark:text-red-400';
  if (percent > 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

const PIE_COLORS = [
  '#6366f1', '#3b82f6', '#22c55e', '#eab308', '#f97316',
  '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6',
  '#84cc16', '#f43f5e', '#a855f7', '#0ea5e9',
];

function getMonthString(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(monthStr: string, locale: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'long', year: 'numeric' });
}

/* ──────────────────────────────────────────────────────── */
/*  Main Page Component                                     */
/* ──────────────────────────────────────────────────────── */

export default function BudgetsPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();

  /* ── Month selector ── */
  const [selectedMonth, setSelectedMonth] = useState(getMonthString(0));

  /* ── Data state ── */
  const [budgetList, setBudgetList] = useState<BudgetItem[]>([]);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [categoryList, setCategoryList] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Form state ── */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ categoryId: '', amount: '' });
  const [saving, setSaving] = useState(false);

  /* ── Fetch data ── */
  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      budgets.list(),
      budgets.summary(selectedMonth),
      categories.list(),
    ])
      .then(([b, s, c]) => {
        setBudgetList(b);
        setSummary(s);
        setCategoryList(c.filter((cat) => !cat.isIncome));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Available categories (not already budgeted, unless editing) ── */
  const availableCategories = categoryList.filter(
    (cat) =>
      !budgetList.some((b) => b.categoryId === cat.id) ||
      (editingId && budgetList.find((b) => b.id === editingId)?.categoryId === cat.id),
  );

  /* ── Handlers ── */
  function openAdd() {
    setEditingId(null);
    setForm({ categoryId: '', amount: '' });
    setShowForm(true);
  }

  function openEdit(b: BudgetItem) {
    setEditingId(b.id);
    setForm({ categoryId: b.categoryId, amount: String(b.amount) });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.categoryId || !form.amount) return;
    setSaving(true);
    try {
      await budgets.upsert({ categoryId: form.categoryId, amount: parseFloat(form.amount) || 0 });
      toast(t('budgets.saved'), 'success');
      setShowForm(false);
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('budgets.confirmDelete'))) return;
    try {
      await budgets.remove(id);
      toast(t('budgets.deleted'), 'success');
      fetchData();
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    }
  }

  /* ── Month navigation ── */
  function navigateMonth(offset: number) {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  /* ── Pie chart data ── */
  const pieData = budgetList.map((b) => ({
    name: getCategoryDisplayName(b.category.name, b.category.slug, t),
    value: b.amount,
    color: b.category.color || PIE_COLORS[budgetList.indexOf(b) % PIE_COLORS.length],
  }));

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t('budgets.title')} <HelpTooltip text={t('help.budgets')} className="ms-1" />
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('budgets.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={openAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('budgets.addBudget')}
        </button>
      </div>

      {/* ── Month Selector ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigateMonth(-1)}
          className="p-2 rounded-lg border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <input
            type="month"
            className="input py-1.5 text-sm"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {formatMonth(selectedMonth, locale)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigateMonth(1)}
          className="p-2 rounded-lg border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setSelectedMonth(getMonthString(0))}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline ms-1"
        >
          {t('budgets.currentMonth')}
        </button>
      </div>

      {/* ── Summary Cards ── */}
      {summary && budgetList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-sm text-slate-500">{t('budgets.totalBudgeted')}</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(summary.totalBudgeted, locale)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('budgets.totalSpent')}</p>
            <p className={`text-xl font-bold mt-1 ${summary.percentUsed > 100 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {formatCurrency(summary.totalSpent, locale)}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('budgets.remaining')}</p>
            <p className={`text-xl font-bold mt-1 ${summary.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {formatCurrency(summary.remaining, locale)}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('budgets.categoriesOverBudget')}</p>
            <p className={`text-xl font-bold mt-1 ${summary.overBudgetCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {summary.overBudgetCount}
            </p>
          </div>
        </div>
      )}

      {/* ── Over-budget Alerts ── */}
      {summary && summary.overBudget.length > 0 && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h3 className="font-semibold text-red-700 dark:text-red-300">{t('budgets.overBudgetAlerts')}</h3>
          </div>
          <div className="space-y-1">
            {summary.overBudget.map((item) => (
              <div key={item.categoryName} className="flex items-center justify-between text-sm">
                <span className="text-red-700 dark:text-red-300">{item.categoryName}</span>
                <span className="text-red-600 dark:text-red-400 font-medium">
                  {formatCurrency(item.spent, locale)} / {formatCurrency(item.amount, locale)}
                  <span className="ms-2 text-xs">
                    (+{formatCurrency(item.spent - item.amount, locale)})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main content: budget list + pie chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Budget Cards */}
        <div className="lg:col-span-2">
          {budgetList.length === 0 ? (
            <div className="card text-center py-12">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-400 mb-4">
                <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <p className="text-slate-500">{t('budgets.noBudgets')}</p>
              <p className="text-xs text-slate-400 mt-1">{t('budgets.noBudgetsHint')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {budgetList.map((b) => {
                const pct = Math.min(b.percentUsed, 100);
                const barPctDisplay = Math.min(b.percentUsed, 100);
                return (
                  <div key={b.id} className={`card relative overflow-hidden ${b.isOver ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}>
                    {b.category.color && <div className="absolute inset-x-0 top-0 h-1" style={{ background: b.category.color }} />}

                    <div className="flex items-start gap-3 mb-3">
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{
                          background: b.category.color ? `${b.category.color}20` : undefined,
                          color: b.category.color || undefined,
                        }}
                      >
                        {b.category.icon || b.category.name.charAt(0)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">
                          {getCategoryDisplayName(b.category.name, b.category.slug, t)}
                        </h3>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          b.isOver
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : b.percentUsed > 70
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                          {b.isOver ? t('budgets.overBudget') : b.percentUsed > 70 ? t('budgets.warning') : t('budgets.onTrack')}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(b)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title={t('budgets.editBudget')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(b.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                          title={t('common.delete')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium">
                          {formatCurrency(b.spent, locale)} / {formatCurrency(b.amount, locale)}
                        </span>
                        <span className={`font-bold ${getProgressTextColor(b.percentUsed)}`}>
                          {b.percentUsed}%
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getProgressGradient(b.percentUsed)}`}
                          style={{ width: `${barPctDisplay}%` }}
                        />
                      </div>
                    </div>

                    {/* Remaining */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span className="text-slate-500">
                        {t('budgets.remaining')}:{' '}
                        <b className={b.isOver ? 'text-red-600 dark:text-red-400' : ''}>
                          {formatCurrency(b.remaining, locale)}
                        </b>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pie Chart */}
        {budgetList.length > 0 && (
          <div className="card">
            <h2 className="font-semibold mb-4">{t('budgets.allocation')}</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value, locale)}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="space-y-2 mt-4">
              {pieData.map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: entry.color }} />
                    <span className="truncate">{entry.name}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(entry.value, locale)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Overall Progress ── */}
      {summary && budgetList.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">{t('budgets.overallProgress')}</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressGradient(summary.percentUsed)}`}
                  style={{ width: `${Math.min(summary.percentUsed, 100)}%` }}
                />
              </div>
            </div>
            <span className={`text-lg font-bold ${getProgressTextColor(summary.percentUsed)}`}>
              {summary.percentUsed}%
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-2">
            {formatCurrency(summary.totalSpent, locale)} {t('budgets.of')} {formatCurrency(summary.totalBudgeted, locale)} {t('budgets.used')}
          </p>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">
                {editingId ? t('budgets.editBudget') : t('budgets.addBudget')}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('budgets.category')}</label>
                <select
                  className="input w-full"
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  required
                  disabled={!!editingId}
                >
                  <option value="">{t('budgets.category')}...</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {getCategoryDisplayName(cat.name, cat.slug, t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('budgets.monthlyLimit')}</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="input w-full"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  required
                />
              </div>
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
