'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dashboard,
  accounts,
  categories,
  users,
  transactions as txApi,
  forex,
  goals as goalsApi,
  budgets as budgetsApi,
  recurring as recurringApi,
  invoices as invoicesApi,
  clients as clientsApi,
  projects as projectsApi,
  reports as reportsApi,
  type FixedItem,
  type WidgetConfig,
  type ForexAccountItem,
  type GoalItem,
  type BudgetItem,
  type RecurringPatternItem,
  type InvoiceItem,
  type InvoiceSummary,
  type ClientItem,
  type ProjectItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import DateRangePicker from '@/components/DateRangePicker';
import SmartTip from '@/components/SmartTip';
import HelpTooltip from '@/components/HelpTooltip';
import WidgetSettings from '@/components/dashboard/WidgetSettings';
import { DEFAULT_WIDGETS } from '@/components/dashboard/defaults';
import { getQuickRangeDates } from '@/components/DateRangePicker';
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
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from 'recharts';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

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

const CLIENT_COLORS = [
  '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e',
  '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899',
  '#8b5cf6', '#a855f7', '#06b6d4', '#d946ef', '#f43f5e',
];

function formatCurrency(n: number, locale: string, currency = 'ILS') {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function formatNumber(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL').format(n);
}

type SummaryData = Awaited<ReturnType<typeof dashboard.summary>>;
type TrendsData = Awaited<ReturnType<typeof dashboard.trends>>;
type RecentTxData = Awaited<ReturnType<typeof dashboard.recentTransactions>>;
type ForecastData = Awaited<ReturnType<typeof reportsApi.getForecast>>;
type ClientRevenueData = Awaited<ReturnType<typeof reportsApi.getClientRevenue>>;

/* ------------------------------------------------------------------ */
/* Stat card background helper                                        */
/* ------------------------------------------------------------------ */

function getStatCardClass(metric?: string): string {
  switch (metric) {
    case 'currentBalance': case 'totalBalance': return 'stat-card-blue';
    case 'income': case 'fixedIncomeSum': return 'stat-card-green';
    case 'expenses': case 'fixedExpensesSum': return 'stat-card-red';
    case 'creditCardCharges': return 'stat-card-pink';
    case 'netSavings': case 'monthlyProfit': return 'stat-card-purple';
    case 'transactionCount': return 'stat-card-amber';
    case 'unpaidInvoices': return 'stat-card-cyan';
    case 'overdueInvoices': return 'stat-card-pink';
    default: return '';
  }
}

/* ------------------------------------------------------------------ */
/* Skeleton Components                                                 */
/* ------------------------------------------------------------------ */

function SkeletonStatCard() {
  return (
    <div className="card animate-pulse">
      <div className="skeleton h-4 w-24 mb-3" />
      <div className="skeleton h-8 w-32 mb-2" />
      <div className="skeleton h-3 w-20" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="card animate-pulse col-span-full">
      <div className="skeleton h-5 w-40 mb-4" />
      <div className="skeleton h-64 w-full rounded-xl" />
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="card animate-pulse">
      <div className="skeleton h-5 w-36 mb-4" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex justify-between py-3 border-b border-[var(--border)] last:border-0">
          <div>
            <div className="skeleton h-4 w-32 mb-1" />
            <div className="skeleton h-3 w-20" />
          </div>
          <div className="skeleton h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fadeIn">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <SkeletonStatCard key={i} />
      ))}
      <SkeletonChart />
      <SkeletonList />
      <SkeletonList />
      <SkeletonChart />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sortable widget wrapper                                             */
/* ------------------------------------------------------------------ */

