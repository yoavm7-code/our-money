'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { accounts, categories, transactions as txApi, goals, budgets, forex, api } from '@/lib/api';

/* ─── Types ─── */

type EntryType = 'expense' | 'income' | 'account' | 'loan' | 'saving' | 'goal' | 'forexTransfer' | 'budget';

type AccountOption = { id: string; name: string; type: string; balance: string; currency: string };
type CategoryOption = { id: string; name: string; slug: string; icon: string | null; color: string | null; isIncome: boolean };

interface QuickAddProps {
  open: boolean;
  onClose: () => void;
}

/* ─── Icons (inline SVG) ─── */

function ArrowDownCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="8 12 12 16 16 12" />
      <line x1="12" y1="8" x2="12" y2="16" />
    </svg>
  );
}

function ArrowUpCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="16 12 12 8 8 12" />
      <line x1="12" y1="16" x2="12" y2="8" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
    </svg>
  );
}

function BanknotesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

function PiggyBankIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2" />
      <path d="M2 9.5a1 1 0 0 1 1-1 5 5 0 0 1 4 2c.5.8.5 2 .5 3" />
      <circle cx="14" cy="10" r=".5" fill="currentColor" />
    </svg>
  );
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="7" />
      <path d="M15 15a7 7 0 1 0 0-0" />
      <path d="M9 7v4M7 9h4" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

/* ─── Type definitions for the grid ─── */

const ENTRY_TYPES: Array<{
  key: EntryType;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  textColor: string;
}> = [
  { key: 'expense', labelKey: 'quickAdd.expense', Icon: ArrowDownCircleIcon, bgColor: 'bg-red-100 dark:bg-red-900/30', textColor: 'text-red-600 dark:text-red-400' },
  { key: 'income', labelKey: 'quickAdd.income', Icon: ArrowUpCircleIcon, bgColor: 'bg-green-100 dark:bg-green-900/30', textColor: 'text-green-600 dark:text-green-400' },
  { key: 'account', labelKey: 'quickAdd.account', Icon: BuildingIcon, bgColor: 'bg-blue-100 dark:bg-blue-900/30', textColor: 'text-blue-600 dark:text-blue-400' },
  { key: 'loan', labelKey: 'quickAdd.loan', Icon: BanknotesIcon, bgColor: 'bg-orange-100 dark:bg-orange-900/30', textColor: 'text-orange-600 dark:text-orange-400' },
  { key: 'saving', labelKey: 'quickAdd.saving', Icon: PiggyBankIcon, bgColor: 'bg-teal-100 dark:bg-teal-900/30', textColor: 'text-teal-600 dark:text-teal-400' },
  { key: 'goal', labelKey: 'quickAdd.goal', Icon: TargetIcon, bgColor: 'bg-purple-100 dark:bg-purple-900/30', textColor: 'text-purple-600 dark:text-purple-400' },
  { key: 'forexTransfer', labelKey: 'quickAdd.forexTransfer', Icon: CurrencyIcon, bgColor: 'bg-indigo-100 dark:bg-indigo-900/30', textColor: 'text-indigo-600 dark:text-indigo-400' },
  { key: 'budget', labelKey: 'quickAdd.budget', Icon: WalletIcon, bgColor: 'bg-amber-100 dark:bg-amber-900/30', textColor: 'text-amber-600 dark:text-amber-400' },
];

const ACCOUNT_TYPES = ['BANK', 'CREDIT_CARD', 'INSURANCE', 'PENSION', 'INVESTMENT', 'CASH'] as const;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ─── Component ─── */

