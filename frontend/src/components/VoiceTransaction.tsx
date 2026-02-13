'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import {
  accounts,
  categories,
  transactions as txApi,
  goals,
  budgets,
  mortgages,
  stocks,
  forex,
  api,
  type ParsedVoiceInput,
} from '@/lib/api';

type AccountOption = { id: string; name: string; type: string; currency: string };
type CategoryOption = { id: string; name: string; slug: string; icon: string | null; color: string | null; isIncome: boolean };

type Step = 'idle' | 'listening' | 'processing' | 'review' | 'saving' | 'done' | 'error';

type VoiceAction = ParsedVoiceInput['action'];

const ACTION_LABELS: Record<VoiceAction, { he: string; en: string; color: string }> = {
  transaction: { he: 'הוצאה / הכנסה', en: 'Expense / Income', color: 'primary' },
  loan: { he: 'הלוואה', en: 'Loan', color: 'orange' },
  saving: { he: 'חיסכון', en: 'Saving', color: 'teal' },
  goal: { he: 'יעד', en: 'Goal', color: 'purple' },
  budget: { he: 'תקציב', en: 'Budget', color: 'amber' },
  forex: { he: 'העברת מט"ח', en: 'Forex', color: 'indigo' },
  mortgage: { he: 'משכנתא', en: 'Mortgage', color: 'cyan' },
  stock_portfolio: { he: 'תיק מניות', en: 'Stock Portfolio', color: 'rose' },
  account: { he: 'חשבון', en: 'Account', color: 'blue' },
};

function getCategoryDisplayName(name: string, slug: string | undefined, t: (k: string) => string): string {
  if (slug) {
    const translated = t('categories.' + slug);
    if (translated !== 'categories.' + slug) return translated;
  }
  return name;
}

const VOICE_HIDDEN_KEY = 'our-money-voice-hidden';

