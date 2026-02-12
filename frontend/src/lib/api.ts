/**
 * API client for Our Money backend.
 * Set NEXT_PUBLIC_API_URL or default to http://localhost:4000
 */

const raw = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
const API_URL = raw || (typeof window !== 'undefined' ? '' : 'http://localhost:4000');

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export async function api<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const { params, ...init } = options;
  let urlStr = path.startsWith('http') ? path : `${API_URL}${path}`;
  if (params) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    const qs = q.toString();
    if (qs) urlStr += (path.includes('?') ? '&' : '?') + qs;
  }
  const token = getToken();
  const headers: HeadersInit = {
    ...(init.headers as Record<string, string>),
    ...(token && { Authorization: `Bearer ${token}` }),
  };
  if (init.body && typeof init.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const getOpts: RequestInit = { ...init, headers };
  if (init.method === undefined || init.method === 'GET') getOpts.cache = 'no-store';
  const res = await fetch(urlStr, getOpts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message || 'Request failed');
  }
  return res.json() as Promise<T>;
}

export const auth = {
  login: (email: string, password: string, captchaToken?: string, twoFactorToken?: string) =>
    api<{ accessToken: string | null; user: { id: string; email: string; name: string | null; householdId: string; countryCode?: string } | null; requiresTwoFactor?: boolean }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password, captchaToken, twoFactorToken }) },
    ),
  register: (email: string, password: string, name?: string, countryCode?: string, captchaToken?: string, phone?: string) =>
    api<{ accessToken: string; user: { id: string; email: string; name: string | null; householdId: string; countryCode?: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, countryCode, captchaToken, phone }),
    }),
  verifyEmail: (token: string) =>
    api<{ verified: boolean }>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerification: () =>
    api<{ sent: boolean }>('/api/auth/resend-verification', { method: 'POST' }),
};

