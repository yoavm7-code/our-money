/**
 * API client for FreelancerOS backend.
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
  if (init.body && typeof init.body === 'string' && !(headers as Record<string, string>)['Content-Type']) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
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

// ─────────────────────────────────────────────
// Helper for file uploads (FormData, XHR progress)
// ─────────────────────────────────────────────

function uploadFormData<T>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  }).then((res) => {
    if (!res.ok) return res.json().then((e) => { throw new Error((e as { message?: string }).message || 'Upload failed'); });
    return res.json() as Promise<T>;
  });
}

// ═══════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════

export const auth = {
  login: (email: string, password: string, captchaToken?: string, twoFactorToken?: string) =>
    api<{
      accessToken: string | null;
      user: { id: string; email: string; name: string | null; householdId: string; countryCode?: string } | null;
      requiresTwoFactor?: boolean;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, captchaToken, twoFactorToken }),
    }),
  register: (email: string, password: string, name?: string, countryCode?: string, captchaToken?: string, phone?: string) =>
    api<{
      accessToken: string;
      user: { id: string; email: string; name: string | null; householdId: string; countryCode?: string };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, countryCode, captchaToken, phone }),
    }),
  verifyEmail: (token: string) =>
    api<{ verified: boolean }>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerification: () =>
    api<{ sent: boolean }>('/api/auth/resend-verification', { method: 'POST' }),
};

// ═══════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════

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
  type: 'stat' | 'bar-chart' | 'pie-chart' | 'fixed-list' | 'recent-tx' | 'forex-accounts' | 'goals' | 'budgets' | 'recurring' | 'clients' | 'invoices' | 'projects';
  metric?: string;
  variant?: string;
  title?: string;
  color?: string;
  size: 'sm' | 'md' | 'lg';
};

export const users = {
  me: () =>
    api<{
      id: string;
      email: string;
      name: string | null;
      householdId: string;
      countryCode?: string | null;
      avatarUrl?: string | null;
      emailVerified?: boolean;
      phone?: string | null;
      onboardingCompleted?: boolean;
      twoFactorMethod?: string | null;
    }>('/api/users/me'),
  update: (body: { name?: string; email?: string; password?: string; countryCode?: string | null }) =>
    api<{
      id: string;
      email: string;
      name: string | null;
      householdId: string;
      countryCode?: string | null;
      avatarUrl?: string | null;
    }>('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return uploadFormData<{ avatarUrl: string }>('/api/users/me/avatar', form);
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

// ═══════════════════════════════════════════════
// TWO-FACTOR AUTH
// ═══════════════════════════════════════════════

export const twoFactor = {
  status: () => api<{ enabled: boolean }>('/api/2fa/status'),
  generate: () => api<{ secret: string; qrCode: string }>('/api/2fa/generate', { method: 'POST' }),
  enable: (token: string) => api<{ enabled: boolean }>('/api/2fa/enable', { method: 'POST', body: JSON.stringify({ token }) }),
  disable: (token: string) => api<{ enabled: boolean }>('/api/2fa/disable', { method: 'POST', body: JSON.stringify({ token }) }),
  sendCode: () => api<{ sent: boolean }>('/api/2fa/send-code', { method: 'POST' }),
  getMethod: () => api<{ method: string | null }>('/api/2fa/method'),
  setMethod: (method: string) => api<{ method: string }>('/api/2fa/method', { method: 'PUT', body: JSON.stringify({ method }) }),
};

// ═══════════════════════════════════════════════
// ACCOUNTS
// ═══════════════════════════════════════════════

export type AccountItem = {
  id: string;
  name: string;
  type: string;
  balance: string;
  balanceDate?: string | null;
  currency: string;
};

export const accounts = {
  list: (type?: string) =>
    api<AccountItem[]>('/api/accounts' + (type ? `?type=${encodeURIComponent(type)}` : '')),
  get: (id: string) => api<AccountItem>(`/api/accounts/${id}`),
  create: (body: { name: string; type: string; provider?: string; balance?: number; balanceDate?: string; currency?: string; linkedBankAccountId?: string }) =>
    api<AccountItem>('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; type?: string; balance?: number; balanceDate?: string | null; isActive?: boolean; linkedBankAccountId?: string | null }) =>
    api<AccountItem>(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/accounts/${id}`, { method: 'DELETE' }),
};

// ═══════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════

export type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  isIncome: boolean;
  excludeFromExpenseTotal?: boolean;
};

export const categories = {
  list: (incomeOnly?: boolean) =>
    api<CategoryItem[]>('/api/categories' + (incomeOnly !== undefined ? `?incomeOnly=${incomeOnly}` : '')),
  create: (body: { name: string; slug?: string; icon?: string; color?: string; isIncome?: boolean; excludeFromExpenseTotal?: boolean }) =>
    api<CategoryItem>('/api/categories', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; icon?: string; color?: string; isIncome?: boolean; excludeFromExpenseTotal?: boolean }) =>
    api<CategoryItem>(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/categories/${id}`, { method: 'DELETE' }),
};

// ═══════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════

export type ParsedVoiceInput = {
  action: 'transaction' | 'loan' | 'saving' | 'goal' | 'budget' | 'forex' | 'mortgage' | 'stock_portfolio' | 'account';
  name?: string;
  description?: string;
  amount?: number;
  currency?: string;
  date?: string;
  type?: 'expense' | 'income';
  categorySlug?: string | null;
  originalAmount?: number;
  remainingAmount?: number;
  interestRate?: number;
  monthlyPayment?: number;
  lender?: string;
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: string;
  budgetCategorySlug?: string;
  fromCurrency?: string;
  toCurrency?: string;
  fromAmount?: number;
  toAmount?: number;
  exchangeRate?: number;
  bank?: string;
  totalAmount?: number;
  broker?: string;
  accountType?: string;
};

export type TransactionItem = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency?: string;
  categoryId: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  categoryColor?: string | null;
  accountId: string | null;
  accountName?: string | null;
  isRecurring?: boolean;
  totalAmount?: number | null;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
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
    return api<{ items: TransactionItem[]; total: number; page: number; limit: number }>(`/api/transactions?${qs}`);
  },
  create: (body: { accountId: string; categoryId?: string; date: string; description: string; amount: number; currency?: string; isRecurring?: boolean; totalAmount?: number; installmentCurrent?: number; installmentTotal?: number }) =>
    api<TransactionItem>('/api/transactions', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { accountId?: string; categoryId?: string | null; date?: string; description?: string; amount?: number; isRecurring?: boolean; totalAmount?: number | null; installmentCurrent?: number | null; installmentTotal?: number | null }) =>
    api<TransactionItem>(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  updateCategory: (id: string, categoryId: string | null) =>
    api<TransactionItem>(`/api/transactions/${id}/category`, {
      method: 'PATCH',
      body: JSON.stringify({ categoryId }),
    }),
  delete: (id: string) => api<unknown>(`/api/transactions/${id}`, { method: 'DELETE' }),
  suggestCategory: (description: string) =>
    api<{ categoryId: string | null }>('/api/transactions/suggest-category', {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),
  parseVoice: (text: string) =>
    api<ParsedVoiceInput | { error: string }>('/api/transactions/parse-voice', {
      method: 'POST',
      body: JSON.stringify({ text }),
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

// ═══════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════

export type DocumentWithCount = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  _count?: { transactions: number };
  extractedCount?: number;
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

export const documents = {
  upload: (file: File, accountId: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('accountId', accountId);
    return uploadFormData<DocumentWithCount>('/api/documents/upload', form);
  },

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
                resolve(d as DocumentWithCount);
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

// ═══════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════

export type ClientItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  isActive: boolean;
  currency: string;
  hourlyRate: number | null;
  contactName: string | null;
  website: string | null;
  createdAt: string;
  _count?: { projects: number; invoices: number };
  totalRevenue?: number;
};

export const clients = {
  list: () => api<ClientItem[]>('/api/clients'),
  get: (id: string) => api<ClientItem>(`/api/clients/${id}`),
  create: (body: {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    address?: string;
    taxId?: string;
    notes?: string;
    currency?: string;
    hourlyRate?: number;
    contactName?: string;
    website?: string;
  }) => api<ClientItem>('/api/clients', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    address?: string;
    taxId?: string;
    notes?: string;
    currency?: string;
    hourlyRate?: number;
    contactName?: string;
    website?: string;
    isActive?: boolean;
  }) => api<ClientItem>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/clients/${id}`, { method: 'DELETE' }),
};

// ═══════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════

export type ProjectItem = {
  id: string;
  name: string;
  clientId: string;
  client?: { id: string; name: string };
  description: string | null;
  status: 'active' | 'completed' | 'on_hold' | 'cancelled';
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  hourlyRate: number | null;
  totalHours: number | null;
  billedHours: number | null;
  currency: string;
  notes: string | null;
  createdAt: string;
  totalInvoiced?: number;
  totalPaid?: number;
};

export const projects = {
  list: (clientId?: string) =>
    api<ProjectItem[]>('/api/projects' + (clientId ? `?clientId=${clientId}` : '')),
  get: (id: string) => api<ProjectItem>(`/api/projects/${id}`),
  create: (body: {
    name: string;
    clientId: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    hourlyRate?: number;
    currency?: string;
    notes?: string;
  }) => api<ProjectItem>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: {
    name?: string;
    clientId?: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    hourlyRate?: number;
    totalHours?: number;
    billedHours?: number;
    currency?: string;
    notes?: string;
  }) => api<ProjectItem>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/projects/${id}`, { method: 'DELETE' }),
};

// ═══════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════

export type InvoiceLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate?: number;
};

export type InvoiceItem = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  client?: { id: string; name: string; email: string | null };
  projectId: string | null;
  project?: { id: string; name: string } | null;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  notes: string | null;
  terms: string | null;
  lineItems: InvoiceLineItem[];
  createdAt: string;
};

export type InvoiceSummary = {
  totalDraft: number;
  totalSent: number;
  totalPaid: number;
  totalOverdue: number;
  countDraft: number;
  countSent: number;
  countPaid: number;
  countOverdue: number;
};

export const invoices = {
  list: (params?: { clientId?: string; projectId?: string; status?: string }) =>
    api<InvoiceItem[]>('/api/invoices', { params: params as Record<string, string | undefined> }),
  get: (id: string) => api<InvoiceItem>(`/api/invoices/${id}`),
  create: (body: {
    clientId: string;
    projectId?: string;
    issueDate: string;
    dueDate: string;
    taxRate?: number;
    currency?: string;
    notes?: string;
    terms?: string;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }>;
  }) => api<InvoiceItem>('/api/invoices', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: {
    clientId?: string;
    projectId?: string | null;
    issueDate?: string;
    dueDate?: string;
    taxRate?: number;
    currency?: string;
    notes?: string;
    terms?: string;
    lineItems?: Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }>;
  }) => api<InvoiceItem>(`/api/invoices/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  send: (id: string) =>
    api<InvoiceItem>(`/api/invoices/${id}/send`, { method: 'POST' }),
  markPaid: (id: string, paidDate?: string) =>
    api<InvoiceItem>(`/api/invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify({ paidDate }) }),
  cancel: (id: string) =>
    api<InvoiceItem>(`/api/invoices/${id}/cancel`, { method: 'POST' }),
  duplicate: (id: string) =>
    api<InvoiceItem>(`/api/invoices/${id}/duplicate`, { method: 'POST' }),
  delete: (id: string) => api<unknown>(`/api/invoices/${id}`, { method: 'DELETE' }),
  getNextNumber: () =>
    api<{ nextNumber: string }>('/api/invoices/next-number'),
  getSummary: (params?: { from?: string; to?: string }) =>
    api<InvoiceSummary>('/api/invoices/summary', { params: params as Record<string, string | undefined> }),
};

// ═══════════════════════════════════════════════
// TAX
// ═══════════════════════════════════════════════

export type TaxPeriod = {
  id: string;
  year: number;
  month: number | null;
  quarter: number | null;
  periodType: 'monthly' | 'bimonthly' | 'quarterly' | 'annual';
  status: 'open' | 'calculated' | 'filed';
  income: number;
  expenses: number;
  taxableIncome: number;
  vatCollected: number;
  vatDeductible: number;
  vatPayable: number;
  incomeTax: number;
  nationalInsurance: number;
  healthTax: number;
  totalTax: number;
  filedDate: string | null;
  notes: string | null;
};

export type TaxSummary = {
  totalIncome: number;
  totalExpenses: number;
  totalTaxPaid: number;
  totalVatPaid: number;
  pendingPeriods: number;
  upcomingDeadline: string | null;
};

export type VatReport = {
  period: string;
  sales: number;
  vatOnSales: number;
  purchases: number;
  vatOnPurchases: number;
  netVat: number;
  transactions: Array<{ date: string; description: string; amount: number; vat: number; type: 'sale' | 'purchase' }>;
};

export const tax = {
  getPeriods: (year?: number) =>
    api<TaxPeriod[]>('/api/tax/periods', { params: year ? { year } : undefined }),
  createPeriod: (body: {
    year: number;
    month?: number;
    quarter?: number;
    periodType: string;
  }) => api<TaxPeriod>('/api/tax/periods', { method: 'POST', body: JSON.stringify(body) }),
  updatePeriod: (id: string, body: Partial<TaxPeriod>) =>
    api<TaxPeriod>(`/api/tax/periods/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  calculatePeriod: (id: string) =>
    api<TaxPeriod>(`/api/tax/periods/${id}/calculate`, { method: 'POST' }),
  markFiled: (id: string, filedDate?: string) =>
    api<TaxPeriod>(`/api/tax/periods/${id}/mark-filed`, { method: 'POST', body: JSON.stringify({ filedDate }) }),
  getSummary: (year?: number) =>
    api<TaxSummary>('/api/tax/summary', { params: year ? { year } : undefined }),
  getVatReport: (params: { year: number; month?: number; quarter?: number }) =>
    api<VatReport>('/api/tax/vat-report', { params: params as Record<string, string | number | undefined> }),
};

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════

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
  getCashFlow: (params?: { from?: string; to?: string }) =>
    api<{ inflows: number; outflows: number; net: number; byMonth: Array<{ month: string; inflows: number; outflows: number; net: number }> }>(
      '/api/dashboard/cash-flow',
      { params: params as Record<string, string | undefined> },
    ),
  search: (query: string) =>
    api<{
      transactions: Array<{ id: string; description: string; amount: number; date: string }>;
      accounts: Array<{ id: string; name: string; type: string }>;
      categories: Array<{ id: string; name: string; slug: string }>;
      clients: Array<{ id: string; name: string }>;
      projects: Array<{ id: string; name: string }>;
      invoices: Array<{ id: string; invoiceNumber: string; clientName: string }>;
    }>('/api/dashboard/search', { params: { q: query } }),
};

// ═══════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════

export const reports = {
  getProfitLoss: (params: { from: string; to: string }) =>
    api<{
      income: number;
      expenses: number;
      netProfit: number;
      incomeByCategory: Array<{ category: string; total: number }>;
      expensesByCategory: Array<{ category: string; total: number }>;
      byMonth: Array<{ month: string; income: number; expenses: number; net: number }>;
    }>('/api/reports/profit-loss', { params }),
  getCashFlow: (params: { from: string; to: string }) =>
    api<{
      inflows: number;
      outflows: number;
      net: number;
      byMonth: Array<{ month: string; inflows: number; outflows: number; net: number }>;
    }>('/api/reports/cash-flow', { params }),
  getClientRevenue: (params?: { from?: string; to?: string }) =>
    api<Array<{
      clientId: string;
      clientName: string;
      totalInvoiced: number;
      totalPaid: number;
      outstanding: number;
      invoiceCount: number;
    }>>('/api/reports/client-revenue', { params: params as Record<string, string | undefined> }),
  getCategoryBreakdown: (params: { from: string; to: string; type?: 'income' | 'expense' }) =>
    api<Array<{
      categoryId: string;
      categoryName: string;
      categoryColor: string | null;
      total: number;
      percentage: number;
      transactionCount: number;
    }>>('/api/reports/category-breakdown', { params: params as Record<string, string | undefined> }),
  getTaxSummary: (params: { year: number }) =>
    api<{
      income: number;
      deductions: number;
      taxableIncome: number;
      estimatedTax: number;
      vatCollected: number;
      vatDeductible: number;
      vatPayable: number;
      quarterlyBreakdown: Array<{ quarter: number; income: number; expenses: number; tax: number }>;
    }>('/api/reports/tax-summary', { params }),
  getForecast: (params?: { months?: number }) =>
    api<{
      projectedIncome: number;
      projectedExpenses: number;
      projectedNet: number;
      monthlyForecast: Array<{ month: string; income: number; expenses: number; net: number; confidence: number }>;
    }>('/api/reports/forecast', { params: params as Record<string, string | number | undefined> }),
};

// ═══════════════════════════════════════════════
// INSIGHTS
// ═══════════════════════════════════════════════

export type InsightSection =
  | 'balanceForecast'
  | 'savingsRecommendation'
  | 'investmentRecommendations'
  | 'taxTips'
  | 'spendingInsights'
  | 'monthlySummary'
  | 'clientInsights'
  | 'invoiceInsights';

export const INSIGHT_SECTIONS: InsightSection[] = [
  'balanceForecast',
  'savingsRecommendation',
  'investmentRecommendations',
  'taxTips',
  'spendingInsights',
  'monthlySummary',
  'clientInsights',
  'invoiceInsights',
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
      clientInsights?: string;
      invoiceInsights?: string;
    }>('/api/insights', { params: lang ? { lang } : undefined }),
  getSection: (section: InsightSection, lang?: string) =>
    api<{ content: string }>(`/api/insights/${section}`, { params: lang ? { lang } : undefined }),
};

// ═══════════════════════════════════════════════
// LOANS & SAVINGS
// ═══════════════════════════════════════════════

export type LoanItem = {
  id: string;
  name: string;
  lender: string | null;
  originalAmount: number;
  remainingAmount: number;
  interestRate: number | null;
  monthlyPayment: number | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  notes: string | null;
  isActive: boolean;
};

export type SavingItem = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  currency: string;
  notes: string | null;
  isActive: boolean;
};

export const loans = {
  list: () => api<LoanItem[]>('/api/loans'),
  get: (id: string) => api<LoanItem>(`/api/loans/${id}`),
  create: (body: {
    name: string;
    lender?: string;
    originalAmount: number;
    remainingAmount?: number;
    interestRate?: number;
    monthlyPayment?: number;
    startDate?: string;
    endDate?: string;
    currency?: string;
    notes?: string;
  }) => api<LoanItem>('/api/loans', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<LoanItem>) =>
    api<LoanItem>(`/api/loans/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/loans/${id}`, { method: 'DELETE' }),
};

export const savings = {
  list: () => api<SavingItem[]>('/api/savings'),
  get: (id: string) => api<SavingItem>(`/api/savings/${id}`),
  create: (body: {
    name: string;
    targetAmount: number;
    currentAmount?: number;
    targetDate?: string;
    currency?: string;
    notes?: string;
  }) => api<SavingItem>('/api/savings', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<SavingItem>) =>
    api<SavingItem>(`/api/savings/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/savings/${id}`, { method: 'DELETE' }),
};

// ═══════════════════════════════════════════════
// GOALS
// ═══════════════════════════════════════════════

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
  create: (body: {
    name: string;
    targetAmount: number;
    currentAmount?: number;
    targetDate?: string;
    icon?: string;
    color?: string;
    priority?: number;
    monthlyTarget?: number;
    currency?: string;
    notes?: string;
  }) => api<GoalItem>('/api/goals', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: {
    name?: string;
    targetAmount?: number;
    currentAmount?: number;
    targetDate?: string;
    icon?: string;
    color?: string;
    priority?: number;
    monthlyTarget?: number;
    currency?: string;
    notes?: string;
    isActive?: boolean;
  }) => api<GoalItem>(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/goals/${id}`, { method: 'DELETE' }),
  aiTips: (id: string) => api<{ tips: string }>(`/api/goals/${id}/ai-tips`, { method: 'POST' }),
};

// ═══════════════════════════════════════════════
// BUDGETS
// ═══════════════════════════════════════════════

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
    api<BudgetItem>('/api/budgets', { method: 'POST', body: JSON.stringify(body) }),
  remove: (id: string) => api<unknown>(`/api/budgets/${id}`, { method: 'DELETE' }),
  summary: (month?: string) =>
    api<{
      totalBudgeted: number;
      totalSpent: number;
      remaining: number;
      percentUsed: number;
      budgetCount: number;
      overBudgetCount: number;
      overBudget: Array<{ categoryName: string; amount: number; spent: number }>;
    }>('/api/budgets/summary', { params: month ? { month } : undefined }),
};

// ═══════════════════════════════════════════════
// FOREX
// ═══════════════════════════════════════════════

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
    create: (body: {
      forexAccountId?: string;
      type: string;
      fromCurrency: string;
      toCurrency: string;
      fromAmount: number;
      toAmount: number;
      exchangeRate: number;
      fee?: number;
      date: string;
      description?: string;
      notes?: string;
    }) => api<ForexTransferItem>('/api/forex/transfers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      api<ForexTransferItem>(`/api/forex/transfers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => api<unknown>(`/api/forex/transfers/${id}`, { method: 'DELETE' }),
  },
};

// ═══════════════════════════════════════════════
// RECURRING PATTERNS
// ═══════════════════════════════════════════════

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

export const recurring = {
  list: () => api<RecurringPatternItem[]>('/api/recurring'),
  detect: () => api<{ detected: number; patterns: RecurringPatternItem[] }>('/api/recurring/detect', { method: 'POST' }),
  confirm: (id: string) => api<unknown>(`/api/recurring/${id}/confirm`, { method: 'POST' }),
  dismiss: (id: string) => api<unknown>(`/api/recurring/${id}/dismiss`, { method: 'POST' }),
};

// ═══════════════════════════════════════════════
// MORTGAGES
// ═══════════════════════════════════════════════

export type MortgageTrackItem = {
  id: string;
  mortgageId: string;
  name: string | null;
  trackType: string;
  indexType: string | null;
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
    name: string;
    bank?: string;
    propertyValue?: number;
    totalAmount: number;
    remainingAmount?: number;
    totalMonthly?: number;
    startDate?: string;
    endDate?: string;
    currency?: string;
    notes?: string;
    tracks?: Array<{
      name?: string;
      trackType: string;
      indexType?: string;
      amount: number;
      interestRate: number;
      monthlyPayment?: number;
      totalPayments?: number;
      remainingPayments?: number;
      startDate?: string;
      endDate?: string;
      notes?: string;
    }>;
  }) => api<MortgageItem>('/api/mortgages', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    api<MortgageItem>(`/api/mortgages/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => api<unknown>(`/api/mortgages/${id}`, { method: 'DELETE' }),
  addTrack: (mortgageId: string, body: {
    name?: string;
    trackType: string;
    indexType?: string;
    amount: number;
    interestRate: number;
    monthlyPayment?: number;
    totalPayments?: number;
    remainingPayments?: number;
    startDate?: string;
    endDate?: string;
    notes?: string;
  }) => api<MortgageTrackItem>(`/api/mortgages/${mortgageId}/tracks`, { method: 'POST', body: JSON.stringify(body) }),
  updateTrack: (mortgageId: string, trackId: string, body: Record<string, unknown>) =>
    api<MortgageTrackItem>(`/api/mortgages/${mortgageId}/tracks/${trackId}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTrack: (mortgageId: string, trackId: string) =>
    api<unknown>(`/api/mortgages/${mortgageId}/tracks/${trackId}`, { method: 'DELETE' }),
};

// ═══════════════════════════════════════════════
// STOCKS
// ═══════════════════════════════════════════════

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
      api<StockPortfolioItem>(`/api/stocks/portfolios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => api<unknown>(`/api/stocks/portfolios/${id}`, { method: 'DELETE' }),
    refreshPrices: (id: string) => api<StockPortfolioItem>(`/api/stocks/portfolios/${id}/refresh-prices`, { method: 'POST' }),
  },
  holdings: {
    add: (portfolioId: string, body: {
      ticker: string;
      name: string;
      exchange?: string;
      sector?: string;
      shares: number;
      avgBuyPrice: number;
      currency?: string;
      buyDate?: string;
      notes?: string;
    }) => api<StockHoldingItem>(`/api/stocks/portfolios/${portfolioId}/holdings`, { method: 'POST', body: JSON.stringify(body) }),
    update: (portfolioId: string, holdingId: string, body: Record<string, unknown>) =>
      api<StockHoldingItem>(`/api/stocks/portfolios/${portfolioId}/holdings/${holdingId}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (portfolioId: string, holdingId: string) =>
      api<unknown>(`/api/stocks/portfolios/${portfolioId}/holdings/${holdingId}`, { method: 'DELETE' }),
  },
};

// ═══════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════

export type AlertItem = {
  id: string;
  type: 'budget_exceeded' | 'low_balance' | 'goal_deadline' | 'unusual_expense' | 'recurring_missed' | 'invoice_overdue' | 'tax_deadline';
  severity: 'warning' | 'info' | 'critical';
  title: string;
  description: string;
  data: Record<string, unknown>;
  createdAt: string;
  isRead?: boolean;
};

export const alerts = {
  list: () => api<AlertItem[]>('/api/alerts'),
  markRead: (id: string) => api<unknown>(`/api/alerts/${id}/read`, { method: 'POST' }),
  clearAll: () => api<unknown>('/api/alerts/clear', { method: 'POST' }),
};

// ═══════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════

export const admin = {
  login: (email: string, password: string) =>
    api<{ accessToken: string; user: { id: string; email: string; name: string | null; isAdmin: boolean } }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  stats: () =>
    api<{
      totalUsers: number;
      totalHouseholds: number;
      totalTransactions: number;
      totalAccounts: number;
      usersToday: number;
      usersThisMonth: number;
    }>('/api/admin/stats'),
  users: {
    list: (params?: { search?: string; page?: number; limit?: number }) =>
      api<{
        items: Array<{
          id: string;
          email: string;
          name: string | null;
          countryCode: string | null;
          emailVerified: boolean;
          twoFactorEnabled: boolean;
          isAdmin: boolean;
          createdAt: string;
          householdId: string;
          _count?: { accounts: number; transactions: number };
        }>;
        total: number;
      }>('/api/admin/users', { params: params as Record<string, string | number | undefined> }),
    get: (id: string) => api<unknown>(`/api/admin/users/${id}`),
    create: (body: { email: string; password: string; name?: string; isAdmin?: boolean }) =>
      api<unknown>('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      api<unknown>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => api<unknown>(`/api/admin/users/${id}`, { method: 'DELETE' }),
    resetPassword: (id: string, newPassword: string) =>
      api<unknown>(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: newPassword }) }),
    getData: (id: string, dataType: string) =>
      api<unknown>(`/api/admin/users/${id}/data/${dataType}`),
    deleteRecord: (id: string, dataType: string, recordId: string) =>
      api<unknown>(`/api/admin/users/${id}/data/${dataType}/${recordId}`, { method: 'DELETE' }),
    backup: (id: string) => {
      const token = getToken();
      return fetch(`${API_URL}/api/admin/users/${id}/backup`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then((res) => {
        if (!res.ok) throw new Error('Backup failed');
        return res.blob();
      });
    },
  },
};
