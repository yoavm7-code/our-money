'use client';

import { useEffect, useState } from 'react';
import { dashboard, transactions as txApi, accounts, categories } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

const KNOWN_SLUGS = ['groceries', 'transport', 'utilities', 'rent', 'insurance', 'healthcare', 'dining', 'shopping', 'entertainment', 'other', 'salary'];
function getCatName(name: string, slug: string | undefined, t: (k: string) => string) {
  if (slug && KNOWN_SLUGS.includes(slug)) {
    const tr = t('categories.' + slug);
    return tr !== 'categories.' + slug ? tr : name;
  }
  return name;
}

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', { style: 'currency', currency: 'ILS' }).format(n);
}

export default function ExpensesPage() {
  const { t, locale } = useTranslation();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof dashboard.summary>> | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<Array<{ id: string; name: string; slug?: string }>>([]);
  const [accountsList, setAccountsList] = useState<Array<{ id: string; name: string }>>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setFrom(start.toISOString().slice(0, 10));
    setTo(now.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    const start = from || new Date().toISOString().slice(0, 10);
    const end = to || new Date().toISOString().slice(0, 10);
    dashboard.summary(start, end).then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false));
    categories.list().then((c) => setExpenseCategories(c.filter((x) => !x.isIncome))).catch(() => {});
    accounts.list().then((a) => setAccountsList(a)).catch(() => {});
  }, [from, to]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    accountId: '',
    categoryId: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: 0,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [suggestingCat, setSuggestingCat] = useState(false);

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

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!form.accountId || !form.description || form.amount <= 0) return;
    setSaving(true);
    setMsg('');
    try {
      await txApi.create({
        accountId: form.accountId,
        categoryId: form.categoryId || undefined,
        date: form.date,
        description: form.description,
        amount: -Math.abs(form.amount),
      });
      setMsg(t('expenses.expenseAdded'));
      setForm((f) => ({ ...f, description: '', amount: 0 }));
      const start = from || new Date().toISOString().slice(0, 10);
      const end = to || new Date().toISOString().slice(0, 10);
      dashboard.summary(start, end).then(setSummary).catch(() => {});
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('common.failedToLoad'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t('expenses.title')}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('expenses.expensesThisPeriod')}</p>
          {loading ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent mt-2" />
          ) : (
            <p className="text-2xl font-semibold mt-1 text-red-600 dark:text-red-400">
              {summary ? formatCurrency(summary.expenses, locale) : '–'}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <input type="date" className="input w-auto text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="input w-auto text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('expenses.incomeThisPeriod')}</p>
          <p className="text-2xl font-semibold mt-1 text-green-600 dark:text-green-400">
            {summary ? formatCurrency(summary.income, locale) : '–'}
          </p>
        </div>
      </div>
      <div className="card max-w-lg">
        <h2 className="font-medium mb-4">{t('expenses.addExpense')}</h2>
        {!showForm ? (
          <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
            {t('expenses.addExpenseEntry')}
          </button>
        ) : (
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('common.account')}</label>
              <select
                className="input"
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
              <label className="block text-sm font-medium mb-1">{t('common.category')}</label>
              <div className="flex gap-2">
                <select
                  className="input flex-1"
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                >
                  <option value="">{t('common.optional')}</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>{getCatName(c.name, c.slug, t)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary text-sm whitespace-nowrap"
                  onClick={handleSuggestCategory}
                  disabled={!form.description.trim() || suggestingCat}
                  title={t('transactionsPage.suggestCategory')}
                >
                  {suggestingCat ? '…' : t('transactionsPage.suggestCategory')}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('common.date')}</label>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('common.description')}</label>
              <input
                type="text"
                className="input"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('expenses.descriptionPlaceholder')}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('expenses.amountIls')}</label>
              <input
                type="number"
                className="input"
                step="0.01"
                min="0"
                value={form.amount || ''}
                onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                required
              />
            </div>
            {msg && <p className="text-sm text-slate-600">{msg}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? t('expenses.saving') : t('common.save')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