export const users = {
  me: () => api<{ id: string; email: string; name: string | null; householdId: string; countryCode?: string | null; avatarUrl?: string | null; emailVerified?: boolean; phone?: string | null; onboardingCompleted?: boolean; twoFactorMethod?: string | null }>('/api/users/me'),
  update: (body: { name?: string; email?: string; password?: string; countryCode?: string | null }) =>
    api<{ id: string; email: string; name: string | null; householdId: string; countryCode?: string | null; avatarUrl?: string | null }>('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    const token = getToken();
    return fetch(`${API_URL}/api/users/me/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((res) => {
      if (!res.ok) return res.json().then((e) => { throw new Error((e as { message?: string }).message || 'Upload failed'); });
      return res.json() as Promise<{ avatarUrl: string }>;
    });
  },
  deleteAvatar: () =>
    api<{ avatarUrl: null }>('/api/users/me/avatar', { method: 'DELETE' }),
  getNotificationSettings: () =>
    api<NotificationSettings>('/api/users/me/notification-settings'),
  updateNotificationSettings: (settings: Partial<NotificationSettings>) =>
    api<NotificationSettings>('/api/users/me/notification-settings', { method: 'PUT', body: JSON.stringify(settings) }),
  completeOnboarding: () =>
    api<{ ok: boolean }>('/api/users/me/complete-onboarding', { method: 'POST' }),
  getDashboardConfig: () =>
    api<{ widgets: WidgetConfig[] } | null>('/api/users/me/dashboard-config'),
  saveDashboardConfig: (config: { widgets: WidgetConfig[] }) =>
    api<{ ok: boolean }>('/api/users/me/dashboard-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
};

export const twoFactor = {
  status: () => api<{ enabled: boolean }>('/api/2fa/status'),
  generate: () => api<{ secret: string; qrCode: string }>('/api/2fa/generate', { method: 'POST' }),
  enable: (token: string) => api<{ enabled: boolean }>('/api/2fa/enable', { method: 'POST', body: JSON.stringify({ token }) }),
  disable: (token: string) => api<{ enabled: boolean }>('/api/2fa/disable', { method: 'POST', body: JSON.stringify({ token }) }),
  sendCode: () => api<{ sent: boolean }>('/api/2fa/send-code', { method: 'POST' }),
  getMethod: () => api<{ method: string | null }>('/api/2fa/method'),
  setMethod: (method: string) => api<{ method: string }>('/api/2fa/method', { method: 'PUT', body: JSON.stringify({ method }) }),
};

export type NotificationSettings = {
  notifyLogin: boolean;
  notifyLargeTransaction: boolean;
  notifyBudgetExceeded: boolean;
  notifyGoalDeadline: boolean;
  notifyWeeklyReport: boolean;
  notifyMonthlyReport: boolean;
  largeTransactionThreshold: number | null;
};

export type WidgetConfig = {
  id: string;
  type: 'stat' | 'bar-chart' | 'pie-chart' | 'fixed-list' | 'recent-tx' | 'forex-accounts' | 'goals' | 'budgets' | 'recurring';
  metric?: string;
  variant?: string;
  title?: string;
  color?: string;
  size: 'sm' | 'md' | 'lg';
};

export const accounts = {
  list: (type?: string) =>
    api<Array<{ id: string; name: string; type: string; balance: string; balanceDate?: string | null; currency: string }>>(
      '/api/accounts' + (type ? `?type=${encodeURIComponent(type)}` : ''),
    ),
  get: (id: string) => api<unknown>(`/api/accounts/${id}`),
  create: (body: { name: string; type: string; provider?: string; balance?: number; balanceDate?: string; currency?: string; linkedBankAccountId?: string }) =>
    api<unknown>('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; type?: string; balance?: number; balanceDate?: string | null; isActive?: boolean; linkedBankAccountId?: string | null }) =>
    api<unknown>(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/accounts/${id}`, { method: 'DELETE' }),
};

export const categories = {
  list: (incomeOnly?: boolean) =>
    api<Array<{ id: string; name: string; slug: string; icon: string | null; color: string | null; isIncome: boolean; excludeFromExpenseTotal?: boolean }>>(
      '/api/categories' + (incomeOnly !== undefined ? `?incomeOnly=${incomeOnly}` : ''),
    ),
  create: (body: { name: string; slug?: string; icon?: string; color?: string; isIncome?: boolean; excludeFromExpenseTotal?: boolean }) =>
    api<unknown>('/api/categories', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; icon?: string; color?: string; isIncome?: boolean; excludeFromExpenseTotal?: boolean }) =>
    api<unknown>(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/categories/${id}`, { method: 'DELETE' }),
};

export const transactions = {
  list: (params?: { from?: string; to?: string; accountId?: string; categoryId?: string; search?: string; type?: 'income' | 'expense'; page?: number; limit?: number }) => {
    const p = params ?? {};
    const query = new URLSearchParams();
    if (p.from != null && p.from !== '') query.set('from', String(p.from));
    if (p.to != null && p.to !== '') query.set('to', String(p.to));
    if (p.accountId != null && p.accountId !== '') query.set('accountId', String(p.accountId));
    if (p.categoryId != null && p.categoryId !== '') query.set('categoryId', String(p.categoryId));
    if (p.search != null && p.search !== '') query.set('search', String(p.search));
    if (p.type) query.set('type', p.type);
    query.set('page', String(p.page ?? 1));
    query.set('limit', String(p.limit ?? 20));
    const qs = query.toString();
    return api<{ items: Array<unknown>; total: number; page: number; limit: number }>(
      `/api/transactions?${qs}`,
    );
  },
  create: (body: { accountId: string; categoryId?: string; date: string; description: string; amount: number; currency?: string; isRecurring?: boolean; totalAmount?: number; installmentCurrent?: number; installmentTotal?: number }) =>
    api<unknown>('/api/transactions', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { accountId?: string; categoryId?: string | null; date?: string; description?: string; amount?: number; isRecurring?: boolean; totalAmount?: number | null; installmentCurrent?: number | null; installmentTotal?: number | null }) =>
    api<unknown>(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  updateCategory: (id: string, categoryId: string | null) =>
    api<unknown>(`/api/transactions/${id}/category`, {
      method: 'PATCH',
      body: JSON.stringify({ categoryId }),
    }),
  delete: (id: string) => api<unknown>(`/api/transactions/${id}`, { method: 'DELETE' }),
  suggestCategory: (description: string) =>
    api<{ categoryId: string | null }>('/api/transactions/suggest-category', {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),
  bulkDelete: (ids: string[]) =>
    api<{ count: number }>('/api/transactions/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  bulkUpdate: (ids: string[], updates: { categoryId?: string | null; date?: string; description?: string }) =>
    api<{ count: number }>('/api/transactions/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ids, updates }),
    }),
  bulkFlipSign: (ids: string[]) =>
    api<{ count: number }>('/api/transactions/bulk-flip-sign', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
};

export type DocumentWithCount = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  _count?: { transactions: number };
  extractedCount?: number;
};

export const documents = {
  upload: (file: File, accountId: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('accountId', accountId);
    const token = getToken();
    return fetch(`${API_URL}/api/documents/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((res) => {
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    });
  },

  /** Upload with live progress (upload % then polling until COMPLETED/FAILED). */
  uploadWithProgress: (
    file: File,
    accountId: string,
    onProgress: (state: {
      phase: 'upload' | 'processing' | 'done';
      uploadPercent?: number;
      status?: string;
      transactionsCount?: number;
      document?: DocumentWithCount;
    }) => void,
  ): Promise<DocumentWithCount> => {
    const token = getToken();
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      form.append('accountId', accountId);
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({ phase: 'upload', uploadPercent: Math.round((100 * e.loaded) / e.total) });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('Upload failed'));
          return;
        }
        let doc: { id: string; status: string };
        try {
          doc = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error('Invalid response'));
          return;
        }
        onProgress({ phase: 'processing', status: doc.status });

        const pollInterval = 2000;
        const poll = () => {
          fetch(`${API_URL}/api/documents/${doc.id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: 'no-store',
          })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to fetch status'))))
            .then((d: DocumentWithCount & { _count?: { transactions: number }; extractedJson?: unknown }) => {
              const status = d.status;
              const count = d._count?.transactions;
              onProgress({
                phase: status === 'COMPLETED' || status === 'FAILED' || status === 'PENDING_REVIEW' ? 'done' : 'processing',
                status,
                transactionsCount: count,
                document: d as DocumentWithCount,
              });
              if (status === 'COMPLETED' || status === 'FAILED' || status === 'PENDING_REVIEW') {
                resolve(d as DocumentWithCount & { extractedJson?: unknown });
                return;
              }
              setTimeout(poll, pollInterval);
            })
            .catch(reject);
        };
        setTimeout(poll, pollInterval);
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.open('POST', `${API_URL}/api/documents/upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(form);
    });
  },

  list: () => api<DocumentWithCount[]>('/api/documents'),
  get: (id: string) => api<DocumentWithCount & { _count?: { transactions: number }; extractedJson?: ExtractedItem[] }>(`/api/documents/${id}`),
  confirmImport: (
    documentId: string,
    body: { accountId: string; action: 'add_all' | 'skip_duplicates' | 'add_none'; selectedIndices?: number[] },
  ) =>
    api<DocumentWithCount & { _count?: { transactions: number } }>(`/api/documents/${documentId}/confirm-import`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export type ExtractedItem = {
  date: string;
  description: string;
  amount: number;
  categorySlug?: string;
  totalAmount?: number;
  installmentCurrent?: number;
  installmentTotal?: number;
  isDuplicate?: boolean;
  existingTransaction?: { id: string; date: string; amount: number; description: string };
};

export type InsightSection =
  | 'balanceForecast'
  | 'savingsRecommendation'
  | 'investmentRecommendations'
  | 'taxTips'
  | 'spendingInsights'
  | 'monthlySummary';

export const INSIGHT_SECTIONS: InsightSection[] = [
  'balanceForecast',
  'savingsRecommendation',
  'investmentRecommendations',
  'taxTips',
  'spendingInsights',
  'monthlySummary',
];

export const insights = {
  get: (lang?: string) =>
    api<{
      balanceForecast: string;
      savingsRecommendation: string;
      investmentRecommendations: string;
      taxTips?: string;
      spendingInsights?: string;
      monthlySummary?: string;
    }>('/api/insights', { params: lang ? { lang } : undefined }),
  getSection: (section: InsightSection, lang?: string) =>
    api<{ content: string }>(`/api/insights/${section}`, { params: lang ? { lang } : undefined }),
};

export type FixedItem = {
  id: string;
  description: string;
  amount: number;
  categoryName: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  expectedEndDate: string | null;
};

export type ForexAccountItem = {
  id: string;
  name: string;
  currency: string;
  balance: string;
  provider: string | null;
  accountNum: string | null;
  notes: string | null;
  isActive: boolean;
  _count?: { transfers: number };
};

export type ForexTransferItem = {
  id: string;
  type: 'BUY' | 'SELL' | 'TRANSFER';
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  fee: string | null;
  date: string;
  description: string | null;
  notes: string | null;
  forexAccount: { id: string; name: string; currency: string } | null;
};

export const forex = {
  rates: (base?: string) =>
    api<{ base: string; date: string; rates: Record<string, number> }>('/api/forex/rates', { params: { base } }),
  convert: (amount: number, from: string, to: string) =>
    api<{ from: string; to: string; amount: number; result: number; rate: number; date: string }>('/api/forex/convert', {
      params: { amount, from, to },
    }),
  history: (from: string, to: string, start?: string, end?: string) =>
    api<{ base: string; target: string; rates: Array<{ date: string; rate: number }> }>('/api/forex/history', {
      params: { from, to, start, end },
    }),
  currencies: () => api<Record<string, string>>('/api/forex/currencies'),
  accounts: {
    list: () => api<ForexAccountItem[]>('/api/forex/accounts'),
    get: (id: string) => api<ForexAccountItem>(`/api/forex/accounts/${id}`),
    create: (body: { name: string; currency: string; balance?: number; provider?: string; accountNum?: string; notes?: string }) =>
      api<ForexAccountItem>('/api/forex/accounts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; currency?: string; balance?: number; provider?: string; accountNum?: string; notes?: string; isActive?: boolean }) =>
      api<ForexAccountItem>(`/api/forex/accounts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => api<unknown>(`/api/forex/accounts/${id}`, { method: 'DELETE' }),
  },
  transfers: {
    list: (accountId?: string) =>
      api<ForexTransferItem[]>('/api/forex/transfers' + (accountId ? `?accountId=${accountId}` : '')),
    create: (body: { forexAccountId?: string; type: string; fromCurrency: string; toCurrency: string; fromAmount: number; toAmount: number; exchangeRate: number; fee?: number; date: string; description?: string; notes?: string }) =>
      api<ForexTransferItem>('/api/forex/transfers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      api<ForexTransferItem>(`/api/forex/transfers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => api<unknown>(`/api/forex/transfers/${id}`, { method: 'DELETE' }),
  },
};

export type GoalItem = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  icon: string | null;
  color: string | null;
  priority: number;
  monthlyTarget: number | null;
  currency: string;
  notes: string | null;
  progress: number;
  remainingAmount: number;
  monthsRemaining: number | null;
  aiTips: string | null;
};

export const goals = {
  list: () => api<GoalItem[]>('/api/goals'),
  get: (id: string) => api<GoalItem>(`/api/goals/${id}`),
  create: (body: { name: string; targetAmount: number; currentAmount?: number; targetDate?: string; icon?: string; color?: string; priority?: number; monthlyTarget?: number; currency?: string; notes?: string }) =>
    api<unknown>('/api/goals', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; targetAmount?: number; currentAmount?: number; targetDate?: string; icon?: string; color?: string; priority?: number; monthlyTarget?: number; currency?: string; notes?: string; isActive?: boolean }) =>
    api<unknown>(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/goals/${id}`, { method: 'DELETE' }),
  aiTips: (id: string) => api<{ tips: string }>(`/api/goals/${id}/ai-tips`, { method: 'POST' }),
};

export const dashboard = {
  summary: (from?: string, to?: string, accountId?: string, categoryId?: string) =>
    api<{
      totalBalance: number;
      currentBalance: number;
      income: number;
      expenses: number;
      creditCardCharges?: number;
      fixedExpensesSum?: number;
      fixedIncomeSum?: number;
      period: { from: string; to: string };
      accounts: Array<{ id: string; name: string; type: string; balance: string }>;
      currentAccountBalances: Array<{ id: string; name: string; balance: number }>;
      spendingByCategory: Array<{ categoryId: string; category: { name: string; slug?: string; color: string | null }; total: number }>;
      incomeByCategory: Array<{ categoryId: string; category: { name: string; slug?: string; color: string | null }; total: number }>;
      transactionCount: number;
    }>('/api/dashboard/summary', {
      params: {
        ...(from && { from }),
        ...(to && { to }),
        ...(accountId && { accountId }),
        ...(categoryId && { categoryId }),
      } as Record<string, string>,
    }),
  trends: (from: string, to: string, groupBy?: 'month' | 'year', accountId?: string, categoryId?: string) =>
    api<Array<{ period: string; income: number; expenses: number }>>('/api/dashboard/trends', {
      params: { from, to, ...(groupBy && { groupBy }), ...(accountId && { accountId }), ...(categoryId && { categoryId }) },
    }),
  fixedExpenses: () => api<FixedItem[]>('/api/dashboard/fixed-expenses'),
  fixedIncome: () => api<FixedItem[]>('/api/dashboard/fixed-income'),
  recentTransactions: () =>
    api<Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
      categoryName: string | null;
      categorySlug: string | null;
      categoryColor: string | null;
      accountName: string | null;
    }>>('/api/dashboard/recent-transactions'),
};

// Budgets
export type BudgetItem = {
  id: string;
  categoryId: string;
  category: { id: string; name: string; slug: string; color: string | null; icon: string | null };
  amount: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  isOver: boolean;
};

export const budgets = {
  list: () => api<BudgetItem[]>('/api/budgets'),
  upsert: (body: { categoryId: string; amount: number }) =>
    api<unknown>('/api/budgets', { method: 'POST', body: JSON.stringify(body) }),
  remove: (id: string) => api<unknown>(`/api/budgets/${id}`, { method: 'DELETE' }),
  summary: (month?: string) =>
    api<{ totalBudgeted: number; totalSpent: number; remaining: number; percentUsed: number; budgetCount: number; overBudgetCount: number; overBudget: Array<{ categoryName: string; amount: number; spent: number }> }>(
      '/api/budgets/summary',
      { params: month ? { month } : undefined },
    ),
};

// Alerts
export type AlertItem = {
  id: string;
  type: 'budget_exceeded' | 'low_balance' | 'goal_deadline' | 'unusual_expense' | 'recurring_missed';
  severity: 'warning' | 'info' | 'critical';
  title: string;
  description: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export const alerts = {
  list: () => api<AlertItem[]>('/api/alerts'),
};

// Recurring patterns
export type RecurringPatternItem = {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  frequency: string;
  categoryId: string | null;
  accountId: string | null;
  lastSeenDate: string;
  occurrences: number;
  isConfirmed: boolean;
};

// Mortgages
export type MortgageTrackItem = {
  id: string;
  mortgageId: string;
  name: string | null;
  trackType: string; // PRIME, FIXED, VARIABLE, CPI_FIXED, CPI_VARIABLE
  indexType: string | null; // CPI, NONE, DOLLAR, EURO
  amount: number;
  interestRate: number;
  monthlyPayment: number | null;
  totalPayments: number | null;
  remainingPayments: number | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};

export type MortgageItem = {
  id: string;
  name: string;
  bank: string | null;
  propertyValue: number | null;
  totalAmount: number;
  remainingAmount: number | null;
  totalMonthly: number | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  notes: string | null;
  isActive: boolean;
  tracks: MortgageTrackItem[];
};

export const mortgages = {
  list: () => api<MortgageItem[]>('/api/mortgages'),
  get: (id: string) => api<MortgageItem>(`/api/mortgages/${id}`),
  create: (body: {
    name: string; bank?: string; propertyValue?: number; totalAmount: number;
    remainingAmount?: number; totalMonthly?: number; startDate?: string; endDate?: string;
    currency?: string; notes?: string;
    tracks?: Array<{
      name?: string; trackType: string; indexType?: string; amount: number;
      interestRate: number; monthlyPayment?: number; totalPayments?: number;
      remainingPayments?: number; startDate?: string; endDate?: string; notes?: string;
    }>;
  }) => api<MortgageItem>('/api/mortgages', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    api<unknown>(`/api/mortgages/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/mortgages/${id}`, { method: 'DELETE' }),
  addTrack: (mortgageId: string, body: {
    name?: string; trackType: string; indexType?: string; amount: number;
    interestRate: number; monthlyPayment?: number; totalPayments?: number;
    remainingPayments?: number; startDate?: string; endDate?: string; notes?: string;
  }) => api<MortgageTrackItem>(`/api/mortgages/${mortgageId}/tracks`, { method: 'POST', body: JSON.stringify(body) }),
  updateTrack: (mortgageId: string, trackId: string, body: Record<string, unknown>) =>
    api<unknown>(`/api/mortgages/${mortgageId}/tracks/${trackId}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTrack: (mortgageId: string, trackId: string) =>
    api<unknown>(`/api/mortgages/${mortgageId}/tracks/${trackId}`, { method: 'DELETE' }),
};

// Stocks
export type StockHoldingItem = {
  id: string;
  portfolioId: string;
  ticker: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  shares: number;
  avgBuyPrice: number;
  currency: string;
  buyDate: string | null;
  currentPrice: number | null;
  priceUpdatedAt: string | null;
  notes: string | null;
  isActive: boolean;
};

export type StockPortfolioItem = {
  id: string;
  name: string;
  broker: string | null;
  accountNum: string | null;
  currency: string;
  notes: string | null;
  isActive: boolean;
  holdings: StockHoldingItem[];
};

export type StockProviderInfo = {
  name: string;
  url: string;
  hasApiKey: boolean;
  description: string;
};

export type StockQuote = {
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
};

export const stocks = {
  provider: () => api<StockProviderInfo>('/api/stocks/provider'),
  search: (q: string) => api<Array<{ symbol: string; description: string; type: string }>>('/api/stocks/search', { params: { q } }),
  quote: (ticker: string) => api<StockQuote | null>(`/api/stocks/quote/${encodeURIComponent(ticker)}`),
  portfolios: {
    list: () => api<StockPortfolioItem[]>('/api/stocks/portfolios'),
    get: (id: string) => api<StockPortfolioItem>(`/api/stocks/portfolios/${id}`),
    create: (body: { name: string; broker?: string; accountNum?: string; currency?: string; notes?: string }) =>
      api<StockPortfolioItem>('/api/stocks/portfolios', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      api<unknown>(`/api/stocks/portfolios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => api<unknown>(`/api/stocks/portfolios/${id}`, { method: 'DELETE' }),
    refreshPrices: (id: string) => api<StockPortfolioItem>(`/api/stocks/portfolios/${id}/refresh-prices`, { method: 'POST' }),
  },
  holdings: {
    add: (portfolioId: string, body: {
      ticker: string; name: string; exchange?: string; sector?: string;
      shares: number; avgBuyPrice: number; currency?: string; buyDate?: string; notes?: string;
    }) => api<StockHoldingItem>(`/api/stocks/portfolios/${portfolioId}/holdings`, { method: 'POST', body: JSON.stringify(body) }),
    update: (portfolioId: string, holdingId: string, body: Record<string, unknown>) =>
      api<unknown>(`/api/stocks/portfolios/${portfolioId}/holdings/${holdingId}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (portfolioId: string, holdingId: string) =>
      api<unknown>(`/api/stocks/portfolios/${portfolioId}/holdings/${holdingId}`, { method: 'DELETE' }),
  },
};

export const recurring = {
  list: () => api<RecurringPatternItem[]>('/api/recurring'),
  detect: () => api<{ detected: number; patterns: RecurringPatternItem[] }>('/api/recurring/detect', { method: 'POST' }),
  confirm: (id: string) => api<unknown>(`/api/recurring/${id}/confirm`, { method: 'POST' }),
  dismiss: (id: string) => api<unknown>(`/api/recurring/${id}/dismiss`, { method: 'POST' }),
};
