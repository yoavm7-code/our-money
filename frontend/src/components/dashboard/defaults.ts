import type { WidgetConfig } from '@/lib/api';

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'w-balance', type: 'stat', metric: 'totalBalance', color: '#3b82f6', size: 'sm' },
  { id: 'w-income', type: 'stat', metric: 'income', color: '#22c55e', size: 'sm' },
  { id: 'w-expenses', type: 'stat', metric: 'expenses', color: '#ef4444', size: 'sm' },
  { id: 'w-cc-charges', type: 'stat', metric: 'creditCardCharges', color: '#f97316', size: 'sm' },
  { id: 'w-fixed-exp', type: 'fixed-list', variant: 'expenses', size: 'md' },
  { id: 'w-fixed-inc', type: 'fixed-list', variant: 'income', size: 'md' },
  { id: 'w-trends', type: 'bar-chart', size: 'lg' },
  { id: 'w-spend-pie', type: 'pie-chart', variant: 'spending', size: 'md' },
  { id: 'w-inc-pie', type: 'pie-chart', variant: 'income', size: 'md' },
  { id: 'w-goals', type: 'goals', size: 'lg' },
  { id: 'w-recent', type: 'recent-tx', size: 'lg' },
];

export const STAT_METRICS = [
  'totalBalance',
  'income',
  'expenses',
  'creditCardCharges',
  'netSavings',
  'transactionCount',
  'fixedExpensesSum',
  'fixedIncomeSum',
] as const;

export type StatMetric = (typeof STAT_METRICS)[number];

export const METRIC_DEFAULTS: Record<StatMetric, { color: string }> = {
  totalBalance: { color: '#3b82f6' },
  income: { color: '#22c55e' },
  expenses: { color: '#ef4444' },
  creditCardCharges: { color: '#f97316' },
  netSavings: { color: '#8b5cf6' },
  transactionCount: { color: '#f59e0b' },
  fixedExpensesSum: { color: '#ec4899' },
  fixedIncomeSum: { color: '#14b8a6' },
};

export const WIDGET_TYPES = [
  { type: 'stat' as const, labelKey: 'dashboard.widgetStat' },
  { type: 'bar-chart' as const, labelKey: 'dashboard.widgetBarChart' },
  { type: 'pie-chart' as const, labelKey: 'dashboard.widgetPieChart' },
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
