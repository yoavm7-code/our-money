'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clients,
  projects as projectsApi,
  invoices as invoicesApi,
  type ClientItem,
  type ProjectItem,
  type InvoiceItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';

// ─── Constants ───────────────────────────────────────
const CLIENT_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e',
  '#eab308', '#f97316', '#ef4444', '#ec4899', '#8b5cf6',
  '#14b8a6', '#f59e0b', '#64748b',
];

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP'];

// ─── Helpers ─────────────────────────────────────────
function formatCurrency(n: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string, locale: string) {
  return new Date(d).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── SVG Icons ───────────────────────────────────────
function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 me-1">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function IconInvoice() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl-flip">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><path d="M9 22V12h6v10" /><line x1="8" y1="6" x2="8" y2="6" /><line x1="12" y1="6" x2="12" y2="6" /><line x1="16" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="8" y2="10" /><line x1="16" y1="10" x2="16" y2="10" />
    </svg>
  );
}

function IconTrendUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

// ─── Form initial state ──────────────────────────────
const emptyForm = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  taxId: '',
  hourlyRate: '',
  currency: 'ILS',
  color: '#6366f1',
  notes: '',
  website: '',
  company: '',
};

// ─── Skeleton Loader ─────────────────────────────────
function ClientsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="skeleton h-8 w-40 mb-2" />
          <div className="skeleton h-4 w-64" />
        </div>
        <div className="skeleton h-10 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card">
            <div className="skeleton h-4 w-24 mb-2" />
            <div className="skeleton h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="skeleton h-10 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="skeleton w-12 h-12 rounded-xl" />
              <div className="flex-1">
                <div className="skeleton h-5 w-28 mb-2" />
                <div className="skeleton h-3 w-20" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-3/4" />
            </div>
            <div className="flex gap-2 mt-4">
              <div className="skeleton h-8 w-8 rounded-lg" />
              <div className="skeleton h-8 w-8 rounded-lg" />
              <div className="skeleton h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Delete Confirmation Dialog ──────────────────────
