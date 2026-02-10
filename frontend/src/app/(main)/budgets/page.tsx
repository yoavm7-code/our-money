'use client';

import { useCallback, useEffect, useState } from 'react';
import { budgets, categories, type BudgetItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import { useToast } from '@/components/Toast';

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

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

export default function BudgetsPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const [budgetList, setBudgetList] = useState<BudgetItem[]>([]);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [categoryList, setCategoryList] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ categoryId: '', amount: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([budgets.list(), budgets.summary(), categories.list()])
      .then(([b, s, c]) => {
        setBudgetList(b);
        setSummary(s);
        setCategoryList(c.filter((cat) => !cat.isIncome));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Categories not already used in a budget (unless we're editing that budget)
  const availableCategories = categoryList.filter(
    (cat) => !budgetList.some((b) => b.categoryId === cat.id) || (editingId && budgetList.find((b) => b.id === editingId)?.categoryId === cat.id),
  );

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('budgets.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('budgets.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={openAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('budgets.addBudget')}
        </button>
      </div>

      {/* Summary cards */}
      {summary && budgetList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <p className="text-sm text-slate-500">{t('budgets.categoriesOverBudget')}</p>
            <p className={`text-xl font-bold mt-1 ${summary.overBudgetCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {summary.overBudgetCount}
            </p>
          </div>
        </div>
      )}

      {/* Budget cards */}
      {budgetList.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-400"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <p className="text-slate-500">{t('budgets.noBudgets')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgetList.map((b) => {
            const pct = Math.min(b.percentUsed, 100);
            return (
              <div key={b.id} className="card relative overflow-hidden">
                {b.category.color && <div className="absolute inset-x-0 top-0 h-1" style={{ background: b.category.color }} />}

                <div className="flex items-start gap-3 mb-3">
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: b.category.color ? `${b.category.color}20` : undefined, color: b.category.color || undefined }}
                  >
                    {b.category.icon || b.category.name.charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{b.category.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.isOver ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {b.isOver ? t('budgets.overBudget') : t('budgets.onTrack')}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t('budgets.editBudget')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <button type="button" onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors" title={t('common.delete')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">
                      {formatCurrency(b.spent, locale)} / {formatCurrency(b.amount, locale)}
                    </span>
                    <span className={`font-bold ${b.isOver ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {b.percentUsed}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${b.isOver ? 'bg-gradient-to-r from-red-500 to-red-400' : 'bg-gradient-to-r from-primary-500 to-emerald-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="text-slate-500">
                    {t('budgets.remaining')}: <b className={b.isOver ? 'text-red-600 dark:text-red-400' : ''}>{formatCurrency(b.remaining, locale)}</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">{editingId ? t('budgets.editBudget') : t('budgets.addBudget')}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
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
