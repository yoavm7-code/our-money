'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  projects,
  clients as clientsApi,
  invoices as invoicesApi,
  type ProjectItem,
  type ClientItem,
  type InvoiceItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';

// ─── Constants ───────────────────────────────────────
const PROJECT_STATUSES = ['active', 'completed', 'on_hold', 'cancelled'] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const STATUS_CONFIG: Record<ProjectStatus, { badgeClass: string; dotColor: string }> = {
  active: { badgeClass: 'badge-success', dotColor: '#22c55e' },
  completed: { badgeClass: 'badge-primary', dotColor: '#6366f1' },
  on_hold: { badgeClass: 'badge-warning', dotColor: '#f59e0b' },
  cancelled: { badgeClass: 'badge-danger', dotColor: '#ef4444' },
};

const PROJECT_COLORS = [
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

function formatDateShort(d: string, locale: string) {
  return new Date(d).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', {
    day: 'numeric',
    month: 'short',
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

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function IconKanban() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="4" height="18" rx="1" /><rect x="10" y="3" width="4" height="12" rx="1" /><rect x="16" y="3" width="4" height="15" rx="1" />
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

function IconClipboard() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function IconDollar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ─── Form initial state ──────────────────────────────
const emptyForm = {
  name: '',
  description: '',
  clientId: '',
  status: 'active' as ProjectStatus,
  budget: '',
  hourlyRate: '',
  currency: 'ILS',
  startDate: '',
  endDate: '',
  color: '#6366f1',
  notes: '',
};

// ─── Skeleton Loader ─────────────────────────────────
function ProjectsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="skeleton h-8 w-40 mb-2" />
          <div className="skeleton h-4 w-64" />
        </div>
        <div className="skeleton h-10 w-36 rounded-xl" />
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-9 w-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card">
            <div className="flex items-start gap-3 mb-4">
              <div className="skeleton w-10 h-10 rounded-lg" />
              <div className="flex-1">
                <div className="skeleton h-5 w-32 mb-2" />
                <div className="skeleton h-3 w-20" />
              </div>
            </div>
            <div className="skeleton h-2 w-full rounded-full mb-3" />
            <div className="space-y-2">
              <div className="skeleton h-3 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
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
  projectName,
  onConfirm,
  onCancel,
  t,
}: {
  open: boolean;
  projectName: string;
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
          <h3 className="text-lg font-semibold mb-2">{t('projects.deleteTitle')}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {t('projects.deleteConfirm', { name: projectName })}
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

// ─── Project Form Modal ──────────────────────────────
function ProjectFormModal({
  open,
  editingId,
  form,
  setForm,
  clientsList,
  onClose,
  onSave,
  saving,
  t,
}: {
  open: boolean;
  editingId: string | null;
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  clientsList: ClientItem[];
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
            {editingId ? t('projects.editProject') : t('projects.addProject')}
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <IconClose />
          </button>
        </div>
        <form onSubmit={onSave} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('projects.projectName')} *</label>
            <input
              className="input w-full"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('projects.projectNamePlaceholder')}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('projects.description')}</label>
            <textarea
              className="input w-full h-20 resize-none"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('projects.descriptionPlaceholder')}
            />
          </div>

          {/* Client & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('projects.client')} *</label>
              <select
                className="input w-full"
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                required
              >
                <option value="">{t('projects.selectClient')}</option>
                {clientsList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('projects.status')}</label>
              <select
                className="input w-full"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`projects.status_${s}`)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Budget, Hourly Rate, Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('projects.budget')}</label>
              <input
                type="number"
                step="1"
                className="input w-full"
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('projects.hourlyRate')}</label>
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
              <label className="block text-sm font-medium mb-1">{t('projects.currency')}</label>
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

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('projects.startDate')}</label>
              <input
                type="date"
                className="input w-full"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('projects.endDate')}</label>
              <input
                type="date"
                className="input w-full"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('projects.color')}</label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
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
            <label className="block text-sm font-medium mb-1">{t('projects.notes')}</label>
            <textarea
              className="input w-full h-20 resize-none"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={t('projects.notesPlaceholder')}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? t('common.loading') : editingId ? t('common.save') : t('projects.addProject')}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Project Detail Panel ────────────────────────────
function ProjectDetailPanel({
  project,
  projectInvoices,
  onClose,
  onEdit,
  onStatusChange,
  t,
  locale,
}: {
  project: ProjectItem;
  projectInvoices: InvoiceItem[];
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (status: ProjectStatus) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  const budget = project.budget || 0;
  const totalInvoiced = project.totalInvoiced || projectInvoices.reduce((s, inv) => s + inv.total, 0);
  const totalPaid = project.totalPaid || projectInvoices.filter((inv) => inv.status === 'paid').reduce((s, inv) => s + inv.total, 0);
  const budgetUsedPct = budget > 0 ? Math.min(100, Math.round((totalInvoiced / budget) * 100)) : 0;
  const budgetRemaining = budget > 0 ? budget - totalInvoiced : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-[var(--border)]">
          <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-2xl" style={{ background: STATUS_CONFIG[project.status]?.dotColor || '#6366f1' }} />
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md"
              style={{ background: STATUS_CONFIG[project.status]?.dotColor || '#6366f1' }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold truncate">{project.name}</h2>
              {project.client && (
                <p className="text-sm text-slate-500">{project.client.name}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className={`badge ${STATUS_CONFIG[project.status]?.badgeClass || 'badge-primary'}`}>
                  {t(`projects.status_${project.status}`)}
                </span>
                {project.startDate && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <IconCalendar />
                    {formatDateShort(project.startDate, locale)}
                    {project.endDate && ` - ${formatDateShort(project.endDate, locale)}`}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onEdit} className="btn-secondary text-sm px-3 py-1.5">
                <IconEdit /> <span className="ms-1">{t('projects.edit')}</span>
              </button>
              <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <IconClose />
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <div className="px-6 pt-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">{project.description}</p>
          </div>
        )}

        {/* Budget tracking */}
        <div className="p-6 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <IconDollar />
            {t('projects.budgetTracking')}
          </h3>
          {budget > 0 ? (
            <>
              <div className="flex items-center justify-between text-sm mb-2">
                <span>
                  {formatCurrency(totalInvoiced, project.currency, locale)} / {formatCurrency(budget, project.currency, locale)}
                </span>
                <span className={`font-bold ${budgetUsedPct >= 90 ? 'text-red-600 dark:text-red-400' : budgetUsedPct >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                  {budgetUsedPct}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all duration-700 animate-progressFill ${
                    budgetUsedPct >= 90
                      ? 'bg-gradient-to-r from-red-500 to-red-400'
                      : budgetUsedPct >= 70
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                      : 'bg-gradient-to-r from-primary-500 to-primary-400'
                  }`}
                  style={{ width: `${budgetUsedPct}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="text-slate-500">{t('projects.budgetUsed')}</p>
                  <p className="font-bold">{formatCurrency(totalInvoiced, project.currency, locale)}</p>
                </div>
                <div>
                  <p className="text-slate-500">{t('projects.budgetRemaining')}</p>
                  <p className="font-bold text-green-600 dark:text-green-400">{formatCurrency(budgetRemaining, project.currency, locale)}</p>
                </div>
                <div>
                  <p className="text-slate-500">{t('projects.totalPaid')}</p>
                  <p className="font-bold">{formatCurrency(totalPaid, project.currency, locale)}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-center text-sm">
              <div>
                <p className="text-slate-500">{t('projects.totalInvoiced')}</p>
                <p className="text-xl font-bold">{formatCurrency(totalInvoiced, project.currency, locale)}</p>
              </div>
              <div>
                <p className="text-slate-500">{t('projects.totalPaid')}</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalPaid, project.currency, locale)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Status change buttons */}
        <div className="px-6 pt-4 pb-2 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold mb-3">{t('projects.changeStatus')}</h3>
          <div className="flex flex-wrap gap-2">
            {PROJECT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStatusChange(s)}
                disabled={s === project.status}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  s === project.status
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="inline-block w-2 h-2 rounded-full me-1.5" style={{ background: STATUS_CONFIG[s].dotColor }} />
                {t(`projects.status_${s}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Related invoices */}
        <div className="p-6 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold mb-3">{t('projects.relatedInvoices')} ({projectInvoices.length})</h3>
          {projectInvoices.length === 0 ? (
            <p className="text-sm text-slate-400">{t('projects.noInvoices')}</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {projectInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div>
                    <span className="text-sm font-medium">#{inv.invoiceNumber}</span>
                    <span className="text-xs text-slate-400 ms-2">{formatDate(inv.issueDate, locale)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatCurrency(inv.total, inv.currency, locale)}</span>
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

        {/* Project info */}
        <div className="p-6">
          <h3 className="text-sm font-semibold mb-3">{t('projects.projectInfo')}</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {project.hourlyRate != null && project.hourlyRate > 0 && (
              <div>
                <span className="text-slate-500">{t('projects.hourlyRate')}:</span>
                <p className="font-medium">{formatCurrency(project.hourlyRate, project.currency, locale)}/h</p>
              </div>
            )}
            {project.totalHours != null && project.totalHours > 0 && (
              <div>
                <span className="text-slate-500">{t('projects.totalHours')}:</span>
                <p className="font-medium">{project.totalHours}h</p>
              </div>
            )}
            {project.billedHours != null && project.billedHours > 0 && (
              <div>
                <span className="text-slate-500">{t('projects.billedHours')}:</span>
                <p className="font-medium">{project.billedHours}h</p>
              </div>
            )}
            <div>
              <span className="text-slate-500">{t('projects.createdAt')}:</span>
              <p className="font-medium">{formatDate(project.createdAt, locale)}</p>
            </div>
          </div>
          {project.notes && (
            <div className="mt-3">
              <span className="text-sm text-slate-500">{t('projects.notes')}:</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{project.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Column ───────────────────────────────────
function KanbanColumn({
  status,
  projectsList,
  onDragOver,
  onDrop,
  onDragStart,
  onCardClick,
  t,
  locale,
}: {
  status: ProjectStatus;
  projectsList: ProjectItem[];
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: ProjectStatus) => void;
  onDragStart: (e: React.DragEvent, projectId: string) => void;
  onCardClick: (p: ProjectItem) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  const config = STATUS_CONFIG[status];
  return (
    <div
      className="flex-1 min-w-[260px] max-w-[320px]"
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, status)}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="w-3 h-3 rounded-full" style={{ background: config.dotColor }} />
        <h3 className="text-sm font-semibold">{t(`projects.status_${status}`)}</h3>
        <span className="text-xs text-slate-400 ms-auto">{projectsList.length}</span>
      </div>
      <div className="space-y-2 min-h-[200px] rounded-xl bg-slate-50 dark:bg-slate-800/30 p-2 border border-dashed border-slate-200 dark:border-slate-700">
        {projectsList.map((p) => {
          const budget = p.budget || 0;
          const invoiced = p.totalInvoiced || 0;
          const pct = budget > 0 ? Math.min(100, Math.round((invoiced / budget) * 100)) : 0;
          return (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => onDragStart(e, p.id)}
              onClick={() => onCardClick(p)}
              className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)] cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
            >
              <p className="text-sm font-semibold truncate mb-1">{p.name}</p>
              {p.client && <p className="text-xs text-slate-400 mb-2">{p.client.name}</p>}
              {budget > 0 && (
                <div className="mb-2">
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{pct}% {t('projects.ofBudget')}</p>
                </div>
              )}
              {p.startDate && (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <IconCalendar />
                  {formatDateShort(p.startDate, locale)}
                  {p.endDate && ` - ${formatDateShort(p.endDate, locale)}`}
                </p>
              )}
            </div>
          );
        })}
        {projectsList.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">{t('projects.noProjectsInColumn')}</p>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════
export default function ProjectsPage() {
  const { t, locale } = useTranslation();

  // ─── State ───────────────────────────────────────
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([]);
  const [clientsList, setClientsList] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | ProjectStatus>('all');
  const [filterClientId, setFilterClientId] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'kanban'>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Detail panel
  const [detailProject, setDetailProject] = useState<ProjectItem | null>(null);
  const [detailInvoices, setDetailInvoices] = useState<InvoiceItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null);

  // Drag ref for kanban
  const dragProjectId = useRef<string | null>(null);

  // ─── Data fetching ───────────────────────────────
  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      projects.list(),
      clientsApi.list(),
    ])
      .then(([projs, cls]) => {
        setProjectsList(projs);
        setClientsList(cls);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Filtered & tabbed list ──────────────────────
  const filtered = useMemo(() => {
    let list = projectsList;

    // Tab filter
    if (activeTab !== 'all') {
      list = list.filter((p) => p.status === activeTab);
    }

    // Client filter
    if (filterClientId) {
      list = list.filter((p) => p.clientId === filterClientId);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.client && p.client.name.toLowerCase().includes(q))
      );
    }

    return list;
  }, [projectsList, activeTab, filterClientId, search]);

  // ─── Summary stats ───────────────────────────────
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: projectsList.length };
    for (const s of PROJECT_STATUSES) {
      counts[s] = projectsList.filter((p) => p.status === s).length;
    }
    return counts;
  }, [projectsList]);

  // ─── Handlers ────────────────────────────────────
  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setMsg(null);
  }

  function openEdit(p: ProjectItem) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description || '',
      clientId: p.clientId,
      status: p.status,
      budget: p.budget != null ? String(p.budget) : '',
      hourlyRate: p.hourlyRate != null ? String(p.hourlyRate) : '',
      currency: p.currency || 'ILS',
      startDate: p.startDate ? new Date(p.startDate).toISOString().slice(0, 10) : '',
      endDate: p.endDate ? new Date(p.endDate).toISOString().slice(0, 10) : '',
      color: '#6366f1',
      notes: p.notes || '',
    });
    setShowForm(true);
    setMsg(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.clientId) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        clientId: form.clientId,
        status: form.status,
        budget: form.budget ? parseFloat(form.budget) : undefined,
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : undefined,
        currency: form.currency,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editingId) {
        await projects.update(editingId, body);
        setMsg({ text: t('projects.projectUpdated'), type: 'success' });
      } else {
        await projects.create(body);
        setMsg({ text: t('projects.projectCreated'), type: 'success' });
      }
      setShowForm(false);
      fetchData();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : t('common.somethingWentWrong'), type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(p: ProjectItem) {
    setDeleteTarget(p);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await projects.delete(deleteTarget.id);
      setMsg({ text: t('projects.projectDeleted'), type: 'success' });
      setDeleteTarget(null);
      if (detailProject?.id === deleteTarget.id) setDetailProject(null);
      fetchData();
    } catch {
      setMsg({ text: t('common.somethingWentWrong'), type: 'error' });
    }
  }

  async function openDetail(p: ProjectItem) {
    setDetailProject(p);
    setDetailLoading(true);
    try {
      const invs = await invoicesApi.list({ projectId: p.id });
      setDetailInvoices(invs);
    } catch {
      setDetailInvoices([]);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleStatusChange(newStatus: ProjectStatus) {
    if (!detailProject) return;
    try {
      await projects.update(detailProject.id, { status: newStatus });
      setDetailProject({ ...detailProject, status: newStatus });
      setMsg({ text: t('projects.statusChanged'), type: 'success' });
      fetchData();
    } catch {
      setMsg({ text: t('common.somethingWentWrong'), type: 'error' });
    }
  }

  // ─── Kanban drag & drop ──────────────────────────
  function handleDragStart(e: React.DragEvent, projectId: string) {
    dragProjectId.current = projectId;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleDrop(e: React.DragEvent, targetStatus: ProjectStatus) {
    e.preventDefault();
    const projectId = dragProjectId.current;
    if (!projectId) return;

    const project = projectsList.find((p) => p.id === projectId);
    if (!project || project.status === targetStatus) return;

    // Optimistic update
    setProjectsList((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, status: targetStatus } : p))
    );

    try {
      await projects.update(projectId, { status: targetStatus });
      setMsg({ text: t('projects.statusChanged'), type: 'success' });
    } catch {
      // Revert on failure
      fetchData();
      setMsg({ text: t('common.somethingWentWrong'), type: 'error' });
    }

    dragProjectId.current = null;
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
    return <ProjectsSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('projects.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('projects.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              title={t('projects.gridView')}
            >
              <IconGrid />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              title={t('projects.kanbanView')}
            >
              <IconKanban />
            </button>
          </div>
          <button type="button" className="btn-primary" onClick={openAdd}>
            <IconPlus />
            {t('projects.addProject')}
          </button>
        </div>
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

      {/* Status tabs */}
      {projectsList.length > 0 && viewMode === 'grid' && (
        <div className="flex flex-wrap gap-2">
          {(['all', ...PROJECT_STATUSES] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'bg-[var(--card)] border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {tab !== 'all' && (
                  <span className="w-2 h-2 rounded-full" style={{ background: isActive ? 'white' : STATUS_CONFIG[tab].dotColor }} />
                )}
                {tab === 'all' ? t('common.all') : t(`projects.status_${tab}`)}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'
                }`}>
                  {tabCounts[tab] || 0}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + client filter */}
      {projectsList.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <div className="absolute inset-y-0 start-3 flex items-center pointer-events-none">
              <IconSearch />
            </div>
            <input
              className="input w-full ps-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('projects.searchPlaceholder')}
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
          <div className="relative min-w-[180px]">
            <select
              className="input w-full appearance-none pe-8"
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
            >
              <option value="">{t('projects.allClients')}</option>
              {clientsList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 end-2.5 flex items-center pointer-events-none">
              <IconChevronDown />
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {projectsList.length === 0 ? (
        <div className="card text-center py-16">
          <div className="mx-auto mb-6">
            <IconClipboard />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('projects.emptyTitle')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
            {t('projects.emptyDescription')}
          </p>
          <button type="button" className="btn-primary" onClick={openAdd}>
            <IconPlus />
            {t('projects.addFirstProject')}
          </button>
        </div>
      ) : viewMode === 'kanban' ? (
        /* ─── Kanban View ─── */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PROJECT_STATUSES.map((status) => {
            const columnProjects = projectsList.filter((p) => {
              let match = p.status === status;
              if (filterClientId) match = match && p.clientId === filterClientId;
              if (search.trim()) {
                const q = search.toLowerCase();
                match = match && (
                  p.name.toLowerCase().includes(q) ||
                  (p.description && p.description.toLowerCase().includes(q)) ||
                  (p.client && p.client.name.toLowerCase().includes(q))
                );
              }
              return match;
            });
            return (
              <KanbanColumn
                key={status}
                status={status}
                projectsList={columnProjects}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onCardClick={openDetail}
                t={t}
                locale={locale}
              />
            );
          })}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-500">{t('projects.noResults')}</p>
        </div>
      ) : (
        /* ─── Grid View ─── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p, idx) => {
            const budget = p.budget || 0;
            const invoiced = p.totalInvoiced || 0;
            const pct = budget > 0 ? Math.min(100, Math.round((invoiced / budget) * 100)) : 0;
            const config = STATUS_CONFIG[p.status];

            return (
              <div
                key={p.id}
                className={`card-hover relative overflow-hidden cursor-pointer group stagger-${Math.min(idx + 1, 8)}`}
                style={{ animationName: 'fadeIn' }}
                onClick={() => openDetail(p)}
              >
                {/* Top color indicator */}
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: config.dotColor }} />

                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm"
                    style={{ background: config.dotColor }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      {p.name}
                    </h3>
                    {p.client && (
                      <p className="text-xs text-slate-400 truncate">{p.client.name}</p>
                    )}
                  </div>
                  <span className={`badge ${config.badgeClass} text-[11px]`}>
                    {t(`projects.status_${p.status}`)}
                  </span>
                </div>

                {/* Budget progress */}
                {budget > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500">
                        {formatCurrency(invoiced, p.currency, locale)} / {formatCurrency(budget, p.currency, locale)}
                      </span>
                      <span className={`font-bold ${pct >= 90 ? 'text-red-500' : pct >= 70 ? 'text-amber-500' : 'text-green-600 dark:text-green-400'}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          pct >= 90
                            ? 'bg-gradient-to-r from-red-500 to-red-400'
                            : pct >= 70
                            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                            : 'bg-gradient-to-r from-primary-500 to-primary-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Info row */}
                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                  {p.startDate && (
                    <span className="flex items-center gap-1">
                      <IconCalendar />
                      {formatDateShort(p.startDate, locale)}
                      {p.endDate && ` - ${formatDateShort(p.endDate, locale)}`}
                    </span>
                  )}
                  {invoiced > 0 && (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                      <IconDollar />
                      {formatCurrency(invoiced, p.currency, locale)}
                    </span>
                  )}
                </div>

                {/* Quick actions */}
                <div className="flex gap-1.5 pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title={t('projects.edit')}
                  >
                    <IconEdit /> {t('projects.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); /* Navigate to invoices for this project */ }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title={t('projects.invoices')}
                  >
                    <IconInvoice /> {t('projects.invoices')}
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); confirmDelete(p); }}
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
      <ProjectFormModal
        open={showForm}
        editingId={editingId}
        form={form}
        setForm={setForm}
        clientsList={clientsList}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
        saving={saving}
        t={t}
      />

      <DeleteDialog
        open={!!deleteTarget}
        projectName={deleteTarget?.name || ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        t={t}
      />

      {detailProject && !detailLoading && (
        <ProjectDetailPanel
          project={detailProject}
          projectInvoices={detailInvoices}
          onClose={() => setDetailProject(null)}
          onEdit={() => { openEdit(detailProject); setDetailProject(null); }}
          onStatusChange={handleStatusChange}
          t={t}
          locale={locale}
        />
      )}

      {detailProject && detailLoading && (
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
