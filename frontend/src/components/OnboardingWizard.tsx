'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';
import { users, accounts, clients } from '@/lib/api';

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { key: 'business', icon: 'briefcase' },
  { key: 'bank', icon: 'bank' },
  { key: 'client', icon: 'user' },
  { key: 'firstAction', icon: 'rocket' },
] as const;

function StepIcon({ icon, active, completed }: { icon: string; active: boolean; completed: boolean }) {
  const cn = `w-6 h-6 ${completed ? 'text-white' : active ? 'text-indigo-600' : 'text-slate-400'}`;
  switch (icon) {
    case 'briefcase':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="12.01"/></svg>;
    case 'bank':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/></svg>;
    case 'user':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case 'rocket':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>;
    default:
      return null;
  }
}

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Business details
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('freelancer');
  const [taxId, setTaxId] = useState('');
  const [countryCode, setCountryCode] = useState('IL');

  // Step 2: Bank account
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('checking');
  const [accountBalance, setAccountBalance] = useState('');

  // Step 3: First client
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientCompany, setClientCompany] = useState('');

  const totalSteps = 4;

  async function handleStep1Next() {
    setError('');
    if (!businessName.trim()) {
      setError(t('onboarding.businessNameRequired'));
      return;
    }
    setLoading(true);
    try {
      await users.update({ name: businessName, countryCode: countryCode || null });
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2Next() {
    setError('');
    setLoading(true);
    try {
      if (accountName.trim()) {
        await accounts.create({
          name: accountName,
          type: accountType,
          balance: accountBalance ? parseFloat(accountBalance) : 0,
          currency: 'ILS',
        });
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep3Next() {
    setError('');
    setLoading(true);
    try {
      if (clientName.trim()) {
        await clients.create({
          name: clientName,
          email: clientEmail || undefined,
          phone: clientPhone || undefined,
          company: clientCompany || undefined,
        });
      }
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish(action: 'invoice' | 'upload' | 'dashboard') {
    setLoading(true);
    try {
      await users.completeOnboarding();
      onComplete();
      if (action === 'invoice') {
        router.push('/invoices?new=1');
      } else if (action === 'upload') {
        router.push('/upload');
      } else {
        router.push('/dashboard');
      }
    } catch {
      onComplete();
    }
  }

  function handleSkip() {
    if (step < 4) {
      setStep((s) => (s + 1) as Step);
    } else {
      handleFinish('dashboard');
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Progress indicator */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-6">
            {STEPS.map((s, idx) => {
              const stepNum = (idx + 1) as Step;
              const isCompleted = step > stepNum;
              const isCurrent = step === stepNum;
              return (
                <div key={s.key} className="flex items-center">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                    ${isCompleted ? 'bg-indigo-500' : isCurrent ? 'bg-indigo-100 dark:bg-indigo-900/30 ring-2 ring-indigo-500' : 'bg-slate-100 dark:bg-slate-800'}
                  `}>
                    {isCompleted ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <StepIcon icon={s.icon} active={isCurrent} completed={false} />
                    )}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`w-8 sm:w-16 h-0.5 mx-1 transition-colors duration-300 ${isCompleted ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-400 text-center">
            {t('onboarding.stepOf', { current: String(step), total: String(totalSteps) })}
          </p>
        </div>

        {/* Step content */}
        <div className="px-6 pb-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Business details */}
          {step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold">{t('onboarding.step1Title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('onboarding.step1Desc')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('onboarding.businessName')}</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={t('onboarding.businessNamePlaceholder')}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('onboarding.businessType')}</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="freelancer">{t('onboarding.typeFreelancer')}</option>
                  <option value="exempt">{t('onboarding.typeExempt')}</option>
                  <option value="licensed">{t('onboarding.typeLicensed')}</option>
                  <option value="company">{t('onboarding.typeCompany')}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('onboarding.taxId')}</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={t('onboarding.taxIdPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('onboarding.country')}</label>
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="IL">{t('countries.IL')}</option>
                    <option value="US">{t('countries.US')}</option>
                    <option value="GB">{t('countries.GB')}</option>
                    <option value="DE">{t('countries.DE')}</option>
                    <option value="FR">{t('countries.FR')}</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleSkip} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  {t('onboarding.skip')}
                </button>
                <button type="button" onClick={handleStep1Next} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 transition-all">
                  {loading ? t('auth.pleaseWait') : t('onboarding.next')}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Bank account */}
          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold">{t('onboarding.step2Title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('onboarding.step2Desc')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('onboarding.accountName')}</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={t('onboarding.accountNamePlaceholder')}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('onboarding.accountType')}</label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="checking">{t('accountType.checking')}</option>
                  <option value="savings">{t('accountType.savings')}</option>
                  <option value="credit_card">{t('accountType.credit_card')}</option>
                  <option value="business">{t('accountType.business')}</option>
                  <option value="cash">{t('accountType.cash')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('onboarding.openingBalance')}</label>
                <input
                  type="number"
                  value={accountBalance}
                  onChange={(e) => setAccountBalance(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  {t('common.back')}
                </button>
                <button type="button" onClick={handleSkip} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  {t('onboarding.skip')}
                </button>
                <button type="button" onClick={handleStep2Next} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 transition-all">
                  {loading ? t('auth.pleaseWait') : t('onboarding.next')}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: First client */}
          {step === 3 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold">{t('onboarding.step3Title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('onboarding.step3Desc')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('clients.name')}</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={t('onboarding.clientNamePlaceholder')}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">{t('clients.email')}</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={t('onboarding.clientEmailPlaceholder')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('clients.phone')}</label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('clients.company')}</label>
                  <input
                    type="text"
                    value={clientCompany}
                    onChange={(e) => setClientCompany(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(2)} className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  {t('common.back')}
                </button>
                <button type="button" onClick={handleSkip} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  {t('onboarding.skip')}
                </button>
                <button type="button" onClick={handleStep3Next} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 transition-all">
                  {loading ? t('auth.pleaseWait') : t('onboarding.next')}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Create invoice or upload document */}
          {step === 4 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold">{t('onboarding.step4Title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('onboarding.step4Desc')}</p>
              </div>

              <div className="space-y-3">
                {/* Create invoice */}
                <button
                  type="button"
                  onClick={() => handleFinish('invoice')}
                  disabled={loading}
                  className="flex items-center gap-4 w-full p-4 rounded-xl border border-[var(--border)] hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group text-start"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform shrink-0">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t('onboarding.createInvoice')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t('onboarding.createInvoiceDesc')}</p>
                  </div>
                </button>

                {/* Upload document */}
                <button
                  type="button"
                  onClick={() => handleFinish('upload')}
                  disabled={loading}
                  className="flex items-center gap-4 w-full p-4 rounded-xl border border-[var(--border)] hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group text-start"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform shrink-0">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t('onboarding.uploadDocument')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t('onboarding.uploadDocumentDesc')}</p>
                  </div>
                </button>

                {/* Go to dashboard */}
                <button
                  type="button"
                  onClick={() => handleFinish('dashboard')}
                  disabled={loading}
                  className="flex items-center gap-4 w-full p-4 rounded-xl border border-[var(--border)] hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group text-start"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform shrink-0">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t('onboarding.goToDashboard')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t('onboarding.goToDashboardDesc')}</p>
                  </div>
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  {t('common.back')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