function SortableWidget({
  id, editMode, onEdit, children, size, statMetric, widgetType,
}: {
  id: string; editMode: boolean; onEdit: () => void;
  children: React.ReactNode; size: string;
  statMetric?: string; widgetType?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const colSpan = size === 'lg' ? 'col-span-full'
    : size === 'md' ? 'sm:col-span-2 lg:col-span-1'
    : '';
  const statBgClass = widgetType === 'stat' ? getStatCardClass(statMetric) : '';
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card relative overflow-hidden group ${colSpan} ${statBgClass} ${
        editMode ? 'ring-2 ring-primary-300 dark:ring-primary-700 cursor-grab' : ''
      } hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200`}
    >
      {editMode && (
        <>
          <button
            type="button"
            className="absolute top-2 end-2 z-10 w-7 h-7 rounded-full bg-white/80 dark:bg-slate-700 flex items-center justify-center hover:bg-white dark:hover:bg-slate-600 transition-colors shadow-sm"
            onClick={onEdit}
            title="Edit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 start-2 z-10 w-7 h-7 rounded-full bg-white/80 dark:bg-slate-700 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm"
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

/* ------------------------------------------------------------------ */
/* Widget Visibility Panel                                             */
/* ------------------------------------------------------------------ */

function WidgetVisibilityPanel({
  widgets,
  hiddenWidgetIds,
  onToggle,
  onResetDefaults,
  onClose,
  t,
}: {
  widgets: WidgetConfig[];
  hiddenWidgetIds: Set<string>;
  onToggle: (id: string) => void;
  onResetDefaults: () => void;
  onClose: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-scaleIn max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('dashboard.widgetVisibility')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
          {widgets.map((w) => {
            const isHidden = hiddenWidgetIds.has(w.id);
            const label = w.title || getWidgetDefaultTitle(w, t);
            return (
              <button
                key={w.id}
                type="button"
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  isHidden
                    ? 'opacity-50 hover:bg-slate-100 dark:hover:bg-slate-800'
                    : 'hover:bg-primary-50 dark:hover:bg-primary-950/30'
                }`}
                onClick={() => onToggle(w.id)}
              >
                <span className="font-medium">{label}</span>
                <div className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${
                  isHidden ? 'bg-slate-200 dark:bg-slate-700' : 'bg-primary-500'
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    isHidden ? '' : 'translate-x-4 rtl:-translate-x-4'
                  }`} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border)]">
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            onClick={onResetDefaults}
          >
            {t('dashboard.resetToDefaults')}
          </button>
          <button
            type="button"
            className="btn-primary text-sm py-2 px-4"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helper: get default widget title from type                         */
/* ------------------------------------------------------------------ */

function getWidgetDefaultTitle(w: WidgetConfig, t: (key: string) => string): string {
  switch (w.type) {
    case 'stat': return t(`dashboard.metric_${w.metric || 'totalBalance'}`);
    case 'bar-chart': return t('dashboard.trendsOverTime');
    case 'pie-chart': return w.variant === 'income' ? t('dashboard.incomeByCategory') : t('dashboard.spendingByCategory');
    case 'fixed-list': return w.variant === 'income' ? t('dashboard.fixedIncome') : t('dashboard.fixedExpenses');
    case 'recent-tx': return t('dashboard.recentTransactions');
    case 'forex-accounts': return t('dashboard.forexAccounts');
    case 'goals': return t('dashboard.goalsWidget');
    case 'budgets': return t('dashboard.budgetsWidget');
    case 'recurring': return t('dashboard.recurringWidget');
    case 'clients': return t('dashboard.incomeByClient');
    case 'invoices': return t('dashboard.upcomingInvoices');
    case 'projects': return t('dashboard.activeProjects');
    default: return w.type;
  }
}

/* ================================================================== */
/* Main Dashboard Page                                                 */
/* ================================================================== */

export default function DashboardPage() {
  const { t, locale } = useTranslation();

  /* --- Core data state --- */
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

  /* --- Extended data for freelancer widgets --- */
  const [forexAccounts, setForexAccounts] = useState<ForexAccountItem[]>([]);
  const [forexRates, setForexRates] = useState<Record<string, number>>({});
  const [goalsList, setGoalsList] = useState<GoalItem[]>([]);
  const [budgetsList, setBudgetsList] = useState<BudgetItem[]>([]);
  const [recurringList, setRecurringList] = useState<RecurringPatternItem[]>([]);
  const [invoicesList, setInvoicesList] = useState<InvoiceItem[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null);
  const [clientsList, setClientsList] = useState<ClientItem[]>([]);
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([]);
  const [cashFlowForecast, setCashFlowForecast] = useState<ForecastData | null>(null);
  const [clientRevenue, setClientRevenue] = useState<ClientRevenueData | null>(null);

  /* --- Per-widget account filter for balance widgets --- */
  const [balanceAccountFilter, setBalanceAccountFilter] = useState<Record<string, string>>({});

  /* --- Stat card detail modal --- */
  type DetailTx = { id: string; date: string; description: string; amount: number; category?: { name?: string; slug?: string } | null; account?: { name?: string; type?: string } | null };
  const [detailMetric, setDetailMetric] = useState<string | null>(null);
  const [detailTxs, setDetailTxs] = useState<DetailTx[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailPage, setDetailPage] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);
  const DETAIL_LIMIT = 20;

  /* --- Widget configuration --- */
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [hiddenWidgetIds, setHiddenWidgetIds] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null | 'new'>(null);
  const [showVisibilityPanel, setShowVisibilityPanel] = useState(false);
  const configLoaded = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  /* --- DnD sensors --- */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ---------------------------------------------------------------- */
  /* Load saved widget config                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    users.getDashboardConfig()
      .then((cfg) => {
        if (cfg && Array.isArray(cfg.widgets) && cfg.widgets.length > 0) {
          const savedIds = new Set(cfg.widgets.map((w: WidgetConfig) => w.id));
          const newDefaults = DEFAULT_WIDGETS.filter((dw) => !savedIds.has(dw.id));
          if (newDefaults.length > 0) {
            const statWidgets = newDefaults.filter((w) => w.type === 'stat');
            const otherWidgets = newDefaults.filter((w) => w.type !== 'stat');
            const merged = [...cfg.widgets];
            let lastStatIdx = -1;
            for (let i = merged.length - 1; i >= 0; i--) {
              if (merged[i].type === 'stat') { lastStatIdx = i; break; }
            }
            if (statWidgets.length > 0 && lastStatIdx >= 0) {
              merged.splice(lastStatIdx + 1, 0, ...statWidgets);
            } else {
              merged.unshift(...statWidgets);
            }
            merged.push(...otherWidgets);
            setWidgets(merged);
            users.saveDashboardConfig({ widgets: merged }).catch(() => {});
          } else {
            setWidgets(cfg.widgets);
          }
        }
        configLoaded.current = true;
      })
      .catch(() => { configLoaded.current = true; });
  }, []);

  /* --- Auto-save config (debounced) --- */
  const saveConfig = useCallback((w: WidgetConfig[]) => {
    if (!configLoaded.current) return;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      users.saveDashboardConfig({ widgets: w }).catch(() => {});
    }, 1000);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Data loading                                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const { from: f, to: t2 } = getQuickRangeDates('allTime');
    setFrom(f);
    setTo(t2);
  }, []);

  /* Static data (loaded once) */
  useEffect(() => {
    accounts.list().then((a) => setAccountsList(a)).catch(() => {});
    categories.list().then((c) => setCategoriesList(c)).catch(() => {});
    dashboard.recentTransactions().then(setRecentTx).catch(() => {});
    forex.accounts.list().then(setForexAccounts).catch(() => {});
    forex.rates('ILS').then((d) => setForexRates(d.rates)).catch(() => {});
    goalsApi.list().then(setGoalsList).catch(() => {});
    budgetsApi.list().then(setBudgetsList).catch(() => {});
    recurringApi.list().then(setRecurringList).catch(() => {});
    invoicesApi.list().then(setInvoicesList).catch(() => {});
    invoicesApi.getSummary().then(setInvoiceSummary).catch(() => {});
    clientsApi.list().then(setClientsList).catch(() => {});
    projectsApi.list().then(setProjectsList).catch(() => {});
    reportsApi.getForecast({ months: 3 }).then(setCashFlowForecast).catch(() => {});
    reportsApi.getClientRevenue().then(setClientRevenue).catch(() => {});
  }, []);

  /* Period-dependent data */
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

  /* Fixed expenses/income lazy load */
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

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

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

  const makeClientRevenueData = () => {
    if (!clientRevenue || clientRevenue.length === 0) return [];
    return clientRevenue.slice(0, 8).map((c, i) => ({
      name: c.clientName,
      value: c.totalPaid,
      color: CLIENT_COLORS[i % CLIENT_COLORS.length],
    }));
  };

  const getMetricValue = (metric: string): number => {
    if (!summary) return 0;
    switch (metric) {
      case 'currentBalance': return summary.currentBalance ?? summary.totalBalance;
      case 'totalBalance': return summary.totalBalance;
      case 'income': return summary.income;
      case 'expenses': return summary.expenses;
      case 'creditCardCharges': return summary.creditCardCharges ?? 0;
      case 'netSavings': return summary.income - summary.expenses;
      case 'monthlyProfit': return summary.income - summary.expenses;
      case 'transactionCount': return summary.transactionCount;
      case 'fixedExpensesSum': return summary.fixedExpensesSum ?? 0;
      case 'fixedIncomeSum': return summary.fixedIncomeSum ?? 0;
      case 'unpaidInvoices': return (invoiceSummary?.totalSent ?? 0) + (invoiceSummary?.totalOverdue ?? 0);
      case 'overdueInvoices': return invoiceSummary?.totalOverdue ?? 0;
      default: return 0;
    }
  };

  const getMetricLabel = (metric: string): string => t(`dashboard.metric_${metric}`);

  /* ---------------------------------------------------------------- */
  /* Stat card detail handler                                          */
  /* ---------------------------------------------------------------- */

  const openStatDetail = useCallback(async (metric: string, pg = 1) => {
    setDetailMetric(metric);
    setDetailPage(pg);
    setDetailLoading(true);
    try {
      const typeFilter: 'income' | 'expense' | undefined =
        metric === 'income' || metric === 'fixedIncomeSum' ? 'income'
        : metric === 'expenses' || metric === 'fixedExpensesSum' ? 'expense'
        : undefined;
      const res = await txApi.list({
        from: from || undefined,
        to: to || undefined,
        accountId: accountId || undefined,
        categoryId: categoryId || undefined,
        type: typeFilter,
        page: pg,
        limit: DETAIL_LIMIT,
      });
      setDetailTxs((res.items ?? []) as DetailTx[]);
      setDetailTotal(res.total ?? 0);
    } catch {
      setDetailTxs([]);
      setDetailTotal(0);
    } finally {
      setDetailLoading(false);
    }
  }, [from, to, accountId, categoryId]);

  const closeStatDetail = () => { setDetailMetric(null); setDetailTxs([]); setDetailTotal(0); setDetailPage(1); };

  /* ---------------------------------------------------------------- */
  /* DnD handler                                                       */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /* Widget edit handlers                                              */
  /* ---------------------------------------------------------------- */

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
    setHiddenWidgetIds(new Set());
    saveConfig(DEFAULT_WIDGETS);
  };

  const toggleWidgetVisibility = (id: string) => {
    setHiddenWidgetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ---------------------------------------------------------------- */
  /* Invoice status helpers                                            */
  /* ---------------------------------------------------------------- */

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return 'badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
      case 'sent': return 'badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      case 'paid': return 'badge bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
      case 'overdue': return 'badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
      case 'cancelled': return 'badge bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
      default: return 'badge bg-slate-100 text-slate-700';
    }
  };

  const getProjectStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 dark:text-green-400';
      case 'completed': return 'text-blue-600 dark:text-blue-400';
      case 'on_hold': return 'text-amber-600 dark:text-amber-400';
      case 'cancelled': return 'text-red-600 dark:text-red-400';
      default: return 'text-slate-600';
    }
  };

  /* ================================================================ */
  /* Render widget content                                             */
  /* ================================================================ */

  const renderWidget = (w: WidgetConfig) => {
    switch (w.type) {

      /* ─── Stat Card ─── */
      case 'stat': {
        const metric = w.metric ?? 'totalBalance';
        const isBalanceMetric = metric === 'totalBalance' || metric === 'currentBalance';
        const selectedAcctId = isBalanceMetric ? balanceAccountFilter[w.id] || '' : '';
        const bankAccounts = metric === 'currentBalance'
          ? (summary?.currentAccountBalances ?? [])
          : (summary?.accounts?.filter((a) => a.type === 'BANK') ?? []);

        let value: number;
        if (isBalanceMetric && selectedAcctId) {
          const acct = bankAccounts.find((a) => a.id === selectedAcctId);
          value = acct ? Number(acct.balance ?? 0) : 0;
        } else {
          value = getMetricValue(metric);
        }

        const label = w.title || getMetricLabel(metric);
        const isCurrency = metric !== 'transactionCount';
        const colorClass =
          metric === 'income' || metric === 'fixedIncomeSum' ? 'text-green-700 dark:text-green-400'
          : metric === 'expenses' || metric === 'fixedExpensesSum' || metric === 'creditCardCharges' ? 'text-red-700 dark:text-red-400'
          : metric === 'netSavings' || metric === 'monthlyProfit' ? (value >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')
          : metric === 'currentBalance' ? 'text-sky-700 dark:text-sky-400'
          : metric === 'totalBalance' ? 'text-blue-700 dark:text-blue-400'
          : metric === 'unpaidInvoices' ? 'text-amber-700 dark:text-amber-400'
          : metric === 'overdueInvoices' ? 'text-red-700 dark:text-red-400'
          : 'text-amber-700 dark:text-amber-400';

        const isClickable = !isBalanceMetric && ['income', 'expenses', 'netSavings', 'monthlyProfit', 'transactionCount', 'fixedExpensesSum', 'fixedIncomeSum', 'creditCardCharges'].includes(metric);
        const isUp = metric === 'income' || metric === 'fixedIncomeSum' || metric === 'totalBalance' || metric === 'currentBalance' || (metric === 'netSavings' && value >= 0) || (metric === 'monthlyProfit' && value >= 0);
        const trendColor = isUp ? 'text-green-600' : 'text-red-600';

        const asOfDate = metric === 'totalBalance' && to
          ? new Date(to).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'short', year: 'numeric' })
          : null;
        const subtitle = metric === 'currentBalance'
          ? t('dashboard.currentBalanceHint')
          : metric === 'totalBalance' && asOfDate
            ? `${t('dashboard.filteredBalanceHint')} (${asOfDate})`
            : metric === 'unpaidInvoices'
              ? `${invoiceSummary?.countSent ?? 0} + ${invoiceSummary?.countOverdue ?? 0} ${t('dashboard.invoiceCount')}`
              : metric === 'overdueInvoices'
                ? `${invoiceSummary?.countOverdue ?? 0} ${t('dashboard.invoiceCount')}`
                : null;

        return (
          <div className="pt-1 w-full text-start">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</p>
              <span className={`${trendColor}`}>
                {isUp ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                )}
              </span>
            </div>
            {isClickable ? (
              <button
                type="button"
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onClick={!editMode ? () => openStatDetail(metric) : undefined}
                title={t('dashboard.clickToShowDetails')}
              >
                <p className={`text-2xl font-bold mt-2 ${colorClass}`}>
                  {isCurrency ? formatCurrency(value, locale) : value.toLocaleString()}
                </p>
              </button>
            ) : (
              <p className={`text-2xl font-bold mt-2 ${colorClass}`}>
                {isCurrency ? formatCurrency(value, locale) : value.toLocaleString()}
              </p>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-tight font-medium">{subtitle}</p>
            )}
            {isBalanceMetric && bankAccounts.length > 0 && !editMode && (
              <select
                className="mt-2 text-xs bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-600 dark:text-slate-400 w-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500"
                value={selectedAcctId}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setBalanceAccountFilter((prev) => ({ ...prev, [w.id]: e.target.value }))}
              >
                <option value="">{t('dashboard.allBankAccounts')}</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </div>
        );
      }

      /* ─── Revenue Trend Chart (Bar) ─── */
      case 'bar-chart': {
        const barData = trends ?? [];
        return (
          <>
            <h2 className="font-semibold mb-4">{w.title || t('dashboard.trendsOverTime')}</h2>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v, locale)}
                    labelFormatter={(l) => l}
                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}
                  />
                  <Bar dataKey="income" fill="#22c55e" name={t('dashboard.income')} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" fill="#ef4444" name={t('dashboard.expenses')} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
                <p className="text-sm">{t('dashboard.noTrendData')}</p>
              </div>
            )}
          </>
        );
      }

      /* ─── Pie Chart (Spending / Income by Category) ─── */
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
                  <Tooltip formatter={(v: number) => formatCurrency(v, locale)} contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ paddingRight: 8, maxHeight: 280, overflowY: 'auto', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                <p className="text-sm">{t(noDataKey)}</p>
              </div>
            )}
          </>
        );
      }

      /* ─── Cash Flow Forecast ─── */
      case 'clients': {
        if (w.variant === 'cashflow' || w.id === 'w-cashflow') {
          // Render cash flow forecast
          const forecastData = cashFlowForecast?.monthlyForecast ?? [];
          return (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">{w.title || t('dashboard.cashFlowForecast')}</h2>
              </div>
              {forecastData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={forecastData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="cashFlowGreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="cashFlowRed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => formatCurrency(v, locale)}
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}
                    />
                    <Area type="monotone" dataKey="income" stroke="#22c55e" fill="url(#cashFlowGreen)" name={t('dashboard.inflows')} strokeWidth={2} />
                    <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#cashFlowRed)" name={t('dashboard.outflows')} strokeWidth={2} />
                    <Line type="monotone" dataKey="net" stroke="#6366f1" name={t('dashboard.net')} strokeWidth={2.5} dot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  <p className="text-sm">{t('dashboard.noCashFlowData')}</p>
                </div>
              )}
            </>
          );
        }

        /* Income by Client Pie Chart */
        const clientData = makeClientRevenueData();
        return (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{w.title || t('dashboard.incomeByClient')}</h2>
            </div>
            {clientData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={clientData} cx="40%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} dataKey="value" nameKey="name">
                    {clientData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v, locale)} contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ paddingRight: 8, maxHeight: 280, overflowY: 'auto', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <p className="text-sm">{t('dashboard.noClients')}</p>
              </div>
            )}
          </>
        );
      }

      /* ─── Fixed List (Expenses / Income) ─── */
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

      /* ─── Recent Transactions ─── */
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
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p className="text-sm">{t('dashboard.noRecentTransactions')}</p>
              </div>
            )}
          </>
        );
      }

      /* ─── Upcoming Invoices ─── */
      case 'invoices': {
        const pendingInvoices = invoicesList
          .filter((inv) => inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'draft')
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
          .slice(0, 6);

        return (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{w.title || t('dashboard.upcomingInvoices')}</h2>
              <a href="/transactions" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                {t('dashboard.viewAll')}
              </a>
            </div>
            {pendingInvoices.length > 0 ? (
              <ul className="space-y-1">
                {pendingInvoices.map((inv) => {
                  const isOverdue = inv.status === 'overdue' || (inv.status === 'sent' && new Date(inv.dueDate) < new Date());
                  return (
                    <li key={inv.id} className="flex items-center justify-between py-2.5 border-b border-[var(--border)] last:border-0 gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{inv.invoiceNumber}</p>
                          <span className={getInvoiceStatusBadge(isOverdue ? 'overdue' : inv.status)}>
                            {t(`dashboard.${isOverdue ? 'overdue' : inv.status}`)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {inv.client?.name || t('common.other')}
                          <span> · {t('dashboard.dueDate')}: {new Date(inv.dueDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'short' })}</span>
                        </p>
                      </div>
                      <span className={`text-sm font-semibold whitespace-nowrap ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        {formatCurrency(inv.total, locale)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <p className="text-sm">{t('dashboard.noInvoices')}</p>
                <a href="/transactions" className="text-sm text-primary-600 dark:text-primary-400 hover:underline mt-2">
                  {t('dashboard.newInvoice')}
                </a>
              </div>
            )}
          </>
        );
      }

      /* ─── Active Projects ─── */
      case 'projects': {
        const activeProjects = projectsList
          .filter((p) => p.status === 'active')
          .slice(0, 5);

        return (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{w.title || t('dashboard.activeProjects')}</h2>
              <a href="/transactions" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                {t('dashboard.viewAll')}
              </a>
            </div>
            {activeProjects.length > 0 ? (
              <div className="space-y-3">
                {activeProjects.map((proj) => {
                  const budgetVal = proj.budget ?? 0;
                  const invoiced = proj.totalInvoiced ?? 0;
                  const progressPct = budgetVal > 0 ? Math.min(100, Math.round((invoiced / budgetVal) * 100)) : 0;
                  const hoursProgress = proj.totalHours ? Math.min(100, Math.round(((proj.billedHours ?? 0) / proj.totalHours) * 100)) : 0;

                  return (
                    <div key={proj.id} className="py-2.5 border-b border-[var(--border)] last:border-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{proj.name}</p>
                          <p className="text-xs text-slate-500">{proj.client?.name}</p>
                        </div>
                        <span className={`text-xs font-medium ${getProjectStatusColor(proj.status)}`}>
                          {proj.status}
                        </span>
                      </div>
                      {budgetVal > 0 && (
                        <>
                          <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-1">
                            <div
                              className="h-full rounded-full bg-primary-500 transition-all duration-500"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{formatCurrency(invoiced, locale)} / {formatCurrency(budgetVal, locale)}</span>
                            <span>{progressPct}%</span>
                          </div>
                        </>
                      )}
                      {proj.totalHours != null && proj.totalHours > 0 && (
                        <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                          <span>{t('dashboard.hoursLogged')}: {proj.billedHours ?? 0}/{proj.totalHours}h</span>
                          <span>{hoursProgress}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                <p className="text-sm">{t('dashboard.noProjects')}</p>
              </div>
            )}
          </>
        );
      }

      /* ─── Forex Accounts ─── */
      case 'forex-accounts': {
        const FOREX_FLAGS: Record<string, string> = {
          USD: '\u{1F1FA}\u{1F1F8}', EUR: '\u{1F1EA}\u{1F1FA}', GBP: '\u{1F1EC}\u{1F1E7}',
          JPY: '\u{1F1EF}\u{1F1F5}', CHF: '\u{1F1E8}\u{1F1ED}', CAD: '\u{1F1E8}\u{1F1E6}',
          AUD: '\u{1F1E6}\u{1F1FA}', CNY: '\u{1F1E8}\u{1F1F3}', THB: '\u{1F1F9}\u{1F1ED}',
          TRY: '\u{1F1F9}\u{1F1F7}', ILS: '\u{1F1EE}\u{1F1F1}',
        };
        const FOREX_SYMS: Record<string, string> = {
          ILS: '\u{20AA}', USD: '$', EUR: '\u{20AC}', GBP: '\u{00A3}', JPY: '\u{00A5}', CHF: 'Fr',
        };
        const totalILS = forexAccounts.reduce((sum, a) => {
          const bal = Number(a.balance);
          if (a.currency === 'ILS') return sum + bal;
          const rate = forexRates[a.currency];
          return sum + (rate ? bal / rate : 0);
        }, 0);
        return (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{w.title || t('dashboard.forexAccounts')}</h2>
              <a href="/forex" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                {t('dashboard.viewAll')}
              </a>
            </div>
            {forexAccounts.length > 0 ? (
              <>
                <div className="text-xs text-slate-500 mb-3">
                  {t('forex.totalValue')}: <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{FOREX_SYMS.ILS}{totalILS.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                </div>
                <ul className="space-y-2">
                  {forexAccounts.slice(0, 5).map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{FOREX_FLAGS[a.currency] || '\u{1F4B1}'}</span>
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          {a.provider && <p className="text-xs text-slate-500">{a.provider}</p>}
                        </div>
                      </div>
                      <span className="font-semibold text-sm">{FOREX_SYMS[a.currency] || ''}{Number(a.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                <p className="text-sm">{t('forex.noAccounts')}</p>
              </div>
            )}
          </>
        );
      }

      /* ─── Goals Progress ─── */
      case 'goals': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeGoals = goalsList.filter((g) => {
          if (!g.targetDate) return true;
          return new Date(g.targetDate) >= today;
        });
        return (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{w.title || t('dashboard.goalsWidget')}</h2>
              <a href="/goals" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                {t('dashboard.viewAll')}
              </a>
            </div>
            {activeGoals.length > 0 ? (
              <div className="space-y-3">
                {activeGoals.slice(0, 5).map((g) => {
                  const pct = Math.min(100, Math.round(g.progress));
                  const remaining = g.remainingAmount;
                  const monthsLeft = g.monthsRemaining;
                  return (
                    <div key={g.id} className="py-2 border-b border-[var(--border)] last:border-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium flex items-center gap-1.5">
                          {g.icon && <span>{g.icon}</span>}
                          {g.name}
                        </span>
                        <span className="text-xs text-slate-500">{pct}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-1.5">
                        <div
                          className="h-full rounded-full transition-all duration-500 animate-progressFill"
                          style={{ width: `${pct}%`, backgroundColor: g.color || '#22c55e' }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{t('goals.remaining')}: {formatCurrency(remaining, locale)}</span>
                        {monthsLeft != null && monthsLeft > 0 && (
                          <span>{monthsLeft} {t('goals.monthsLeft')}</span>
                        )}
                        {monthsLeft != null && monthsLeft <= 0 && pct < 100 && (
                          <span className="text-amber-600">{t('goals.behind')}</span>
                        )}
                        {pct >= 100 && (
                          <span className="text-green-600 font-medium">{t('goals.reached')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                <p className="text-sm">{t('goals.noGoals')}</p>
              </div>
            )}
          </>
        );
      }

      /* ─── Budget Overview ─── */
      case 'budgets': {
        return (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{w.title || t('dashboard.budgetsWidget')}</h2>
              <a href="/budgets" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                {t('dashboard.viewAll')}
              </a>
            </div>
            {budgetsList.length > 0 ? (
              <div className="space-y-3">
                {budgetsList.slice(0, 5).map((b) => {
                  const pct = Math.min(100, Math.round(b.percentUsed));
                  return (
                    <div key={b.id} className="py-2 border-b border-[var(--border)] last:border-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">{b.category?.name || t('common.uncategorized')}</span>
                        <span className={`text-xs font-medium ${b.isOver ? 'text-red-600' : 'text-green-600'}`}>
                          {b.isOver ? t('budgets.overBudget') : `${pct}%`}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-1.5">
                        <div
                          className={`h-full rounded-full transition-all duration-500 animate-progressFill ${b.isOver ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{formatCurrency(b.spent, locale)} / {formatCurrency(b.amount, locale)}</span>
                        <span>{t('budgets.remaining')}: {formatCurrency(b.remaining, locale)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 14h.01"/><path d="M2 10h20"/></svg>
                <p className="text-sm">{t('budgets.noBudgets')}</p>
              </div>
            )}
          </>
        );
      }

      /* ─── Recurring Items ─── */
      case 'recurring': {
        const confirmed = recurringList.filter((r) => r.isConfirmed);
        return (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{w.title || t('dashboard.recurringWidget')}</h2>
              <a href="/recurring" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                {t('dashboard.viewAll')}
              </a>
            </div>
            {confirmed.length > 0 ? (
              <div className="space-y-2">
                {confirmed.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.description}</p>
                      <p className="text-xs text-slate-500">
                        {t(`recurring.${r.type}`)} · {t(`recurring.${r.frequency}`)} · {r.occurrences}x
                      </p>
                    </div>
                    <span className={`text-sm font-semibold whitespace-nowrap ${r.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {r.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(Number(r.amount)), locale)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                <p className="text-sm">{t('dashboard.noUpcomingRecurring')}</p>
              </div>
            )}
          </>
        );
      }

      default:
        return null;
    }
  };

  /* ================================================================ */
  /* Quick Actions Widget (rendered inline, not through renderWidget)  */
  /* ================================================================ */

  const QuickActionsWidget = () => (
    <div className="card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
      <h2 className="font-semibold mb-4">{t('dashboard.quickActions')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          { href: '/transactions', label: t('dashboard.newInvoice'), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          ), bg: 'bg-primary-50 dark:bg-primary-950/30 hover:bg-primary-100 dark:hover:bg-primary-950/50' },
          { href: '/transactions', label: t('dashboard.newClient'), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          ), bg: 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50' },
          { href: '/upload', label: t('dashboard.uploadDocument'), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-500"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          ), bg: 'bg-accent-50 dark:bg-accent-950/30 hover:bg-accent-100 dark:hover:bg-accent-950/50' },
          { href: '/transactions', label: t('dashboard.newProject'), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          ), bg: 'bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50' },
          { href: '/transactions', label: t('dashboard.newExpense'), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          ), bg: 'bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50' },
          { href: '/goals', label: t('dashboard.goalsWidget'), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-500"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          ), bg: 'bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50' },
        ].map((action, i) => (
          <a
            key={i}
            href={action.href}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl text-center transition-all duration-150 ${action.bg}`}
          >
            {action.icon}
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{action.label}</span>
          </a>
        ))}
      </div>
    </div>
  );

  /* ================================================================ */
  /* Render                                                            */
  /* ================================================================ */

  if (loading && !summary) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="skeleton h-8 w-48" />
          <div className="flex gap-3">
            <div className="skeleton h-10 w-32" />
            <div className="skeleton h-10 w-32" />
          </div>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 p-6 text-red-700 dark:text-red-300 animate-fadeIn">
        <div className="flex items-center gap-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <div>
            <p className="font-semibold">{t('common.somethingWentWrong')}</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const visibleWidgets = widgets.filter((w) => !hiddenWidgetIds.has(w.id));

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {t('dashboard.title')}
          <HelpTooltip text={t('help.dashboardTitle')} className="ms-1" />
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker from={from} to={to} onChange={handleDateRangeChange} />
          <HelpTooltip text={t('help.dateRange')} className="ms-1" />
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

      {/* ── Edit mode toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
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
          <HelpTooltip text={t('help.customize')} className="ms-1" />
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          onClick={() => setShowVisibilityPanel(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          {t('dashboard.widgetVisibility')}
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

      {/* ── Empty state for new users ── */}
      {summary && !loading && summary.transactionCount === 0 && summary.income === 0 && summary.expenses === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 animate-fadeIn">
          <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600 dark:text-primary-400">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <h2 className="text-2xl font-semibold mb-2">{t('dashboard.welcomeTitle')}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-center max-w-md mb-8">
            {t('dashboard.welcomeDescription')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/upload" className="btn-primary flex items-center gap-2 px-6 py-3 text-base">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {t('dashboard.uploadFile')}
            </a>
            <a href="/transactions" className="btn-secondary flex items-center gap-2 px-6 py-3 text-base">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {t('dashboard.addManually')}
            </a>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-6 text-center max-w-sm">
            {t('dashboard.welcomeHint')}
          </p>
        </div>
      ) : summary && (
        <>
          {/* ── Quick Actions ── */}
          <QuickActionsWidget />

          {/* ── Widgets Grid ── */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleWidgets.map((w) => (
                  <SortableWidget
                    key={w.id}
                    id={w.id}
                    editMode={editMode}
                    onEdit={() => setEditingWidget(w)}
                    size={w.size}
                    statMetric={w.metric}
                    widgetType={w.type}
                  >
                    {renderWidget(w)}
                  </SortableWidget>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <SmartTip />

      {/* ── Stat card detail modal ── */}
      {detailMetric && (
        <div className="modal-overlay" onClick={closeStatDetail}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div>
                <h3 className="font-semibold text-lg">{getMetricLabel(detailMetric)}</h3>
                <p className="text-xs text-slate-500" dir="ltr">
                  {from ? new Date(from + 'T00:00:00').toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  {' \u2014 '}
                  {to ? new Date(to + 'T00:00:00').toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeStatDetail}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                  <span className="text-sm">{t('common.loading')}</span>
                </div>
              ) : detailTxs.length === 0 ? (
                <p className="text-center py-8 text-slate-500 text-sm">{t('dashboard.noRecentTransactions')}</p>
              ) : (
                <ul className="space-y-1">
                  {detailTxs.map((tx) => {
                    const isIncome = tx.amount > 0;
                    const catSlug = tx.category?.slug;
                    const catKey = catSlug ? `categories.${catSlug}` : '';
                    const catLabel = catKey ? (t(catKey) !== catKey ? t(catKey) : tx.category?.name) : tx.category?.name;
                    return (
                      <li key={tx.id} className="flex items-center justify-between py-2.5 border-b border-[var(--border)] last:border-0 gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{tx.description}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(String(tx.date).slice(0, 10) + 'T00:00:00').toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {catLabel && <span> · {catLabel}</span>}
                            {tx.account?.name && <span> · {tx.account.name}</span>}
                          </p>
                        </div>
                        <span className={`text-sm font-semibold whitespace-nowrap ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {isIncome ? '+' : ''}{formatCurrency(tx.amount, locale)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {detailTotal > DETAIL_LIMIT && (
              <div className="flex items-center justify-center gap-3 p-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  className="btn-secondary text-sm py-1.5 px-3"
                  disabled={detailPage <= 1 || detailLoading}
                  onClick={() => openStatDetail(detailMetric, detailPage - 1)}
                >
                  {t('common.previous')}
                </button>
                <span className="text-sm text-slate-500">
                  {t('common.page')} {detailPage} {t('common.of')} {Math.ceil(detailTotal / DETAIL_LIMIT)}
                </span>
                <button
                  type="button"
                  className="btn-secondary text-sm py-1.5 px-3"
                  disabled={detailPage >= Math.ceil(detailTotal / DETAIL_LIMIT) || detailLoading}
                  onClick={() => openStatDetail(detailMetric, detailPage + 1)}
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Widget settings modal ── */}
      {editingWidget && (
        <WidgetSettings
          widget={editingWidget === 'new' ? null : editingWidget}
          onSave={handleWidgetSave}
          onDelete={editingWidget !== 'new' ? handleWidgetDelete : undefined}
          onClose={() => setEditingWidget(null)}
        />
      )}

      {/* ── Widget visibility panel ── */}
      {showVisibilityPanel && (
        <WidgetVisibilityPanel
          widgets={widgets}
          hiddenWidgetIds={hiddenWidgetIds}
          onToggle={toggleWidgetVisibility}
          onResetDefaults={handleResetLayout}
          onClose={() => setShowVisibilityPanel(false)}
          t={t}
        />
      )}
    </div>
  );
}
