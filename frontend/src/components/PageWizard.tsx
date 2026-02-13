'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/context';

export interface WizardStep {
  title: string;
  description: string;
}

interface PageWizardProps {
  pageKey: string;
  steps: WizardStep[];
}

const STORAGE_PREFIX = 'our-money-wizard-';

export default function PageWizard({ pageKey, steps }: PageWizardProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [dismissed, setDismissed] = useState(true);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_PREFIX + pageKey);
    if (stored === 'dismissed') {
      setDismissed(true);
      setShowButton(true);
    } else {
      setDismissed(false);
      setShowButton(false);
    }
  }, [pageKey]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setShowButton(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_PREFIX + pageKey, 'dismissed');
    }
  }, [pageKey]);

  const handleReopen = useCallback(() => {
    setDismissed(false);
    setShowButton(false);
    setCurrentStep(0);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_PREFIX + pageKey);
    }
  }, [pageKey]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleDismiss();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  if (steps.length === 0) return null;

  // Show "?" button to reopen wizard
  if (dismissed && showButton) {
    return (
      <button
        type="button"
        onClick={handleReopen}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
        title={t('wizard.showGuide')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        {t('wizard.showGuide')}
      </button>
    );
  }

  if (dismissed) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  return (
    <div className="bg-gradient-to-r from-primary-50 to-emerald-50 dark:from-primary-900/15 dark:to-emerald-900/15 border border-primary-200 dark:border-primary-800/50 rounded-xl p-4 animate-fadeIn">
      <div className="flex items-start gap-3">
        {/* Step indicator */}
        <div className="shrink-0 w-8 h-8 rounded-lg bg-primary-500 text-white flex items-center justify-center text-sm font-bold">
          {currentStep + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{step.title}</h3>
            <span className="text-xs text-slate-400">
              {currentStep + 1}/{steps.length}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
            {step.description}
          </p>

          {/* Progress dots */}
          <div className="flex items-center gap-1 mb-3">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 rounded-full transition-all duration-300 ${
                  idx <= currentStep ? 'bg-primary-500 w-4' : 'bg-slate-200 dark:bg-slate-700 w-2'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="text-xs px-2.5 py-1 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
              >
                {t('common.previous')}
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="text-xs px-3 py-1 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors font-medium"
            >
              {isLast ? t('wizard.gotIt') : t('common.next')}
            </button>
          </div>
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
          title={t('common.close')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
