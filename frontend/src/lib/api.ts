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
  login: (email: string, password: string, captchaToken?: string) =>
    api<{ accessToken: string; user: { id: string; email: string; name: string | null; householdId: string; countryCode?: string } }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password, captchaToken }) },
    ),
  register: (email: string, password: string, name?: string, countryCode?: string, captchaToken?: string) =>
    api<{ accessToken: string; user: { id: string; email: string; name: string | null; householdId: string; countryCode?: string } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, countryCode, captchaToken }),
    }),
};

export const users = {
  me: () => api<{ id: string; email: string; name: string | null; householdId: string; countryCode?: string | null }>('/api/users/me'),
  update: (body: { name?: string; email?: string; password?: string; countryCode?: string | null }) =>
    api<{ id: string; email: string; name: string | null; householdId: string; countryCode?: string | null }>('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getDashboardConfig: () =>
    api<{ widgets: WidgetConfig[] } | null>('/api/users/me/dashboard-config'),
  saveDashboardConfig: (config: { widgets: WidgetConfig[] }) =>
    api<{ ok: boolean }>('/api/users/me/dashboard-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
};

export type WidgetConfig = {
  id: string;
  type: 'stat' | 'bar-chart' | 'pie-chart' | 'fixed-list' | 'recent-tx';
  metric?: string;
  variant?: string;
  title?: string;
  color?: string;
  size: 'sm' | 'md' | 'lg';
};

export const accounts = {
  list: (type?: string) =>
    api<Array<{ id: string; name: string; type: string; balance: string; currency: string }>>(
      '/api/accounts' + (type ? `?type=${encodeURIComponent(type)}` : ''),
    ),
  get: (id: string) => api<unknown>(`/api/accounts/${id}`),
  create: (body: { name: string; type: string; provider?: string; balance?: number; currency?: string }) =>
    api<unknown>('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; type?: string; balance?: number; isActive?: boolean }) =>
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
  list: (params?: { from?: string; to?: string; accountId?: string; categoryId?: string; search?: string; page?: number; limit?: number }) => {
    const p = params ?? {};
    const query = new URLSearchParams();
    if (p.from != null && p.from !== '') query.set('from', String(p.from));
    if (p.to != null && p.to !== '') query.set('to', String(p.to));
    if (p.accountId != null && p.accountId !== '') query.set('accountId', String(p.accountId));
    if (p.categoryId != null && p.categoryId !== '') query.set('categoryId', String(p.categoryId));
    if (p.search != null && p.search !== '') query.set('search', String(p.search));
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

export const dashboard = {
  summary: (from?: string, to?: string, accountId?: string, categoryId?: string) =>
    api<{
      totalBalance: number;
      income: number;
      expenses: number;
      fixedExpensesSum?: number;
      fixedIncomeSum?: number;
      period: { from: string; to: string };
      accounts: Array<{ id: string; name: string; type: string; balance: string }>;
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
