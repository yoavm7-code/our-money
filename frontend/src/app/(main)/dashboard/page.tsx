'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboard, accounts, categories, users, type FixedItem, type WidgetConfig } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import DateRangePicker from '@/components/DateRangePicker';
import SmartTip from '@/components/SmartTip';
import WidgetSettings from '@/components/dashboard/WidgetSettings';
import { DEFAULT_WIDGETS } from '@/components/dashboard/defaults';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

/* ─── constants ─── */
const CATEGORY_COLORS: Record<string, string> = {
  credit_charges: '#ef4444', transfers: '#f97316', standing_order: '#f59e0b',
  loan_payment: '#eab308', loan_interest: '#d97706', pension: '#84cc16',
  insurance: '#22c55e', utilities: '#14b8a6', groceries: '#06b6d4',
  transport: '#0ea5e9', healthcare: '#3b82f6', dining: '#6366f1',
  shopping: '#8b5cf6', entertainment: '#a855f7', education: '#d946ef',
  bank_fees: '#ec4899', subscriptions: '#f43f5e', childcare: '#fb923c',
  pets: '#a3e635', gifts: '#2dd4bf', savings: '#38bdf8',
  investment: '#818cf8', salary: '#34d399', income: '#4ade80',
  rent: '#fb7185', online_shopping: '#c084fc', other: '#94a3b8',
};
const FALLBACK_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#ec4899', '#f43f5e', '#0ea5e9', '#d946ef',
];

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

type SummaryData = Awaited<ReturnType<typeof dashboard.summary>>;
type TrendsData = Awaited<ReturnType<typeof dashboard.trends>>;
type RecentTxData = Awaited<ReturnType<typeof dashboard.recentTransactions>>;

