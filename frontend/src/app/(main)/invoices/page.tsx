'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  invoices,
  clients as clientsApi,
  projects as projectsApi,
  type InvoiceItem,
  type InvoiceLineItem,
  type InvoiceSummary,
  type ClientItem,
  type ProjectItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import { useToast } from '@/components/Toast';

// ─── Constants ───────────────────────────────────────
const INVOICE_STATUSES = ['all', 'draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;
type StatusFilter = (typeof INVOICE_STATUSES)[number];

const INVOICE_TYPES = [
  'tax_invoice',
  'tax_invoice_receipt',
  'receipt',
  'price_quote',
  'credit_note',
] as const;
type InvoiceType = (typeof INVOICE_TYPES)[number];

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP'];
const DEFAULT_VAT_RATE = 17;

const SORT_OPTIONS = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc', 'status'] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

// ─── Helpers ─────────────────────────────────────────
function formatCurrency(n: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(d: string, locale: string) {
  return new Date(d).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateInput(d: Date): string {
  return d.toISOString().split('T')[0];
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getStatusOrder(status: string): number {
  const order: Record<string, number> = { overdue: 0, sent: 1, draft: 2, paid: 3, cancelled: 4 };
  return order[status] ?? 5;
}

function invoiceTypeLabel(type: InvoiceType, t: (k: string) => string): string {
  const labels: Record<InvoiceType, string> = {
    tax_invoice: t('invoices.typeTaxInvoice'),
    tax_invoice_receipt: t('invoices.typeTaxInvoiceReceipt'),
    receipt: t('invoices.typeReceipt'),
    price_quote: t('invoices.typePriceQuote'),
    credit_note: t('invoices.typeCreditNote'),
  };
  return labels[type] || type;
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

function IconSend() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function IconPrinter() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconAlertTriangle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
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

function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconFileText() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconGripVertical() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 dark:text-slate-600 cursor-grab">
      <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
    </svg>
  );
}

function IconBan() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconArrowUpDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 15l5 5 5-5" /><path d="M7 9l5-5 5 5" />
    </svg>
  );
}

// ─── Empty line item factory ─────────────────────────
function createEmptyLineItem(): InvoiceLineItem {
  return { description: '', quantity: 1, unitPrice: 0, amount: 0 };
}

// ─── Form initial state ─────────────────────────────
interface InvoiceForm {
  invoiceNumber: string;
  invoiceType: InvoiceType;
  clientId: string;
  projectId: string;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  vatRate: number;
  currency: string;
  terms: string;
  notes: string;
  language: 'he' | 'en';
}

function createEmptyForm(): InvoiceForm {
  const now = new Date();
  const due = new Date(now);
  due.setDate(due.getDate() + 30);
  return {
    invoiceNumber: '',
    invoiceType: 'tax_invoice',
    clientId: '',
    projectId: '',
    issueDate: formatDateInput(now),
    dueDate: formatDateInput(due),
    lineItems: [createEmptyLineItem()],
    vatRate: DEFAULT_VAT_RATE,
    currency: 'ILS',
    terms: '',
    notes: '',
    language: 'he',
  };
}

// ─── Skeleton Loader ─────────────────────────────────
function InvoicesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="skeleton h-8 w-40 mb-2" />
          <div className="skeleton h-4 w-64" />
        </div>
        <div className="skeleton h-10 w-36 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card">
            <div className="skeleton h-4 w-24 mb-2" />
            <div className="skeleton h-7 w-28 mb-1" />
            <div className="skeleton h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton h-9 w-20 rounded-xl" />
        ))}
      </div>
      <div className="card p-0 overflow-hidden">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-[var(--border)]">
            <div className="skeleton h-4 w-20" />
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-4 w-20" />
            <div className="skeleton h-6 w-16 rounded-full" />
            <div className="flex-1" />
            <div className="skeleton h-8 w-8 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status Badge Component ─────────────────────────
function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const config: Record<string, string> = {
    draft: 'invoice-draft',
    sent: 'invoice-sent',
    paid: 'invoice-paid',
    overdue: 'invoice-overdue',
    cancelled: 'invoice-cancelled',
  };
  const labels: Record<string, string> = {
    draft: t('invoices.statusDraft'),
    sent: t('invoices.statusSent'),
    paid: t('invoices.statusPaid'),
    overdue: t('invoices.statusOverdue'),
    cancelled: t('invoices.statusCancelled'),
  };
  return (
    <span className={`badge ${config[status] || 'badge-primary'} ${status === 'cancelled' ? 'line-through' : ''}`}>
      {labels[status] || status}
    </span>
  );
}

// ─── Confirm Dialog ──────────────────────────────────
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 70 }}>
      <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-sm animate-scaleIn p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <IconAlertTriangle />
          </div>
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{message}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1">
              ביטול
            </button>
            <button type="button" onClick={onConfirm} className={`flex-1 ${confirmClass || 'btn-danger'}`}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Recording Modal ─────────────────────────