function DeleteDialog({
  open,
  clientName,
  onConfirm,
  onCancel,
  t,
}: {
  open: boolean;
  clientName: string;
  onConfirm: () => void;
  onCancel: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-sm animate-scaleIn p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-600 dark:text-red-400">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('clients.deleteTitle')}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {t('clients.deleteConfirm', { name: clientName })}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={onConfirm} className="btn-danger flex-1">
              {t('common.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Client Form Modal ───────────────────────────────
function ClientFormModal({
  open,
  editingId,
  form,
  setForm,
  onClose,
  onSave,
  saving,
  t,
}: {
  open: boolean;
  editingId: string | null;
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  saving: boolean;
  t: (key: string) => string;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h3 className="font-semibold text-lg">
            {editingId ? t('clients.editClient') : t('clients.addClient')}
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <IconClose />
          </button>
        </div>
        <form onSubmit={onSave} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('clients.clientName')} *</label>
            <input
              className="input w-full"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('clients.clientNamePlaceholder')}
              required
            />
          </div>

          {/* Company & Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('clients.company')}</label>
              <input
                className="input w-full"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder={t('clients.companyPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('clients.contactName')}</label>
              <input
                className="input w-full"
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder={t('clients.contactNamePlaceholder')}
              />
            </div>
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('clients.email')}</label>
              <input
                type="email"
                className="input w-full"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('clients.phone')}</label>
              <input
                type="tel"
                className="input w-full"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="050-0000000"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('clients.address')}</label>
            <input
              className="input w-full"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder={t('clients.addressPlaceholder')}
            />
          </div>

          {/* Tax ID, Hourly Rate, Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('clients.taxId')}</label>
              <input
                className="input w-full"
                value={form.taxId}
                onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                placeholder={t('clients.taxIdPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('clients.hourlyRate')}</label>
              <input
                type="number"
                step="1"
                className="input w-full"
                value={form.hourlyRate}
                onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('clients.currency')}</label>
              <select
                className="input w-full"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('clients.website')}</label>
            <input
              className="input w-full"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('clients.color')}</label>
            <div className="flex flex-wrap gap-2">
              {CLIENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('clients.notes')}</label>
            <textarea
              className="input w-full h-20 resize-none"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={t('clients.notesPlaceholder')}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? t('common.loading') : editingId ? t('common.save') : t('clients.addClient')}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Client Detail Panel ─────────────────────────────
function ClientDetailPanel({
  client,
  clientProjects,
  clientInvoices,
  onClose,
  onEdit,
  t,
  locale,
}: {
  client: ClientItem;
  clientProjects: ProjectItem[];
  clientInvoices: InvoiceItem[];
  onClose: () => void;
  onEdit: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  const activeProjects = clientProjects.filter((p) => p.status === 'active');
  const totalInvoiced = clientInvoices.reduce((s, inv) => s + inv.total, 0);
  const totalPaid = clientInvoices.filter((inv) => inv.status === 'paid').reduce((s, inv) => s + inv.total, 0);
  const outstanding = totalInvoiced - totalPaid;

  // Simple revenue by month (last 6 months)
  const revenueByMonth = useMemo(() => {
    const months: { label: string; amount: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'short' });
      const amount = clientInvoices
        .filter((inv) => inv.status === 'paid' && inv.paidDate && inv.paidDate.startsWith(key))
        .reduce((s, inv) => s + inv.total, 0);
      months.push({ label, amount });
    }
    return months;
  }, [clientInvoices, locale]);

  const maxRevenue = Math.max(...revenueByMonth.map((m) => m.amount), 1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-[var(--border)]">
          <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-2xl" style={{ background: client.company ? undefined : '#6366f1' }} />
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0"
              style={{ background: '#6366f1' }}
            >
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold truncate">{client.name}</h2>
              {client.company && <p className="text-sm text-slate-500">{client.company}</p>}
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-500">
                {client.email && (
                  <span className="flex items-center gap-1">
                    <IconMail /> {client.email}
                  </span>
                )}
                {client.phone && (
                  <span className="flex items-center gap-1">
                    <IconPhone /> {client.phone}
                  </span>
                )}
                {client.contactName && (
                  <span className="flex items-center gap-1">
                    <IconUser /> {client.contactName}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onEdit} className="btn-secondary text-sm px-3 py-1.5">
                <IconEdit /> <span className="ms-1">{t('clients.edit')}</span>
              </button>
              <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <IconClose />
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 border-b border-[var(--border)]">
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">{t('clients.activeProjects')}</p>
            <p className="text-xl font-bold text-primary-600 dark:text-primary-400">{activeProjects.length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">{t('clients.totalInvoiced')}</p>
            <p className="text-xl font-bold">{formatCurrency(totalInvoiced, client.currency, locale)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">{t('clients.totalPaid')}</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalPaid, client.currency, locale)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1">{t('clients.outstanding')}</p>
            <p className={`text-xl font-bold ${outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
              {formatCurrency(outstanding, client.currency, locale)}
            </p>
          </div>
        </div>

        {/* Revenue chart */}
        <div className="p-6 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <IconTrendUp />
            {t('clients.revenueOverTime')}
          </h3>
          <div className="flex items-end gap-2 h-32">
            {revenueByMonth.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-slate-500 font-medium">
                  {m.amount > 0 ? formatCurrency(m.amount, client.currency, locale) : ''}
                </span>
                <div className="w-full relative" style={{ height: '80px' }}>
                  <div
                    className="absolute bottom-0 inset-x-1 rounded-t-md bg-gradient-to-t from-primary-600 to-primary-400 dark:from-primary-500 dark:to-primary-300 transition-all duration-500"
                    style={{ height: `${Math.max(m.amount > 0 ? 8 : 2, (m.amount / maxRevenue) * 80)}px` }}
                  />
                </div>
                <span className="text-xs text-slate-400">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Projects list */}
        <div className="p-6 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold mb-3">{t('clients.projectsList')} ({clientProjects.length})</h3>
          {clientProjects.length === 0 ? (
            <p className="text-sm text-slate-400">{t('clients.noProjects')}</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {clientProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <IconFolder />
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                  <span className={`badge ${
                    p.status === 'active' ? 'badge-success' :
                    p.status === 'completed' ? 'badge-primary' :
                    p.status === 'on_hold' ? 'badge-warning' :
                    'badge-danger'
                  }`}>
                    {t(`projects.status_${p.status}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent invoices */}
        <div className="p-6">
          <h3 className="text-sm font-semibold mb-3">{t('clients.recentInvoices')} ({clientInvoices.length})</h3>
          {clientInvoices.length === 0 ? (
            <p className="text-sm text-slate-400">{t('clients.noInvoices')}</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {clientInvoices.slice(0, 10).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div>
                    <span className="text-sm font-medium">#{inv.invoiceNumber}</span>
                    <span className="text-xs text-slate-400 ms-2">{formatDate(inv.issueDate, locale)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {formatCurrency(inv.total, inv.currency, locale)}
                    </span>
                    <span className={`badge ${
                      inv.status === 'paid' ? 'badge-success' :
                      inv.status === 'sent' ? 'badge-primary' :
                      inv.status === 'overdue' ? 'badge-danger' :
                      inv.status === 'draft' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' :
                      'badge-warning'
                    }`}>
                      {t(`invoices.status_${inv.status}`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Extra info */}
        {(client.address || client.taxId || client.hourlyRate || client.notes) && (
          <div className="p-6 border-t border-[var(--border)]">
            <h3 className="text-sm font-semibold mb-3">{t('clients.additionalInfo')}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {client.address && (
                <div>
                  <span className="text-slate-500">{t('clients.address')}:</span>
                  <p className="font-medium">{client.address}</p>
                </div>
              )}
              {client.taxId && (
                <div>
                  <span className="text-slate-500">{t('clients.taxId')}:</span>
                  <p className="font-medium">{client.taxId}</p>
                </div>
              )}
              {client.hourlyRate != null && client.hourlyRate > 0 && (
                <div>
                  <span className="text-slate-500">{t('clients.hourlyRate')}:</span>
                  <p className="font-medium">{formatCurrency(client.hourlyRate, client.currency, locale)}</p>
                </div>
              )}
              {client.website && (
                <div>
                  <span className="text-slate-500">{t('clients.website')}:</span>
                  <p className="font-medium">{client.website}</p>
                </div>
              )}
            </div>
            {client.notes && (
              <div className="mt-3">
                <span className="text-sm text-slate-500">{t('clients.notes')}:</span>
                <p className="text-sm mt-1 whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════
export default function ClientsPage() {
  const { t, locale } = useTranslation();

  // ─── State ───────────────────────────────────────
  const [clientsList, setClientsList] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Detail panel
  const [detailClient, setDetailClient] = useState<ClientItem | null>(null);
  const [detailProjects, setDetailProjects] = useState<ProjectItem[]>([]);
  const [detailInvoices, setDetailInvoices] = useState<InvoiceItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ClientItem | null>(null);

  // ─── Data fetching ───────────────────────────────
  const fetchClients = useCallback(() => {
    setLoading(true);
    clients
      .list()
      .then(setClientsList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // ─── Filtered list ───────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return clientsList;
    const q = search.toLowerCase();
    return clientsList.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.contactName && c.contactName.toLowerCase().includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q))
    );
  }, [clientsList, search]);

  // ─── Summary stats ───────────────────────────────
  const totalClients = clientsList.length;
  const activeClients = clientsList.filter((c) => c.isActive).length;
  const totalRevenue = clientsList.reduce((s, c) => s + (c.totalRevenue || 0), 0);

  // ─── Handlers ────────────────────────────────────
  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setMsg(null);
  }

  function openEdit(c: ClientItem) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      contactName: c.contactName || '',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      taxId: c.taxId || '',
      hourlyRate: c.hourlyRate != null ? String(c.hourlyRate) : '',
      currency: c.currency || 'ILS',
      color: '#6366f1',
      notes: c.notes || '',
      website: c.website || '',
      company: c.company || '',
    });
    setShowForm(true);
    setMsg(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        contactName: form.contactName.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        taxId: form.taxId.trim() || undefined,
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : undefined,
        currency: form.currency,
        notes: form.notes.trim() || undefined,
        website: form.website.trim() || undefined,
        company: form.company.trim() || undefined,
      };
      if (editingId) {
        await clients.update(editingId, body);
        setMsg({ text: t('clients.clientUpdated'), type: 'success' });
      } else {
        await clients.create(body);
        setMsg({ text: t('clients.clientCreated'), type: 'success' });
      }
      setShowForm(false);
      fetchClients();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : t('common.somethingWentWrong'), type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(c: ClientItem) {
    setDeleteTarget(c);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await clients.delete(deleteTarget.id);
      setMsg({ text: t('clients.clientDeleted'), type: 'success' });
      setDeleteTarget(null);
      if (detailClient?.id === deleteTarget.id) setDetailClient(null);
      fetchClients();
    } catch {
      setMsg({ text: t('common.somethingWentWrong'), type: 'error' });
    }
  }

  async function openDetail(c: ClientItem) {
    setDetailClient(c);
    setDetailLoading(true);
    try {
      const [projs, invs] = await Promise.all([
        projectsApi.list(c.id),
        invoicesApi.list({ clientId: c.id }),
      ]);
      setDetailProjects(projs);
      setDetailInvoices(invs);
    } catch {
      setDetailProjects([]);
      setDetailInvoices([]);
    } finally {
      setDetailLoading(false);
    }
  }

  // ─── Auto-dismiss message ───────────────────────
  useEffect(() => {
    if (msg) {
      const timer = setTimeout(() => setMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [msg]);

  // ─── Render: Loading ─────────────────────────────
  if (loading) {
    return <ClientsSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('clients.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('clients.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={openAdd}>
          <IconPlus />
          {t('clients.addClient')}
        </button>
      </div>

      {/* Message */}
      {msg && (
        <div className={`rounded-xl p-3 text-sm ${
          msg.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Summary cards */}
      {clientsList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card stat-card-indigo">
            <p className="text-sm text-slate-500">{t('clients.totalClients')}</p>
            <p className="text-2xl font-bold mt-1">{totalClients}</p>
          </div>
          <div className="card stat-card-green">
            <p className="text-sm text-slate-500">{t('clients.activeClientsCount')}</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{activeClients}</p>
          </div>
          <div className="card stat-card-blue">
            <p className="text-sm text-slate-500">{t('clients.totalRevenue')}</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalRevenue, 'ILS', locale)}</p>
          </div>
        </div>
      )}

      {/* Search bar */}
      {clientsList.length > 0 && (
        <div className="relative">
          <div className="absolute inset-y-0 start-3 flex items-center pointer-events-none">
            <IconSearch />
          </div>
          <input
            className="input w-full ps-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('clients.searchPlaceholder')}
          />
          {search && (
            <button
              type="button"
              className="absolute inset-y-0 end-3 flex items-center text-slate-400 hover:text-slate-600"
              onClick={() => setSearch('')}
            >
              <IconClose />
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {clientsList.length === 0 ? (
        <div className="card text-center py-16">
          <div className="mx-auto mb-6">
            <IconBuilding />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('clients.emptyTitle')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
            {t('clients.emptyDescription')}
          </p>
          <button type="button" className="btn-primary" onClick={openAdd}>
            <IconPlus />
            {t('clients.addFirstClient')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-500">{t('clients.noResults')}</p>
        </div>
      ) : (
        /* Client cards grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c, idx) => {
            const projectCount = c._count?.projects || 0;
            const revenue = c.totalRevenue || 0;
            const initials = c.name
              .split(' ')
              .map((w) => w.charAt(0))
              .slice(0, 2)
              .join('')
              .toUpperCase();

            return (
              <div
                key={c.id}
                className={`card-hover relative overflow-hidden cursor-pointer group stagger-${Math.min(idx + 1, 8)}`}
                style={{ animationName: 'fadeIn' }}
                onClick={() => openDetail(c)}
              >
                {/* Top color bar */}
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: '#6366f1' }} />

                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md"
                    style={{ background: '#6366f1' }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      {c.name}
                    </h3>
                    {c.contactName && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <IconUser /> {c.contactName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconChevronRight />
                  </div>
                </div>

                {/* Contact info */}
                <div className="space-y-1.5 mb-4">
                  {c.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <IconMail />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <IconPhone />
                      <span>{c.phone}</span>
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 mb-4 pt-3 border-t border-[var(--border)]">
                  <div className="flex-1">
                    <p className="text-xs text-slate-400">{t('clients.projects')}</p>
                    <p className="text-sm font-bold">{projectCount}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400">{t('clients.revenue')}</p>
                    <p className="text-sm font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(revenue, c.currency, locale)}
                    </p>
                  </div>
                  {c.hourlyRate != null && c.hourlyRate > 0 && (
                    <div className="flex-1">
                      <p className="text-xs text-slate-400">{t('clients.rate')}</p>
                      <p className="text-sm font-bold">{formatCurrency(c.hourlyRate, c.currency, locale)}/h</p>
                    </div>
                  )}
                </div>

                {/* Quick actions */}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title={t('clients.edit')}
                  >
                    <IconEdit /> {t('clients.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openDetail(c); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title={t('clients.viewProjects')}
                  >
                    <IconFolder /> {t('clients.projects')}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); /* Navigate to create invoice for this client */ }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title={t('clients.createInvoice')}
                  >
                    <IconInvoice /> {t('clients.invoice')}
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); confirmDelete(c); }}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                    title={t('common.delete')}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <ClientFormModal
        open={showForm}
        editingId={editingId}
        form={form}
        setForm={setForm}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
        saving={saving}
        t={t}
      />

      <DeleteDialog
        open={!!deleteTarget}
        clientName={deleteTarget?.name || ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        t={t}
      />

      {detailClient && !detailLoading && (
        <ClientDetailPanel
          client={detailClient}
          clientProjects={detailProjects}
          clientInvoices={detailInvoices}
          onClose={() => setDetailClient(null)}
          onEdit={() => { openEdit(detailClient); setDetailClient(null); }}
          t={t}
          locale={locale}
        />
      )}

      {detailClient && detailLoading && (
        <div className="modal-overlay">
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-2xl p-12 animate-scaleIn text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent mx-auto" />
            <p className="text-sm text-slate-500 mt-3">{t('common.loading')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
