'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  transactions as txApi,
  accounts,
  categories,
  clients as clientsApi,
  projects as projectsApi,
  type TransactionItem,
  type AccountItem,
  type CategoryItem,
  type ClientItem,
  type ProjectItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import DateRangePicker from '@/components/DateRangePicker';
import HelpTooltip from '@/components/HelpTooltip';
import VoiceTransaction from '@/components/VoiceTransaction';

/* ──────────────────────────────────────────────────────── */
/*  Helpers                                                 */
/* ──────────────────────────────────────────────────────── */

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(n);
}

function formatDate(dateStr: string, locale: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const CATEGORY_ICON_COLORS: Record<string, string> = {
  groceries: '#22c55e', transport: '#3b82f6', utilities: '#f59e0b',
  rent: '#ef4444', insurance: '#8b5cf6', healthcare: '#ec4899',
  dining: '#f97316', shopping: '#a855f7', entertainment: '#06b6d4',
  salary: '#10b981', income: '#10b981', credit_charges: '#ef4444',
  transfers: '#6366f1', fees: '#94a3b8', subscriptions: '#f43f5e',
  education: '#0ea5e9', pets: '#84cc16', gifts: '#d946ef',
  childcare: '#fb923c', savings: '#14b8a6', pension: '#22c55e',
  investment: '#3b82f6', bank_fees: '#94a3b8', online_shopping: '#a855f7',
  loan_payment: '#ef4444', loan_interest: '#f59e0b', standing_order: '#6366f1',
  finance: '#3b82f6', other: '#94a3b8', unknown: '#94a3b8',
};

const CATEGORY_ICONS: Record<string, string> = {
  groceries: '\u{1F6D2}', transport: '\u{1F697}', utilities: '\u{1F4A1}', rent: '\u{1F3E0}',
  insurance: '\u{1F6E1}\uFE0F', healthcare: '\u{1F3E5}', dining: '\u{1F37D}\uFE0F', shopping: '\u{1F6CD}\uFE0F',
  entertainment: '\u{1F3AC}', salary: '\u{1F4B0}', income: '\u{1F4B0}', credit_charges: '\u{1F4B3}',
  transfers: '\u2194\uFE0F', fees: '\u{1F3E6}', subscriptions: '\u{1F4F1}', education: '\u{1F4DA}',
  pets: '\u{1F43E}', gifts: '\u{1F381}', childcare: '\u{1F476}', savings: '\u{1F3E6}',
  pension: '\u{1F4CA}', investment: '\u{1F4C8}', bank_fees: '\u{1F3E6}', online_shopping: '\u{1F6D2}',
  loan_payment: '\u{1F4B8}', loan_interest: '\u{1F4CA}', standing_order: '\u{1F504}',
  finance: '\u{1F4B9}', other: '\u{1F4C4}', unknown: '\u{1F4C4}',
};

function getCategoryDisplayName(name: string, slug: string | undefined, t: (k: string) => string): string {
  if (slug) {
    const translated = t('categories.' + slug);
    if (translated !== 'categories.' + slug) return translated;
  }
  if (!name && slug) {
    return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return name || t('common.uncategorized');
}

/* ──────────────────────────────────────────────────────── */
/*  Extended transaction type for local state               */
/* ──────────────────────────────────────────────────────── */

type Tx = {
  id: string;
  date: string;
  displayDate?: string;
  firstPaymentDate?: string;
  description: string;
  amount: string;
  currency?: string;
  category?: { id: string; name: string; slug?: string } | null;
  account?: { id?: string; name: string; type?: string } | null;
  clientId?: string | null;
  clientName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  totalAmount?: string | null;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
  isRecurring?: boolean;
  vatAmount?: number | null;
  isVatIncluded?: boolean;
  isTaxDeductible?: boolean;
  notes?: string | null;
  suggestedCategoryId?: string | null;
};

type SortField = 'date' | 'amount' | 'description';
type SortDir = 'asc' | 'desc';

/* ──────────────────────────────────────────────────────── */
/*  Skeleton                                                */
/* ──────────────────────────────────────────────────────── */

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="flex-1 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="w-16 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="w-16 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  Main Page Component                                     */
/* ──────────────────────────────────────────────────────── */

export default function TransactionsPage() {
  const { t, locale } = useTranslation();

  /* ── list data ── */
  const [items, setItems] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ── reference data ── */
  const [accountsList, setAccountsList] = useState<AccountItem[]>([]);
  const [categoriesList, setCategoriesList] = useState<CategoryItem[]>([]);
  const [clientsList, setClientsList] = useState<ClientItem[]>([]);
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([]);

  /* ── filters ── */
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const [from, setFrom] = useState(() => defaultStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(() => now.toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'income' | 'expense'>('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── pagination ── */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  /* ── sorting ── */
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  /* ── selection / bulk ── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* ── add transaction modal ── */
  const [showAddTx, setShowAddTx] = useState(false);
  const [addTxForm, setAddTxForm] = useState({
    type: 'expense' as 'expense' | 'income',
    accountId: '',
    categoryId: '',
    clientId: '',
    projectId: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    vatAmount: '',
    isVatIncluded: true,
    isTaxDeductible: false,
    isRecurring: false,
    notes: '',
    installmentCurrent: '',
    installmentTotal: '',
    totalAmount: '',
  });
  const [addingTx, setAddingTx] = useState(false);
  const [suggestingCategory, setSuggestingCategory] = useState(false);
  const [suggestedCatHint, setSuggestedCatHint] = useState<string | null>(null);

  /* ── edit transaction modal ── */
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editTxForm, setEditTxForm] = useState({
    type: 'expense' as 'expense' | 'income',
    accountId: '',
    categoryId: '',
    clientId: '',
    projectId: '',
    date: '',
    description: '',
    amount: '',
    vatAmount: '',
    isVatIncluded: true,
    isTaxDeductible: false,
    isRecurring: false,
    notes: '',
    installmentCurrent: '',
    installmentTotal: '',
    totalAmount: '',
  });
  const [updatingTx, setUpdatingTx] = useState(false);

  /* ── category inline ── */
  const [updatingCategoryId, setUpdatingCategoryId] = useState<string | null>(null);
  const [suggestingCategoryTxId, setSuggestingCategoryTxId] = useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [addCategoryForTxId, setAddCategoryForTxId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  /* ── voice modal ── */
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  /* ── misc ── */
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchIdRef = useRef(0);

  /* ──────────────────────────────────────────────────────── */
  /*  Load reference data                                     */
  /* ──────────────────────────────────────────────────────── */

  useEffect(() => {
    accounts.list().then(setAccountsList).catch(() => {});
    categories.list().then(setCategoriesList).catch(() => {});
    clientsApi.list().then(setClientsList).catch(() => {});
    projectsApi.list().then(setProjectsList).catch(() => {});
  }, []);

  /* ── combined categories (list + from loaded txs) ── */
  const categoriesForSelect = useMemo(() => {
    const listIds = new Set(categoriesList.map((c) => c.id));
    const fromTxs = items
      .map((tx) => tx.category)
      .filter((c): c is { id: string; name: string; slug?: string } => !!c?.id && !listIds.has(c.id));
    const seen = new Set<string>();
    const extra = fromTxs.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    return [
      ...categoriesList,
      ...extra.map((c) => ({ id: c.id, name: c.name, slug: c.slug || '', icon: null, color: null, isIncome: false })),
    ];
  }, [categoriesList, items]);

  /* ──────────────────────────────────────────────────────── */
  /*  Search debounce                                         */
  /* ──────────────────────────────────────────────────────── */

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search]);

  /* ──────────────────────────────────────────────────────── */
  /*  Fetch transactions                                      */
  /* ──────────────────────────────────────────────────────── */

  const handleDateRangeChange = useCallback((f: string, t2: string) => {
    setFrom(f);
    setTo(t2);
    setPage(1);
  }, []);

  useEffect(() => {
    const currentId = ++fetchIdRef.current;
    setLoading(true);
    setError('');

    const params: Record<string, string | number | undefined> = {
      from: from || undefined,
      to: to || undefined,
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      search: searchDebounced || undefined,
      type: typeFilter || undefined,
      page,
      limit,
    };

    txApi
      .list(params as Parameters<typeof txApi.list>[0])
      .then((res) => {
        if (currentId !== fetchIdRef.current) return;
        const list = (res.items as unknown as Tx[]) ?? [];
        setItems(list);
        setTotal(res.total ?? 0);
        if (list.length === 0 && page > 1) setPage(1);
      })
      .catch((e) => {
        if (currentId !== fetchIdRef.current) return;
        setError(e instanceof Error ? e.message : t('common.failedToLoad'));
      })
      .finally(() => {
        if (currentId === fetchIdRef.current) setLoading(false);
      });
  }, [from, to, accountId, categoryId, searchDebounced, typeFilter, page, limit, refreshKey, t]);

  /* ──────────────────────────────────────────────────────── */
  /*  Sorting (client-side on the current page)               */
  /* ──────────────────────────────────────────────────────── */

  const sortedItems = useMemo(() => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'amount':
          cmp = Number(a.amount) - Number(b.amount);
          break;
        case 'description':
          cmp = (a.description || '').localeCompare(b.description || '', locale === 'he' ? 'he' : 'en');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [items, sortField, sortDir, locale]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'date' ? 'desc' : 'asc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-slate-300 dark:text-slate-600 ms-1">&udarr;</span>;
    return <span className="text-indigo-500 ms-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Selection                                               */
  /* ──────────────────────────────────────────────────────── */

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

  /* ──────────────────────────────────────────────────────── */
  /*  Delete                                                  */
  /* ──────────────────────────────────────────────────────── */

  const handleDeleteOne = async (id: string) => {
    if (!confirm(t('transactions.confirmDeleteOne'))) return;
    setDeleting(true);
    setError('');
    try {
      await txApi.delete(id);
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
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

  /* ──────────────────────────────────────────────────────── */
  /*  Category change                                         */
  /* ──────────────────────────────────────────────────────── */

  const handleCategoryChange = async (txId: string, newCatId: string) => {
    if (newCatId === '__add__') {
      setAddCategoryForTxId(txId);
      setShowAddCategory(true);
      return;
    }
    setUpdatingCategoryId(txId);
    setError('');
    try {
      await txApi.updateCategory(txId, newCatId || null);
      const cat = newCatId ? categoriesForSelect.find((c) => c.id === newCatId) : null;
      setItems((prev) =>
        prev.map((item) =>
          item.id === txId
            ? { ...item, category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null }
            : item,
        ),
      );
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
      await txApi.updateCategory(addCategoryForTxId, created.id);
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

  /* ──────────────────────────────────────────────────────── */
  /*  AI category suggestion                                  */
  /* ──────────────────────────────────────────────────────── */

  async function handleAiSuggestCategory(tx: Tx) {
    if (!tx.description.trim()) return;
    setSuggestingCategoryTxId(tx.id);
    try {
      const res = await txApi.suggestCategory(tx.description.trim());
      if (res.categoryId) {
        await txApi.updateCategory(tx.id, res.categoryId);
        const cat = categoriesForSelect.find((c) => c.id === res.categoryId);
        setItems((prev) =>
          prev.map((item) =>
            item.id === tx.id
              ? { ...item, category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null }
              : item,
          ),
        );
      }
    } catch {
      setError(t('common.failedToLoad'));
    } finally {
      setSuggestingCategoryTxId(null);
    }
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Flip sign                                               */
  /* ──────────────────────────────────────────────────────── */

  const [flippingTxId, setFlippingTxId] = useState<string | null>(null);

  async function handleFlipSign(tx: Tx) {
    const num = Number(tx.amount);
    if (isNaN(num) || num === 0) return;
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

  /* ──────────────────────────────────────────────────────── */
  /*  Toggle recurring                                        */
  /* ──────────────────────────────────────────────────────── */

  const [updatingRecurringId, setUpdatingRecurringId] = useState<string | null>(null);

  const handleToggleRecurring = useCallback(
    async (tx: Tx) => {
      setUpdatingRecurringId(tx.id);
      try {
        await txApi.update(tx.id, { isRecurring: !tx.isRecurring });
        setItems((prev) => prev.map((item) => (item.id === tx.id ? { ...item, isRecurring: !item.isRecurring } : item)));
      } catch {
        setError(t('common.failedToLoad'));
      } finally {
        setUpdatingRecurringId(null);
      }
    },
    [t],
  );

  /* ──────────────────────────────────────────────────────── */
  /*  Bulk actions                                            */
  /* ──────────────────────────────────────────────────────── */

  async function handleBulkCategoryUpdate() {
    const ids = Array.from(selectedIds);
    if (!ids.length || !bulkCategoryId) return;
    setBulkUpdating(true);
    setError('');
    try {
      await txApi.bulkUpdate(ids, { categoryId: bulkCategoryId });
      const cat = categoriesForSelect.find((c) => c.id === bulkCategoryId);
      setItems((prev) =>
        prev.map((item) =>
          selectedIds.has(item.id)
            ? { ...item, category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null }
            : item,
        ),
      );
      setSelectedIds(new Set());
      setBulkCategoryId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.failedToLoad'));
    } finally {
      setBulkUpdating(false);
    }
  }

  async function handleBulkFlipSign() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkUpdating(true);
    setError('');
    try {
      await txApi.bulkFlipSign(ids);
      setItems((prev) =>
        prev.map((item) =>
          selectedIds.has(item.id) ? { ...item, amount: String(-Number(item.amount)) } : item,
        ),
      );
      setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.failedToLoad'));
    } finally {
      setBulkUpdating(false);
    }
  }

  async function handleBulkSuggestCategory() {
    const selected = items.filter((item) => selectedIds.has(item.id));
    if (!selected.length) return;
    setBulkUpdating(true);
    setError('');
    try {
      for (const tx of selected) {
        if (!tx.description.trim()) continue;
        const res = await txApi.suggestCategory(tx.description.trim());
        if (res.categoryId) {
          await txApi.updateCategory(tx.id, res.categoryId);
          const cat = categoriesForSelect.find((c) => c.id === res.categoryId);
          setItems((prev) =>
            prev.map((item) =>
              item.id === tx.id
                ? { ...item, category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null }
                : item,
            ),
          );
        }
      }
      setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.failedToLoad'));
    } finally {
      setBulkUpdating(false);
    }
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Add Transaction                                         */
  /* ──────────────────────────────────────────────────────── */

  async function handleSuggestCategoryForAdd() {
    if (!addTxForm.description.trim()) return;
    setSuggestingCategory(true);
    setSuggestedCatHint(null);
    try {
      const res = await txApi.suggestCategory(addTxForm.description.trim());
      if (res.categoryId) {
        setAddTxForm((f) => ({ ...f, categoryId: res.categoryId! }));
        const cat = categoriesForSelect.find((c) => c.id === res.categoryId);
        if (cat) setSuggestedCatHint(getCategoryDisplayName(cat.name, cat.slug, t));
      }
    } finally {
      setSuggestingCategory(false);
    }
  }

  function computeVat(amount: string, isIncluded: boolean): string {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return '';
    const vatRate = 0.17;
    if (isIncluded) {
      return (num - num / (1 + vatRate)).toFixed(2);
    }
    return (num * vatRate).toFixed(2);
  }

  // Auto-calculate VAT when amount changes
  useEffect(() => {
    if (addTxForm.amount) {
      setAddTxForm((f) => ({ ...f, vatAmount: computeVat(f.amount, f.isVatIncluded) }));
    }
  }, [addTxForm.amount, addTxForm.isVatIncluded]);

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!addTxForm.accountId || !addTxForm.amount || parseFloat(addTxForm.amount) <= 0) return;
    setAddingTx(true);
    setError('');
    try {
      const amountNum = parseFloat(addTxForm.amount);
      const amount = addTxForm.type === 'income' ? Math.abs(amountNum) : -Math.abs(amountNum);
      const instCurrent = addTxForm.installmentCurrent ? parseInt(addTxForm.installmentCurrent, 10) : undefined;
      const instTotal = addTxForm.installmentTotal ? parseInt(addTxForm.installmentTotal, 10) : undefined;
      const totalAmt = addTxForm.totalAmount ? parseFloat(addTxForm.totalAmount) : undefined;
      await txApi.create({
        accountId: addTxForm.accountId,
        categoryId: addTxForm.categoryId || undefined,
        date: addTxForm.date,
        description: addTxForm.description.trim() || '-',
        amount,
        isRecurring: addTxForm.isRecurring,
        ...(instCurrent && { installmentCurrent: instCurrent }),
        ...(instTotal && { installmentTotal: instTotal }),
        ...(totalAmt && { totalAmount: totalAmt }),
      });
      setShowAddTx(false);
      setAddTxForm({
        type: 'expense',
        accountId: '',
        categoryId: '',
        clientId: '',
        projectId: '',
        date: new Date().toISOString().slice(0, 10),
        description: '',
        amount: '',
        vatAmount: '',
        isVatIncluded: true,
        isTaxDeductible: false,
        isRecurring: false,
        notes: '',
        installmentCurrent: '',
        installmentTotal: '',
        totalAmount: '',
      });
      setSuggestedCatHint(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setAddingTx(false);
    }
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Edit Transaction                                        */
  /* ──────────────────────────────────────────────────────── */

  function openEditTx(tx: Tx) {
    setEditingTxId(tx.id);
    let dateStr = '';
    if (tx.date) {
      const s = String(tx.date).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) dateStr = s.slice(0, 10);
      else {
        const d = new Date(tx.date);
        if (!isNaN(d.getTime()))
          dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    const absAmount = String(Math.abs(Number(tx.amount)));
    setEditTxForm({
      type: Number(tx.amount) >= 0 ? 'income' : 'expense',
      accountId: tx.account?.id ?? '',
      categoryId: tx.category?.id ?? '',
      clientId: tx.clientId ?? '',
      projectId: tx.projectId ?? '',
      date: dateStr || new Date().toISOString().slice(0, 10),
      description: tx.description,
      amount: absAmount,
      vatAmount: computeVat(absAmount, true),
      isVatIncluded: tx.isVatIncluded ?? true,
      isTaxDeductible: tx.isTaxDeductible ?? false,
      isRecurring: tx.isRecurring ?? false,
      notes: tx.notes ?? '',
      installmentCurrent: tx.installmentCurrent != null ? String(tx.installmentCurrent) : '',
      installmentTotal: tx.installmentTotal != null ? String(tx.installmentTotal) : '',
      totalAmount: tx.totalAmount != null && Number(tx.totalAmount) > 0 ? String(Number(tx.totalAmount)) : '',
    });
  }

  async function handleSaveEditTx(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTxId || !editTxForm.accountId || !editTxForm.amount || parseFloat(editTxForm.amount) <= 0) return;
    setUpdatingTx(true);
    setError('');
    const amountNum = parseFloat(editTxForm.amount);
    const isIncome = editTxForm.type === 'income';
    const amount = isIncome ? amountNum : -amountNum;
    const instCurrent = editTxForm.installmentCurrent ? parseInt(editTxForm.installmentCurrent, 10) : null;
    const instTotal = editTxForm.installmentTotal ? parseInt(editTxForm.installmentTotal, 10) : null;
    const totalAmt = editTxForm.totalAmount ? parseFloat(editTxForm.totalAmount) : null;
    try {
      await txApi.update(editingTxId, {
        accountId: editTxForm.accountId,
        categoryId: editTxForm.categoryId || null,
        date: editTxForm.date,
        description: editTxForm.description.trim() || '-',
        amount,
        isRecurring: editTxForm.isRecurring,
        installmentCurrent: instCurrent,
        installmentTotal: instTotal,
        totalAmount: totalAmt,
      });
      const cat = editTxForm.categoryId ? categoriesForSelect.find((c) => c.id === editTxForm.categoryId) : null;
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingTxId
            ? {
                ...item,
                amount: String(amount),
                description: editTxForm.description.trim(),
                date: editTxForm.date,
                category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null,
                isRecurring: editTxForm.isRecurring,
                installmentCurrent: instCurrent,
                installmentTotal: instTotal,
                totalAmount: totalAmt != null ? String(totalAmt) : null,
              }
            : item,
        ),
      );
      setEditingTxId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setUpdatingTx(false);
    }
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Export CSV                                              */
  /* ──────────────────────────────────────────────────────── */

  function handleExport() {
    const header = [
      t('common.date'),
      t('common.description'),
      t('common.amount'),
      t('common.category'),
      t('common.account'),
      t('common.type'),
    ].join(',');

    const rows = sortedItems.map((tx) => {
      const amt = Number(tx.amount);
      const catName = tx.category
        ? getCategoryDisplayName(tx.category.name, tx.category.slug, t)
        : '';
      const accName = tx.account?.name || '';
      const type = amt >= 0 ? t('transactionsPage.income') : t('transactionsPage.expense');
      return [
        tx.date?.slice(0, 10) ?? '',
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        amt,
        `"${catName}"`,
        `"${accName}"`,
        `"${type}"`,
      ].join(',');
    });

    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Pagination info                                         */
  /* ──────────────────────────────────────────────────────── */

  const totalPages = Math.max(1, Math.ceil(total / limit));

  /* ──────────────────────────────────────────────────────── */
  /*  Filter for projects based on selected client            */
  /* ──────────────────────────────────────────────────────── */

  const filteredProjects = useMemo(() => {
    if (!clientId) return projectsList;
    return projectsList.filter((p) => p.clientId === clientId);
  }, [projectsList, clientId]);

  const addFormProjects = useMemo(() => {
    if (!addTxForm.clientId) return projectsList;
    return projectsList.filter((p) => p.clientId === addTxForm.clientId);
  }, [projectsList, addTxForm.clientId]);

  const editFormProjects = useMemo(() => {
    if (!editTxForm.clientId) return projectsList;
    return projectsList.filter((p) => p.clientId === editTxForm.clientId);
  }, [projectsList, editTxForm.clientId]);

  /* ──────────────────────────────────────────────────────── */
  /*  Render                                                  */
  /* ──────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t('transactions.title')}
          <HelpTooltip text={t('help.transactions')} className="ms-2" />
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={() => setShowVoiceModal(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            {t('voice.title')}
          </button>
          <button
            type="button"
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={handleExport}
            disabled={items.length === 0}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('common.export')}
          </button>
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={() => {
              setShowAddTx(true);
              if (accountsList.length > 0 && !addTxForm.accountId) {
                setAddTxForm((f) => ({ ...f, accountId: accountsList[0].id }));
              }
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('transactionsPage.addTransaction')}
          </button>
        </div>
      </div>

      {/* ── Filters Card ── */}
      <div className="card p-4 space-y-4">
        {/* Row 1: Date range + Search */}
        <div className="flex flex-wrap gap-4 items-center">
          <DateRangePicker from={from} to={to} onChange={handleDateRangeChange} />
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
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

        {/* Row 2: Filter dropdowns */}
        <div className="flex flex-wrap gap-3 items-center pt-3 border-t border-[var(--border)]">
          {/* Account */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500">{t('common.account')}:</span>
            <select
              className="input w-auto min-w-[130px] py-1.5 text-sm"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.allAccounts')}</option>
              {accountsList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500">{t('common.category')}:</span>
            <select
              className="input w-auto min-w-[130px] py-1.5 text-sm"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.allCategories')}</option>
              {categoriesList.map((c) => (
                <option key={c.id} value={c.id}>
                  {getCategoryDisplayName(c.name, c.slug, t)}
                </option>
              ))}
            </select>
          </div>

          {/* Client */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500">{t('common.client')}:</span>
            <select
              className="input w-auto min-w-[120px] py-1.5 text-sm"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setProjectId('');
                setPage(1);
              }}
            >
              <option value="">{t('common.all')}</option>
              {clientsList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Project */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500">{t('common.project')}:</span>
            <select
              className="input w-auto min-w-[120px] py-1.5 text-sm"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.all')}</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500">{t('common.type')}:</span>
            <select
              className="input w-auto min-w-[100px] py-1.5 text-sm"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as '' | 'income' | 'expense');
                setPage(1);
              }}
            >
              <option value="">{t('common.all')}</option>
              <option value="income">{t('transactionsPage.income')}</option>
              <option value="expense">{t('transactionsPage.expense')}</option>
            </select>
          </div>

          {/* Rows per page */}
          <div className="flex items-center gap-1.5 ms-auto">
            <span className="text-xs font-medium text-slate-500">{t('common.rowsPerPage')}:</span>
            <select
              className="input w-auto min-w-[65px] py-1.5 text-sm"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* ── Table Card ── */}
      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          /* ── Empty State ── */
          <div className="py-16 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t('transactions.noTransactionsInRange')}
            </h3>
            <p className="text-sm text-slate-500 mb-4">{t('transactions.expandRangeHint')}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  const n = new Date();
                  const start = new Date(n.getFullYear(), n.getMonth() - 2, 1);
                  setFrom(start.toISOString().slice(0, 10));
                  setTo(n.toISOString().slice(0, 10));
                  setPage(1);
                }}
              >
                {t('transactions.showLast3Months')}
              </button>
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => {
                  setShowAddTx(true);
                  if (accountsList.length > 0 && !addTxForm.accountId)
                    setAddTxForm((f) => ({ ...f, accountId: accountsList[0].id }));
                }}
              >
                {t('transactionsPage.addTransaction')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Bulk Actions Bar ── */}
            {selectedIds.size > 0 && (
              <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-[var(--border)]">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    {t('transactions.selectedCount', { count: selectedIds.size })}
                  </span>
                  <HelpTooltip text={t('help.bulkActions')} className="ms-1" />
                  <div className="flex-1" />
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    onClick={() => {
                      setSelectedIds(new Set());
                      setBulkCategoryId('');
                    }}
                  >
                    {t('transactions.clearSelection')}
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {/* Bulk category */}
                  <select
                    className="input py-1.5 px-2 text-sm min-w-[140px] w-auto"
                    value={bulkCategoryId}
                    onChange={(e) => setBulkCategoryId(e.target.value)}
                    disabled={bulkUpdating}
                  >
                    <option value="">{t('transactions.chooseCategoryForBulk')}</option>
                    {categoriesForSelect.map((c) => (
                      <option key={c.id} value={c.id}>
                        {getCategoryDisplayName(c.name, c.slug, t)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-primary text-xs py-1.5 px-3"
                    disabled={!bulkCategoryId || bulkUpdating}
                    onClick={handleBulkCategoryUpdate}
                  >
                    {bulkUpdating ? t('transactions.updating') : t('transactions.bulkApply')}
                  </button>
                  <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1" />
                  {/* Bulk AI */}
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1.5 px-3"
                    disabled={bulkUpdating}
                    onClick={handleBulkSuggestCategory}
                    title={t('transactions.bulkSuggestCategory')}
                  >
                    {bulkUpdating ? '\u2026' : t('transactions.bulkSuggestCategory')}
                  </button>
                  {/* Bulk flip */}
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1.5 px-3"
                    disabled={bulkUpdating}
                    onClick={handleBulkFlipSign}
                  >
                    {t('transactions.bulkFlipSign')}
                  </button>
                  <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1" />
                  {/* Bulk delete */}
                  <button
                    type="button"
                    className="bg-red-600 hover:bg-red-700 text-white text-xs py-1.5 px-3 rounded-lg transition-colors"
                    disabled={deleting || bulkUpdating}
                    onClick={handleBulkDelete}
                  >
                    {deleting ? t('transactions.deleting') : t('transactions.deleteSelected')}
                  </button>
                </div>
              </div>
            )}

            {/* ── Table ── */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.size === items.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th
                      className="text-end py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors"
                      onClick={() => toggleSort('date')}
                    >
                      {t('common.date')}
                      <SortIcon field="date" />
                    </th>
                    <th
                      className="text-end py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors"
                      onClick={() => toggleSort('description')}
                    >
                      {t('common.description')}
                      <SortIcon field="description" />
                    </th>
                    <th className="text-end py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t('common.category')}
                    </th>
                    <th className="text-end py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t('common.account')}
                    </th>
                    <th className="text-end py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t('common.client')}
                    </th>
                    <th className="text-end py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t('common.project')}
                    </th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t('common.type')}
                    </th>
                    <th
                      className="text-end py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition-colors"
                      onClick={() => toggleSort('amount')}
                    >
                      {t('common.amount')}
                      <SortIcon field="amount" />
                    </th>
                    <th className="text-center py-3 px-3 w-16 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t('transactions.payments')}
                    </th>
                    <th className="text-center py-3 px-3 w-20" aria-label={t('common.actions')}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((tx) => {
                    const amt = Number(tx.amount);
                    const isIncome = amt >= 0;
                    const slug = tx.category?.slug || 'other';
                    const bgColor = CATEGORY_ICON_COLORS[slug] || '#94a3b8';
                    const icon = CATEGORY_ICONS[slug] || '\u{1F4C4}';

                    return (
                      <tr
                        key={tx.id}
                        className={`border-b border-[var(--border)] last:border-0 transition-colors ${
                          isIncome
                            ? 'bg-green-50/30 dark:bg-green-900/5 hover:bg-green-50/60 dark:hover:bg-green-900/10'
                            : 'bg-red-50/20 dark:bg-red-900/5 hover:bg-red-50/50 dark:hover:bg-red-900/10'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(tx.id)}
                            onChange={() => toggleSelect(tx.id)}
                            className="rounded border-slate-300"
                          />
                        </td>

                        {/* Date */}
                        <td className="py-3 px-3 text-end text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatDate(tx.displayDate ?? tx.date, locale)}
                          {tx.firstPaymentDate && tx.firstPaymentDate !== (tx.displayDate ?? tx.date) && (
                            <span className="block text-xs text-slate-400 dark:text-slate-500">
                              {t('transactions.firstChargeDate')}: {formatDate(tx.firstPaymentDate, locale)}
                            </span>
                          )}
                        </td>

                        {/* Description + category icon */}
                        <td className="py-3 px-3 text-end">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="font-medium text-sm truncate max-w-[200px]" title={tx.description}>
                              {tx.description}
                            </span>
                            <span
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs shrink-0"
                              style={{ backgroundColor: bgColor + '20', color: bgColor }}
                              title={tx.category?.name || slug}
                            >
                              {icon}
                            </span>
                          </div>
                        </td>

                        {/* Category quick-change */}
                        <td className="py-3 px-3 text-end">
                          <div className="flex items-center gap-1 justify-end">
                            <select
                              className="input py-1 px-2 text-xs min-w-[110px]"
                              value={tx.category?.id ?? ''}
                              onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                              disabled={updatingCategoryId === tx.id}
                              title={t('transactions.changeCategory')}
                            >
                              <option value="">{t('common.noCategory')}</option>
                              {categoriesForSelect.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {getCategoryDisplayName(c.name, c.slug, t)}
                                </option>
                              ))}
                              <option value="__add__">{t('transactions.addNewCategory')}</option>
                            </select>
                            <button
                              type="button"
                              className="p-1 rounded border border-[var(--border)] hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-40 transition-colors"
                              onClick={() => handleAiSuggestCategory(tx)}
                              disabled={!tx.description.trim() || suggestingCategoryTxId === tx.id}
                              title={t('transactionsPage.aiSuggestCategory')}
                            >
                              {suggestingCategoryTxId === tx.id ? (
                                <span className="inline-block w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500">
                                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                  <path d="M2 17l10 5 10-5" />
                                  <path d="M2 12l10 5 10-5" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Account */}
                        <td className="py-3 px-3 text-end text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {tx.account?.name || '\u2013'}
                        </td>

                        {/* Client */}
                        <td className="py-3 px-3 text-end text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {tx.clientName || '\u2013'}
                        </td>

                        {/* Project */}
                        <td className="py-3 px-3 text-end text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {tx.projectName || '\u2013'}
                        </td>

                        {/* Type badge */}
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              isIncome
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}
                          >
                            {isIncome ? t('transactionsPage.income') : t('transactionsPage.expense')}
                          </span>
                        </td>

                        {/* Amount */}
                        <td
                          dir="ltr"
                          className={`py-3 px-3 text-right font-bold whitespace-nowrap tabular-nums ${
                            isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {isIncome ? '+' : ''}
                          {formatCurrency(amt, locale)}
                        </td>

                        {/* Installment */}
                        <td className="py-3 px-3 text-center text-xs text-slate-500 whitespace-nowrap">
                          {tx.installmentCurrent != null && tx.installmentTotal != null ? (
                            <span
                              dir="ltr"
                              className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium"
                            >
                              {tx.installmentCurrent}/{tx.installmentTotal}
                            </span>
                          ) : tx.isRecurring ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M17 1l4 4-4 4" />
                                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                <path d="M7 23l-4-4 4-4" />
                                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                              </svg>
                            </span>
                          ) : (
                            '\u2013'
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                              onClick={() => openEditTx(tx)}
                              title={t('transactionsPage.editTransaction')}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                              onClick={() => handleFlipSign(tx)}
                              disabled={!!flippingTxId}
                              title={t('transactionsPage.flipSign')}
                            >
                              {flippingTxId === tx.id ? (
                                <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="17 1 21 5 17 9" />
                                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                  <polyline points="7 23 3 19 7 15" />
                                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                                </svg>
                              )}
                            </button>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              onClick={() => handleDeleteOne(tx.id)}
                              disabled={deleting}
                              title={t('common.delete')}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {total > limit && (
              <div className="flex flex-wrap justify-center items-center gap-3 p-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  className="btn-secondary text-sm py-1.5"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('common.previous')}
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        className={`w-8 h-8 text-sm rounded-lg transition-colors ${
                          page === pageNum
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn-secondary text-sm py-1.5"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('common.next')}
                </button>
                <span className="text-xs text-slate-500">
                  ({total} {t('common.total')})
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/*  Add Category Modal                                */}
      {/* ══════════════════════════════════════════════════ */}
      {showAddCategory && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowAddCategory(false);
            setAddCategoryForTxId(null);
            setNewCategoryName('');
          }}
        >
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">{t('transactions.addCategoryTitle')}</h3>
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
                  onClick={() => {
                    setShowAddCategory(false);
                    setAddCategoryForTxId(null);
                    setNewCategoryName('');
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/*  Add Transaction Modal                             */}
      {/* ══════════════════════════════════════════════════ */}
      {showAddTx && (
        <div className="modal-overlay" onClick={() => setShowAddTx(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{t('transactionsPage.addTransaction')}</h3>
              <button type="button" onClick={() => setShowAddTx(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="space-y-4">
              {/* Type toggle */}
              <div className="flex rounded-xl overflow-hidden border border-[var(--border)]">
                <button
                  type="button"
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    addTxForm.type === 'expense'
                      ? 'bg-red-500 text-white'
                      : 'bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setAddTxForm((f) => ({ ...f, type: 'expense' }))}
                >
                  {t('transactionsPage.expense')}
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    addTxForm.type === 'income'
                      ? 'bg-green-500 text-white'
                      : 'bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setAddTxForm((f) => ({ ...f, type: 'income' }))}
                >
                  {t('transactionsPage.income')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Date */}
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
                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.amount')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input w-full text-lg font-bold"
                    value={addTxForm.amount}
                    onChange={(e) => setAddTxForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.description')}</label>
                <input
                  type="text"
                  className="input w-full"
                  value={addTxForm.description}
                  onChange={(e) => setAddTxForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={
                    addTxForm.type === 'income' ? t('income.descriptionPlaceholder') : t('expenses.descriptionPlaceholder')
                  }
                />
              </div>

              {/* Account */}
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

              {/* Category + AI suggest */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.category')}</label>
                <div className="flex gap-2">
                  <select
                    className="input flex-1"
                    value={addTxForm.categoryId}
                    onChange={(e) => setAddTxForm((f) => ({ ...f, categoryId: e.target.value }))}
                  >
                    <option value="">{t('common.noCategory')}</option>
                    {(addTxForm.type === 'income'
                      ? categoriesList.filter((c) => c.isIncome)
                      : categoriesList.filter((c) => !c.isIncome)
                    ).map((c) => (
                      <option key={c.id} value={c.id}>
                        {getCategoryDisplayName(c.name, c.slug, t)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary text-sm whitespace-nowrap flex items-center gap-1"
                    onClick={handleSuggestCategoryForAdd}
                    disabled={!addTxForm.description.trim() || suggestingCategory}
                  >
                    {suggestingCategory ? (
                      <span className="inline-block w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                    )}
                    AI
                  </button>
                </div>
                {suggestedCatHint && (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                    AI {t('transactionsPage.suggestCategory')}: {suggestedCatHint}
                  </p>
                )}
              </div>

              {/* Client (optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('common.client')}
                    <span className="text-slate-400 text-xs ms-1">({t('common.optional')})</span>
                  </label>
                  <select
                    className="input w-full"
                    value={addTxForm.clientId}
                    onChange={(e) => setAddTxForm((f) => ({ ...f, clientId: e.target.value, projectId: '' }))}
                  >
                    <option value="">{t('common.none')}</option>
                    {clientsList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {/* Project (optional) */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('common.project')}
                    <span className="text-slate-400 text-xs ms-1">({t('common.optional')})</span>
                  </label>
                  <select
                    className="input w-full"
                    value={addTxForm.projectId}
                    onChange={(e) => setAddTxForm((f) => ({ ...f, projectId: e.target.value }))}
                  >
                    <option value="">{t('common.none')}</option>
                    {addFormProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* VAT */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('common.vat')}</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addTxForm.isVatIncluded}
                        onChange={(e) => setAddTxForm((f) => ({ ...f, isVatIncluded: e.target.checked }))}
                        className="rounded border-slate-300"
                      />
                      {t('transactions.vatIncluded')}
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">{t('transactions.vatAmount')}:</span>
                  <input
                    type="number"
                    step="0.01"
                    className="input w-28 py-1 text-sm"
                    value={addTxForm.vatAmount}
                    onChange={(e) => setAddTxForm((f) => ({ ...f, vatAmount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addTxForm.isTaxDeductible}
                    onChange={(e) => setAddTxForm((f) => ({ ...f, isTaxDeductible: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  {t('transactions.taxDeductible')}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addTxForm.isRecurring}
                    onChange={(e) => setAddTxForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  {t('transactions.recurring')}
                </label>
              </div>

              {/* Installments */}
              {addTxForm.isRecurring && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs font-medium text-slate-500 mb-2">{t('transactions.installments')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">{t('transactions.installmentCurrentShort')}</label>
                      <input
                        type="number"
                        min="1"
                        className="input w-full py-1.5 text-sm"
                        value={addTxForm.installmentCurrent}
                        onChange={(e) => setAddTxForm((f) => ({ ...f, installmentCurrent: e.target.value.replace(/\D/g, '') }))}
                        placeholder="2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">{t('transactions.installmentTotalShort')}</label>
                      <input
                        type="number"
                        min="1"
                        className="input w-full py-1.5 text-sm"
                        value={addTxForm.installmentTotal}
                        onChange={(e) => setAddTxForm((f) => ({ ...f, installmentTotal: e.target.value.replace(/\D/g, '') }))}
                        placeholder="3"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">{t('transactions.totalAmountShort')}</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input w-full py-1.5 text-sm"
                        value={addTxForm.totalAmount}
                        onChange={(e) => setAddTxForm((f) => ({ ...f, totalAmount: e.target.value }))}
                        placeholder="1,950"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
                <textarea
                  className="input w-full resize-none"
                  rows={2}
                  value={addTxForm.notes}
                  onChange={(e) => setAddTxForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder={t('common.optional')}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={addingTx}>
                  {addingTx ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t('common.loading')}
                    </span>
                  ) : (
                    t('common.save')
                  )}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowAddTx(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/*  Edit Transaction Modal                            */}
      {/* ══════════════════════════════════════════════════ */}
      {editingTxId && (
        <div className="modal-overlay" onClick={() => setEditingTxId(null)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{t('transactionsPage.editTransaction')}</h3>
              <button type="button" onClick={() => setEditingTxId(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <form onSubmit={handleSaveEditTx} className="space-y-4">
              {/* Type toggle */}
              <div className="flex rounded-xl overflow-hidden border border-[var(--border)]">
                <button
                  type="button"
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    editTxForm.type === 'expense'
                      ? 'bg-red-500 text-white'
                      : 'bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setEditTxForm((f) => ({ ...f, type: 'expense' }))}
                >
                  {t('transactionsPage.expense')}
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    editTxForm.type === 'income'
                      ? 'bg-green-500 text-white'
                      : 'bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setEditTxForm((f) => ({ ...f, type: 'income' }))}
                >
                  {t('transactionsPage.income')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.date')}</label>
                  <input type="date" className="input w-full" value={editTxForm.date} onChange={(e) => setEditTxForm((f) => ({ ...f, date: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.amount')}</label>
                  <input type="number" step="0.01" min="0" className="input w-full text-lg font-bold" value={editTxForm.amount} onChange={(e) => setEditTxForm((f) => ({ ...f, amount: e.target.value }))} required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('common.description')}</label>
                <input type="text" className="input w-full" value={editTxForm.description} onChange={(e) => setEditTxForm((f) => ({ ...f, description: e.target.value }))} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('common.account')}</label>
                <select className="input w-full" value={editTxForm.accountId} onChange={(e) => setEditTxForm((f) => ({ ...f, accountId: e.target.value }))} required>
                  <option value="">{t('common.chooseAccount')}</option>
                  {accountsList.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('common.category')}</label>
                <select className="input w-full" value={editTxForm.categoryId} onChange={(e) => setEditTxForm((f) => ({ ...f, categoryId: e.target.value }))}>
                  <option value="">{t('common.noCategory')}</option>
                  {categoriesList.map((c) => (
                    <option key={c.id} value={c.id}>{getCategoryDisplayName(c.name, c.slug, t)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.client')} <span className="text-slate-400 text-xs">({t('common.optional')})</span></label>
                  <select className="input w-full" value={editTxForm.clientId} onChange={(e) => setEditTxForm((f) => ({ ...f, clientId: e.target.value, projectId: '' }))}>
                    <option value="">{t('common.none')}</option>
                    {clientsList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.project')} <span className="text-slate-400 text-xs">({t('common.optional')})</span></label>
                  <select className="input w-full" value={editTxForm.projectId} onChange={(e) => setEditTxForm((f) => ({ ...f, projectId: e.target.value }))}>
                    <option value="">{t('common.none')}</option>
                    {editFormProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* VAT */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('common.vat')}</span>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={editTxForm.isVatIncluded} onChange={(e) => setEditTxForm((f) => ({ ...f, isVatIncluded: e.target.checked }))} className="rounded border-slate-300" />
                    {t('transactions.vatIncluded')}
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">{t('transactions.vatAmount')}:</span>
                  <input type="number" step="0.01" className="input w-28 py-1 text-sm" value={editTxForm.vatAmount} onChange={(e) => setEditTxForm((f) => ({ ...f, vatAmount: e.target.value }))} />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editTxForm.isTaxDeductible} onChange={(e) => setEditTxForm((f) => ({ ...f, isTaxDeductible: e.target.checked }))} className="rounded border-slate-300" />
                  {t('transactions.taxDeductible')}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editTxForm.isRecurring} onChange={(e) => setEditTxForm((f) => ({ ...f, isRecurring: e.target.checked }))} className="rounded border-slate-300" />
                  {t('transactions.recurring')}
                </label>
              </div>

              {/* Installments */}
              {editTxForm.isRecurring && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs font-medium text-slate-500 mb-2">{t('transactions.installments')}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">{t('transactions.installmentCurrentShort')}</label>
                      <input type="number" min="1" className="input w-full py-1.5 text-sm" value={editTxForm.installmentCurrent} onChange={(e) => setEditTxForm((f) => ({ ...f, installmentCurrent: e.target.value.replace(/\D/g, '') }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">{t('transactions.installmentTotalShort')}</label>
                      <input type="number" min="1" className="input w-full py-1.5 text-sm" value={editTxForm.installmentTotal} onChange={(e) => setEditTxForm((f) => ({ ...f, installmentTotal: e.target.value.replace(/\D/g, '') }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">{t('transactions.totalAmountShort')}</label>
                      <input type="number" step="0.01" className="input w-full py-1.5 text-sm" value={editTxForm.totalAmount} onChange={(e) => setEditTxForm((f) => ({ ...f, totalAmount: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
                <textarea className="input w-full resize-none" rows={2} value={editTxForm.notes} onChange={(e) => setEditTxForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={updatingTx}>
                  {updatingTx ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t('common.loading')}
                    </span>
                  ) : (
                    t('common.save')
                  )}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setEditingTxId(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/*  Voice Transaction (FAB + Modal)                   */}
      {/* ══════════════════════════════════════════════════ */}
      <VoiceTransaction />
    </div>
  );
}
