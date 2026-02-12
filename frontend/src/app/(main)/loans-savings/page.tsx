'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  loans as loansApi,
  savings as savingsApi,
  type LoanItem,
  type SavingItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';
import VoiceInputButton from '@/components/VoiceInputButton';
import { useToast } from '@/components/Toast';

/* ──────────────────────────────────────────────────────── */
/*  Helpers                                                 */
/* ──────────────────────────────────────────────────────── */

function formatCurrency(n: number, locale: string, currency = 'ILS') {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPercent(n: number) {
  return `${n.toFixed(2)}%`;
}

type ActiveSection = 'loans' | 'savings';

/* ──────────────────────────────────────────────────────── */
/*  Main Page Component                                     */
/* ──────────────────────────────────────────────────────── */

export default function LoansSavingsPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();

  /* ── State ── */
  const [activeSection, setActiveSection] = useState<ActiveSection>('loans');
  const [loansList, setLoansList] = useState<LoanItem[]>([]);
  const [savingsList, setSavingsList] = useState<SavingItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Loan form ── */
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [loanForm, setLoanForm] = useState({
    name: '', lender: '', originalAmount: '', remainingAmount: '',
    interestRate: '', monthlyPayment: '', startDate: '', endDate: '',
    currency: 'ILS', notes: '',
  });
  const [savingLoan, setSavingLoan] = useState(false);

  /* ── Saving form ── */
  const [showSavingForm, setShowSavingForm] = useState(false);
  const [editingSavingId, setEditingSavingId] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState({
    name: '', targetAmount: '', currentAmount: '', interestRate: '',
    startDate: '', targetDate: '', currency: 'ILS', notes: '',
  });
  const [savingSaving, setSavingSaving] = useState(false);

  /* ── Fetch ── */
  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      loansApi.list().catch(() => []),
      savingsApi.list().catch(() => []),
    ])
      .then(([l, s]) => {
        setLoansList(l);
        setSavingsList(s);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Loan form helpers ── */
  function resetLoanForm() {
    setLoanForm({ name: '', lender: '', originalAmount: '', remainingAmount: '', interestRate: '', monthlyPayment: '', startDate: '', endDate: '', currency: 'ILS', notes: '' });
  }

  function openAddLoan() {
    setEditingLoanId(null);
    resetLoanForm();
    setShowLoanForm(true);
  }

  function openEditLoan(loan: LoanItem) {
    setEditingLoanId(loan.id);
    setLoanForm({
      name: loan.name,
      lender: loan.lender ?? '',
      originalAmount: String(loan.originalAmount),
      remainingAmount: String(loan.remainingAmount),
      interestRate: loan.interestRate != null ? String(loan.interestRate) : '',
      monthlyPayment: loan.monthlyPayment != null ? String(loan.monthlyPayment) : '',
      startDate: loan.startDate ?? '',
      endDate: loan.endDate ?? '',
      currency: loan.currency || 'ILS',
      notes: loan.notes ?? '',
    });
    setShowLoanForm(true);
  }

  async function handleSaveLoan(e: React.FormEvent) {
    e.preventDefault();
    if (!loanForm.name.trim()) return;
    setSavingLoan(true);
    const body = {
      name: loanForm.name.trim(),
      lender: loanForm.lender.trim() || null,
      originalAmount: parseFloat(loanForm.originalAmount) || 0,
      remainingAmount: parseFloat(loanForm.remainingAmount) || 0,
      interestRate: loanForm.interestRate ? parseFloat(loanForm.interestRate) : null,
      monthlyPayment: loanForm.monthlyPayment ? parseFloat(loanForm.monthlyPayment) : null,
      startDate: loanForm.startDate || null,
      endDate: loanForm.endDate || null,
      currency: loanForm.currency,
      notes: loanForm.notes.trim() || null,
    };
    try {
      if (editingLoanId) {
        await loansApi.update(editingLoanId, body);
      } else {
        await loansApi.create(body);
      }
      toast(t('loansSavings.saved'), 'success');
      setShowLoanForm(false);
      setEditingLoanId(null);
      resetLoanForm();
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setSavingLoan(false);
    }
  }

  async function handleDeleteLoan(id: string) {
    if (!confirm(t('loansSavings.confirmDelete'))) return;
    try {
      await loansApi.delete(id);
      setLoansList((prev) => prev.filter((l) => l.id !== id));
      toast(t('loansSavings.deleted'), 'success');
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    }
  }

  /* ── Saving form helpers ── */
  function resetSavingForm() {
    setSavingForm({ name: '', targetAmount: '', currentAmount: '', interestRate: '', startDate: '', targetDate: '', currency: 'ILS', notes: '' });
  }

  function openAddSaving() {
    setEditingSavingId(null);
    resetSavingForm();
    setShowSavingForm(true);
  }

  function openEditSaving(sv: SavingItem) {
    setEditingSavingId(sv.id);
    setSavingForm({
      name: sv.name,
      targetAmount: sv.targetAmount != null ? String(sv.targetAmount) : '',
      currentAmount: String(sv.currentAmount),
      interestRate: sv.interestRate != null ? String(sv.interestRate) : '',
      startDate: sv.startDate ?? '',
      targetDate: sv.targetDate ?? '',
      currency: sv.currency || 'ILS',
      notes: sv.notes ?? '',
    });
    setShowSavingForm(true);
  }

  async function handleSaveSaving(e: React.FormEvent) {
    e.preventDefault();
    if (!savingForm.name.trim()) return;
    setSavingSaving(true);
    const body = {
      name: savingForm.name.trim(),
      targetAmount: savingForm.targetAmount ? parseFloat(savingForm.targetAmount) : null,
      currentAmount: parseFloat(savingForm.currentAmount) || 0,
      interestRate: savingForm.interestRate ? parseFloat(savingForm.interestRate) : null,
      startDate: savingForm.startDate || null,
      targetDate: savingForm.targetDate || null,
      currency: savingForm.currency,
      notes: savingForm.notes.trim() || null,
    };
    try {
      if (editingSavingId) {
        await savingsApi.update(editingSavingId, body);
      } else {
        await savingsApi.create(body);
      }
      toast(t('loansSavings.saved'), 'success');
      setShowSavingForm(false);
      setEditingSavingId(null);
      resetSavingForm();
      fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setSavingSaving(false);
    }
  }

  async function handleDeleteSaving(id: string) {
    if (!confirm(t('loansSavings.confirmDelete'))) return;
    try {
      await savingsApi.delete(id);
      setSavingsList((prev) => prev.filter((s) => s.id !== id));
      toast(t('loansSavings.deleted'), 'success');
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    }
  }

  /* ── Calculations ── */
  const totalLoanOriginal = loansList.reduce((s, l) => s + l.originalAmount, 0);
  const totalLoanRemaining = loansList.reduce((s, l) => s + l.remainingAmount, 0);
  const totalLoanPaid = totalLoanOriginal - totalLoanRemaining;
  const loanPaidPercent = totalLoanOriginal > 0 ? Math.round((totalLoanPaid / totalLoanOriginal) * 100) : 0;
  const totalMonthlyPayments = loansList.reduce((s, l) => s + (l.monthlyPayment ?? 0), 0);

  const totalSavingsTarget = savingsList.reduce((s, sv) => s + (sv.targetAmount ?? 0), 0);
  const totalSavingsCurrent = savingsList.reduce((s, sv) => s + sv.currentAmount, 0);
  const savingsPercent = totalSavingsTarget > 0 ? Math.round((totalSavingsCurrent / totalSavingsTarget) * 100) : 0;

  const netPosition = totalSavingsCurrent - totalLoanRemaining;

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t('loansSavings.title')} <HelpTooltip text={t('help.loansSavings')} className="ms-1" />
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('loansSavings.description')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            onClick={openAddLoan}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('loansSavings.addLoan')}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            onClick={openAddSaving}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('loansSavings.addSaving')}
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-slate-500">{t('loansSavings.totalDebt')}</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">
            {formatCurrency(totalLoanRemaining, locale)}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${loanPaidPercent}%` }}
              />
            </div>
            <span className="text-xs text-slate-500">{loanPaidPercent}% {t('loansSavings.paidOff')}</span>
          </div>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">{t('loansSavings.monthlyPayments')}</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">
            {formatCurrency(totalMonthlyPayments, locale)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">{t('loansSavings.totalSaved')}</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">
            {formatCurrency(totalSavingsCurrent, locale)}
          </p>
          {totalSavingsTarget > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-blue-400 transition-all duration-500"
                  style={{ width: `${Math.min(savingsPercent, 100)}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">{savingsPercent}%</span>
            </div>
          )}
        </div>
        <div className="card">
          <p className="text-sm text-slate-500">{t('loansSavings.netPosition')}</p>
          <p className={`text-xl font-bold mt-1 ${netPosition >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(netPosition, locale)}
          </p>
        </div>
      </div>

      {/* ── Section Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveSection('loans')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeSection === 'loans'
              ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t('loansSavings.loans')}
          {loansList.length > 0 && (
            <span className="ms-2 px-2 py-0.5 rounded-full text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
              {loansList.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('savings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeSection === 'savings'
              ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t('loansSavings.savingsGoals')}
          {savingsList.length > 0 && (
            <span className="ms-2 px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
              {savingsList.length}
            </span>
          )}
        </button>
      </div>

      {/* ──────────────────── LOANS SECTION ──────────────────── */}
      {activeSection === 'loans' && (
        <>
          {loansList.length === 0 ? (
            <div className="card text-center py-12">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-300 dark:text-slate-600 mb-3">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="text-slate-500">{t('loansSavings.noLoans')}</p>
              <p className="text-xs text-slate-400 mt-1">{t('loansSavings.noLoansHint')}</p>
              <button type="button" className="btn-secondary mt-4" onClick={openAddLoan}>
                {t('loansSavings.addLoan')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {loansList.map((loan) => {
                const paidPercent = loan.originalAmount > 0
                  ? Math.round(((loan.originalAmount - loan.remainingAmount) / loan.originalAmount) * 100)
                  : 0;

                return (
                  <div key={loan.id} className="card relative overflow-hidden group">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 to-orange-400" />

                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg truncate">{loan.name}</h3>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mt-0.5">
                          {loan.lender && (
                            <span className="flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                              </svg>
                              {loan.lender}
                            </span>
                          )}
                          {loan.interestRate != null && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                              {formatPercent(loan.interestRate)} {t('loansSavings.interest')}
                            </span>
                          )}
                          {loan.endDate && (
                            <span className="text-xs text-slate-400">
                              {t('loansSavings.endDate')}: {new Date(loan.endDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEditLoan(loan)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary-500 transition-colors"
                          title={t('loansSavings.editLoan')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLoan(loan.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                          title={t('common.delete')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-slate-500">
                          {t('loansSavings.paid')}: <b>{formatCurrency(loan.originalAmount - loan.remainingAmount, locale)}</b> {t('loansSavings.of')} {formatCurrency(loan.originalAmount, locale)}
                        </span>
                        <span className="font-bold text-green-600 dark:text-green-400">{paidPercent}%</span>
                      </div>
                      <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
                          style={{ width: `${paidPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">{t('loansSavings.originalAmount')}</p>
                        <p className="font-bold">{formatCurrency(loan.originalAmount, locale)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">{t('loansSavings.remainingAmount')}</p>
                        <p className="font-bold text-red-600 dark:text-red-400">{formatCurrency(loan.remainingAmount, locale)}</p>
                      </div>
                      {loan.monthlyPayment != null && (
                        <div>
                          <p className="text-slate-500">{t('loansSavings.monthly')}</p>
                          <p className="font-bold">{formatCurrency(loan.monthlyPayment, locale)}</p>
                        </div>
                      )}
                      {loan.interestRate != null && (
                        <div>
                          <p className="text-slate-500">{t('loansSavings.interestRate')}</p>
                          <p className="font-bold">{formatPercent(loan.interestRate)}</p>
                        </div>
                      )}
                    </div>

                    {loan.notes && <p className="mt-3 text-xs text-slate-400 italic">{loan.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ──────────────────── SAVINGS SECTION ──────────────────── */}
      {activeSection === 'savings' && (
        <>
          {savingsList.length === 0 ? (
            <div className="card text-center py-12">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-300 dark:text-slate-600 mb-3">
                <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-slate-500">{t('loansSavings.noSavings')}</p>
              <p className="text-xs text-slate-400 mt-1">{t('loansSavings.noSavingsHint')}</p>
              <button type="button" className="btn-primary mt-4" onClick={openAddSaving}>
                {t('loansSavings.addSaving')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {savingsList.map((sv) => {
                const progress = sv.targetAmount && sv.targetAmount > 0
                  ? Math.round((sv.currentAmount / sv.targetAmount) * 100)
                  : 0;
                const isReached = progress >= 100;

                return (
                  <div key={sv.id} className="card relative overflow-hidden group">
                    <div className={`absolute inset-x-0 top-0 h-1 ${isReached ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-primary-500 to-blue-400'}`} />

                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg truncate">{sv.name}</h3>
                          {isReached && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              {t('loansSavings.reached')}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mt-0.5">
                          {sv.interestRate != null && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                              {formatPercent(sv.interestRate)} {t('loansSavings.interest')}
                            </span>
                          )}
                          {sv.targetDate && (
                            <span className="text-xs text-slate-400">
                              {t('loansSavings.targetDateLabel')}: {new Date(sv.targetDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEditSaving(sv)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary-500 transition-colors"
                          title={t('loansSavings.editSaving')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSaving(sv.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                          title={t('common.delete')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {sv.targetAmount != null && sv.targetAmount > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="font-medium">
                            {formatCurrency(sv.currentAmount, locale)} / {formatCurrency(sv.targetAmount, locale)}
                          </span>
                          <span className={`font-bold text-lg ${isReached ? 'text-green-600 dark:text-green-400' : ''}`}>
                            {Math.min(progress, 100)}%
                          </span>
                        </div>
                        <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${isReached ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-primary-500 to-blue-400'}`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Current amount display when no target */}
                    {(sv.targetAmount == null || sv.targetAmount === 0) && (
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">{formatCurrency(sv.currentAmount, locale)}</p>
                    )}

                    {/* Remaining */}
                    {sv.targetAmount != null && sv.targetAmount > 0 && !isReached && (
                      <p className="text-sm text-slate-500">
                        {t('loansSavings.remaining')}: <b>{formatCurrency(sv.targetAmount - sv.currentAmount, locale)}</b>
                      </p>
                    )}

                    {sv.notes && <p className="mt-2 text-xs text-slate-400 italic">{sv.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Add/Edit Loan Modal ── */}
      {showLoanForm && (
        <div className="modal-overlay" onClick={() => { setShowLoanForm(false); setEditingLoanId(null); }}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">
                {editingLoanId ? t('loansSavings.editLoan') : t('loansSavings.addLoan')}
              </h3>
              <button type="button" onClick={() => { setShowLoanForm(false); setEditingLoanId(null); }} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveLoan} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.loanName')}</label>
                <div className="relative flex items-center">
                  <input className="input w-full pe-9" value={loanForm.name} onChange={(e) => setLoanForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('loansSavings.loanNamePlaceholder')} required />
                  <div className="absolute end-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => setLoanForm((f) => ({ ...f, name: text }))} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.lender')}</label>
                <div className="relative flex items-center">
                  <input className="input w-full pe-9" value={loanForm.lender} onChange={(e) => setLoanForm((f) => ({ ...f, lender: e.target.value }))} placeholder={t('loansSavings.lenderPlaceholder')} />
                  <div className="absolute end-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => setLoanForm((f) => ({ ...f, lender: text }))} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.originalAmount')}</label>
                  <input type="number" step="0.01" className="input w-full" value={loanForm.originalAmount} onChange={(e) => setLoanForm((f) => ({ ...f, originalAmount: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.remainingAmount')}</label>
                  <input type="number" step="0.01" className="input w-full" value={loanForm.remainingAmount} onChange={(e) => setLoanForm((f) => ({ ...f, remainingAmount: e.target.value }))} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.interestRate')} (%)</label>
                  <input type="number" step="0.01" className="input w-full" value={loanForm.interestRate} onChange={(e) => setLoanForm((f) => ({ ...f, interestRate: e.target.value }))} placeholder="%" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.monthlyPaymentLabel')}</label>
                  <input type="number" step="0.01" className="input w-full" value={loanForm.monthlyPayment} onChange={(e) => setLoanForm((f) => ({ ...f, monthlyPayment: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <div className="relative">
                  <textarea className="input w-full h-16 resize-none pe-9" value={loanForm.notes} onChange={(e) => setLoanForm((f) => ({ ...f, notes: e.target.value }))} />
                  <div className="absolute end-2 top-2">
                    <VoiceInputButton onResult={(text) => setLoanForm((f) => ({ ...f, notes: f.notes ? f.notes + ' ' + text : text }))} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={savingLoan}>
                  {savingLoan ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowLoanForm(false); setEditingLoanId(null); }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add/Edit Saving Modal ── */}
      {showSavingForm && (
        <div className="modal-overlay" onClick={() => { setShowSavingForm(false); setEditingSavingId(null); }}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">
                {editingSavingId ? t('loansSavings.editSaving') : t('loansSavings.addSaving')}
              </h3>
              <button type="button" onClick={() => { setShowSavingForm(false); setEditingSavingId(null); }} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveSaving} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.savingName')}</label>
                <div className="relative flex items-center">
                  <input className="input w-full pe-9" value={savingForm.name} onChange={(e) => setSavingForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('loansSavings.savingNamePlaceholder')} required />
                  <div className="absolute end-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => setSavingForm((f) => ({ ...f, name: text }))} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.currentAmountLabel')}</label>
                  <input type="number" step="0.01" className="input w-full" value={savingForm.currentAmount} onChange={(e) => setSavingForm((f) => ({ ...f, currentAmount: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.targetAmountLabel')}</label>
                  <input type="number" step="0.01" className="input w-full" value={savingForm.targetAmount} onChange={(e) => setSavingForm((f) => ({ ...f, targetAmount: e.target.value }))} placeholder={t('common.optional')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.interestRate')} (%)</label>
                  <input type="number" step="0.01" className="input w-full" value={savingForm.interestRate} onChange={(e) => setSavingForm((f) => ({ ...f, interestRate: e.target.value }))} placeholder="%" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('loansSavings.targetDateLabel')}</label>
                  <input type="date" className="input w-full" value={savingForm.targetDate} onChange={(e) => setSavingForm((f) => ({ ...f, targetDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.notes')}</label>
                <div className="relative">
                  <textarea className="input w-full h-16 resize-none pe-9" value={savingForm.notes} onChange={(e) => setSavingForm((f) => ({ ...f, notes: e.target.value }))} />
                  <div className="absolute end-2 top-2">
                    <VoiceInputButton onResult={(text) => setSavingForm((f) => ({ ...f, notes: f.notes ? f.notes + ' ' + text : text }))} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={savingSaving}>
                  {savingSaving ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowSavingForm(false); setEditingSavingId(null); }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
