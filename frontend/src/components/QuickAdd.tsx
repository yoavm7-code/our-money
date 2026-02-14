'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { accounts, categories, transactions as txApi, goals, budgets, forex, mortgages, stocks, api } from '@/lib/api';
import VoiceInputButton from '@/components/VoiceInputButton';

/* ─── Types ─── */

type EntryType = 'expense' | 'income' | 'account' | 'loan' | 'saving' | 'goal' | 'forexTransfer' | 'budget' | 'mortgage' | 'stockPortfolio';

type AccountOption = { id: string; name: string; type: string; balance: string; currency: string };
type CategoryOption = { id: string; name: string; slug: string; icon: string | null; color: string | null; isIncome: boolean };
type ForexAccountOption = { id: string; name: string; currency: string };

interface QuickAddProps {
  open: boolean;
  onClose: () => void;
}

/* ─── Helpers ─── */

function getCategoryDisplayName(name: string, slug: string | undefined, t: (k: string) => string): string {
  if (slug) {
    const translated = t('categories.' + slug);
    if (translated !== 'categories.' + slug) return translated;
  }
  return name;
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

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
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

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
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
  { key: 'mortgage', labelKey: 'quickAdd.mortgage', Icon: HomeIcon, bgColor: 'bg-cyan-100 dark:bg-cyan-900/30', textColor: 'text-cyan-600 dark:text-cyan-400' },
  { key: 'stockPortfolio', labelKey: 'quickAdd.stockPortfolio', Icon: BarChartIcon, bgColor: 'bg-rose-100 dark:bg-rose-900/30', textColor: 'text-rose-600 dark:text-rose-400' },
];

const ACCOUNT_TYPES = ['BANK', 'CREDIT_CARD', 'INSURANCE', 'PENSION', 'INVESTMENT', 'CASH'] as const;
const BALANCE_TYPES = ['BANK', 'INVESTMENT', 'PENSION', 'INSURANCE', 'CASH'];
const GOAL_ICONS = ['🎯', '✈️', '🏠', '🚗', '💰', '📚', '🏥', '💍', '🎓', '🛒', '🏖️', '💻', '👶', '🐕', '🎁'];
const GOAL_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ─── Component ─── */