function PaymentModal({
  open,
  invoice,
  onClose,
  onSave,
  t,
  locale,
}: {
  open: boolean;
  invoice: InvoiceItem | null;
  onClose: () => void;
  onSave: (invoiceId: string, paidDate: string) => void;
  t: (k: string) => string;
  locale: string;
}) {
  const [paidDate, setPaidDate] = useState(formatDateInput(new Date()));

  useEffect(() => {
    if (open) setPaidDate(formatDateInput(new Date()));
  }, [open]);

  if (!open || !invoice) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 70 }}>
      <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-sm animate-scaleIn p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{t('invoices.markPaid')}</h3>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-500 mb-1">{t('invoices.invoiceNumber')}</p>
            <p className="font-semibold">#{invoice.invoiceNumber}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-1">{t('invoices.total')}</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(invoice.total, invoice.currency, locale)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('invoices.paidDate')}</label>
            <input
              type="date"
              className="input w-full"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => onSave(invoice.id, paidDate)}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <IconCheck /> {t('invoices.markPaid')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Detail Panel ────────────────────────────
function InvoiceDetailPanel({
  invoice,
  onClose,
  onEdit,
  onSend,
  onMarkPaid,
  onCancel,
  onDuplicate,
  onDelete,
  onPrint,
  t,
  locale,
}: {
  invoice: InvoiceItem;
  onClose: () => void;
  onEdit: () => void;
  onSend: () => void;
  onMarkPaid: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPrint: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  const overdueDays = invoice.status === 'overdue' ? Math.abs(daysUntil(invoice.dueDate)) : 0;
  const daysLeft = invoice.status === 'sent' ? daysUntil(invoice.dueDate) : 0;

  // Timeline entries
  const timeline: { label: string; date: string; color: string }[] = [];
  timeline.push({ label: t('invoices.created'), date: invoice.createdAt, color: 'bg-slate-400' });
  if (invoice.issueDate !== invoice.createdAt) {
    timeline.push({ label: t('invoices.issued'), date: invoice.issueDate, color: 'bg-indigo-500' });
  }
  if (invoice.status === 'sent' || invoice.status === 'paid' || invoice.status === 'overdue') {
    timeline.push({ label: t('invoices.statusSent'), date: invoice.issueDate, color: 'bg-blue-500' });
  }
  if (invoice.status === 'paid' && invoice.paidDate) {
    timeline.push({ label: t('invoices.statusPaid'), date: invoice.paidDate, color: 'bg-green-500' });
  }
  if (invoice.status === 'cancelled') {
    timeline.push({ label: t('invoices.statusCancelled'), date: invoice.createdAt, color: 'bg-gray-500' });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-lg">#{invoice.invoiceNumber}</h3>
              <StatusBadge status={invoice.status} t={t} />
            </div>
            {invoice.client && (
              <p className="text-sm text-slate-500 mt-1">{invoice.client.name}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <IconClose />
          </button>
        </div>

        {/* Due date info */}
        {invoice.status === 'overdue' && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
            <IconAlertTriangle />
            <span>{t('invoices.daysOverdue')}: {overdueDays} {locale === 'he' ? 'ימים' : 'days'}</span>
          </div>
        )}
        {invoice.status === 'sent' && daysLeft > 0 && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm">
            <IconClock />
            <span>{t('invoices.daysUntilDue')}: {daysLeft} {locale === 'he' ? 'ימים' : 'days'}</span>
          </div>
        )}

        {/* Invoice summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-[var(--border)]">
          <div>
            <p className="text-xs text-slate-500 mb-1">{t('invoices.issueDate')}</p>
            <p className="text-sm font-semibold">{formatDate(invoice.issueDate, locale)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">{t('invoices.dueDate')}</p>
            <p className="text-sm font-semibold">{formatDate(invoice.dueDate, locale)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">{t('invoices.currency')}</p>
            <p className="text-sm font-semibold">{invoice.currency}</p>
          </div>
          {invoice.paidDate && (
            <div>
              <p className="text-xs text-slate-500 mb-1">{t('invoices.paidDate')}</p>
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">{formatDate(invoice.paidDate, locale)}</p>
            </div>
          )}
          {invoice.project && (
            <div>
              <p className="text-xs text-slate-500 mb-1">{t('invoices.project')}</p>
              <p className="text-sm font-semibold">{invoice.project.name}</p>
            </div>
          )}
        </div>

        {/* Line items table */}
        <div className="p-5 border-b border-[var(--border)]">
          <h4 className="text-sm font-semibold mb-3">{t('invoices.lineItems')}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-start py-2 pe-3 font-medium text-slate-500">{t('invoices.itemDescription')}</th>
                  <th className="text-center py-2 px-3 font-medium text-slate-500 w-20">{t('invoices.quantity')}</th>
                  <th className="text-center py-2 px-3 font-medium text-slate-500 w-28">{t('invoices.unitPrice')}</th>
                  <th className="text-end py-2 ps-3 font-medium text-slate-500 w-28">{t('invoices.lineTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 pe-3">{item.description}</td>
                    <td className="py-2.5 px-3 text-center">{item.quantity}</td>
                    <td className="py-2.5 px-3 text-center">{formatCurrency(item.unitPrice, invoice.currency, locale)}</td>
                    <td className="py-2.5 ps-3 text-end font-medium">{formatCurrency(item.amount, invoice.currency, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-4 pt-3 border-t border-[var(--border)] space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('invoices.subtotal')}</span>
              <span className="font-medium">{formatCurrency(invoice.subtotal, invoice.currency, locale)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('invoices.vat')} ({invoice.taxRate}%)</span>
              <span className="font-medium">{formatCurrency(invoice.taxAmount, invoice.currency, locale)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--border)]">
              <span>{t('invoices.total')}</span>
              <span className="text-primary-600 dark:text-primary-400">{formatCurrency(invoice.total, invoice.currency, locale)}</span>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        {(invoice.notes || invoice.terms) && (
          <div className="p-5 border-b border-[var(--border)] space-y-3">
            {invoice.terms && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">{t('invoices.paymentTerms')}</p>
                <p className="text-sm whitespace-pre-wrap">{invoice.terms}</p>
              </div>
            )}
            {invoice.notes && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">{t('invoices.notes')}</p>
                <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="p-5 border-b border-[var(--border)]">
          <h4 className="text-sm font-semibold mb-3">{t('invoices.timeline')}</h4>
          <div className="space-y-3">
            {timeline.map((entry, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${entry.color} shrink-0`} />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm">{entry.label}</span>
                  <span className="text-xs text-slate-400">{formatDate(entry.date, locale)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 flex flex-wrap gap-2">
          {invoice.status === 'draft' && (
            <>
              <button type="button" onClick={onEdit} className="btn-secondary text-sm flex items-center gap-1.5">
                <IconEdit /> {t('common.edit')}
              </button>
              <button type="button" onClick={onSend} className="btn-primary text-sm flex items-center gap-1.5">
                <IconSend /> {t('invoices.send')}
              </button>
              <button type="button" onClick={onDelete} className="btn-danger text-sm flex items-center gap-1.5">
                <IconTrash /> {t('common.delete')}
              </button>
            </>
          )}
          {invoice.status === 'sent' && (
            <>
              <button type="button" onClick={onMarkPaid} className="btn-primary text-sm flex items-center gap-1.5 bg-green-600 hover:bg-green-700 focus:ring-green-500">
                <IconCheck /> {t('invoices.markPaid')}
              </button>
              <button type="button" onClick={onCancel} className="btn-secondary text-sm flex items-center gap-1.5 text-red-600">
                <IconBan /> {t('invoices.cancelInvoice')}
              </button>
              <button type="button" onClick={onDuplicate} className="btn-secondary text-sm flex items-center gap-1.5">
                <IconCopy /> {t('common.duplicate')}
              </button>
            </>
          )}
          {invoice.status === 'paid' && (
            <>
              <button type="button" onClick={onDuplicate} className="btn-secondary text-sm flex items-center gap-1.5">
                <IconCopy /> {t('common.duplicate')}
              </button>
            </>
          )}
          {invoice.status === 'overdue' && (
            <>
              <button type="button" onClick={onMarkPaid} className="btn-primary text-sm flex items-center gap-1.5 bg-green-600 hover:bg-green-700 focus:ring-green-500">
                <IconCheck /> {t('invoices.markPaid')}
              </button>
              <button type="button" onClick={onSend} className="btn-secondary text-sm flex items-center gap-1.5">
                <IconSend /> {t('invoices.sendReminder')}
              </button>
              <button type="button" onClick={onCancel} className="btn-secondary text-sm flex items-center gap-1.5 text-red-600">
                <IconBan /> {t('invoices.cancelInvoice')}
              </button>
            </>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onPrint} className="btn-secondary text-sm flex items-center gap-1.5">
            <IconPrinter /> {t('common.print')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Form Modal ──────────────────────────────
function InvoiceFormModal({
  open,
  editingId,
  form,
  setForm,
  clientsList,
  projectsList,
  onClose,
  onSave,
  saving,
  t,
  locale,
}: {
  open: boolean;
  editingId: string | null;
  form: InvoiceForm;
  setForm: React.Dispatch<React.SetStateAction<InvoiceForm>>;
  clientsList: ClientItem[];
  projectsList: ProjectItem[];
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  saving: boolean;
  t: (k: string) => string;
  locale: string;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Close client dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!open) return null;

  const filteredClients = clientSearch.trim()
    ? clientsList.filter((c) =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.company && c.company.toLowerCase().includes(clientSearch.toLowerCase()))
      )
    : clientsList;

  const selectedClient = clientsList.find((c) => c.id === form.clientId);
  const clientProjects = projectsList.filter((p) => p.clientId === form.clientId);

  const subtotal = form.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const vatAmount = subtotal * (form.vatRate / 100);
  const total = subtotal + vatAmount;

  function updateLineItem(index: number, field: keyof InvoiceLineItem, value: string | number) {
    setForm((f) => {
      const items = [...f.lineItems];
      const item = { ...items[index], [field]: value };
      item.amount = item.quantity * item.unitPrice;
      items[index] = item;
      return { ...f, lineItems: items };
    });
  }

  function addLineItem() {
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, createEmptyLineItem()] }));
  }

  function removeLineItem(index: number) {
    setForm((f) => {
      if (f.lineItems.length <= 1) return f;
      return { ...f, lineItems: f.lineItems.filter((_, i) => i !== index) };
    });
  }

  function handleDragStart(index: number) {
    dragItem.current = index;
  }

  function handleDragEnter(index: number) {
    dragOverItem.current = index;
  }

  function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null) return;
    setForm((f) => {
      const items = [...f.lineItems];
      const draggedItem = items[dragItem.current!];
      items.splice(dragItem.current!, 1);
      items.splice(dragOverItem.current!, 0, draggedItem);
      return { ...f, lineItems: items };
    });
    dragItem.current = null;
    dragOverItem.current = null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] sticky top-0 bg-[var(--card)] z-10 rounded-t-2xl">
          <h3 className="font-bold text-lg">
            {editingId ? t('invoices.editInvoice') : t('invoices.addInvoice')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={`btn-secondary text-sm flex items-center gap-1.5 ${showPreview ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
            >
              <IconEye /> {t('invoices.preview')}
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <IconClose />
            </button>
          </div>
        </div>

        <div className={showPreview ? 'grid grid-cols-1 lg:grid-cols-2' : ''}>
          {/* Form */}
          <form onSubmit={onSave} className="p-5 space-y-5">
            {/* Invoice number & type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('invoices.invoiceNumber')}</label>
                <input
                  className="input w-full"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                  placeholder={t('invoices.nextNumber')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('invoices.invoiceType')}</label>
                <select
                  className="input w-full"
                  value={form.invoiceType}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceType: e.target.value as InvoiceType }))}
                >
                  {INVOICE_TYPES.map((type) => (
                    <option key={type} value={type}>{invoiceTypeLabel(type, t)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Client selection */}
            <div ref={clientDropdownRef} className="relative">
              <label className="block text-sm font-medium mb-1">{t('invoices.client')} *</label>
              <div
                className="input w-full cursor-pointer flex items-center justify-between"
                onClick={() => setShowClientDropdown(!showClientDropdown)}
              >
                <span className={selectedClient ? '' : 'text-slate-400'}>
                  {selectedClient ? selectedClient.name : t('invoices.selectClient')}
                </span>
                <IconChevronDown />
              </div>
              {showClientDropdown && (
                <div className="absolute z-20 top-full mt-1 inset-x-0 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  <div className="p-2 sticky top-0 bg-[var(--card)]">
                    <input
                      className="input-sm w-full"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder={t('common.search') + '...'}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {filteredClients.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-400">{t('common.noResults')}</p>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full text-start px-3 py-2 text-sm hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-colors ${
                          c.id === form.clientId ? 'bg-primary-50 dark:bg-primary-950/30 font-medium' : ''
                        }`}
                        onClick={() => {
                          setForm((f) => ({ ...f, clientId: c.id, currency: c.currency || f.currency }));
                          setShowClientDropdown(false);
                          setClientSearch('');
                        }}
                      >
                        <span className="block">{c.name}</span>
                        {c.company && <span className="text-xs text-slate-400">{c.company}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Project selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('invoices.project')}</label>
                <select
                  className="input w-full"
                  value={form.projectId}
                  onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                >
                  <option value="">{t('invoices.selectProject')}</option>
                  {clientProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('invoices.currency')}</label>
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
                <label className="block text-sm font-medium mb-1">{t('invoices.issueDate')}</label>
                <input
                  type="date"
                  className="input w-full"
                  value={form.issueDate}
                  onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('invoices.dueDate')}</label>
                <input
                  type="date"
                  className="input w-full"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  required
                />
              </div>
            </div>

            {/* Line items */}
            <div>
              <label className="block text-sm font-semibold mb-2">{t('invoices.lineItems')}</label>
              <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[24px_1fr_72px_100px_100px_32px] gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-slate-500 border-b border-[var(--border)]">
                  <div />
                  <div>{t('invoices.itemDescription')}</div>
                  <div className="text-center">{t('invoices.quantity')}</div>
                  <div className="text-center">{t('invoices.unitPrice')}</div>
                  <div className="text-end">{t('invoices.lineTotal')}</div>
                  <div />
                </div>

                {/* Rows */}
                {form.lineItems.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[24px_1fr_72px_100px_100px_32px] gap-2 px-3 py-2 items-center border-b border-[var(--border)] last:border-0"
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragEnter={() => handleDragEnter(index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="flex items-center">
                      <IconGripVertical />
                    </div>
                    <input
                      className="input-sm w-full"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      placeholder={t('invoices.itemDescription')}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="input-sm w-full text-center"
                      value={item.quantity || ''}
                      onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input-sm w-full text-center"
                      value={item.unitPrice || ''}
                      onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                    />
                    <div className="text-sm font-medium text-end">
                      {formatCurrency(item.quantity * item.unitPrice, form.currency, locale)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors disabled:opacity-30"
                      disabled={form.lineItems.length <= 1}
                    >
                      <IconTrash />
                    </button>
                  </div>
                ))}

                {/* Add row */}
                <button
                  type="button"
                  onClick={addLineItem}
                  className="w-full px-3 py-2.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-colors flex items-center justify-center gap-1"
                >
                  <IconPlus /> {t('invoices.addItem')}
                </button>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t('invoices.subtotal')}</span>
                <span className="font-medium">{formatCurrency(subtotal, form.currency, locale)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{t('invoices.vat')}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    className="input-sm w-16 text-center"
                    value={form.vatRate}
                    onChange={(e) => setForm((f) => ({ ...f, vatRate: parseFloat(e.target.value) || 0 }))}
                  />
                  <span className="text-slate-400 text-xs">%</span>
                </div>
                <span className="font-medium">{formatCurrency(vatAmount, form.currency, locale)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--border)]">
                <span>{t('invoices.total')}</span>
                <span className="text-primary-600 dark:text-primary-400">{formatCurrency(total, form.currency, locale)}</span>
              </div>
            </div>

            {/* Terms & Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('invoices.paymentTerms')}</label>
                <textarea
                  className="input w-full h-20 resize-none"
                  value={form.terms}
                  onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
                  placeholder={t('invoices.paymentTerms')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('invoices.notes')}</label>
                <textarea
                  className="input w-full h-20 resize-none"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder={t('invoices.notes')}
                />
              </div>
            </div>

            {/* Language toggle */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('invoices.invoiceLanguage')}</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, language: 'he' }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    form.language === 'he'
                      ? 'bg-primary-600 text-white'
                      : 'border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  עברית
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, language: 'en' }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    form.language === 'en'
                      ? 'bg-primary-600 text-white'
                      : 'border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" className="btn-primary w-full" disabled={saving || !form.clientId}>
              {saving
                ? t('common.loading')
                : editingId
                ? t('common.save')
                : t('invoices.addInvoice')
              }
            </button>
          </form>

          {/* Preview Pane */}
          {showPreview && (
            <div className="border-s border-[var(--border)] p-5 bg-white dark:bg-slate-900 min-h-[400px]">
              <div className="max-w-md mx-auto" dir={form.language === 'he' ? 'rtl' : 'ltr'}>
                {/* Preview header */}
                <div className="text-center mb-6 pb-4 border-b-2 border-indigo-500">
                  <h2 className="text-xl font-bold text-indigo-600">
                    {form.language === 'he' ? 'חשבונית מס' : 'Tax Invoice'}
                  </h2>
                  <p className="text-lg font-semibold mt-1">#{form.invoiceNumber || '---'}</p>
                </div>

                {/* Preview client */}
                <div className="mb-4">
                  <p className="text-xs text-slate-400 mb-1">
                    {form.language === 'he' ? 'לכבוד' : 'Bill To'}
                  </p>
                  <p className="font-semibold">{selectedClient?.name || '---'}</p>
                  {selectedClient?.company && (
                    <p className="text-sm text-slate-500">{selectedClient.company}</p>
                  )}
                </div>

                {/* Preview dates */}
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">{form.language === 'he' ? 'תאריך' : 'Date'}</p>
                    <p>{form.issueDate ? formatDate(form.issueDate, form.language) : '---'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{form.language === 'he' ? 'לתשלום עד' : 'Due'}</p>
                    <p>{form.dueDate ? formatDate(form.dueDate, form.language) : '---'}</p>
                  </div>
                </div>

                {/* Preview items table */}
                <table className="w-full text-xs mb-4">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-start py-1 font-medium">{form.language === 'he' ? 'תיאור' : 'Description'}</th>
                      <th className="text-center py-1 font-medium w-12">{form.language === 'he' ? 'כמות' : 'Qty'}</th>
                      <th className="text-center py-1 font-medium w-16">{form.language === 'he' ? 'מחיר' : 'Price'}</th>
                      <th className="text-end py-1 font-medium w-16">{form.language === 'he' ? 'סכום' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lineItems.filter((li) => li.description || li.unitPrice > 0).map((item, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1">{item.description || '---'}</td>
                        <td className="py-1 text-center">{item.quantity}</td>
                        <td className="py-1 text-center">{item.unitPrice}</td>
                        <td className="py-1 text-end">{(item.quantity * item.unitPrice).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Preview totals */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{form.language === 'he' ? 'סכום ביניים' : 'Subtotal'}</span>
                    <span>{formatCurrency(subtotal, form.currency, form.language)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{form.language === 'he' ? `מע"מ (${form.vatRate}%)` : `VAT (${form.vatRate}%)`}</span>
                    <span>{formatCurrency(vatAmount, form.currency, form.language)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span>{form.language === 'he' ? 'סה"כ לתשלום' : 'Total Due'}</span>
                    <span className="text-indigo-600">{formatCurrency(total, form.currency, form.language)}</span>
                  </div>
                </div>

                {/* Preview terms/notes */}
                {form.terms && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-400 mb-0.5">{form.language === 'he' ? 'תנאי תשלום' : 'Payment Terms'}</p>
                    <p className="text-xs">{form.terms}</p>
                  </div>
                )}
                {form.notes && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-400 mb-0.5">{form.language === 'he' ? 'הערות' : 'Notes'}</p>
                    <p className="text-xs">{form.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════
export default function InvoicesPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();

  // ─── State ─────────────────────────────────────────
  const [invoicesList, setInvoicesList] = useState<InvoiceItem[]>([]);
  const [clientsList, setClientsList] = useState<ClientItem[]>([]);
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [clientFilter, setClientFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InvoiceForm>(createEmptyForm);
  const [saving, setSaving] = useState(false);

  // Detail panel
  const [detailInvoice, setDetailInvoice] = useState<InvoiceItem | null>(null);

  // Payment modal
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceItem | null>(null);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    label: string;
    className?: string;
    action: () => void;
  } | null>(null);

  // ─── Data fetching ─────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [invList, clList, prList, smry] = await Promise.all([
        invoices.list(
          statusFilter !== 'all' ? { status: statusFilter } : undefined
        ),
        clientsApi.list(),
        projectsApi.list(),
        invoices.getSummary(),
      ]);
      setInvoicesList(invList);
      setClientsList(clList);
      setProjectsList(prList);
      setSummary(smry);
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Keyboard shortcuts ────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only fire when no modal is open and not focused on an input
      const target = e.target as HTMLElement;
      if (showForm || detailInvoice || paymentInvoice || confirmAction) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openCreate();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showForm, detailInvoice, paymentInvoice, confirmAction]);

  // ─── Filtered & sorted list ────────────────────────
  const filtered = useMemo(() => {
    let list = [...invoicesList];

    // Client filter
    if (clientFilter) {
      list = list.filter((inv) => inv.clientId === clientFilter);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          (inv.client?.name && inv.client.name.toLowerCase().includes(q))
      );
    }

    // Date range filter
    if (dateFrom) {
      list = list.filter((inv) => inv.issueDate >= dateFrom);
    }
    if (dateTo) {
      list = list.filter((inv) => inv.issueDate <= dateTo);
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
        case 'date_asc':
          return new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
        case 'amount_desc':
          return b.total - a.total;
        case 'amount_asc':
          return a.total - b.total;
        case 'status':
          return getStatusOrder(a.status) - getStatusOrder(b.status);
        default:
          return 0;
      }
    });

    return list;
  }, [invoicesList, clientFilter, search, dateFrom, dateTo, sortBy]);

  // ─── Handlers ──────────────────────────────────────
  async function openCreate() {
    const newForm = createEmptyForm();
    try {
      const { nextNumber } = await invoices.getNextNumber();
      newForm.invoiceNumber = nextNumber;
    } catch {
      // leave blank if failed
    }
    setEditingId(null);
    setForm(newForm);
    setShowForm(true);
  }

  function openEdit(inv: InvoiceItem) {
    setEditingId(inv.id);
    setForm({
      invoiceNumber: inv.invoiceNumber,
      invoiceType: 'tax_invoice',
      clientId: inv.clientId,
      projectId: inv.projectId || '',
      issueDate: inv.issueDate.split('T')[0],
      dueDate: inv.dueDate.split('T')[0],
      lineItems: inv.lineItems.length > 0 ? inv.lineItems : [createEmptyLineItem()],
      vatRate: inv.taxRate,
      currency: inv.currency,
      terms: inv.terms || '',
      notes: inv.notes || '',
      language: 'he',
    });
    setShowForm(true);
    setDetailInvoice(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId) return;
    setSaving(true);
    try {
      const body = {
        clientId: form.clientId,
        projectId: form.projectId || undefined,
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        taxRate: form.vatRate,
        currency: form.currency,
        notes: form.notes || undefined,
        terms: form.terms || undefined,
        lineItems: form.lineItems
          .filter((li) => li.description.trim() || li.unitPrice > 0)
          .map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
          })),
      };

      if (editingId) {
        await invoices.update(editingId, body);
        toast(t('invoices.invoiceUpdated'), 'success');
      } else {
        await invoices.create(body);
        toast(t('invoices.invoiceCreated'), 'success');
      }
      setShowForm(false);
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(inv: InvoiceItem) {
    try {
      await invoices.send(inv.id);
      toast(t('invoices.invoiceSent'), 'success');
      setDetailInvoice(null);
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    }
  }

  async function handleMarkPaid(invoiceId: string, paidDate: string) {
    try {
      await invoices.markPaid(invoiceId, paidDate);
      toast(t('invoices.invoicePaid'), 'success');
      setPaymentInvoice(null);
      setDetailInvoice(null);
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    }
  }

  async function handleCancel(inv: InvoiceItem) {
    try {
      await invoices.cancel(inv.id);
      toast(t('invoices.invoiceCancelled'), 'success');
      setDetailInvoice(null);
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    }
  }

  async function handleDuplicate(inv: InvoiceItem) {
    try {
      await invoices.duplicate(inv.id);
      toast(t('invoices.invoiceDuplicated'), 'success');
      setDetailInvoice(null);
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    }
  }

  async function handleDelete(inv: InvoiceItem) {
    try {
      await invoices.delete(inv.id);
      toast(t('invoices.invoiceDeleted'), 'success');
      setDetailInvoice(null);
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    }
  }

  function handlePrint() {
    window.print();
  }

  // ─── Render: Loading ───────────────────────────────
  if (loading) {
    return <InvoicesSkeleton />;
  }

  // ─── Status tab configs ────────────────────────────
  const statusTabs: { key: StatusFilter; label: string; count?: number }[] = [
    { key: 'all', label: t('invoices.allStatuses'), count: invoicesList.length },
    { key: 'draft', label: t('invoices.statusDraft'), count: summary?.countDraft },
    { key: 'sent', label: t('invoices.statusSent'), count: summary?.countSent },
    { key: 'paid', label: t('invoices.statusPaid'), count: summary?.countPaid },
    { key: 'overdue', label: t('invoices.statusOverdue'), count: summary?.countOverdue },
    { key: 'cancelled', label: t('invoices.statusCancelled') },
  ];

  const sortLabels: Record<SortOption, string> = {
    date_desc: locale === 'he' ? 'תאריך (חדש)' : 'Date (Newest)',
    date_asc: locale === 'he' ? 'תאריך (ישן)' : 'Date (Oldest)',
    amount_desc: locale === 'he' ? 'סכום (גבוה)' : 'Amount (High)',
    amount_asc: locale === 'he' ? 'סכום (נמוך)' : 'Amount (Low)',
    status: locale === 'he' ? 'סטטוס' : 'Status',
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('invoices.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('invoices.summaryTitle')}
            <span className="ms-2 text-xs text-slate-400 hidden sm:inline">
              ({locale === 'he' ? 'לחץ N ליצירת חשבונית' : 'Press N to create invoice'})
            </span>
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <IconPlus />
          {t('invoices.addInvoice')}
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card stat-card-indigo">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-500">{t('invoices.totalDraft')}</p>
              <span className="text-xs font-medium text-slate-400">{summary.countDraft}</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(summary.totalDraft, 'ILS', locale)}</p>
          </div>
          <div className="card stat-card-blue">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-500">{t('invoices.totalSent')}</p>
              <span className="text-xs font-medium text-slate-400">{summary.countSent}</span>
            </div>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(summary.totalSent, 'ILS', locale)}</p>
          </div>
          <div className="card stat-card-green">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-500">{t('invoices.totalPaid')}</p>
              <span className="text-xs font-medium text-slate-400">{summary.countPaid}</span>
            </div>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(summary.totalPaid, 'ILS', locale)}</p>
          </div>
          <div className="card stat-card-red">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-500">{t('invoices.totalOverdue')}</p>
              <span className="text-xs font-medium text-slate-400">{summary.countOverdue}</span>
            </div>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(summary.totalOverdue, 'ILS', locale)}</p>
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
              statusFilter === tab.key
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-[var(--card)] border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`ms-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                statusFilter === tab.key
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 start-3 flex items-center pointer-events-none">
            <IconSearch />
          </div>
          <input
            className="input w-full ps-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={locale === 'he' ? 'חפש לפי מספר חשבונית או לקוח...' : 'Search by invoice # or client...'}
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

        {/* Client filter */}
        <select
          className="input w-auto min-w-[160px]"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        >
          <option value="">{t('invoices.filterByClient')}</option>
          {clientsList.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-slate-400">
            <IconCalendar />
          </div>
          <input
            type="date"
            className="input-sm w-auto"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder={locale === 'he' ? 'מתאריך' : 'From'}
          />
          <span className="text-slate-400 text-sm">-</span>
          <input
            type="date"
            className="input-sm w-auto"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder={locale === 'he' ? 'עד תאריך' : 'To'}
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1">
          <IconArrowUpDown />
          <select
            className="input-sm w-auto"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{sortLabels[opt]}</option>
            ))}
          </select>
        </div>

        {/* Clear filters */}
        {(search || clientFilter || dateFrom || dateTo) && (
          <button
            type="button"
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
            onClick={() => {
              setSearch('');
              setClientFilter('');
              setDateFrom('');
              setDateTo('');
            }}
          >
            {locale === 'he' ? 'נקה סינון' : 'Clear filters'}
          </button>
        )}
      </div>

      {/* Content */}
      {invoicesList.length === 0 && statusFilter === 'all' ? (
        /* Empty state */
        <div className="card text-center py-16">
          <div className="mx-auto mb-6">
            <IconFileText />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('invoices.noInvoices')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
            {t('invoices.noInvoicesDesc')}
          </p>
          <button type="button" className="btn-primary" onClick={openCreate}>
            <IconPlus />
            {t('invoices.addInvoice')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-500">{t('common.noResults')}</p>
        </div>
      ) : (
        /* Invoice table */
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-slate-50/50 dark:bg-slate-800/30">
                  <th className="text-start py-3 px-4 font-medium text-slate-500 whitespace-nowrap">{t('invoices.invoiceNumber')}</th>
                  <th className="text-start py-3 px-4 font-medium text-slate-500 whitespace-nowrap">{t('invoices.client')}</th>
                  <th className="text-start py-3 px-4 font-medium text-slate-500 whitespace-nowrap">{t('invoices.issueDate')}</th>
                  <th className="text-start py-3 px-4 font-medium text-slate-500 whitespace-nowrap">{t('invoices.dueDate')}</th>
                  <th className="text-end py-3 px-4 font-medium text-slate-500 whitespace-nowrap">{t('invoices.total')}</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-500 whitespace-nowrap">{t('invoices.status')}</th>
                  <th className="text-end py-3 px-4 font-medium text-slate-500 whitespace-nowrap">{locale === 'he' ? 'פעולות' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const isOverdue = inv.status === 'overdue';
                  const daysDue = daysUntil(inv.dueDate);

                  return (
                    <tr
                      key={inv.id}
                      className="table-row cursor-pointer"
                      onClick={() => setDetailInvoice(inv)}
                    >
                      <td className="py-3 px-4 font-medium">
                        <span className="text-primary-600 dark:text-primary-400">#{inv.invoiceNumber}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium">{inv.client?.name || '---'}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {formatDate(inv.issueDate, locale)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500'}>
                          {formatDate(inv.dueDate, locale)}
                        </span>
                        {inv.status === 'sent' && daysDue >= 0 && daysDue <= 7 && (
                          <span className="ms-1 text-xs text-amber-500">({daysDue}d)</span>
                        )}
                        {isOverdue && (
                          <span className="ms-1 text-xs text-red-500">(-{Math.abs(daysDue)}d)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-end font-semibold whitespace-nowrap">
                        {formatCurrency(inv.total, inv.currency, locale)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={inv.status} t={t} />
                      </td>
                      <td className="py-3 px-4 text-end">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {inv.status === 'draft' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(inv)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title={t('common.edit')}
                              >
                                <IconEdit />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmAction({
                                    title: t('invoices.send'),
                                    message: t('invoices.confirmSend'),
                                    label: t('invoices.send'),
                                    className: 'btn-primary',
                                    action: () => handleSend(inv),
                                  });
                                }}
                                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 transition-colors"
                                title={t('invoices.send')}
                              >
                                <IconSend />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmAction({
                                    title: t('invoices.deleteInvoice'),
                                    message: locale === 'he' ? 'האם אתה בטוח שברצונך למחוק את החשבונית?' : 'Are you sure you want to delete this invoice?',
                                    label: t('common.delete'),
                                    action: () => handleDelete(inv),
                                  });
                                }}
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                                title={t('common.delete')}
                              >
                                <IconTrash />
                              </button>
                            </>
                          )}
                          {inv.status === 'sent' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPaymentInvoice(inv)}
                                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 transition-colors"
                                title={t('invoices.markPaid')}
                              >
                                <IconCheck />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicate(inv)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title={t('common.duplicate')}
                              >
                                <IconCopy />
                              </button>
                            </>
                          )}
                          {inv.status === 'overdue' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPaymentInvoice(inv)}
                                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 transition-colors"
                                title={t('invoices.markPaid')}
                              >
                                <IconCheck />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmAction({
                                    title: t('invoices.send'),
                                    message: locale === 'he' ? 'לשלוח תזכורת ללקוח?' : 'Send a reminder to the client?',
                                    label: t('invoices.send'),
                                    className: 'btn-primary',
                                    action: () => handleSend(inv),
                                  });
                                }}
                                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 transition-colors"
                                title={t('invoices.sendReminder')}
                              >
                                <IconSend />
                              </button>
                            </>
                          )}
                          {inv.status === 'paid' && (
                            <button
                              type="button"
                              onClick={() => handleDuplicate(inv)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title={t('common.duplicate')}
                            >
                              <IconCopy />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDetailInvoice(inv)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title={t('common.view')}
                          >
                            <IconEye />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-slate-50/50 dark:bg-slate-800/20 text-sm text-slate-500">
            <span>
              {filtered.length} {locale === 'he' ? 'חשבוניות' : 'invoices'}
            </span>
            <span className="font-medium">
              {locale === 'he' ? 'סה"כ' : 'Total'}:{' '}
              {formatCurrency(
                filtered.reduce((sum, inv) => sum + inv.total, 0),
                'ILS',
                locale,
              )}
            </span>
          </div>
        </div>
      )}

      {/* ─── Modals ─────────────────────────────────── */}

      {/* Create/Edit Invoice */}
      <InvoiceFormModal
        open={showForm}
        editingId={editingId}
        form={form}
        setForm={setForm}
        clientsList={clientsList}
        projectsList={projectsList}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
        saving={saving}
        t={t}
        locale={locale}
      />

      {/* Invoice Detail Panel */}
      {detailInvoice && (
        <InvoiceDetailPanel
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
          onEdit={() => openEdit(detailInvoice)}
          onSend={() => {
            setConfirmAction({
              title: t('invoices.send'),
              message: t('invoices.confirmSend'),
              label: t('invoices.send'),
              className: 'btn-primary',
              action: () => handleSend(detailInvoice),
            });
          }}
          onMarkPaid={() => setPaymentInvoice(detailInvoice)}
          onCancel={() => {
            setConfirmAction({
              title: t('invoices.cancelInvoice'),
              message: t('invoices.confirmCancel'),
              label: t('invoices.cancelInvoice'),
              action: () => handleCancel(detailInvoice),
            });
          }}
          onDuplicate={() => handleDuplicate(detailInvoice)}
          onDelete={() => {
            setConfirmAction({
              title: t('invoices.deleteInvoice'),
              message: locale === 'he' ? 'האם אתה בטוח שברצונך למחוק את החשבונית?' : 'Are you sure you want to delete this invoice?',
              label: t('common.delete'),
              action: () => handleDelete(detailInvoice),
            });
          }}
          onPrint={handlePrint}
          t={t}
          locale={locale}
        />
      )}

      {/* Payment Recording Modal */}
      <PaymentModal
        open={!!paymentInvoice}
        invoice={paymentInvoice}
        onClose={() => setPaymentInvoice(null)}
        onSave={handleMarkPaid}
        t={t}
        locale={locale}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmLabel={confirmAction?.label || ''}
        confirmClass={confirmAction?.className}
        onConfirm={() => {
          confirmAction?.action();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