/* ─── Sortable widget wrapper ─── */
function SortableWidget({
  id, editMode, onEdit, children, color, size,
}: {
  id: string; editMode: boolean; onEdit: () => void;
  children: React.ReactNode; color?: string; size: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const colSpan = size === 'lg' ? 'col-span-full' : size === 'md' ? 'sm:col-span-2 lg:col-span-1' : '';
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card relative overflow-hidden ${colSpan} ${editMode ? 'ring-2 ring-primary-300 dark:ring-primary-700 cursor-grab' : ''}`}
    >
      {color && <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />}
      {editMode && (
        <>
          <button
            type="button"
            className="absolute top-2 end-2 z-10 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            onClick={onEdit}
            title="Edit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 start-2 z-10 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center cursor-grab active:cursor-grabbing"
            title="Drag"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>
          </div>
        </>
      )}
      {children}
    </div>
  );
}

/* ─── Main page ─── */
export default function DashboardPage() {
  const { t, locale } = useTranslation();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trends, setTrends] = useState<TrendsData | null>(null);
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
  const [recentTx, setRecentTx] = useState<RecentTxData | null>(null);

  // Widget config
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [editMode, setEditMode] = useState(false);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null | 'new'>(null);
  const configLoaded = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load saved config
  useEffect(() => {
    users.getDashboardConfig()
      .then((cfg) => {
        if (cfg && Array.isArray(cfg.widgets) && cfg.widgets.length > 0) {
          setWidgets(cfg.widgets);
        }
        configLoaded.current = true;
      })
      .catch(() => { configLoaded.current = true; });
  }, []);

  // Auto-save config (debounced)
  const saveConfig = useCallback((w: WidgetConfig[]) => {
    if (!configLoaded.current) return;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      users.saveDashboardConfig({ widgets: w }).catch(() => {});
    }, 1000);
  }, []);

  // Data loading
  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    setFrom(start.toISOString().slice(0, 10));
    setTo(now.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    accounts.list().then((a) => setAccountsList(a)).catch(() => {});
    categories.list().then((c) => setCategoriesList(c)).catch(() => {});
    dashboard.recentTransactions().then(setRecentTx).catch(() => {});
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    Promise.all([
      dashboard.summary(from, to, accountId || undefined, categoryId || undefined),
      dashboard.trends(from, to, 'month', accountId || undefined, categoryId || undefined),
    ])
      .then(([s, tr]) => { setSummary(s); setTrends(tr); })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.failedToLoad')))
      .finally(() => setLoading(false));
  }, [from, to, accountId, categoryId, t]);

  const handleDateRangeChange = useCallback((f: string, t2: string) => {
    setFrom(f); setTo(t2);
  }, []);

  useEffect(() => {
    if (!fixedExpensesOpen || fixedExpensesList !== null) return;
    setFixedExpensesLoading(true);
    dashboard.fixedExpenses().then(setFixedExpensesList).catch(() => {}).finally(() => setFixedExpensesLoading(false));
  }, [fixedExpensesOpen, fixedExpensesList]);

  useEffect(() => {
    if (!fixedIncomeOpen || fixedIncomeList !== null) return;
    setFixedIncomeLoading(true);
    dashboard.fixedIncome().then(setFixedIncomeList).catch(() => {}).finally(() => setFixedIncomeLoading(false));
  }, [fixedIncomeOpen, fixedIncomeList]);

  /* ─── helpers ─── */
  const getCatName = (name: string | undefined, slug: string | undefined) => {
    if (slug) { const tr = t('categories.' + slug); if (tr !== 'categories.' + slug) return tr; }
    if (!name) return slug ? slug.replace(/_/g, ' ') : t('common.other');
    return name;
  };

  const MAX_PIE_CATEGORIES = 8;

  const makePieData = (variant: string) => {
    const source = variant === 'income' ? summary?.incomeByCategory : summary?.spendingByCategory;
    if (!source) return [];
    const mapped = source.map((c, i) => {
      const slug = (c.category as { slug?: string })?.slug;
      const color = c.category?.color ?? (slug ? CATEGORY_COLORS[slug] : undefined) ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      return { name: getCatName(c.category?.name, slug), value: c.total, color };
    });
    if (mapped.length <= MAX_PIE_CATEGORIES) return mapped;
    const top = mapped.slice(0, MAX_PIE_CATEGORIES - 1);
    const rest = mapped.slice(MAX_PIE_CATEGORIES - 1);
    const otherValue = rest.reduce((sum, c) => sum + c.value, 0);
    top.push({ name: t('common.other'), value: otherValue, color: '#94a3b8' });
    return top;
  };

  const getMetricValue = (metric: string): number => {
    if (!summary) return 0;
    switch (metric) {
      case 'totalBalance': return summary.totalBalance;
      case 'income': return summary.income;
      case 'expenses': return summary.expenses;
      case 'netSavings': return summary.income - summary.expenses;
      case 'transactionCount': return summary.transactionCount;
      case 'fixedExpensesSum': return summary.fixedExpensesSum ?? 0;
      case 'fixedIncomeSum': return summary.fixedIncomeSum ?? 0;
      default: return 0;
    }
  };

  const getMetricLabel = (metric: string): string => {
    return t(`dashboard.metric_${metric}`);
  };

  /* ─── DnD handler ─── */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setWidgets((prev) => {
        const oldIndex = prev.findIndex((w) => w.id === active.id);
        const newIndex = prev.findIndex((w) => w.id === over.id);
        const next = arrayMove(prev, oldIndex, newIndex);
        saveConfig(next);
        return next;
      });
    }
  };

  /* ─── Widget edit handlers ─── */
  const handleWidgetSave = (updated: WidgetConfig) => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === updated.id);
      const next = idx >= 0 ? prev.map((w) => (w.id === updated.id ? updated : w)) : [...prev, updated];
      saveConfig(next);
      return next;
    });
    setEditingWidget(null);
  };

  const handleWidgetDelete = () => {
    if (!editingWidget || editingWidget === 'new') return;
    setWidgets((prev) => {
      const next = prev.filter((w) => w.id !== (editingWidget as WidgetConfig).id);
      saveConfig(next);
      return next;
    });
    setEditingWidget(null);
  };

  const handleResetLayout = () => {
    setWidgets(DEFAULT_WIDGETS);
    saveConfig(DEFAULT_WIDGETS);
  };

  /* ─── Render widget content ─── */
  const renderWidget = (w: WidgetConfig) => {
    switch (w.type) {
      case 'stat': {
        const metric = w.metric ?? 'totalBalance';
        const value = getMetricValue(metric);
        const label = w.title || getMetricLabel(metric);
        const isCurrency = metric !== 'transactionCount';
        const colorClass =
          metric === 'income' || metric === 'fixedIncomeSum' ? 'text-green-600 dark:text-green-400'
          : metric === 'expenses' || metric === 'fixedExpensesSum' ? 'text-red-600 dark:text-red-400'
          : metric === 'netSavings' ? (value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
          : '';
        return (
          <div className="pt-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${colorClass}`}>
              {isCurrency ? formatCurrency(value, locale) : value.toLocaleString()}
            </p>
          </div>
        );
      }

      case 'bar-chart': {
        const barData = trends ?? [];
        return (
          <>
            <h2 className="font-semibold mb-4">{w.title || t('dashboard.trendsOverTime')}</h2>
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
          </>
        );
      }

      case 'pie-chart': {
        const variant = w.variant ?? 'spending';
        const data = makePieData(variant);
        const title = w.title || (variant === 'income' ? t('dashboard.incomeByCategory') : t('dashboard.spendingByCategory'));
        const noDataKey = variant === 'income' ? 'dashboard.noIncomeData' : 'dashboard.noSpendingData';
        return (
          <>
            <h2 className="font-semibold mb-4">{title}</h2>
            {data.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={data} cx="40%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} dataKey="value" nameKey="name">
                    {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v, locale)} contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)' }} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ paddingRight: 8, maxHeight: 280, overflowY: 'auto', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 py-8 text-center">{t(noDataKey)}</p>
            )}
          </>
        );
      }

      case 'fixed-list': {
        const isExpenses = (w.variant ?? 'expenses') === 'expenses';
        const isOpen = isExpenses ? fixedExpensesOpen : fixedIncomeOpen;
        const setOpen = isExpenses ? setFixedExpensesOpen : setFixedIncomeOpen;
        const listLoading = isExpenses ? fixedExpensesLoading : fixedIncomeLoading;
        const list = isExpenses ? fixedExpensesList : fixedIncomeList;
        const label = w.title || (isExpenses ? t('dashboard.fixedExpenses') : t('dashboard.fixedIncome'));
        const sumValue = isExpenses ? (summary?.fixedExpensesSum ?? 0) : (summary?.fixedIncomeSum ?? 0);
        const valueColor = isExpenses ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
        return (
          <>
            <button
              type="button"
              className="w-full flex items-center justify-between text-right"
              onClick={() => setOpen((o: boolean) => !o)}
              aria-expanded={isOpen}
            >
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
                <p className={`text-xl font-bold mt-1 ${valueColor}`}>{formatCurrency(sumValue, locale)}</p>
              </div>
              <span className={`shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </button>
            {isOpen && (
              <div className="mt-4 pt-4 border-t border-[var(--border)] animate-slideDown">
                {listLoading ? (
                  <div className="flex items-center justify-center py-6 gap-2 text-slate-500">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <span>{t('common.loading')}</span>
                  </div>
                ) : list && list.length > 0 ? (
                  <ul className="space-y-2 max-h-60 overflow-y-auto">
                    {list.map((item) => (
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
          </>
        );
      }

      case 'recent-tx': {
        return (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{w.title || t('dashboard.recentTransactions')}</h2>
              <a href="/transactions" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                {t('dashboard.viewAll')}
              </a>
            </div>
            {recentTx && recentTx.length > 0 ? (
              <ul className="space-y-1">
                {recentTx.map((tx) => {
                  const isIncome = tx.amount > 0;
                  const catKey = tx.categorySlug ? `categories.${tx.categorySlug}` : '';
                  const catLabel = catKey ? (t(catKey) !== catKey ? t(catKey) : tx.categoryName) : tx.categoryName;
                  return (
                    <li key={tx.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0 gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{tx.description}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(tx.date + 'T00:00:00').toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'short' })}
                          {catLabel && <span> · {catLabel}</span>}
                          {tx.accountName && <span> · {tx.accountName}</span>}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold whitespace-nowrap ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isIncome ? '+' : ''}{formatCurrency(tx.amount, locale)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-slate-500 text-sm py-4 text-center">{t('dashboard.noRecentTransactions')}</p>
            )}
          </>
        );
      }

      default:
        return null;
    }
  };

  /* ─── Render ─── */
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

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker from={from} to={to} onChange={handleDateRangeChange} />
          <select className="input w-auto min-w-[160px]" value={accountId} onChange={(e) => setAccountId(e.target.value)} title={t('common.accounts')}>
            <option value="">{t('common.allAccounts')}</option>
            {accountsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="input w-auto min-w-[140px]" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} title={t('common.categories')}>
            <option value="">{t('common.allCategories')}</option>
            {categoriesList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Edit mode toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            editMode
              ? 'bg-primary-500 text-white shadow-md'
              : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          onClick={() => setEditMode((m) => !m)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          {t('dashboard.customize')}
        </button>
        {editMode && (
          <>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
              onClick={() => setEditingWidget('new')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {t('dashboard.addWidget')}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              onClick={handleResetLayout}
            >
              {t('dashboard.resetLayout')}
            </button>
          </>
        )}
      </div>

      {/* Widgets grid */}
      {summary && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {widgets.map((w) => (
                <SortableWidget
                  key={w.id}
                  id={w.id}
                  editMode={editMode}
                  onEdit={() => setEditingWidget(w)}
                  color={w.color}
                  size={w.size}
                >
                  {renderWidget(w)}
                </SortableWidget>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <SmartTip />

      {/* Widget settings modal */}
      {editingWidget && (
        <WidgetSettings
          widget={editingWidget === 'new' ? null : editingWidget}
          onSave={handleWidgetSave}
          onDelete={editingWidget !== 'new' ? handleWidgetDelete : undefined}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
}