export default function QuickAdd({ open, onClose }: QuickAddProps) {
  const { t } = useTranslation();

  const [selectedType, setSelectedType] = useState<EntryType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared data from API
  const [accountList, setAccountList] = useState<AccountOption[]>([]);
  const [categoryList, setCategoryList] = useState<CategoryOption[]>([]);

  // ── Expense / Income form state ──
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txAccountId, setTxAccountId] = useState('');
  const [txDate, setTxDate] = useState(todayStr());

  // ── Account form state ──
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<string>('BANK');
  const [accBalance, setAccBalance] = useState('');

  // ── Loan form state ──
  const [loanName, setLoanName] = useState('');
  const [loanOriginal, setLoanOriginal] = useState('');
  const [loanRemaining, setLoanRemaining] = useState('');
  const [loanInterest, setLoanInterest] = useState('');
  const [loanMonthly, setLoanMonthly] = useState('');

  // ── Saving form state ──
  const [savingName, setSavingName] = useState('');
  const [savingTarget, setSavingTarget] = useState('');
  const [savingCurrent, setSavingCurrent] = useState('');

  // ── Goal form state ──
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDate, setGoalDate] = useState('');

  // ── Forex Transfer form state ──
  const [fxFromCurrency, setFxFromCurrency] = useState('ILS');
  const [fxToCurrency, setFxToCurrency] = useState('USD');
  const [fxFromAmount, setFxFromAmount] = useState('');
  const [fxToAmount, setFxToAmount] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [fxDate, setFxDate] = useState(todayStr());

  // ── Budget form state ──
  const [budgetCategoryId, setBudgetCategoryId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  // Reset all form state when modal closes or type changes
  useEffect(() => {
    if (!open) {
      setSelectedType(null);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    setError(null);
    setSubmitting(false);
    // Reset individual forms
    setTxAmount(''); setTxDescription(''); setTxDate(todayStr());
    setAccName(''); setAccType('BANK'); setAccBalance('');
    setLoanName(''); setLoanOriginal(''); setLoanRemaining(''); setLoanInterest(''); setLoanMonthly('');
    setSavingName(''); setSavingTarget(''); setSavingCurrent('');
    setGoalName(''); setGoalTarget(''); setGoalDate('');
    setFxFromCurrency('ILS'); setFxToCurrency('USD'); setFxFromAmount(''); setFxToAmount(''); setFxRate(''); setFxDate(todayStr());
    setBudgetCategoryId(''); setBudgetAmount('');
  }, [selectedType]);

  // Load accounts when selecting expense/income
  useEffect(() => {
    if (selectedType === 'expense' || selectedType === 'income') {
      accounts.list().then((list) => {
        setAccountList(list);
        if (list.length > 0 && !txAccountId) setTxAccountId(list[0].id);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  // Load categories when selecting budget
  useEffect(() => {
    if (selectedType === 'budget') {
      categories.list().then((list) => {
        setCategoryList(list);
        if (list.length > 0 && !budgetCategoryId) setBudgetCategoryId(list[0].id);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  if (!open) return null;

  /* ─── Submission handlers ─── */

  async function handleSubmitExpenseIncome() {
    const amount = parseFloat(txAmount);
    if (!amount || !txAccountId) return;
    setSubmitting(true);
    setError(null);
    try {
      const finalAmount = selectedType === 'expense' ? -Math.abs(amount) : Math.abs(amount);
      await txApi.create({
        accountId: txAccountId,
        date: txDate || todayStr(),
        description: txDescription || (selectedType === 'expense' ? t('quickAdd.expense') : t('quickAdd.income')),
        amount: finalAmount,
      });
      onClose();
    } catch {
      setError(t('quickAdd.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitAccount() {
    if (!accName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await accounts.create({
        name: accName.trim(),
        type: accType,
        balance: accBalance ? parseFloat(accBalance) : 0,
      });
      onClose();
    } catch {
      setError(t('quickAdd.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitLoan() {
    if (!loanName.trim() || !loanOriginal || !loanRemaining) return;
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/loans', {
        method: 'POST',
        body: JSON.stringify({
          name: loanName.trim(),
          originalAmount: parseFloat(loanOriginal),
          remainingAmount: parseFloat(loanRemaining),
          ...(loanInterest ? { interestRate: parseFloat(loanInterest) } : {}),
          ...(loanMonthly ? { monthlyPayment: parseFloat(loanMonthly) } : {}),
        }),
      });
      onClose();
    } catch {
      setError(t('quickAdd.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitSaving() {
    if (!savingName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/savings', {
        method: 'POST',
        body: JSON.stringify({
          name: savingName.trim(),
          ...(savingTarget ? { targetAmount: parseFloat(savingTarget) } : {}),
          currentAmount: savingCurrent ? parseFloat(savingCurrent) : 0,
        }),
      });
      onClose();
    } catch {
      setError(t('quickAdd.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitGoal() {
    if (!goalName.trim() || !goalTarget) return;
    setSubmitting(true);
    setError(null);
    try {
      await goals.create({
        name: goalName.trim(),
        targetAmount: parseFloat(goalTarget),
        ...(goalDate ? { targetDate: goalDate } : {}),
      });
      onClose();
    } catch {
      setError(t('quickAdd.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitForexTransfer() {
    if (!fxFromCurrency || !fxToCurrency || !fxFromAmount || !fxToAmount || !fxRate) return;
    setSubmitting(true);
    setError(null);
    try {
      await forex.transfers.create({
        type: 'TRANSFER',
        fromCurrency: fxFromCurrency,
        toCurrency: fxToCurrency,
        fromAmount: parseFloat(fxFromAmount),
        toAmount: parseFloat(fxToAmount),
        exchangeRate: parseFloat(fxRate),
        date: fxDate || todayStr(),
      });
      onClose();
    } catch {
      setError(t('quickAdd.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitBudget() {
    if (!budgetCategoryId || !budgetAmount) return;
    setSubmitting(true);
    setError(null);
    try {
      await budgets.upsert({
        categoryId: budgetCategoryId,
        amount: parseFloat(budgetAmount),
      });
      onClose();
    } catch {
      setError(t('quickAdd.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  /* ─── Form rendering helpers ─── */

  function renderFormHeader() {
    const entry = ENTRY_TYPES.find((e) => e.key === selectedType);
    if (!entry) return null;
    const { Icon, textColor } = entry;
    return (
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => setSelectedType(null)}
          className="btn-secondary !p-2 !rounded-lg"
          aria-label={t('common.cancel')}
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
        <Icon className={`w-6 h-6 ${textColor}`} />
        <h2 className="text-lg font-semibold">{t(entry.labelKey)}</h2>
      </div>
    );
  }

  function renderError() {
    if (!error) return null;
    return <p className="text-red-500 text-sm mb-3">{error}</p>;
  }

  function renderActions(onSubmit: () => void, disabled?: boolean) {
    return (
      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={() => setSelectedType(null)}
          className="btn-secondary flex-1"
          disabled={submitting}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="btn-primary flex-1"
          disabled={submitting || disabled}
        >
          {submitting ? t('common.loading') : t('common.add')}
        </button>
      </div>
    );
  }

  function renderExpenseIncomeForm() {
    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.amount')} *</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.description')}</label>
            <input
              type="text"
              className="input w-full"
              value={txDescription}
              onChange={(e) => setTxDescription(e.target.value)}
              placeholder={selectedType === 'expense' ? t('expenses.descriptionPlaceholder') : t('income.descriptionPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.account')}</label>
            <select
              className="input w-full"
              value={txAccountId}
              onChange={(e) => setTxAccountId(e.target.value)}
            >
              {accountList.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.date')}</label>
            <input
              type="date"
              className="input w-full"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
            />
          </div>
        </div>
        {renderActions(handleSubmitExpenseIncome, !txAmount)}
      </div>
    );
  }

  function renderAccountForm() {
    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.name')} *</label>
            <input
              type="text"
              className="input w-full"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              placeholder={t('settings.namePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('settings.type')}</label>
            <select
              className="input w-full"
              value={accType}
              onChange={(e) => setAccType(e.target.value)}
            >
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>{t(`accountType.${type}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('settings.balance')}</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={accBalance}
              onChange={(e) => setAccBalance(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        {renderActions(handleSubmitAccount, !accName.trim())}
      </div>
    );
  }

  function renderLoanForm() {
    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('loansSavings.loanName')} *</label>
            <input
              type="text"
              className="input w-full"
              value={loanName}
              onChange={(e) => setLoanName(e.target.value)}
              placeholder={t('loansSavings.loanNamePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('loansSavings.originalAmount')} *</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={loanOriginal}
              onChange={(e) => setLoanOriginal(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('loansSavings.remainingAmount')} *</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={loanRemaining}
              onChange={(e) => setLoanRemaining(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('loansSavings.interestRate')}</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={loanInterest}
              onChange={(e) => setLoanInterest(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('loansSavings.monthlyPaymentLabel')}</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={loanMonthly}
              onChange={(e) => setLoanMonthly(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        {renderActions(handleSubmitLoan, !loanName.trim() || !loanOriginal || !loanRemaining)}
      </div>
    );
  }

  function renderSavingForm() {
    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('loansSavings.savingName')} *</label>
            <input
              type="text"
              className="input w-full"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              placeholder={t('loansSavings.savingNamePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('loansSavings.targetAmountLabel')}</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={savingTarget}
              onChange={(e) => setSavingTarget(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('loansSavings.currentAmountLabel')}</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={savingCurrent}
              onChange={(e) => setSavingCurrent(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        {renderActions(handleSubmitSaving, !savingName.trim())}
      </div>
    );
  }

  function renderGoalForm() {
    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('goals.goalName')} *</label>
            <input
              type="text"
              className="input w-full"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder={t('goals.goalNamePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('goals.targetAmount')} *</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('goals.targetDate')}</label>
            <input
              type="date"
              className="input w-full"
              value={goalDate}
              onChange={(e) => setGoalDate(e.target.value)}
            />
          </div>
        </div>
        {renderActions(handleSubmitGoal, !goalName.trim() || !goalTarget)}
      </div>
    );
  }

  function renderForexTransferForm() {
    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('quickAdd.fromCurrency')} *</label>
              <input
                type="text"
                className="input w-full"
                value={fxFromCurrency}
                onChange={(e) => setFxFromCurrency(e.target.value.toUpperCase())}
                placeholder="ILS"
                maxLength={3}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('quickAdd.toCurrency')} *</label>
              <input
                type="text"
                className="input w-full"
                value={fxToCurrency}
                onChange={(e) => setFxToCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
                maxLength={3}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('quickAdd.fromAmount')} *</label>
              <input
                type="number"
                step="0.01"
                className="input w-full"
                value={fxFromAmount}
                onChange={(e) => setFxFromAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('quickAdd.toAmount')} *</label>
              <input
                type="number"
                step="0.01"
                className="input w-full"
                value={fxToAmount}
                onChange={(e) => setFxToAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('quickAdd.exchangeRate')} *</label>
            <input
              type="number"
              step="0.0001"
              className="input w-full"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              placeholder="0.0000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.date')}</label>
            <input
              type="date"
              className="input w-full"
              value={fxDate}
              onChange={(e) => setFxDate(e.target.value)}
            />
          </div>
        </div>
        {renderActions(handleSubmitForexTransfer, !fxFromCurrency || !fxToCurrency || !fxFromAmount || !fxToAmount || !fxRate)}
      </div>
    );
  }

  function renderBudgetForm() {
    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.category')} *</label>
            <select
              className="input w-full"
              value={budgetCategoryId}
              onChange={(e) => setBudgetCategoryId(e.target.value)}
            >
              {categoryList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('quickAdd.monthlyAmount')} *</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
        </div>
        {renderActions(handleSubmitBudget, !budgetCategoryId || !budgetAmount)}
      </div>
    );
  }

  function renderForm() {
    switch (selectedType) {
      case 'expense':
      case 'income':
        return renderExpenseIncomeForm();
      case 'account':
        return renderAccountForm();
      case 'loan':
        return renderLoanForm();
      case 'saving':
        return renderSavingForm();
      case 'goal':
        return renderGoalForm();
      case 'forexTransfer':
        return renderForexTransferForm();
      case 'budget':
        return renderBudgetForm();
      default:
        return null;
    }
  }

  /* ─── Type selector grid ─── */

  function renderTypeSelector() {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-1">{t('quickAdd.title')}</h2>
        <p className="text-sm text-[var(--muted)] mb-5">{t('quickAdd.chooseType')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ENTRY_TYPES.map(({ key, labelKey, Icon, bgColor, textColor }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedType(key)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl ${bgColor} hover:opacity-80 transition-all duration-150 active:scale-[0.97] cursor-pointer`}
            >
              <Icon className={`w-7 h-7 ${textColor}`} />
              <span className={`text-sm font-medium ${textColor}`}>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ─── Render ─── */

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {selectedType ? renderForm() : renderTypeSelector()}
      </div>
    </div>
  );
}
