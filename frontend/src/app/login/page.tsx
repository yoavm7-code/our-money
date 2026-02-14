'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, users } from '@/lib/api';
import { COUNTRY_CODES } from '@/lib/countries';
import { useTranslation } from '@/i18n/context';
import AvatarCropper from '@/components/AvatarCropper';

const RECAPTCHA_SITE_KEY = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '') : '';

declare global {
  interface Window {
    grecaptcha?: {
      getResponse: () => string;
      reset: () => void;
    };
  }
}

const TOTAL_STEPS = 3;

function StepIndicator({ currentStep, t }: { currentStep: number; t: (key: string) => string }) {
  const labels = [t('login.stepBasicInfo'), t('login.stepProfile'), t('login.stepWelcome')];
  return (
    <div className="flex items-center justify-center gap-0 mb-8 px-2">
      {labels.map((label, i) => {
        const step = i + 1;
        const isCompleted = currentStep > step;
        const isCurrent = currentStep === step;
        return (
          <div key={step} className="flex items-center">
            {i > 0 && (
              <div
                className={`w-6 sm:w-10 h-0.5 mx-0.5 sm:mx-1 transition-colors duration-300 ${
                  isCompleted ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold transition-all duration-300 ${
                  isCompleted
                    ? 'bg-primary-500 text-white'
                    : isCurrent
                      ? 'bg-primary-500 text-white ring-4 ring-primary-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}
              >
                {isCompleted ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  step
                )}
              </div>
              <span
                className={`text-xs font-medium text-center max-w-[70px] sm:max-w-none sm:whitespace-nowrap ${
                  isCurrent ? 'text-primary-600 dark:text-primary-400' : isCompleted ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();

  // Shared state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Registration multi-step state
  const [regStep, setRegStep] = useState(1);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState<string>('IL');
  const [phone, setPhone] = useState('');

  // Avatar state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) return;
    if (document.querySelector('script[src*="google.com/recaptcha"]')) return;
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  // Clean up avatar preview URL on unmount
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  function resetRegistration() {
    setRegStep(1);
    setConfirmPassword('');
    setName('');
    setCountryCode('IL');
    setPhone('');
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarCropFile(null);
    setError('');
  }

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError(t('profile.avatarMaxSize'));
      return;
    }
    setAvatarCropFile(file);
    e.target.value = '';
  }

  function handleAvatarCrop(blob: Blob) {
    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(blob));
    setAvatarCropFile(null);
  }

  function validateStep1(): boolean {
    setError('');
    if (!email || !password) return false;
    if (password.length < 8) {
      setError(t('login.passwordTooShort'));
      return false;
    }
    if (password !== confirmPassword) {
      setError(t('login.passwordsDoNotMatch'));
      return false;
    }
    return true;
  }

  async function handleRegisterSubmit() {
    setError('');
    setLoading(true);
    const captchaToken = RECAPTCHA_SITE_KEY && window.grecaptcha ? window.grecaptcha.getResponse() : undefined;
    if (RECAPTCHA_SITE_KEY && (!captchaToken || !captchaToken.length)) {
      setError(t('login.captchaRequired'));
      setLoading(false);
      return;
    }
    try {
      const res = await auth.register(email, password, name || undefined, countryCode || undefined, captchaToken, phone || undefined);
      if (typeof window !== 'undefined' && res.accessToken) {
        localStorage.setItem('accessToken', res.accessToken);

        // Upload avatar if one was selected
        if (avatarFile) {
          try {
            await users.uploadAvatar(avatarFile);
          } catch {
            // Avatar upload failure is non-critical; continue
          }
        }

        // Move to welcome step
        setRegStep(3);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'));
      if (window.grecaptcha) window.grecaptcha.reset();
    } finally {
      setLoading(false);
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const captchaToken = RECAPTCHA_SITE_KEY && window.grecaptcha ? window.grecaptcha.getResponse() : undefined;
    if (RECAPTCHA_SITE_KEY && (!captchaToken || !captchaToken.length)) {
      setError(t('login.captchaRequired'));
      setLoading(false);
      return;
    }
    try {
      const res = await auth.login(email, password, captchaToken);
      if ('requiresTwoFactor' in res && res.requiresTwoFactor) {
        setNeeds2FA(true);
        setLoading(false);
        return;
      }
      if (typeof window !== 'undefined' && res.accessToken) {
        localStorage.setItem('accessToken', res.accessToken);
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'));
      if (window.grecaptcha) window.grecaptcha.reset();
    } finally {
      setLoading(false);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.login(email, password, undefined, twoFactorCode);
      if (typeof window !== 'undefined' && res.accessToken) {
        localStorage.setItem('accessToken', res.accessToken);
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  }

  // ---- 2FA Screen ----
  if (needs2FA) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="card w-full max-w-md relative animate-scaleIn">
          <button
            type="button"
            onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
            className="absolute top-4 end-4 text-xs font-medium px-2 py-1 rounded border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {locale === 'he' ? 'EN' : 'HE'}
          </button>
          <h1 className="text-2xl font-semibold text-center mb-2">{t('login.title')}</h1>
          <p className="text-center text-sm text-slate-500 mb-6">{t('login.twoFactorRequired')}</p>
          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('login.twoFactorCode')}</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="input text-center text-2xl tracking-widest"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('login.twoFactorCodePlaceholder')}
                autoFocus
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading || twoFactorCode.length < 6}>
              {loading ? t('login.pleaseWait') : t('login.verify')}
            </button>
          </form>
          <p className="mt-4 text-center text-sm">
            <button
              type="button"
              className="text-primary-600 hover:underline"
              onClick={() => { setNeeds2FA(false); setTwoFactorCode(''); setError(''); }}
            >
              {t('login.backToLogin')}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ---- Registration Multi-Step ----
  if (isRegister) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4 py-8">
        <div className="card w-full max-w-lg relative animate-scaleIn">
          <button
            type="button"
            onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
            className="absolute top-4 end-4 text-xs font-medium px-2 py-1 rounded border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {locale === 'he' ? 'EN' : 'HE'}
          </button>

          <h1 className="text-2xl font-semibold text-center mb-1">{t('login.title')}</h1>
          <p className="text-center text-sm text-slate-500 mb-4">{t('login.register')}</p>

          <StepIndicator currentStep={regStep} t={t} />

          {/* Step 1: Basic Info */}
          {regStep === 1 && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-lg font-medium">{t('login.step1Title')}</h2>
                <p className="text-sm text-slate-500">{t('login.step1Subtitle')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('login.email')}</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder={t('login.emailPlaceholder')}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('login.password')}</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••"
                />
                {password.length > 0 && password.length < 8 && (
                  <p className="text-xs text-amber-600 mt-1">{t('login.passwordTooShort')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('login.confirmPassword')}</label>
                <input
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder={t('login.confirmPasswordPlaceholder')}
                />
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="text-xs text-red-600 mt-1">{t('login.passwordsDoNotMatch')}</p>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="button"
                className="btn-primary w-full"
                disabled={!email || !password || !confirmPassword}
                onClick={() => {
                  if (validateStep1()) setRegStep(2);
                }}
              >
                {t('login.nextStep')}
              </button>

              <p className="mt-2 text-center text-sm text-slate-500">
                {t('login.alreadyHaveAccount')}{' '}
                <button
                  type="button"
                  className="text-primary-600 hover:underline"
                  onClick={() => { setIsRegister(false); resetRegistration(); setError(''); }}
                >
                  {t('login.signIn')}
                </button>
              </p>
            </div>
          )}

          {/* Step 2: Profile */}
          {regStep === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-lg font-medium">{t('login.step2Title')}</h2>
                <p className="text-sm text-slate-500">{t('login.step2Subtitle')}</p>
              </div>

              {/* Avatar Upload */}
              <div className="flex flex-col items-center gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative group"
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt=""
                      className="w-24 h-24 rounded-full object-cover ring-2 ring-primary-500/30 group-hover:ring-primary-500/60 transition-all"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center ring-2 ring-dashed ring-slate-300 dark:ring-slate-600 group-hover:ring-primary-500/40 transition-all">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  </div>
                </button>
                <p className="text-xs text-slate-500">
                  {avatarPreview ? t('login.changeAvatar') : t('login.avatarHint')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('login.yourName')}</label>
                <input
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('login.yourName')}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('login.country')}</label>
                <select
                  className="input w-full"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  <option value="">{t('login.countryPlaceholder')}</option>
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {t(`countries.${code}`)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">{t('login.countryWhy')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('login.phone')} <span className="text-slate-400 text-xs">({t('common.optional')})</span>
                </label>
                <input
                  type="tel"
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('login.phonePlaceholder')}
                />
              </div>

              {RECAPTCHA_SITE_KEY && (
                <div className="flex justify-center min-h-[78px]">
                  <div
                    className="g-recaptcha"
                    data-sitekey={RECAPTCHA_SITE_KEY}
                    data-theme="light"
                  />
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => { setRegStep(1); setError(''); }}
                >
                  {t('login.prevStep')}
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={loading}
                  onClick={handleRegisterSubmit}
                >
                  {loading ? t('login.pleaseWait') : t('login.createAccount')}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Welcome */}
          {regStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold">{t('login.step3Title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('login.step3Subtitle')}</p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('login.welcomeSummary')}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                    <span className="text-slate-500">{t('login.email')}</span>
                    <span className="font-medium break-all sm:break-normal">{email}</span>
                  </div>
                  {name && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                      <span className="text-slate-500">{t('login.yourName')}</span>
                      <span className="font-medium">{name}</span>
                    </div>
                  )}
                  {countryCode && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                      <span className="text-slate-500">{t('login.country')}</span>
                      <span className="font-medium">{t(`countries.${countryCode}`)}</span>
                    </div>
                  )}
                  {phone && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2">
                      <span className="text-slate-500">{t('login.phone')}</span>
                      <span className="font-medium">{phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 flex items-start gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500 shrink-0 mt-0.5">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 7l-10 7L2 7" />
                </svg>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  {t('login.verifyEmailSent')}
                </p>
              </div>

              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => router.push('/dashboard')}
              >
                {t('login.goToDashboard')}
              </button>
            </div>
          )}
        </div>

        {/* Avatar cropper modal */}
        {avatarCropFile && (
          <AvatarCropper
            file={avatarCropFile}
            onCrop={handleAvatarCrop}
            onCancel={() => setAvatarCropFile(null)}
          />
        )}
      </div>
    );
  }

  // ---- Login Form (unchanged) ----
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="card w-full max-w-md relative animate-scaleIn">
        <button
          type="button"
          onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
          className="absolute top-4 end-4 text-xs font-medium px-2 py-1 rounded border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {locale === 'he' ? 'EN' : 'HE'}
        </button>
        <h1 className="text-2xl font-semibold text-center mb-6">{t('login.title')}</h1>
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('login.email')}</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t('login.emailPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('login.password')}</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
            />
          </div>
          {RECAPTCHA_SITE_KEY && (
            <div className="flex justify-center min-h-[78px]">
              <div
                className="g-recaptcha"
                data-sitekey={RECAPTCHA_SITE_KEY}
                data-theme="light"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? t('login.pleaseWait') : t('login.signIn')}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          {t('login.dontHaveAccount')}{' '}
          <button
            type="button"
            className="text-primary-600 hover:underline"
            onClick={() => { setIsRegister(true); setError(''); }}
          >
            {t('login.register')}
          </button>
        </p>
      </div>
    </div>
  );
}
