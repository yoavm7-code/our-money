'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { transactions as txApi, accounts, categories } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import DateRangePicker from '@/components/DateRangePicker';

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', { style: 'currency', currency: 'ILS' }).format(n);
}

type Tx = {
  id: string;
  date: string;
  displayDate?: string;
  firstPaymentDate?: string;
  description: string;
  amount: string;
  category?: { id: string; name: string; slug?: string } | null;
  account?: { id?: string; name: string } | null;
  totalAmount?: string | null;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
  isRecurring?: boolean;
};

const KNOWN_SLUGS = ['groceries', 'transport', 'utilities', 'rent', 'insurance', 'healthcare', 'dining', 'shopping', 'entertainment', 'other', 'salary', 'income', 'credit_charges', 'transfers', 'fees', 'subscriptions', 'education', 'pets', 'gifts', 'childcare', 'savings', 'pension', 'investment', 'bank_fees', 'online_shopping', 'loan_payment', 'loan_interest', 'standing_order', 'finance', 'unknown'];

function getCategoryDisplayName(name: string, slug: string | undefined, t: (k: string) => string): string {
  // Always try to translate first
  if (slug) {
    const translated = t('categories.' + slug);
    if (translated !== 'categories.' + slug) return translated;
  }
  // Fall back to database name, but convert slug-style to readable if no name
  if (!name && slug) {
    return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return name || 'לא מסווג';
}

export default function TransactionsPage() {
  const { t, locale } = useTranslation();
  const [items, setItems] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [accountsList, setAccountsList] = useState<Array<{ id: string; name: string }>>([]);
  const [categoriesList, setCategoriesList] = useState<Array<{ id: string; name: string; slug?: string; isIncome: boolean }>>([]);
  const [updatingCategoryId, setUpdatingCategoryId] = useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [addCategoryForTxId, setAddCategoryForTxId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const [from, setFrom] = useState(() => defaultStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(() => now.toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [showAddTx, setShowAddTx] = useState(false);
  const [addTxForm, setAddTxForm] = useState({
    type: 'expense' as 'expense' | 'income',
    accountId: '',
    categoryId: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    isRecurring: false,
  });
  const [addingTx, setAddingTx] = useState(false);
  const [suggestingCategory, setSuggestingCategory] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editTxForm, setEditTxForm] = useState({
    type: 'expense' as 'expense' | 'income',
    accountId: '',
    categoryId: '',
    date: '',
    description: '',
    amount: '',
    isRecurring: false,
  });
  const [updatingTx, setUpdatingTx] = useState(false);
  const [suggestingCategoryTxId, setSuggestingCategoryTxId] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [updatingRecurringId, setUpdatingRecurringId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    accounts.list().then((a) => setAccountsList(a)).catch(() => {});
    categories.list().then((c) => setCategoriesList(c)).catch(() => {});
  }, []);

  const categoriesForSelect = useMemo(() => {
    const listIds = new Set(categoriesList.map((c) => c.id));
    const fromTxs = items
      .map((tx) => tx.category as { id: string; name: string; slug?: string } | undefined)
      .filter((c): c is { id: string; name: string; slug?: string } => !!c?.id && !listIds.has(c.id));
    const seen = new Set<string>();
    const extra = fromTxs.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    return [...categoriesList, ...extra.map((c) => ({ id: c.id, name: c.name, slug: c.slug, isIncome: false }))];
  }, [categoriesList, items]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [search]);

  const handleDateRangeChange = useCallback((f: string, t2: string) => {
    setFrom(f);
    setTo(t2);
    setPage(1);
  }, []);

  useEffect(() => {
    const currentId = ++fetchIdRef.current;
    setLoading(true);
    setError('');
    const params = {
      from: from || undefined,
      to: to || undefined,
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      search: searchDebounced || undefined,
      page,
      limit,
    };
    Promise.all([txApi.list(params), categories.list()])
      .then(([res, cats]) => {
        if (currentId !== fetchIdRef.current) return;
        const list = (res.items as Tx[]) ?? [];
        const totalCount = res.total ?? 0;
        setItems(list);
        setTotal(totalCount);
        setCategoriesList(cats);
        if (list.length === 0 && page > 1) setPage(1);
      })
      .catch((e) => {
        if (currentId !== fetchIdRef.current) return;
        setError(e instanceof Error ? e.message : t('common.failedToLoad'));
      })
      .finally(() => {
        if (currentId === fetchIdRef.current) setLoading(false);
      });
  }, [from, to, accountId, categoryId, searchDebounced, page, limit, refreshKey, t]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((t) => t.id)));
  };

  const handleDeleteOne = async (id: string) => {
    if (!confirm(t('transactions.confirmDeleteOne'))) return;
    setDeleting(true);
    setError('');
    try {
      await txApi.delete(id);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('transactions.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!confirm(t('transactions.confirmDeleteMany', { count: ids.length }))) return;
    setDeleting(true);
    setError('');
    try {
      await txApi.bulkDelete(ids);
      setSelectedIds(new Set());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('transactions.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const handleCategoryChange = async (txId: string, categoryId: string) => {
    if (categoryId === '__add__') {
      setAddCategoryForTxId(txId);
      setShowAddCategory(true);
      return;
    }
    setUpdatingCategoryId(txId);
    setError('');
    try {
      await txApi.updateCategory(txId, categoryId || null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('transactions.categoryUpdateFailed'));
    } finally {
      setUpdatingCategoryId(null);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !addCategoryForTxId) return;
    setAddingCategory(true);
    setError('');
    try {
      const created = await categories.create({ name: newCategoryName.trim(), isIncome: false });
      const newId = (created as { id: string }).id;
      await txApi.updateCategory(addCategoryForTxId, newId);
      const list = await categories.list();
      setCategoriesList(list);
      setRefreshKey((k) => k + 1);
      setShowAddCategory(false);
      setAddCategoryForTxId(null);
      setNewCategoryName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('transactions.addCategoryFailed'));
    } finally {
      setAddingCategory(false);
    }
  };

  function openEditTx(tx: Tx) {
    setEditingTxId(tx.id);
    let dateStr = '';
    if (tx.date) {
      const s = String(tx.date).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) dateStr = s.slice(0, 10);
      else {
        const d = new Date(tx.date);
        if (!Number.isNaN(d.getTime())) dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    setEditTxForm({
      type: Number(tx.amount) >= 0 ? 'income' : 'expense',
      accountId: tx.account?.id ?? '',
      categoryId: tx.category?.id ?? '',
      date: dateStr || new Date().toISOString().slice(0, 10),
      description: tx.description,
      amount: String(Math.abs(Number(tx.amount))),
      isRecurring: tx.isRecurring ?? false,
    });
  }

  async function handleSaveEditTx(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTxId || !editTxForm.accountId || !editTxForm.description.trim() || !editTxForm.amount || parseFloat(editTxForm.amount) <= 0) return;
    setUpdatingTx(true);
    setError('');
    const amountNum = parseFloat(editTxForm.amount);
    const isIncome = editTxForm.type === 'income';
    const amount = isIncome ? amountNum : -amountNum;
    try {
      await txApi.update(editingTxId, {
        accountId: editTxForm.accountId,
        categoryId: editTxForm.categoryId || null,
        date: editTxForm.date,
        description: editTxForm.description.trim(),
        amount,
        isRecurring: editTxForm.isRecurring,
      });
      setEditingTxId(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setUpdatingTx(false);
    }
  }

  async function handleAiSuggestCategory(tx: Tx) {
    if (!tx.description.trim()) return;
    setSuggestingCategoryTxId(tx.id);
    try {
      const res = await txApi.suggestCategory(tx.description.trim());
      if (res.categoryId) {
        await txApi.updateCategory(tx.id, res.categoryId);
        setRefreshKey((k) => k + 1);
      }
    } catch {
      setError(t('common.failedToLoad'));
    } finally {
      setSuggestingCategoryTxId(null);
    }
  }

  const handleToggleRecurring = useCallback(async (tx: Tx) => {
    setUpdatingRecurringId(tx.id);
    try {
      await txApi.update(tx.id, { isRecurring: !tx.isRecurring });
      setItems((prev) => prev.map((item) => (item.id === tx.id ? { ...item, isRecurring: !item.isRecurring } : item)));
    } catch {
      setError(t('common.failedToLoad'));
    } finally {
      setUpdatingRecurringId(null);
    }
  }, [t]);

  const [flippingTxId, setFlippingTxId] = useState<string | null>(null);
  async function handleFlipSign(tx: Tx) {
    const num = Number(tx.amount);
    if (Number.isNaN(num) || num === 0) return;
    setFlippingTxId(tx.id);
    try {
      await txApi.update(tx.id, { amount: -num });
      setItems((prev) => prev.map((item) => (item.id === tx.id ? { ...item, amount: String(-num) } : item)));
    } catch {
      setError(t('common.failedToLoad'));
    } finally {
      setFlippingTxId(null);
    }
  }

  async function handleSuggestCategory() {
    if (!addTxForm.description.trim()) return;
    setSuggestingCategory(true);
    try {
      const res = await txApi.suggestCategory(addTxForm.description.trim());
      if (res.categoryId) setAddTxForm((f) => ({ ...f, categoryId: res.categoryId! }));
    } finally {
      setSuggestingCategory(false);
    }
  }

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!addTxForm.accountId || !addTxForm.description.trim() || !addTxForm.amount || parseFloat(addTxForm.amount) <= 0) return;
    setAddingTx(true);
    setError('');
    try {
      const amountNum = parseFloat(addTxForm.amount);
      const amount = addTxForm.type === 'income' ? Math.abs(amountNum) : -Math.abs(amountNum);
      await txApi.create({
        accountId: addTxForm.accountId,
        categoryId: addTxForm.categoryId || undefined,
        date: addTxForm.date,
        description: addTxForm.description.trim(),
        amount,
        isRecurring: addTxForm.isRecurring,
      });
      setShowAddTx(false);
      setAddTxForm({ type: 'expense', accountId: '', categoryId: '', date: new Date().toISOString().slice(0, 10), description: '', amount: '', isRecurring: false });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setAddingTx(false);
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('transactions.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => setShowAddTx(true)}>
          {t('transactionsPage.addTransaction')}
        </button>
      </div>
      <div className="card p-4 space-y-4">
        {/* First row: Date range and search */}
        <div className="flex flex-wrap gap-4 items-center">
          <DateRangePicker from={from} to={to} onChange={handleDateRangeChange} />
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="search"
              className="input w-full ps-10"
              placeholder={t('transactionsPage.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        
        {/* Second row: Dropdowns */}
        <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{t('common.account')}:</span>
            <select
              className="input w-auto min-w-[140px] py-1.5 text-sm"
              value={accountId}
              onChange={(e) => { setAccountId(e.target.value); setPage(1); }}
            >
              <option value="">{t('common.allAccounts')}</option>
              {accountsList.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{t('common.category')}:</span>
            <select
              className="input w-auto min-w-[140px] py-1.5 text-sm"
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
            >
              <option value="">{t('common.allCategories')}</option>
              {categoriesList.map((c) => (
                <option key={c.id} value={c.id}>{getCategoryDisplayName(c.name, c.slug, t)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 ms-auto">
            <span className="text-sm text-slate-500">{t('common.rowsPerPage')}:</span>
            <select
              className="input w-auto min-w-[70px] py-1.5 text-sm"
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-slate-500">{t('transactions.noTransactionsInRange')}</p>
            <p className="text-sm text-slate-500">
              {t('transactions.expandRangeHint')}
            </p>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                setFrom(start.toISOString().slice(0, 10));
                setTo(now.toISOString().slice(0, 10));
                setPage(1);
              }}
            >
              {t('transactions.showLast3Months')}
            </button>
          </div>
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-[var(--border)]">
                <span className="text-sm text-slate-600">
                  {t('transactions.selectedCount', { count: selectedIds.size })}
                </span>
                <button
                  type="button"
                  className="btn-primary bg-red-600 hover:bg-red-700"
                  disabled={deleting}
                  onClick={handleBulkDelete}
                >
                  {deleting ? t('transactions.deleting') : t('transactions.deleteSelected')}
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  {t('transactions.clearSelection')}
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-3 px-2 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedIds.size === items.length}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-end py-3 px-2">{t('common.date')}</th>
                  <th className="text-end py-3 px-2">{t('common.description')}</th>
                  <th className="text-end py-3 px-2">{t('common.category')}</th>
                  <th className="text-end py-3 px-2">{t('common.account')}</th>
                  <th className="text-end py-3 px-2 text-sm text-slate-600">{t('transactions.payments')}</th>
                  <th className="text-end py-3 px-2">{t('common.amount')}</th>
                  <th className="text-center py-3 px-2 w-12" title={t('transactions.recurring')} aria-label={t('transactions.recurring')}></th>
                  <th className="text-center py-3 px-2 w-20" aria-label={t('common.delete')}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr key={tx.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(tx.id)}
                        onChange={() => toggleSelect(tx.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="py-2 px-2 text-end">
                      {(tx.displayDate ?? tx.date) && (
                        <span className="block">
                          {new Date(tx.displayDate ?? tx.date).toLocaleDateString()}
                          {tx.firstPaymentDate && tx.firstPaymentDate !== (tx.displayDate ?? tx.date) && (
                            <span className="block text-xs text-slate-500 dark:text-slate-400" title={t('transactions.firstChargeDate')}>
                              {t('transactions.firstChargeDate')}: {new Date(tx.firstPaymentDate).toLocaleDateString()}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-end">{tx.description}</td>
                    <td className="py-2 px-2 text-end">
                      <div className="flex items-center gap-1 justify-end">
                        <select
                          className="input py-1 px-2 text-sm min-w-[120px]"
                          value={tx.category?.id ?? ''}
                          onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                          disabled={updatingCategoryId === tx.id}
                          title={t('transactions.changeCategory')}
                        >
                          <option value="">{t('common.noCategory')}</option>
                          {categoriesForSelect.map((c) => (
                            <option key={c.id} value={c.id}>{getCategoryDisplayName(c.name, c.slug, t)}</option>
                          ))}
                          <option value="__add__">{t('transactions.addNewCategory')}</option>
                        </select>
                        <button
                          type="button"
                          className="p-1.5 rounded border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                          onClick={() => handleAiSuggestCategory(tx)}
                          disabled={!tx.description.trim() || suggestingCategoryTxId === tx.id}
                          title={t('transactionsPage.aiSuggestCategory')}
                          aria-label={t('transactionsPage.aiSuggestCategory')}
                        >
                          {suggestingCategoryTxId === tx.id ? (
                            <span className="inline-block w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-end">{tx.account?.name ?? '–'}</td>
                    <td className="py-2 px-2 text-sm text-slate-600 text-end">
                      {tx.installmentCurrent != null && tx.installmentTotal != null ? (
                        <span dir="ltr">
                          {tx.installmentCurrent}/{tx.installmentTotal}
                          {tx.totalAmount != null && Number(tx.totalAmount) > 0 && (
                            <> · {formatCurrency(Number(tx.totalAmount), locale)}</>
                          )}
                        </span>
                      ) : tx.totalAmount != null && Number(tx.totalAmount) > 0 ? (
                        <span dir="ltr">{formatCurrency(Number(tx.totalAmount), locale)}</span>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td
                      dir="ltr"
                      className={`py-2 px-2 text-right font-medium whitespace-nowrap ${
                        Number(tx.amount) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(Number(tx.amount), locale)}
                    </td>
                    <td className="py-2 px-2 w-12 text-center">
                      <button
                        type="button"
                        className={`p-1.5 rounded border transition-colors ${
                          tx.isRecurring ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600' : 'border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                        onClick={() => handleToggleRecurring(tx)}
                        disabled={updatingRecurringId === tx.id}
                        title={tx.isRecurring ? t('transactions.recurringOn') : t('transactions.recurringOff')}
                        aria-label={tx.isRecurring ? t('transactions.recurringOn') : t('transactions.recurringOff')}
                      >
                        {updatingRecurringId === tx.id ? (
                          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                          </svg>
                        )}
                      </button>
                    </td>
                    <td className="py-2 px-2 w-20 text-center">
                      <button
                        type="button"
                        className="text-primary-600 hover:underline text-xs me-2"
                        disabled={updatingTx}
                        onClick={() => openEditTx(tx)}
                        title={t('transactionsPage.editTransaction')}
                      >
                        {t('transactionsPage.edit')}
                      </button>
                      <button
                        type="button"
                        className="text-slate-600 hover:underline text-xs me-2"
                        disabled={!!flippingTxId}
                        onClick={() => handleFlipSign(tx)}
                        title={t('transactionsPage.flipSign')}
                      >
                        {flippingTxId === tx.id ? '...' : t('transactionsPage.flipSignShort')}
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline text-xs"
                        disabled={deleting}
                        onClick={() => handleDeleteOne(tx.id)}
                        title={t('transactions.deleteTransaction')}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {total > limit && (
          <div className="flex flex-wrap justify-center items-center gap-2 mt-4">
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('common.previous')}
            </button>
            <span className="py-2 text-sm">
              {t('common.page')} {page} {t('common.of')} {Math.max(1, Math.ceil(total / limit))}
            </span>
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= Math.max(1, Math.ceil(total / limit))}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('common.next')}
            </button>
          </div>
        )}
      </div>

      {showAddCategory && (
        <div className="modal-overlay" onClick={() => { setShowAddCategory(false); setAddCategoryForTxId(null); setNewCategoryName(''); }}>
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-4">{t('transactions.addCategoryTitle')}</h3>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('transactions.categoryName')}</label>
                <input
                  type="text"
                  className="input w-full"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={t('transactions.categoryNamePlaceholder')}
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={addingCategory}>
                  {addingCategory ? t('transactions.adding') : t('transactions.addAndAssign')}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setShowAddCategory(false); setAddCategoryForTxId(null); setNewCategoryName(''); }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddTx && (
        <div className="modal-overlay" onClick={() => setShowAddTx(false)}>
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-4">{t('transactionsPage.addTransaction')}</h3>
            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('transactionsPage.transactionType')}</label>
                <select
                  className="input w-full"
                  value={addTxForm.type}
                  onChange={(e) => setAddTxForm((f) => ({ ...f, type: e.target.value as 'expense' | 'income' }))}
                >
                  <option value="expense">{t('transactionsPage.expense')}</option>
                  <option value="income">{t('transactionsPage.income')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.account')}</label>
                <select
                  className="input w-full"
                  value={addTxForm.accountId}
                  onChange={(e) => setAddTxForm((f) => ({ ...f, accountId: e.target.value }))}
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
                    value={addTxForm.categoryId}
                    onChange={(e) => setAddTxForm((f) => ({ ...f, categoryId: e.target.value }))}
                  >
                    <option value="">{t('common.noCategory')}</option>
                    {(addTxForm.type === 'income' ? categoriesList.filter((c) => c.isIncome) : categoriesList.filter((c) => !c.isIncome)).map((c) => (
                      <option key={c.id} value={c.id}>{getCategoryDisplayName(c.name, c.slug, t)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary text-sm whitespace-nowrap"
                    onClick={handleSuggestCategory}
                    disabled={!addTxForm.description.trim() || suggestingCategory}
                    title={t('transactionsPage.suggestCategory')}
                  >
                    {suggestingCategory ? '…' : t('transactionsPage.suggestCategory')}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.date')}</label>
                <input
                  type="date"
                  className="input w-full"
                  value={addTxForm.date}
                  onChange={(e) => setAddTxForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.description')}</label>
                <input
                  type="text"
                  className="input w-full"
                  value={addTxForm.description}
                  onChange={(e) => setAddTxForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={addTxForm.type === 'income' ? t('income.descriptionPlaceholder') : t('expenses.descriptionPlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.amount')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input w-full"
                  value={addTxForm.amount}
                  onChange={(e) => setAddTxForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="add-tx-recurring"
                  checked={addTxForm.isRecurring}
                  onChange={(e) => setAddTxForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="add-tx-recurring" className="text-sm">{t('transactions.recurring')}</label>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={addingTx}>
                  {addingTx ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowAddTx(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingTxId && (
        <div className="modal-overlay" onClick={() => setEditingTxId(null)}>
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-4">{t('transactionsPage.editTransaction')}</h3>
            <form onSubmit={handleSaveEditTx} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('transactionsPage.transactionType')}</label>
                <select
                  className="input w-full"
                  value={editTxForm.type}
                  onChange={(e) => setEditTxForm((f) => ({ ...f, type: e.target.value as 'expense' | 'income' }))}
                >
                  <option value="expense">{t('transactionsPage.expense')}</option>
                  <option value="income">{t('transactionsPage.income')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.account')}</label>
                <select
                  className="input w-full"
                  value={editTxForm.accountId}
                  onChange={(e) => setEditTxForm((f) => ({ ...f, accountId: e.target.value }))}
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
                <select
                  className="input w-full"
                  value={editTxForm.categoryId}
                  onChange={(e) => setEditTxForm((f) => ({ ...f, categoryId: e.target.value }))}
                >
                  <option value="">{t('common.noCategory')}</option>
                  {categoriesList.map((c) => (
                    <option key={c.id} value={c.id}>{getCategoryDisplayName(c.name, c.slug, t)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.date')}</label>
                <input
                  type="date"
                  className="input w-full"
                  value={editTxForm.date}
                  onChange={(e) => setEditTxForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.description')}</label>
                <input
                  type="text"
                  className="input w-full"
                  value={editTxForm.description}
                  onChange={(e) => setEditTxForm((f) => ({ ...f, description: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.amount')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input w-full"
                  value={editTxForm.amount}
                  onChange={(e) => setEditTxForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-tx-recurring"
                  checked={editTxForm.isRecurring}
                  onChange={(e) => setEditTxForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="edit-tx-recurring" className="text-sm">{t('transactions.recurring')}</label>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={updatingTx}>
                  {updatingTx ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setEditingTxId(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
