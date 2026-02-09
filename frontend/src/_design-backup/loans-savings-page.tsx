'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

type Loan = {
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
};

type Saving = {
  id: string;
  name: string;
  targetAmount: number | null;
  currentAmount: number;
  interestRate: number | null;
  startDate: string | null;
  targetDate: string | null;
  currency: string;
  notes: string | null;
};

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function formatPercent(n: number) {
  return `${n.toFixed(2)}%`;
}

export default function LoansSavingsPage() {
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState<'loans' | 'savings'>('loans');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [savings, setSavings] = useState<Saving[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [showAddSaving, setShowAddSaving] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editingSaving, setEditingSaving] = useState<Saving | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [loanForm, setLoanForm] = useState({
    name: '', lender: '', originalAmount: '', remainingAmount: '',
    interestRate: '', monthlyPayment: '', startDate: '', endDate: '', notes: '',
  });
  const [savingForm, setSavingForm] = useState({
    name: '', targetAmount: '', currentAmount: '', interestRate: '',
    startDate: '', targetDate: '', notes: '',
  });

  useEffect(() => {
    Promise.all([
      api<Loan[]>('/api/loans').catch(() => []),
      api<Saving[]>('/api/savings').catch(() => []),
    ]).then(([l, s]) => {
      setLoans(l);
      setSavings(s);
    }).finally(() => setLoading(false));
  }, []);

  function resetLoanForm() {
    setLoanForm({ name: '', lender: '', originalAmount: '', remainingAmount: '', interestRate: '', monthlyPayment: '', startDate: '', endDate: '', notes: '' });
  }
  function resetSavingForm() {
    setSavingForm({ name: '', targetAmount: '', currentAmount: '', interestRate: '', startDate: '', targetDate: '', notes: '' });
  }

  function openEditLoan(loan: Loan) {
    setLoanForm({
      name: loan.name,
      lender: loan.lender ?? '',
      originalAmount: String(loan.originalAmount),
      remainingAmount: String(loan.remainingAmount),
      interestRate: loan.interestRate != null ? String(loan.interestRate) : '',
      monthlyPayment: loan.monthlyPayment != null ? String(loan.monthlyPayment) : '',
      startDate: loan.startDate ?? '',
      endDate: loan.endDate ?? '',
      notes: loan.notes ?? '',
    });
    setEditingLoan(loan);
    setShowAddLoan(true);
  }

  function openEditSaving(s: Saving) {
    setSavingForm({
      name: s.name,
      targetAmount: s.targetAmount != null ? String(s.targetAmount) : '',
      currentAmount: String(s.currentAmount),
      interestRate: s.interestRate != null ? String(s.interestRate) : '',
      startDate: s.startDate ?? '',
      targetDate: s.targetDate ?? '',
      notes: s.notes ?? '',
    });
    setEditingSaving(s);
    setShowAddSaving(true);
  }

  async function handleSaveLoan(e: React.FormEvent) {
    e.preventDefault();
    if (!loanForm.name.trim()) return;
    setSaving(true);
    setMsg('');
    const body = {
      name: loanForm.name.trim(),
      lender: loanForm.lender.trim() || null,
      originalAmount: parseFloat(loanForm.originalAmount) || 0,
      remainingAmount: parseFloat(loanForm.remainingAmount) || 0,
      interestRate: loanForm.interestRate ? parseFloat(loanForm.interestRate) : null,
      monthlyPayment: loanForm.monthlyPayment ? parseFloat(loanForm.monthlyPayment) : null,
      startDate: loanForm.startDate || null,
      endDate: loanForm.endDate || null,
      notes: loanForm.notes.trim() || null,
    };
    try {
      if (editingLoan) {
        await api(`/api/loans/${editingLoan.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/api/loans', { method: 'POST', body: JSON.stringify(body) });
      }
      const updated = await api<Loan[]>('/api/loans').catch(() => []);
      setLoans(updated);
      setShowAddLoan(false);
      setEditingLoan(null);
      resetLoanForm();
      setMsg(t('loansSavings.saved'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSaving(e: React.FormEvent) {
    e.preventDefault();
    if (!savingForm.name.trim()) return;
    setSaving(true);
    setMsg('');
    const body = {
      name: savingForm.name.trim(),
      targetAmount: savingForm.targetAmount ? parseFloat(savingForm.targetAmount) : null,
      currentAmount: parseFloat(savingForm.currentAmount) || 0,
      interestRate: savingForm.interestRate ? parseFloat(savingForm.interestRate) : null,
      startDate: savingForm.startDate || null,
      targetDate: savingForm.targetDate || null,
      notes: savingForm.notes.trim() || null,
    };
    try {
      if (editingSaving) {
        await api(`/api/savings/${editingSaving.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/api/savings', { method: 'POST', body: JSON.stringify(body) });
      }
      const updated = await api<Saving[]>('/api/savings').catch(() => []);
      setSavings(updated);
      setShowAddSaving(false);
      setEditingSaving(null);
      resetSavingForm();
      setMsg(t('loansSavings.saved'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLoan(id: string) {
    if (!confirm(t('loansSavings.confirmDelete'))) return;
    try {
      await api(`/api/loans/${id}`, { method: 'DELETE' });
      setLoans((prev) => prev.filter((l) => l.id !== id));
    } catch {}
  }

  async function handleDeleteSaving(id: string) {
    if (!confirm(t('loansSavings.confirmDelete'))) return;
    try {
      await api(`/api/savings/${id}`, { method: 'DELETE' });
      setSavings((prev) => prev.filter((s) => s.id !== id));
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  const totalDebt = loans.reduce((s, l) => s + l.remainingAmount, 0);
  const totalMonthlyPayments = loans.reduce((s, l) => s + (l.monthlyPayment ?? 0), 0);
  const totalSaved = savings.reduce((s, sv) => s + sv.currentAmount, 0);
  const totalTarget = savings.reduce((s, sv) => s + (sv.targetAmount ?? 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      <h1 className="text-2xl font-bold">{t('loansSavings.title')}</h1>
      <p className="text-slate-600 dark:text-slate-400">{t('loansSavings.description')}</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-slate-500">{t('loansSavings.totalDebt')}</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{formatCurrency(totalDebt, locale)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">{t('loansSavings.monthlyPayments')}</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">{formatCurrency(totalMonthlyPayments, locale)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">{t('loansSavings.totalSaved')}</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(totalSaved, locale)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">{t('loansSavings.savingsTarget')}</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">{totalTarget > 0 ? formatCurrency(totalTarget, locale) : '–'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setTab('loans')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'loans' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
        >
          {t('loansSavings.loans')} ({loans.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('savings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'savings' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
        >
          {t('loansSavings.savingsGoals')} ({savings.length})
        </button>
      </div>

      {msg && <p className="text-sm text-green-600 dark:text-green-400">{msg}</p>}

      {/* Loans Tab */}
      {tab === 'loans' && (
        <div className="space-y-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            onClick={() => { resetLoanForm(); setEditingLoan(null); setShowAddLoan(true); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('loansSavings.addLoan')}
          </button>

          {loans.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-40">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="text-sm">{t('loansSavings.noLoans')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {loans.map((loan) => {
                const progress = loan.originalAmount > 0 ? ((loan.originalAmount - loan.remainingAmount) / loan.originalAmount) * 100 : 0;
                return (
                  <div key={loan.id} className="card relative group">
                    <div className="absolute inset-x-0 top-0 h-1 bg-red-500 rounded-t-2xl" />
                    <div className="flex items-center justify-between mb-2 pt-1">
                      <h3 className="font-semibold">{loan.name}</h3>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => openEditLoan(loan)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary-500">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </button>
                        <button type="button" onClick={() => handleDeleteLoan(loan.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                    {loan.lender && <p className="text-xs text-slate-500 mb-2">{loan.lender}</p>}
                    <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(loan.remainingAmount, locale)}</p>
                    <p className="text-xs text-slate-500">{t('loansSavings.of')} {formatCurrency(loan.originalAmount, locale)}</p>
                    <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{Math.round(progress)}% {t('loansSavings.paidOff')}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {loan.monthlyPayment != null && <span>{t('loansSavings.monthly')}: {formatCurrency(loan.monthlyPayment, locale)}</span>}
                      {loan.interestRate != null && <span>{t('loansSavings.interest')}: {formatPercent(loan.interestRate)}</span>}
                      {loan.endDate && <span>{t('loansSavings.endDate')}: {new Date(loan.endDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL')}</span>}
                    </div>
                    {loan.notes && <p className="text-xs text-slate-400 mt-2 italic">{loan.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Savings Tab */}
      {tab === 'savings' && (
        <div className="space-y-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            onClick={() => { resetSavingForm(); setEditingSaving(null); setShowAddSaving(true); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('loansSavings.addSaving')}
          </button>

          {savings.length === 0 ? (
            <div className="card text-center py-12 text-slate-500">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-40">
                <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">{t('loansSavings.noSavings')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {savings.map((sv) => {
                const progress = sv.targetAmount && sv.targetAmount > 0 ? (sv.currentAmount / sv.targetAmount) * 100 : 0;
                return (
                  <div key={sv.id} className="card relative group">
                    <div className="absolute inset-x-0 top-0 h-1 bg-green-500 rounded-t-2xl" />
                    <div className="flex items-center justify-between mb-2 pt-1">
                      <h3 className="font-semibold">{sv.name}</h3>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => openEditSaving(sv)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary-500">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </button>
                        <button type="button" onClick={() => handleDeleteSaving(sv.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(sv.currentAmount, locale)}</p>
                    {sv.targetAmount != null && sv.targetAmount > 0 && (
                      <>
                        <p className="text-xs text-slate-500">{t('loansSavings.target')}: {formatCurrency(sv.targetAmount, locale)}</p>
                        <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{Math.round(progress)}% {t('loansSavings.reached')}</p>
                      </>
                    )}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {sv.interestRate != null && <span>{t('loansSavings.interest')}: {formatPercent(sv.interestRate)}</span>}
                      {sv.targetDate && <span>{t('loansSavings.targetDateLabel')}: {new Date(sv.targetDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL')}</span>}
                    </div>
                    {sv.notes && <p className="text-xs text-slate-400 mt-2 italic">{sv.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Loan Modal */}
      {showAddLoan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddLoan(false); setEditingLoan(null); }}>
          <div className="bg-[var(--card)] rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{editingLoan ? t('loansSavings.editLoan') : t('loansSavings.addLoan')}</h3>
            <form onSubmit={handleSaveLoan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.loanName')}</label>
                <input type="text" className="input w-full" value={loanForm.name} onChange={(e) => setLoanForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('loansSavings.loanNamePlaceholder')} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.lender')}</label>
                <input type="text" className="input w-full" value={loanForm.lender} onChange={(e) => setLoanForm((f) => ({ ...f, lender: e.target.value }))} placeholder={t('loansSavings.lenderPlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.originalAmount')}</label>
                  <input type="number" step="0.01" className="input w-full" value={loanForm.originalAmount} onChange={(e) => setLoanForm((f) => ({ ...f, originalAmount: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.remainingAmount')}</label>
                  <input type="number" step="0.01" className="input w-full" value={loanForm.remainingAmount} onChange={(e) => setLoanForm((f) => ({ ...f, remainingAmount: e.target.value }))} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.interestRate')}</label>
                  <input type="number" step="0.01" className="input w-full" value={loanForm.interestRate} onChange={(e) => setLoanForm((f) => ({ ...f, interestRate: e.target.value }))} placeholder="%" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.monthlyPaymentLabel')}</label>
                  <input type="number" step="0.01" className="input w-full" value={loanForm.monthlyPayment} onChange={(e) => setLoanForm((f) => ({ ...f, monthlyPayment: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.startDate')}</label>
                  <input type="date" className="input w-full" value={loanForm.startDate} onChange={(e) => setLoanForm((f) => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.endDate')}</label>
                  <input type="date" className="input w-full" value={loanForm.endDate} onChange={(e) => setLoanForm((f) => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.notes')}</label>
                <textarea className="input w-full" rows={2} value={loanForm.notes} onChange={(e) => setLoanForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</button>
                <button type="button" className="btn-secondary" onClick={() => { setShowAddLoan(false); setEditingLoan(null); }}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Saving Modal */}
      {showAddSaving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddSaving(false); setEditingSaving(null); }}>
          <div className="bg-[var(--card)] rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{editingSaving ? t('loansSavings.editSaving') : t('loansSavings.addSaving')}</h3>
            <form onSubmit={handleSaveSaving} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.savingName')}</label>
                <input type="text" className="input w-full" value={savingForm.name} onChange={(e) => setSavingForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('loansSavings.savingNamePlaceholder')} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.currentAmountLabel')}</label>
                  <input type="number" step="0.01" className="input w-full" value={savingForm.currentAmount} onChange={(e) => setSavingForm((f) => ({ ...f, currentAmount: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.targetAmountLabel')}</label>
                  <input type="number" step="0.01" className="input w-full" value={savingForm.targetAmount} onChange={(e) => setSavingForm((f) => ({ ...f, targetAmount: e.target.value }))} placeholder={t('common.optional')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.interestRate')}</label>
                  <input type="number" step="0.01" className="input w-full" value={savingForm.interestRate} onChange={(e) => setSavingForm((f) => ({ ...f, interestRate: e.target.value }))} placeholder="%" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.targetDateLabel')}</label>
                  <input type="date" className="input w-full" value={savingForm.targetDate} onChange={(e) => setSavingForm((f) => ({ ...f, targetDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.notes')}</label>
                <textarea className="input w-full" rows={2} value={savingForm.notes} onChange={(e) => setSavingForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</button>
                <button type="button" className="btn-secondary" onClick={() => { setShowAddSaving(false); setEditingSaving(null); }}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
