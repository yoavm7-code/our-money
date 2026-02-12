import type { WidgetConfig } from '@/lib/api';

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'w-current-balance', type: 'stat', metric: 'currentBalance', color: '#0ea5e9', size: 'sm' },
  { id: 'w-balance', type: 'stat', metric: 'totalBalance', color: '#3b82f6', size: 'sm' },
  { id: 'w-income', type: 'stat', metric: 'income', color: '#22c55e', size: 'sm' },
  { id: 'w-expenses', type: 'stat', metric: 'expenses', color: '#ef4444', size: 'sm' },
  { id: 'w-profit', type: 'stat', metric: 'monthlyProfit', color: '#8b5cf6', size: 'sm' },
  { id: 'w-unpaid', type: 'stat', metric: 'unpaidInvoices', color: '#f59e0b', size: 'sm' },
  { id: 'w-overdue', type: 'stat', metric: 'overdueInvoices', color: '#ef4444', size: 'sm' },
  { id: 'w-cc-charges', type: 'stat', metric: 'creditCardCharges', color: '#f97316', size: 'sm' },
  { id: 'w-trends', type: 'bar-chart', size: 'lg' },
  { id: 'w-cashflow', type: 'clients', variant: 'cashflow', size: 'lg' },
  { id: 'w-clients', type: 'clients', size: 'md' },
  { id: 'w-spend-pie', type: 'pie-chart', variant: 'spending', size: 'md' },
  { id: 'w-inc-pie', type: 'pie-chart', variant: 'income', size: 'md' },
  { id: 'w-invoices', type: 'invoices', size: 'md' },
  { id: 'w-projects', type: 'projects', size: 'md' },
  { id: 'w-recent', type: 'recent-tx', size: 'lg' },
  { id: 'w-fixed-exp', type: 'fixed-list', variant: 'expenses', size: 'md' },
  { id: 'w-fixed-inc', type: 'fixed-list', variant: 'income', size: 'md' },
  { id: 'w-goals', type: 'goals', size: 'md' },
  { id: 'w-budgets', type: 'budgets', size: 'md' },
  { id: 'w-forex', type: 'forex-accounts', size: 'md' },
  { id: 'w-recurring', type: 'recurring', size: 'md' },
];

export const STAT_METRICS = [
  'currentBalance',
  'totalBalance',
  'income',
  'expenses',
  'monthlyProfit',
  'netSavings',
  'unpaidInvoices',
  'overdueInvoices',
  'creditCardCharges',
  'transactionCount',
  'fixedExpensesSum',
  'fixedIncomeSum',
] as const;

export type StatMetric = (typeof STAT_METRICS)[number];

export const METRIC_DEFAULTS: Record<StatMetric, { color: string }> = {
  currentBalance: { color: '#0ea5e9' },
  totalBalance: { color: '#3b82f6' },
  income: { color: '#22c55e' },
  expenses: { color: '#ef4444' },
  monthlyProfit: { color: '#8b5cf6' },
  netSavings: { color: '#8b5cf6' },
  unpaidInvoices: { color: '#f59e0b' },
  overdueInvoices: { color: '#ef4444' },
  creditCardCharges: { color: '#f97316' },
  transactionCount: { color: '#f59e0b' },
  fixedExpensesSum: { color: '#ec4899' },
  fixedIncomeSum: { color: '#14b8a6' },
};

export const WIDGET_TYPES = [
  { type: 'stat' as const, labelKey: 'dashboard.widgetStat' },
  { type: 'bar-chart' as const, labelKey: 'dashboard.widgetBarChart' },
  { type: 'pie-chart' as const, labelKey: 'dashboard.widgetPieChart' },
  { type: 'clients' as const, labelKey: 'dashboard.widgetClients' },
  { type: 'invoices' as const, labelKey: 'dashboard.widgetInvoices' },
  { type: 'projects' as const, labelKey: 'dashboard.widgetProjects' },
  { type: 'fixed-list' as const, labelKey: 'dashboard.widgetFixedList' },
  { type: 'recent-tx' as const, labelKey: 'dashboard.widgetRecentTx' },
  { type: 'forex-accounts' as const, labelKey: 'dashboard.widgetForexAccounts' },
  { type: 'goals' as const, labelKey: 'dashboard.widgetGoals' },
  { type: 'budgets' as const, labelKey: 'dashboard.widgetBudgets' },
  { type: 'recurring' as const, labelKey: 'dashboard.widgetRecurring' },
];

export const ACCENT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#ec4899', '#f43f5e',
];

let _counter = 0;
export function generateWidgetId(): string {
  return `w-${Date.now()}-${++_counter}`;
}