export default function VoiceTransaction() {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [step, setStep] = useState<Step>('idle');

  /* ── data ── */
  const [accountList, setAccountList] = useState<AccountOption[]>([]);
  const [categoryList, setCategoryList] = useState<CategoryOption[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  /* ── parsed result ── */
  const [parsedAction, setParsedAction] = useState<VoiceAction>('transaction');
  const [parsed, setParsed] = useState<ParsedVoiceInput | null>(null);

  // Transaction fields
  const [fType, setFType] = useState<'expense' | 'income'>('expense');
  const [fAmount, setFAmount] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [fCategoryId, setFCategoryId] = useState('');
  const [fAccountId, setFAccountId] = useState('');
  const [fDate, setFDate] = useState('');
  const [fCurrency, setFCurrency] = useState('ILS');

  // Loan fields
  const [fName, setFName] = useState('');
  const [fOriginalAmount, setFOriginalAmount] = useState('');
  const [fRemainingAmount, setFRemainingAmount] = useState('');
  const [fLender, setFLender] = useState('');
  const [fInterestRate, setFInterestRate] = useState('');
  const [fMonthlyPayment, setFMonthlyPayment] = useState('');

  // Saving / Goal fields
  const [fTargetAmount, setFTargetAmount] = useState('');
  const [fCurrentAmount, setFCurrentAmount] = useState('');
  const [fTargetDate, setFTargetDate] = useState('');

  // Budget fields
  const [fBudgetCategoryId, setFBudgetCategoryId] = useState('');

  // Forex fields
  const [fFromCurrency, setFFromCurrency] = useState('ILS');
  const [fToCurrency, setFToCurrency] = useState('USD');
  const [fFromAmount, setFFromAmount] = useState('');
  const [fToAmount, setFToAmount] = useState('');
  const [fExchangeRate, setFExchangeRate] = useState('');

  // Mortgage fields
  const [fBank, setFBank] = useState('');
  const [fTotalAmount, setFTotalAmount] = useState('');

  // Stock portfolio fields
  const [fBroker, setFBroker] = useState('');

  // Account fields
  const [fAccountType, setFAccountType] = useState('BANK');

  const [voiceText, setVoiceText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  /* ── voice recorder ── */
  const handleVoiceResult = useCallback((text: string) => {
    setVoiceText(text);
    processVoice(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryList, accountList, fAccountId]);

  const { isListening, interimTranscript, isSupported, error: voiceError, start: startListening, stop: stopListening } = useVoiceRecorder({
    lang: locale === 'he' ? 'he-IL' : 'en-US',
    onResult: handleVoiceResult,
  });

  /* ── load hidden state from localStorage ── */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHidden(localStorage.getItem(VOICE_HIDDEN_KEY) === 'true');
    }
  }, []);

  const handleHide = () => {
    setHidden(true);
    if (typeof window !== 'undefined') localStorage.setItem(VOICE_HIDDEN_KEY, 'true');
  };

  const handleShowVoice = () => {
    setHidden(false);
    if (typeof window !== 'undefined') localStorage.setItem(VOICE_HIDDEN_KEY, 'false');
  };

  /* ── load accounts & categories ── */
  const loadData = useCallback(async () => {
    if (dataLoaded) return;
    try {
      const [accs, cats] = await Promise.all([accounts.list(), categories.list()]);
      setAccountList(accs);
      setCategoryList(cats);
      if (accs.length > 0) setFAccountId(accs[0].id);
      setDataLoaded(true);
    } catch {
      // silent
    }
  }, [dataLoaded]);

  useEffect(() => {
    if (open && !dataLoaded) loadData();
  }, [open, dataLoaded, loadData]);

  /* ── open/close ── */
  const handleOpen = () => {
    setOpen(true);
    setStep('idle');
    setErrorMsg('');
    setVoiceText('');
  };

  const handleClose = () => {
    if (isListening) stopListening();
    setOpen(false);
    setStep('idle');
  };

  /* ── start recording ── */
  const handleStartRecording = () => {
    setStep('listening');
    setVoiceText('');
    setErrorMsg('');
    startListening();
  };

  /* ── populate form fields from parsed result ── */
  const populateFields = (result: ParsedVoiceInput) => {
    setParsed(result);
    setParsedAction(result.action);

    switch (result.action) {
      case 'transaction':
        setFType(result.type || 'expense');
        setFAmount(String(result.amount || ''));
        setFDescription(result.description || '');
        setFDate(result.date || new Date().toISOString().slice(0, 10));
        setFCurrency(result.currency || 'ILS');
        if (result.categorySlug) {
          const match = categoryList.find((c) => c.slug === result.categorySlug);
          if (match) setFCategoryId(match.id);
        }
        if (!fAccountId && accountList.length > 0) {
          setFAccountId(accountList[0].id);
        }
        break;

      case 'loan':
        setFName(result.name || '');
        setFOriginalAmount(String(result.originalAmount || ''));
        setFRemainingAmount(String(result.remainingAmount || result.originalAmount || ''));
        setFLender(result.lender || '');
        setFInterestRate(result.interestRate ? String(result.interestRate) : '');
        setFMonthlyPayment(result.monthlyPayment ? String(result.monthlyPayment) : '');
        setFCurrency(result.currency || 'ILS');
        break;

      case 'saving':
        setFName(result.name || '');
        setFTargetAmount(result.targetAmount ? String(result.targetAmount) : '');
        setFCurrentAmount(result.currentAmount ? String(result.currentAmount) : '0');
        setFCurrency(result.currency || 'ILS');
        break;

      case 'goal':
        setFName(result.name || '');
        setFTargetAmount(result.targetAmount ? String(result.targetAmount) : '');
        setFCurrentAmount(result.currentAmount ? String(result.currentAmount) : '0');
        setFTargetDate(result.targetDate || '');
        setFCurrency(result.currency || 'ILS');
        break;

      case 'budget':
        setFAmount(String(result.amount || ''));
        setFName(result.name || '');
        if (result.budgetCategorySlug) {
          const match = categoryList.find((c) => c.slug === result.budgetCategorySlug);
          if (match) setFBudgetCategoryId(match.id);
        }
        break;

      case 'forex':
        setFFromCurrency(result.fromCurrency || 'ILS');
        setFToCurrency(result.toCurrency || 'USD');
        setFFromAmount(result.fromAmount ? String(result.fromAmount) : '');
        setFToAmount(result.toAmount ? String(result.toAmount) : '');
        setFExchangeRate(result.exchangeRate ? String(result.exchangeRate) : '');
        setFDate(result.date || new Date().toISOString().slice(0, 10));
        break;

      case 'mortgage':
        setFName(result.name || '');
        setFTotalAmount(result.totalAmount ? String(result.totalAmount) : '');
        setFBank(result.bank || '');
        setFCurrency(result.currency || 'ILS');
        break;

      case 'stock_portfolio':
        setFName(result.name || '');
        setFBroker(result.broker || '');
        break;

      case 'account':
        setFName(result.name || '');
        setFAccountType(result.accountType || 'BANK');
        break;
    }
  };

  /* ── process voice text with AI ── */
  const processVoice = async (text: string) => {
    if (!text.trim()) {
      setStep('error');
      setErrorMsg(t('voice.noSpeechDetected'));
      return;
    }

    setStep('processing');
    try {
      const result = await txApi.parseVoice(text);
      if ('error' in result) {
        setStep('error');
        setErrorMsg(t('voice.parseFailed'));
        return;
      }

      populateFields(result);
      setStep('review');
    } catch {
      setStep('error');
      setErrorMsg(t('voice.parseFailed'));
    }
  };

  /* ── save ── */
  const handleSave = async () => {
    setStep('saving');
    try {
      switch (parsedAction) {
        case 'transaction': {
          if (!fAccountId || !fAmount || !fDescription) return;
          const amount = parseFloat(fAmount);
          await txApi.create({
            accountId: fAccountId,
            categoryId: fCategoryId || undefined,
            date: fDate || new Date().toISOString().slice(0, 10),
            description: fDescription,
            amount: fType === 'expense' ? -Math.abs(amount) : Math.abs(amount),
            currency: fCurrency,
          });
          break;
        }

        case 'loan': {
          if (!fName || !fOriginalAmount) return;
          await api('/api/loans', {
            method: 'POST',
            body: JSON.stringify({
              name: fName,
              originalAmount: parseFloat(fOriginalAmount),
              remainingAmount: parseFloat(fRemainingAmount || fOriginalAmount),
              ...(fLender && { lender: fLender }),
              ...(fInterestRate && { interestRate: parseFloat(fInterestRate) }),
              ...(fMonthlyPayment && { monthlyPayment: parseFloat(fMonthlyPayment) }),
            }),
          });
          break;
        }

        case 'saving': {
          if (!fName) return;
          await api('/api/savings', {
            method: 'POST',
            body: JSON.stringify({
              name: fName,
              ...(fTargetAmount && { targetAmount: parseFloat(fTargetAmount) }),
              currentAmount: fCurrentAmount ? parseFloat(fCurrentAmount) : 0,
            }),
          });
          break;
        }

        case 'goal': {
          if (!fName || !fTargetAmount) return;
          await goals.create({
            name: fName,
            targetAmount: parseFloat(fTargetAmount),
            currentAmount: fCurrentAmount ? parseFloat(fCurrentAmount) : 0,
            ...(fTargetDate && { targetDate: fTargetDate }),
            currency: fCurrency,
          });
          break;
        }

        case 'budget': {
          if (!fBudgetCategoryId || !fAmount) return;
          await budgets.upsert({
            categoryId: fBudgetCategoryId,
            amount: parseFloat(fAmount),
          });
          break;
        }

        case 'forex': {
          if (!fFromAmount || !fToAmount || !fExchangeRate) return;
          await forex.transfers.create({
            type: 'BUY',
            fromCurrency: fFromCurrency,
            toCurrency: fToCurrency,
            fromAmount: parseFloat(fFromAmount),
            toAmount: parseFloat(fToAmount),
            exchangeRate: parseFloat(fExchangeRate),
            date: fDate || new Date().toISOString().slice(0, 10),
          });
          break;
        }

        case 'mortgage': {
          if (!fName || !fTotalAmount) return;
          await mortgages.create({
            name: fName,
            totalAmount: parseFloat(fTotalAmount),
            ...(fBank && { bank: fBank }),
            currency: fCurrency,
          });
          break;
        }

        case 'stock_portfolio': {
          if (!fName) return;
          await stocks.portfolios.create({
            name: fName,
            ...(fBroker && { broker: fBroker }),
          });
          break;
        }

        case 'account': {
          if (!fName) return;
          await accounts.create({
            name: fName,
            type: fAccountType,
          });
          break;
        }
      }

      setStep('done');
      setTimeout(() => handleClose(), 1500);
    } catch {
      setStep('error');
      setErrorMsg(t('voice.genericError'));
    }
  };

  if (!isSupported) return null;

  const expenseCategories = categoryList.filter((c) => !c.isIncome);
  const incomeCategories = categoryList.filter((c) => c.isIncome);
  const relevantCategories = fType === 'income' ? incomeCategories : expenseCategories;

  const actionLabel = locale === 'he' ? ACTION_LABELS[parsedAction].he : ACTION_LABELS[parsedAction].en;

  /* ── Review form for each action type ── */
  const renderReviewForm = () => {
    switch (parsedAction) {
      case 'transaction':
        return (
          <>
            {/* Type toggle */}
            <div className="flex gap-2">
              <button type="button" onClick={() => setFType('expense')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${fType === 'expense' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-1 ring-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
              >{t('voice.expense')}</button>
              <button type="button" onClick={() => setFType('income')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${fType === 'income' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-1 ring-green-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
              >{t('voice.income')}</button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.amount')}</label>
              <div className="flex gap-2">
                <input type="number" step="any" className="input flex-1 text-lg font-bold" value={fAmount} onChange={(e) => setFAmount(e.target.value)} />
                <select className="input w-20" value={fCurrency} onChange={(e) => setFCurrency(e.target.value)}>
                  <option value="ILS">ILS</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.description')}</label>
              <input className="input" value={fDescription} onChange={(e) => setFDescription(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.account')}</label>
              <select className="input" value={fAccountId} onChange={(e) => setFAccountId(e.target.value)}>
                {accountList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.category')}</label>
              <select className="input" value={fCategoryId} onChange={(e) => setFCategoryId(e.target.value)}>
                <option value="">{t('voice.noCategory')}</option>
                {relevantCategories.map((c) => <option key={c.id} value={c.id}>{getCategoryDisplayName(c.name, c.slug, t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.date')}</label>
              <input type="date" className="input" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
          </>
        );

      case 'loan':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.loanName')}</label>
              <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.originalAmount')}</label>
              <input type="number" step="any" className="input text-lg font-bold" value={fOriginalAmount} onChange={(e) => setFOriginalAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.remainingAmount')}</label>
              <input type="number" step="any" className="input" value={fRemainingAmount} onChange={(e) => setFRemainingAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.lender')}</label>
              <input className="input" value={fLender} onChange={(e) => setFLender(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.interestRate')}</label>
              <input type="number" step="0.1" className="input" value={fInterestRate} onChange={(e) => setFInterestRate(e.target.value)} placeholder="%" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.monthlyPayment')}</label>
              <input type="number" step="any" className="input" value={fMonthlyPayment} onChange={(e) => setFMonthlyPayment(e.target.value)} />
            </div>
          </>
        );

      case 'saving':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.savingName')}</label>
              <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.targetAmountLabel')}</label>
              <input type="number" step="any" className="input text-lg font-bold" value={fTargetAmount} onChange={(e) => setFTargetAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.currentAmountLabel')}</label>
              <input type="number" step="any" className="input" value={fCurrentAmount} onChange={(e) => setFCurrentAmount(e.target.value)} />
            </div>
          </>
        );

      case 'goal':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.goalName')}</label>
              <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.targetAmountLabel')}</label>
              <input type="number" step="any" className="input text-lg font-bold" value={fTargetAmount} onChange={(e) => setFTargetAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.currentAmountLabel')}</label>
              <input type="number" step="any" className="input" value={fCurrentAmount} onChange={(e) => setFCurrentAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.targetDateLabel')}</label>
              <input type="date" className="input" value={fTargetDate} onChange={(e) => setFTargetDate(e.target.value)} />
            </div>
          </>
        );

      case 'budget':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.budgetCategory')}</label>
              <select className="input" value={fBudgetCategoryId} onChange={(e) => setFBudgetCategoryId(e.target.value)}>
                <option value="">{t('voice.noCategory')}</option>
                {expenseCategories.map((c) => <option key={c.id} value={c.id}>{getCategoryDisplayName(c.name, c.slug, t)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.budgetAmount')}</label>
              <input type="number" step="any" className="input text-lg font-bold" value={fAmount} onChange={(e) => setFAmount(e.target.value)} />
            </div>
          </>
        );

      case 'forex':
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('voice.fromCurrency')}</label>
                <select className="input" value={fFromCurrency} onChange={(e) => setFFromCurrency(e.target.value)}>
                  <option value="ILS">ILS</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('voice.toCurrency')}</label>
                <select className="input" value={fToCurrency} onChange={(e) => setFToCurrency(e.target.value)}>
                  <option value="USD">USD</option><option value="EUR">EUR</option><option value="ILS">ILS</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('voice.fromAmountLabel')}</label>
                <input type="number" step="any" className="input" value={fFromAmount} onChange={(e) => setFFromAmount(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('voice.toAmountLabel')}</label>
                <input type="number" step="any" className="input" value={fToAmount} onChange={(e) => setFToAmount(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.exchangeRateLabel')}</label>
              <input type="number" step="any" className="input" value={fExchangeRate} onChange={(e) => setFExchangeRate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.date')}</label>
              <input type="date" className="input" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
          </>
        );

      case 'mortgage':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.mortgageName')}</label>
              <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.totalAmountLabel')}</label>
              <input type="number" step="any" className="input text-lg font-bold" value={fTotalAmount} onChange={(e) => setFTotalAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.bankName')}</label>
              <input className="input" value={fBank} onChange={(e) => setFBank(e.target.value)} />
            </div>
          </>
        );

      case 'stock_portfolio':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.portfolioName')}</label>
              <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.brokerName')}</label>
              <input className="input" value={fBroker} onChange={(e) => setFBroker(e.target.value)} />
            </div>
          </>
        );

      case 'account':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.accountName')}</label>
              <input className="input" value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('voice.accountTypeLabel')}</label>
              <select className="input" value={fAccountType} onChange={(e) => setFAccountType(e.target.value)}>
                <option value="BANK">{t('voice.accountTypes.bank')}</option>
                <option value="CREDIT_CARD">{t('voice.accountTypes.creditCard')}</option>
                <option value="CASH">{t('voice.accountTypes.cash')}</option>
                <option value="INVESTMENT">{t('voice.accountTypes.investment')}</option>
                <option value="INSURANCE">{t('voice.accountTypes.insurance')}</option>
                <option value="PENSION">{t('voice.accountTypes.pension')}</option>
              </select>
            </div>
          </>
        );
    }
  };

  return (
    <>
      {/* ── Floating Action Button - full or minimized ── */}
      {hidden ? (
        /* Minimized tab - small vertical tab on the edge */
        <button
          type="button"
          onClick={handleShowVoice}
          className="fixed bottom-24 end-0 z-40 px-1.5 py-3 rounded-s-lg bg-gradient-to-b from-primary-500 to-primary-600 text-white shadow-md hover:shadow-lg hover:px-2 transition-all duration-200 flex flex-col items-center gap-1 opacity-70 hover:opacity-100"
          title={t('voice.show')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
      ) : (
        <div className="fixed bottom-6 end-6 z-40 flex items-center gap-1 group">
          <button
            type="button"
            onClick={handleOpen}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
            title={t('voice.title')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          {/* Hide button - appears on hover */}
          <button
            type="button"
            onClick={handleHide}
            className="absolute -top-2 -start-2 w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600"
            title={t('voice.hide')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* ── Modal ── */}
      {open && (
        <div className="modal-overlay z-50" onClick={handleClose}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-500">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                {t('voice.title')}
              </h3>
              <button type="button" onClick={handleClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="p-5">
              {/* ── IDLE: Start recording ── */}
              {step === 'idle' && (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-500 mb-6">{t('voice.hintExpanded')}</p>
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-red-400 to-red-500 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                  <p className="text-xs text-slate-400 mt-3">{t('voice.tapToStart')}</p>
                </div>
              )}

              {/* ── LISTENING: Recording in progress ── */}
              {step === 'listening' && (
                <div className="text-center py-6">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full bg-red-400/20 animate-ping" />
                    <div className="absolute inset-2 rounded-full bg-red-400/30 animate-pulse" />
                    <button
                      type="button"
                      onClick={stopListening}
                      className="relative w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg flex items-center justify-center"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm font-medium text-red-500 animate-pulse">{t('voice.listening')}</p>
                  {interimTranscript && (
                    <p className="text-sm text-slate-500 mt-2 bg-slate-50 dark:bg-slate-800 rounded-lg p-2 inline-block max-w-[280px]">
                      &ldquo;{interimTranscript}&rdquo;
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">{t('voice.tapToStop')}</p>
                </div>
              )}

              {/* ── PROCESSING: AI parsing ── */}
              {step === 'processing' && (
                <div className="text-center py-8">
                  <div className="h-10 w-10 mx-auto animate-spin rounded-full border-3 border-primary-500 border-t-transparent mb-4" />
                  <p className="text-sm text-slate-500">{t('voice.processing')}</p>
                  {voiceText && (
                    <p className="text-xs text-slate-400 mt-2 bg-slate-50 dark:bg-slate-800 rounded-lg p-2 inline-block">
                      &ldquo;{voiceText}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {/* ── REVIEW: Editable pre-filled form ── */}
              {step === 'review' && (
                <div className="space-y-4">
                  {/* What was heard */}
                  {voiceText && (
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-sm">
                      <span className="text-xs text-slate-400 block mb-1">{t('voice.youSaid')}</span>
                      <span className="font-medium">&ldquo;{voiceText}&rdquo;</span>
                    </div>
                  )}

                  {/* Action type badge */}
                  <div className="flex items-center justify-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                      {actionLabel}
                    </span>
                  </div>

                  {/* Type-specific form */}
                  {renderReviewForm()}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={handleStartRecording} className="btn-secondary flex-1 text-sm">
                      {t('voice.retry')}
                    </button>
                    <button type="button" onClick={handleSave} className="btn-primary flex-1 text-sm">
                      {t('voice.save')}
                    </button>
                  </div>
                </div>
              )}

              {/* ── SAVING ── */}
              {step === 'saving' && (
                <div className="text-center py-8">
                  <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-primary-500 border-t-transparent mb-3" />
                  <p className="text-sm text-slate-500">{t('voice.saving')}</p>
                </div>
              )}

              {/* ── DONE ── */}
              {step === 'done' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600 dark:text-green-400">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p className="font-medium text-green-600 dark:text-green-400">{t('voice.saved')}</p>
                </div>
              )}

              {/* ── ERROR ── */}
              {step === 'error' && (
                <div className="text-center py-6">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 mb-4">{errorMsg || voiceError || t('voice.genericError')}</p>
                  <div className="flex gap-3">
                    <button type="button" onClick={handleClose} className="btn-secondary flex-1 text-sm">
                      {t('common.close')}
                    </button>
                    <button type="button" onClick={handleStartRecording} className="btn-primary flex-1 text-sm">
                      {t('voice.retry')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
