'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';
import { accounts as accountsApi, transactions, clients, projects, type AccountItem } from '@/lib/api';

type QuickAddType = 'transaction' | 'client' | 'invoice' | 'project';

interface QuickAddProps {
  open: boolean;
  onClose: () => void;
}

export default function QuickAdd({ open, onClose }: QuickAddProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [activeType, setActiveType] = useState<QuickAddType | null>(null);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Transaction form state
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txAccountId, setTxAccountId] = useState('');
  const [txIsExpense, setTxIsExpense] = useState(true);

  // Client form state
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // Project form state
  const [projectName, setProjectName] = useState('');
  const [projectClientId, setProjectClientId] = useState('');
  const [clientsList, setClientsList] = useState<Array<{ id: string; name: string }>>([]);

  // Load accounts and clients
  useEffect(() => {
    if (!open) return;
    accountsApi.list().then(setAccounts).catch(() => {});
    clients.list().then((cls) => setClientsList(cls.map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
  }, [open]);

  // Listen for open-quick-add event from CommandPalette
  useEffect(() => {
    function handler() {
      // This event is dispatched by CommandPalette - Layout manages the open state
    }
    document.addEventListener('open-quick-add', handler);
    return () => document.removeEventListener('open-quick-add', handler);
  }, []);

  const resetForms = useCallback(() => {
    setActiveType(null);
    setLoading(false);
    setSuccess(false);
    setTxDesc('');
    setTxAmount('');
    setTxDate(new Date().toISOString().slice(0, 10));
    setTxAccountId('');
    setTxIsExpense(true);
    setClientName('');
    setClientEmail('');
    setClientPhone('');
    setProjectName('');
    setProjectClientId('');
  }, []);

  function handleClose() {
    resetForms();
    onClose();
  }

  // Escape handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  async function handleSubmitTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!txDesc || !txAmount || !txAccountId) return;
    setLoading(true);
    try {
      const amount = txIsExpense ? -Math.abs(parseFloat(txAmount)) : Math.abs(parseFloat(txAmount));
      await transactions.create({
        accountId: txAccountId,
        date: txDate,
        description: txDesc,
        amount,
      });
      setSuccess(true);
      setTimeout(() => handleClose(), 1200);
    } catch {
      setLoading(false);
    }
  }

  async function handleSubmitClient(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName) return;
    setLoading(true);
    try {
      const result = await clients.create({
        name: clientName,
        email: clientEmail || undefined,
        phone: clientPhone || undefined,
      });
      setSuccess(true);
      setTimeout(() => {
        handleClose();
        router.push(`/clients/${result.id}`);
      }, 800);
    } catch {
      setLoading(false);
    }
  }

  async function handleSubmitProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName || !projectClientId) return;
    setLoading(true);
    try {
      const result = await projects.create({
        name: projectName,
        clientId: projectClientId,
      });
      setSuccess(true);
      setTimeout(() => {
        handleClose();
        router.push(`/projects/${result.id}`);
      }, 800);
    } catch {
      setLoading(false);
    }
  }

  function handleNewInvoice() {
    handleClose();
    router.push('/invoices?new=1');
  }

  if (!open) return null;

  const options: Array<{ type: QuickAddType; labelKey: string; icon: string; color: string }> = [
    { type: 'transaction', labelKey: 'quickAdd.newTransaction', icon: 'list', color: 'from-blue-500 to-blue-600' },
    { type: 'client', labelKey: 'quickAdd.newClient', icon: 'user', color: 'from-emerald-500 to-emerald-600' },
    { type: 'invoice', labelKey: 'quickAdd.newInvoice', icon: 'file', color: 'from-amber-500 to-amber-600' },
    { type: 'project', labelKey: 'quickAdd.newProject', icon: 'folder', color: 'from-purple-500 to-purple-600' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={handleClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] w-full max-w-md overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold">
            {activeType ? t(`quickAdd.new${activeType.charAt(0).toUpperCase() + activeType.slice(1)}`) : t('quickAdd.title')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {success ? (
            <div className="py-8 text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="font-semibold text-green-700 dark:text-green-300">{t('quickAdd.success')}</p>
            </div>
          ) : activeType === null ? (
            /* Option grid */
            <div className="grid grid-cols-2 gap-3">
              {options.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => opt.type === 'invoice' ? handleNewInvoice() : setActiveType(opt.type)}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border border-[var(--border)] hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${opt.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    {opt.icon === 'list' && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
                    {opt.icon === 'user' && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                    {opt.icon === 'file' && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
                    {opt.icon === 'folder' && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>}
                  </div>
                  <span className="text-sm font-medium">{t(opt.labelKey)}</span>
                </button>
              ))}
            </div>
          ) : activeType === 'transaction' ? (
            /* Transaction form */
            <form onSubmit={handleSubmitTransaction} className="space-y-4">
              <button type="button" onClick={() => setActiveType(null)} className="text-xs text-indigo-500 hover:underline mb-2 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                {t('common.back')}
              </button>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('transactionsPage.description')}</label>
                <input
                  type="text"
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  required
                  className="input w-full"
                  placeholder={t('transactionsPage.descriptionPlaceholder')}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('transactionsPage.amount')}</label>
                  <input
                    type="number"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    required
                    min="0"
                    step="0.01"
                    className="input w-full"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('transactionsPage.type')}</label>
                  <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setTxIsExpense(true)}
                      className={`flex-1 py-2 text-xs font-medium ${txIsExpense ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'text-slate-400'}`}
                    >
                      {t('transactionsPage.expense')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxIsExpense(false)}
                      className={`flex-1 py-2 text-xs font-medium ${!txIsExpense ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'text-slate-400'}`}
                    >
                      {t('transactionsPage.income')}
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('transactionsPage.date')}</label>
                  <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('transactionsPage.account')}</label>
                  <select value={txAccountId} onChange={(e) => setTxAccountId(e.target.value)} required className="input w-full">
                    <option value="">{t('common.select')}</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('auth.pleaseWait') : t('quickAdd.add')}
              </button>
            </form>
          ) : activeType === 'client' ? (
            /* Client form */
            <form onSubmit={handleSubmitClient} className="space-y-4">
              <button type="button" onClick={() => setActiveType(null)} className="text-xs text-indigo-500 hover:underline mb-2 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                {t('common.back')}
              </button>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('clients.name')}</label>
                <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} required className="input w-full" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('clients.email')}</label>
                <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('clients.phone')}</label>
                <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="input w-full" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('auth.pleaseWait') : t('quickAdd.add')}
              </button>
            </form>
          ) : activeType === 'project' ? (
            /* Project form */
            <form onSubmit={handleSubmitProject} className="space-y-4">
              <button type="button" onClick={() => setActiveType(null)} className="text-xs text-indigo-500 hover:underline mb-2 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                {t('common.back')}
              </button>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('projects.name')}</label>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} required className="input w-full" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('projects.client')}</label>
                <select value={projectClientId} onChange={(e) => setProjectClientId(e.target.value)} required className="input w-full">
                  <option value="">{t('common.select')}</option>
                  {clientsList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('auth.pleaseWait') : t('quickAdd.add')}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
