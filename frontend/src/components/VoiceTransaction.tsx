'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { accounts, categories, transactions as txApi } from '@/lib/api';

type AccountOption = { id: string; name: string; type: string; currency: string };
type CategoryOption = { id: string; name: string; slug: string; icon: string | null; color: string | null; isIncome: boolean };

type Step = 'idle' | 'listening' | 'processing' | 'review' | 'saving' | 'done' | 'error';

function getCategoryDisplayName(name: string, slug: string | undefined, t: (k: string) => string): string {
  if (slug) {
    const translated = t('categories.' + slug);
    if (translated !== 'categories.' + slug) return translated;
  }
  return name;
}

export default function VoiceTransaction() {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('idle');

  /* ── data ── */
  const [accountList, setAccountList] = useState<AccountOption[]>([]);
  const [categoryList, setCategoryList] = useState<CategoryOption[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  /* ── parsed result ── */
  const [parsedType, setParsedType] = useState<'expense' | 'income'>('expense');
  const [parsedAmount, setParsedAmount] = useState('');
  const [parsedDescription, setParsedDescription] = useState('');
  const [parsedCategoryId, setParsedCategoryId] = useState('');
  const [parsedAccountId, setParsedAccountId] = useState('');
  const [parsedDate, setParsedDate] = useState('');
  const [parsedCurrency, setParsedCurrency] = useState('ILS');
  const [voiceText, setVoiceText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  /* ── voice recorder ── */
  const handleVoiceResult = useCallback((text: string) => {
    setVoiceText(text);
    processVoice(text);
  }, []);

  const { isListening, isSupported, error: voiceError, start: startListening, stop: stopListening } = useVoiceRecorder({
    lang: locale === 'he' ? 'he-IL' : 'en-US',
    onResult: handleVoiceResult,
  });

  /* ── load accounts & categories ── */
  const loadData = useCallback(async () => {
    if (dataLoaded) return;
    try {
      const [accs, cats] = await Promise.all([accounts.list(), categories.list()]);
      setAccountList(accs);
      setCategoryList(cats);
      if (accs.length > 0) setParsedAccountId(accs[0].id);
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

      setParsedType(result.type);
      setParsedAmount(String(result.amount));
      setParsedDescription(result.description);
      setParsedDate(result.date);
      setParsedCurrency(result.currency);

      // Match category by slug
      if (result.categorySlug) {
        const match = categoryList.find((c) => c.slug === result.categorySlug);
        if (match) setParsedCategoryId(match.id);
      }

      // Default account
      if (!parsedAccountId && accountList.length > 0) {
        setParsedAccountId(accountList[0].id);
      }

      setStep('review');
    } catch {
      setStep('error');
      setErrorMsg(t('voice.parseFailed'));
    }
  };

  /* ── save transaction ── */
  const handleSave = async () => {
    if (!parsedAccountId || !parsedAmount || !parsedDescription) return;
    setStep('saving');
    try {
      const amount = parseFloat(parsedAmount);
      await txApi.create({
        accountId: parsedAccountId,
        categoryId: parsedCategoryId || undefined,
        date: parsedDate || new Date().toISOString().slice(0, 10),
        description: parsedDescription,
        amount: parsedType === 'expense' ? -Math.abs(amount) : Math.abs(amount),
        currency: parsedCurrency,
      });
      setStep('done');
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch {
      setStep('error');
      setErrorMsg(t('common.somethingWentWrong'));
    }
  };

  if (!isSupported) return null;

  const expenseCategories = categoryList.filter((c) => !c.isIncome);
  const incomeCategories = categoryList.filter((c) => c.isIncome);
  const relevantCategories = parsedType === 'income' ? incomeCategories : expenseCategories;

  return (
    <>
      {/* ── Floating Action Button ── */}
      <button
        type="button"
        onClick={handleOpen}
        className="fixed bottom-6 end-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
        title={t('voice.title')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>

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
                  <p className="text-sm text-slate-500 mb-6">{t('voice.hint')}</p>
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

                  {/* Type toggle */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setParsedType('expense')}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${parsedType === 'expense' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-1 ring-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                    >
                      {t('voice.expense')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setParsedType('income')}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${parsedType === 'income' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-1 ring-green-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                    >
                      {t('voice.income')}
                    </button>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('voice.amount')}</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="any"
                        className="input flex-1 text-lg font-bold"
                        value={parsedAmount}
                        onChange={(e) => setParsedAmount(e.target.value)}
                      />
                      <select
                        className="input w-20"
                        value={parsedCurrency}
                        onChange={(e) => setParsedCurrency(e.target.value)}
                      >
                        <option value="ILS">ILS</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('voice.description')}</label>
                    <input
                      className="input"
                      value={parsedDescription}
                      onChange={(e) => setParsedDescription(e.target.value)}
                    />
                  </div>

                  {/* Account */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('voice.account')}</label>
                    <select
                      className="input"
                      value={parsedAccountId}
                      onChange={(e) => setParsedAccountId(e.target.value)}
                    >
                      {accountList.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('voice.category')}</label>
                    <select
                      className="input"
                      value={parsedCategoryId}
                      onChange={(e) => setParsedCategoryId(e.target.value)}
                    >
                      <option value="">{t('voice.noCategory')}</option>
                      {relevantCategories.map((c) => (
                        <option key={c.id} value={c.id}>{getCategoryDisplayName(c.name, c.slug, t)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('voice.date')}</label>
                    <input
                      type="date"
                      className="input"
                      value={parsedDate}
                      onChange={(e) => setParsedDate(e.target.value)}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={handleStartRecording} className="btn-secondary flex-1 text-sm">
                      {t('voice.retry')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!parsedAmount || !parsedDescription || !parsedAccountId}
                      className="btn-primary flex-1 text-sm"
                    >
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