export default function QuickAdd({ open, onClose }: QuickAddProps) {
  const { t } = useTranslation();

  const [selectedType, setSelectedType] = useState<EntryType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  // Shared data from API
  const [accountList, setAccountList] = useState<AccountOption[]>([]);
  const [categoryList, setCategoryList] = useState<CategoryOption[]>([]);
  const [forexAccountList, setForexAccountList] = useState<ForexAccountOption[]>([]);

  // ── Expense / Income form state ──
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txAccountId, setTxAccountId] = useState('');
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txDate, setTxDate] = useState(todayStr());
  const [txIsRecurring, setTxIsRecurring] = useState(false);
  const [txInstallmentCurrent, setTxInstallmentCurrent] = useState('');
  const [txInstallmentTotal, setTxInstallmentTotal] = useState('');
  const [txTotalAmount, setTxTotalAmount] = useState('');

  // ── Account form state ──
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<string>('BANK');
  const [accBalance, setAccBalance] = useState('');
  const [accBalanceDate, setAccBalanceDate] = useState('');
  const [accLinkedBankId, setAccLinkedBankId] = useState('');
  const [accCurrency, setAccCurrency] = useState('');

  // ── Loan form state ──
  const [loanName, setLoanName] = useState('');
  const [loanOriginal, setLoanOriginal] = useState('');
  const [loanRemaining, setLoanRemaining] = useState('');
  const [loanInterest, setLoanInterest] = useState('');
  const [loanMonthly, setLoanMonthly] = useState('');
  const [loanLender, setLoanLender] = useState('');
  const [loanStartDate, setLoanStartDate] = useState('');
  const [loanEndDate, setLoanEndDate] = useState('');
  const [loanNotes, setLoanNotes] = useState('');

  // ── Saving form state ──
  const [savingName, setSavingName] = useState('');
  const [savingTarget, setSavingTarget] = useState('');
  const [savingCurrent, setSavingCurrent] = useState('');
  const [savingInterest, setSavingInterest] = useState('');
  const [savingStartDate, setSavingStartDate] = useState('');
  const [savingTargetDate, setSavingTargetDate] = useState('');
  const [savingNotes, setSavingNotes] = useState('');

  // ── Goal form state ──
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [goalIcon, setGoalIcon] = useState('🎯');
  const [goalColor, setGoalColor] = useState('#3b82f6');
  const [goalNotes, setGoalNotes] = useState('');

  // ── Forex Transfer form state ──
  const [fxType, setFxType] = useState('TRANSFER');
  const [fxFromCurrency, setFxFromCurrency] = useState('ILS');
  const [fxToCurrency, setFxToCurrency] = useState('USD');
  const [fxFromAmount, setFxFromAmount] = useState('');
  const [fxToAmount, setFxToAmount] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [fxDate, setFxDate] = useState(todayStr());
  const [fxFee, setFxFee] = useState('');
  const [fxAccountId, setFxAccountId] = useState('');
  const [fxDescription, setFxDescription] = useState('');
  const [fxNotes, setFxNotes] = useState('');

  // ── Budget form state ──
  const [budgetCategoryId, setBudgetCategoryId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  // ── Mortgage form state ──
  const [mortName, setMortName] = useState('');
  const [mortBank, setMortBank] = useState('');
  const [mortTotalAmount, setMortTotalAmount] = useState('');
  const [mortPropertyValue, setMortPropertyValue] = useState('');

  // ── Stock Portfolio form state ──
  const [spName, setSpName] = useState('');
  const [spBroker, setSpBroker] = useState('');
  const [spAccountNum, setSpAccountNum] = useState('');
  const [spCurrency, setSpCurrency] = useState('ILS');

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
    setShowMore(false);
    // Reset all form fields
    setTxAmount(''); setTxDescription(''); setTxDate(todayStr()); setTxCategoryId(''); setTxIsRecurring(false); setTxInstallmentCurrent(''); setTxInstallmentTotal(''); setTxTotalAmount('');
    setAccName(''); setAccType('BANK'); setAccBalance(''); setAccBalanceDate(''); setAccLinkedBankId(''); setAccCurrency('');
    setLoanName(''); setLoanOriginal(''); setLoanRemaining(''); setLoanInterest(''); setLoanMonthly(''); setLoanLender(''); setLoanStartDate(''); setLoanEndDate(''); setLoanNotes('');
    setSavingName(''); setSavingTarget(''); setSavingCurrent(''); setSavingInterest(''); setSavingStartDate(''); setSavingTargetDate(''); setSavingNotes('');
    setGoalName(''); setGoalTarget(''); setGoalCurrent(''); setGoalDate(''); setGoalIcon('🎯'); setGoalColor('#3b82f6'); setGoalNotes('');
    setFxType('TRANSFER'); setFxFromCurrency('ILS'); setFxToCurrency('USD'); setFxFromAmount(''); setFxToAmount(''); setFxRate(''); setFxDate(todayStr()); setFxFee(''); setFxAccountId(''); setFxDescription(''); setFxNotes('');
    setBudgetCategoryId(''); setBudgetAmount('');
    setMortName(''); setMortBank(''); setMortTotalAmount(''); setMortPropertyValue('');
    setSpName(''); setSpBroker(''); setSpAccountNum(''); setSpCurrency('ILS');
  }, [selectedType]);

  // Load accounts + categories when selecting expense/income
  useEffect(() => {
    if (selectedType === 'expense' || selectedType === 'income') {
      accounts.list().then((list) => {
        setAccountList(list);
        if (list.length > 0 && !txAccountId) setTxAccountId(list[0].id);
      }).catch(() => {});
      categories.list().then((list) => {
        setCategoryList(list);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);

  // Load accounts when selecting account type (for linked bank)
  useEffect(() => {
    if (selectedType === 'account') {
      accounts.list().then((list) => {
        setAccountList(list);
      }).catch(() => {});
    }
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

  // Load forex accounts when selecting forex transfer
  useEffect(() => {
    if (selectedType === 'forexTransfer') {
      forex.accounts.list().then((list: ForexAccountOption[]) => {
        setForexAccountList(list);
      }).catch(() => {});
    }
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
        ...(txCategoryId ? { categoryId: txCategoryId } : {}),
        ...(txIsRecurring ? { isRecurring: true } : {}),
        ...(txInstallmentCurrent ? { installmentCurrent: parseInt(txInstallmentCurrent) } : {}),
        ...(txInstallmentTotal ? { installmentTotal: parseInt(txInstallmentTotal) } : {}),
        ...(txTotalAmount ? { totalAmount: parseFloat(txTotalAmount) } : {}),
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
        ...(accBalanceDate ? { balanceDate: accBalanceDate } : {}),
        ...(accType === 'CREDIT_CARD' && accLinkedBankId ? { linkedBankAccountId: accLinkedBankId } : {}),
        ...(accCurrency ? { currency: accCurrency } : {}),
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
          ...(loanLender ? { lender: loanLender.trim() } : {}),
          ...(loanStartDate ? { startDate: loanStartDate } : {}),
          ...(loanEndDate ? { endDate: loanEndDate } : {}),
          ...(loanNotes ? { notes: loanNotes.trim() } : {}),
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
          ...(savingInterest ? { interestRate: parseFloat(savingInterest) } : {}),
          ...(savingStartDate ? { startDate: savingStartDate } : {}),
          ...(savingTargetDate ? { targetDate: savingTargetDate } : {}),
          ...(savingNotes ? { notes: savingNotes.trim() } : {}),
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
        ...(goalCurrent ? { currentAmount: parseFloat(goalCurrent) } : {}),
        ...(goalDate ? { targetDate: goalDate } : {}),
        icon: goalIcon,
        color: goalColor,
        ...(goalNotes ? { notes: goalNotes.trim() } : {}),
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
        type: fxType,
        fromCurrency: fxFromCurrency,
        toCurrency: fxToCurrency,
        fromAmount: parseFloat(fxFromAmount),
        toAmount: parseFloat(fxToAmount),
        exchangeRate: parseFloat(fxRate),
        date: fxDate || todayStr(),
        ...(fxFee ? { fee: parseFloat(fxFee) } : {}),
        ...(fxAccountId ? { forexAccountId: fxAccountId } : {}),
        ...(fxDescription ? { description: fxDescription.trim() } : {}),
        ...(fxNotes ? { notes: fxNotes.trim() } : {}),
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

  async function handleSubmitMortgage() {
    if (!mortName.trim() || !mortTotalAmount) return;
    setSubmitting(true);
    setError(null);
    try {
      await mortgages.create({
        name: mortName.trim(),
        totalAmount: parseFloat(mortTotalAmount),
        ...(mortBank ? { bank: mortBank.trim() } : {}),
        ...(mortPropertyValue ? { propertyValue: parseFloat(mortPropertyValue) } : {}),
      });
      onClose();
    } catch {
      setError(t('quickAdd.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitStockPortfolio() {
    if (!spName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await stocks.portfolios.create({
        name: spName.trim(),
        ...(spBroker ? { broker: spBroker.trim() } : {}),
        ...(spAccountNum ? { accountNum: spAccountNum.trim() } : {}),
        currency: spCurrency || 'ILS',
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
          onClick={onSubmit}
          className="btn-primary flex-1"
          disabled={submitting || disabled}
        >
          {submitting ? t('common.loading') : t('common.add')}
        </button>
        <button
          type="button"
          onClick={() => setSelectedType(null)}
          className="btn-secondary flex-1"
          disabled={submitting}
        >
          {t('common.cancel')}
        </button>
      </div>
    );
  }

  function renderMoreToggle() {
    return (
      <button
        type="button"
        onClick={() => setShowMore(!showMore)}
        className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mt-3"
      >
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
        <span>{t('quickAdd.moreOptions')}</span>
      </button>
    );
  }

  /* ─── Individual forms ─── */

  function renderExpenseIncomeForm() {
    const filteredCategories = categoryList.filter((c) =>
      selectedType === 'income' ? c.isIncome : !c.isIncome
    );

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
            <div className="relative flex items-center">
              <input
                type="text"
                className="input w-full pe-9"
                value={txDescription}
                onChange={(e) => setTxDescription(e.target.value)}
                placeholder={selectedType === 'expense' ? t('expenses.descriptionPlaceholder') : t('income.descriptionPlaceholder')}
              />
              <div className="absolute end-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton onResult={(text) => setTxDescription(text)} />
              </div>
            </div>
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
            <label className="block text-sm font-medium mb-1">{t('common.category')}</label>
            <select
              className="input w-full"
              value={txCategoryId}
              onChange={(e) => setTxCategoryId(e.target.value)}
            >
              <option value="">{t('common.uncategorized')}</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? c.icon + ' ' : ''}{getCategoryDisplayName(c.name, c.slug, t)}
                </option>
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

          {/* Recurring toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={txIsRecurring}
              onChange={(e) => setTxIsRecurring(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-sm">{t('quickAdd.recurring')}</span>
          </label>

          {/* Advanced: installments */}
          {renderMoreToggle()}
          {showMore && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--muted)]">{t('quickAdd.installments')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">{t('quickAdd.installmentCurrent')}</label>
                  <input
                    type="number"
                    className="input w-full"
                    value={txInstallmentCurrent}
                    onChange={(e) => setTxInstallmentCurrent(e.target.value)}
                    placeholder="1"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">{t('quickAdd.installmentTotal')}</label>
                  <input
                    type="number"
                    className="input w-full"
                    value={txInstallmentTotal}
                    onChange={(e) => setTxInstallmentTotal(e.target.value)}
                    placeholder="12"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--muted)] mb-1">{t('quickAdd.totalAmount')}</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input w-full"
                    value={txTotalAmount}
                    onChange={(e) => setTxTotalAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        {renderActions(handleSubmitExpenseIncome, !txAmount)}
      </div>
    );
  }

  function renderAccountForm() {
    const bankAccounts = accountList.filter((a) => a.type === 'BANK');

    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('common.name')} *</label>
            <div className="relative flex items-center">
              <input
                type="text"
                className="input w-full pe-9"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder={t('settings.namePlaceholder')}
                autoFocus
              />
              <div className="absolute end-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton onResult={(text) => setAccName(text)} />
              </div>
            </div>
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

          {/* Link to bank account (only for credit cards) */}
          {accType === 'CREDIT_CARD' && bankAccounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">{t('quickAdd.linkedBank')}</label>
              <select
                className="input w-full"
                value={accLinkedBankId}
                onChange={(e) => setAccLinkedBankId(e.target.value)}
              >
                <option value="">{t('quickAdd.noLinkedBank')}</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Balance (for balance-supporting types) */}
          {BALANCE_TYPES.includes(accType) && (
            <>
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
              {accBalance && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('quickAdd.balanceDate')}</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={accBalanceDate}
                    onChange={(e) => setAccBalanceDate(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          {/* More options */}
          {renderMoreToggle()}
          {showMore && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)]">
              <div>
                <label className="block text-sm font-medium mb-1">{t('quickAdd.currency')}</label>
                <input
                  type="text"
                  className="input w-full"
                  value={accCurrency}
                  onChange={(e) => setAccCurrency(e.target.value.toUpperCase())}
                  placeholder="ILS"
                  maxLength={3}
                />
              </div>
            </div>
          )}
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
            <div className="relative flex items-center">
              <input
                type="text"
                className="input w-full pe-9"
                value={loanName}
                onChange={(e) => setLoanName(e.target.value)}
                placeholder={t('loansSavings.loanNamePlaceholder')}
                autoFocus
              />
              <div className="absolute end-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton onResult={(text) => setLoanName(text)} />
              </div>
            </div>
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
              placeholder="%"
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

          {renderMoreToggle()}
          {showMore && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)]">
              <div>
                <label className="block text-sm font-medium mb-1">{t('quickAdd.lender')}</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    className="input w-full pe-9"
                    value={loanLender}
                    onChange={(e) => setLoanLender(e.target.value)}
                    placeholder={t('quickAdd.lenderPlaceholder')}
                  />
                  <div className="absolute end-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => setLoanLender(text)} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('quickAdd.startDate')}</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={loanStartDate}
                    onChange={(e) => setLoanStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('quickAdd.endDate')}</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={loanEndDate}
                    onChange={(e) => setLoanEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('quickAdd.notes')}</label>
                <div className="relative">
                  <textarea
                    className="input w-full pe-9"
                    rows={2}
                    value={loanNotes}
                    onChange={(e) => setLoanNotes(e.target.value)}
                  />
                  <div className="absolute end-2 top-2">
                    <VoiceInputButton onResult={(text) => setLoanNotes((prev) => prev ? prev + ' ' + text : text)} />
                  </div>
                </div>
              </div>
            </div>
          )}
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
            <div className="relative flex items-center">
              <input
                type="text"
                className="input w-full pe-9"
                value={savingName}
                onChange={(e) => setSavingName(e.target.value)}
                placeholder={t('loansSavings.savingNamePlaceholder')}
                autoFocus
              />
              <div className="absolute end-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton onResult={(text) => setSavingName(text)} />
              </div>
            </div>
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

          {renderMoreToggle()}
          {showMore && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)]">
              <div>
                <label className="block text-sm font-medium mb-1">{t('loansSavings.interestRate')}</label>
                <input
                  type="number"
                  step="0.01"
                  className="input w-full"
                  value={savingInterest}
                  onChange={(e) => setSavingInterest(e.target.value)}
                  placeholder="%"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('quickAdd.startDate')}</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={savingStartDate}
                    onChange={(e) => setSavingStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('quickAdd.targetDate')}</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={savingTargetDate}
                    onChange={(e) => setSavingTargetDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('quickAdd.notes')}</label>
                <div className="relative">
                  <textarea
                    className="input w-full pe-9"
                    rows={2}
                    value={savingNotes}
                    onChange={(e) => setSavingNotes(e.target.value)}
                  />
                  <div className="absolute end-2 top-2">
                    <VoiceInputButton onResult={(text) => setSavingNotes((prev) => prev ? prev + ' ' + text : text)} />
                  </div>
                </div>
              </div>
            </div>
          )}
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
            <div className="relative flex items-center">
              <input
                type="text"
                className="input w-full pe-9"
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                placeholder={t('goals.goalNamePlaceholder')}
                autoFocus
              />
              <div className="absolute end-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton onResult={(text) => setGoalName(text)} />
              </div>
            </div>
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
            <label className="block text-sm font-medium mb-1">{t('quickAdd.currentAmount')}</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={goalCurrent}
              onChange={(e) => setGoalCurrent(e.target.value)}
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

          {renderMoreToggle()}
          {showMore && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)]">
              {/* Icon selector */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('quickAdd.icon')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {GOAL_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setGoalIcon(icon)}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                        goalIcon === icon ? 'bg-emerald-100 dark:bg-emerald-900/40 ring-2 ring-emerald-500' : 'bg-[var(--background)] hover:bg-[var(--border)]'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              {/* Color selector */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('quickAdd.color')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {GOAL_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setGoalColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        goalColor === color ? 'ring-2 ring-offset-2 ring-[var(--foreground)]' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('quickAdd.notes')}</label>
                <div className="relative">
                  <textarea
                    className="input w-full pe-9"
                    rows={2}
                    value={goalNotes}
                    onChange={(e) => setGoalNotes(e.target.value)}
                  />
                  <div className="absolute end-2 top-2">
                    <VoiceInputButton onResult={(text) => setGoalNotes((prev) => prev ? prev + ' ' + text : text)} />
                  </div>
                </div>
              </div>
            </div>
          )}
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
          <div>
            <label className="block text-sm font-medium mb-1">{t('quickAdd.transferType')} *</label>
            <select
              className="input w-full"
              value={fxType}
              onChange={(e) => setFxType(e.target.value)}
            >
              <option value="TRANSFER">{t('quickAdd.fxTransfer')}</option>
              <option value="BUY">{t('quickAdd.fxBuy')}</option>
              <option value="SELL">{t('quickAdd.fxSell')}</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          {renderMoreToggle()}
          {showMore && (
            <div className="space-y-3 pt-2 border-t border-[var(--border)]">
              <div>
                <label className="block text-sm font-medium mb-1">{t('quickAdd.fee')}</label>
                <input
                  type="number"
                  step="0.01"
                  className="input w-full"
                  value={fxFee}
                  onChange={(e) => setFxFee(e.target.value)}
                  placeholder="0"
                />
              </div>
              {forexAccountList.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('quickAdd.forexAccount')}</label>
                  <select
                    className="input w-full"
                    value={fxAccountId}
                    onChange={(e) => setFxAccountId(e.target.value)}
                  >
                    <option value="">{t('quickAdd.noForexAccount')}</option>
                    {forexAccountList.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.description')}</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    className="input w-full pe-9"
                    value={fxDescription}
                    onChange={(e) => setFxDescription(e.target.value)}
                  />
                  <div className="absolute end-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => setFxDescription(text)} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('quickAdd.notes')}</label>
                <div className="relative">
                  <textarea
                    className="input w-full pe-9"
                    rows={2}
                    value={fxNotes}
                    onChange={(e) => setFxNotes(e.target.value)}
                  />
                  <div className="absolute end-2 top-2">
                    <VoiceInputButton onResult={(text) => setFxNotes((prev) => prev ? prev + ' ' + text : text)} />
                  </div>
                </div>
              </div>
            </div>
          )}
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
                <option key={c.id} value={c.id}>
                  {c.icon ? c.icon + ' ' : ''}{getCategoryDisplayName(c.name, c.slug, t)}
                </option>
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

  function renderMortgageForm() {
    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('mortgage.name')} *</label>
            <div className="relative flex items-center">
              <input
                type="text"
                className="input w-full pe-9"
                value={mortName}
                onChange={(e) => setMortName(e.target.value)}
                placeholder={t('mortgage.namePlaceholder')}
                autoFocus
              />
              <div className="absolute end-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton onResult={(text) => setMortName(text)} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('mortgage.totalAmount')} *</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={mortTotalAmount}
              onChange={(e) => setMortTotalAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('mortgage.bank')}</label>
            <div className="relative flex items-center">
              <input
                type="text"
                className="input w-full pe-9"
                value={mortBank}
                onChange={(e) => setMortBank(e.target.value)}
                placeholder={t('mortgage.bankPlaceholder')}
              />
              <div className="absolute end-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton onResult={(text) => setMortBank(text)} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('mortgage.propertyValue')}</label>
            <input
              type="number"
              step="0.01"
              className="input w-full"
              value={mortPropertyValue}
              onChange={(e) => setMortPropertyValue(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        {renderActions(handleSubmitMortgage, !mortName.trim() || !mortTotalAmount)}
      </div>
    );
  }

  function renderStockPortfolioForm() {
    return (
      <div>
        {renderFormHeader()}
        {renderError()}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('stocks.portfolioName')} *</label>
            <div className="relative flex items-center">
              <input
                type="text"
                className="input w-full pe-9"
                value={spName}
                onChange={(e) => setSpName(e.target.value)}
                placeholder={t('stocks.portfolioNamePlaceholder')}
                autoFocus
              />
              <div className="absolute end-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton onResult={(text) => setSpName(text)} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('stocks.broker')}</label>
            <div className="relative flex items-center">
              <input
                type="text"
                className="input w-full pe-9"
                value={spBroker}
                onChange={(e) => setSpBroker(e.target.value)}
                placeholder={t('stocks.brokerPlaceholder')}
              />
              <div className="absolute end-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton onResult={(text) => setSpBroker(text)} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('stocks.accountNum')}</label>
            <input
              type="text"
              className="input w-full"
              value={spAccountNum}
              onChange={(e) => setSpAccountNum(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('stocks.currency')}</label>
            <input
              type="text"
              className="input w-full"
              value={spCurrency}
              onChange={(e) => setSpCurrency(e.target.value.toUpperCase())}
              placeholder="ILS"
              maxLength={3}
            />
          </div>
        </div>
        {renderActions(handleSubmitStockPortfolio, !spName.trim())}
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
      case 'mortgage':
        return renderMortgageForm();
      case 'stockPortfolio':
        return renderStockPortfolioForm();
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
