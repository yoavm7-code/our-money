'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';

/* ---------- Types ---------- */

type StepPosition = 'top' | 'bottom' | 'left' | 'right';

interface TourStep {
  id: string;
  title: string;       // i18n key
  description: string;  // i18n key
  page: string;         // route
  elementSelector: string;
  position: StepPosition;
}

export interface OnboardingWizardProps {
  onComplete: () => void;
}

/* ---------- Tour Step Definitions ---------- */

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard-overview',
    title: 'onboarding.step1Title',
    description: 'onboarding.step1Desc',
    page: '/dashboard',
    elementSelector: 'main',
    position: 'bottom',
  },
  {
    id: 'stat-widgets',
    title: 'onboarding.step2Title',
    description: 'onboarding.step2Desc',
    page: '/dashboard',
    elementSelector: '[data-tour="stat-widgets"], .card:first-child',
    position: 'bottom',
  },
  {
    id: 'date-range-filter',
    title: 'onboarding.step3Title',
    description: 'onboarding.step3Desc',
    page: '/dashboard',
    elementSelector: '[data-tour="date-range"], [class*="dateRange"], button:has(svg)',
    position: 'bottom',
  },
  {
    id: 'customize-dashboard',
    title: 'onboarding.step4Title',
    description: 'onboarding.step4Desc',
    page: '/dashboard',
    elementSelector: '[data-tour="customize"], button:last-of-type',
    position: 'bottom',
  },
  {
    id: 'transactions-page',
    title: 'onboarding.step5Title',
    description: 'onboarding.step5Desc',
    page: '/transactions',
    elementSelector: 'main',
    position: 'bottom',
  },
  {
    id: 'upload-documents',
    title: 'onboarding.step6Title',
    description: 'onboarding.step6Desc',
    page: '/upload',
    elementSelector: 'main',
    position: 'bottom',
  },
  {
    id: 'income-expenses',
    title: 'onboarding.step7Title',
    description: 'onboarding.step7Desc',
    page: '/income',
    elementSelector: 'main',
    position: 'bottom',
  },
  {
    id: 'goals',
    title: 'onboarding.step8Title',
    description: 'onboarding.step8Desc',
    page: '/goals',
    elementSelector: 'main',
    position: 'bottom',
  },
  {
    id: 'budgets',
    title: 'onboarding.step9Title',
    description: 'onboarding.step9Desc',
    page: '/budgets',
    elementSelector: 'main',
    position: 'bottom',
  },
  {
    id: 'reports',
    title: 'onboarding.step10Title',
    description: 'onboarding.step10Desc',
    page: '/reports',
    elementSelector: 'main',
    position: 'bottom',
  },
  {
    id: 'settings',
    title: 'onboarding.step11Title',
    description: 'onboarding.step11Desc',
    page: '/settings',
    elementSelector: 'main',
    position: 'bottom',
  },
  {
    id: 'help-tooltips',
    title: 'onboarding.step12Title',
    description: 'onboarding.step12Desc',
    page: '/dashboard',
    elementSelector: 'main',
    position: 'bottom',
  },
];

/* ---------- Helpers ---------- */

interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

function getElementRect(selector: string): ElementRect | null {
  const selectors = selector.split(',').map((s) => s.trim());
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const rect = el.getBoundingClientRect();
        return {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        };
      }
    } catch {
      // invalid selector, try next
    }
  }
  return null;
}

function computeTooltipPosition(
  rect: ElementRect,
  position: StepPosition,
  tooltipWidth: number,
  tooltipHeight: number,
): { top: number; left: number } {
  const GAP = 16;
  let top = 0;
  let left = 0;

  switch (position) {
    case 'bottom':
      top = rect.top + rect.height + PADDING + GAP;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case 'top':
      top = rect.top - PADDING - GAP - tooltipHeight;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - PADDING - GAP - tooltipWidth;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left + rect.width + PADDING + GAP;
      break;
  }

  // Keep within viewport
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (left < scrollX + 16) left = scrollX + 16;
  if (left + tooltipWidth > scrollX + vw - 16) left = scrollX + vw - 16 - tooltipWidth;
  if (top < scrollY + 16) top = scrollY + 16;
  if (top + tooltipHeight > scrollY + vh - 16) top = scrollY + vh - 16 - tooltipHeight;

  return { top, left };
}

/* ---------- Component ---------- */

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t, isRtl } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<ElementRect | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [tooltipMeasured, setTooltipMeasured] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 380, height: 200 });

  const step = useMemo(() => TOUR_STEPS[currentStep], [currentStep]);
  const totalSteps = TOUR_STEPS.length;

  // Find and highlight the target element
  const findTarget = useCallback(() => {
    const rect = getElementRect(step.elementSelector);
    setTargetRect(rect);

    if (rect) {
      // Scroll the highlighted element into view if needed
      const viewTop = window.scrollY;
      const viewBottom = viewTop + window.innerHeight;
      const elCenter = rect.top + rect.height / 2;
      if (elCenter < viewTop + 100 || elCenter > viewBottom - 100) {
        window.scrollTo({ top: Math.max(0, rect.top - 150), behavior: 'smooth' });
      }
    }
  }, [step]);

  // Measure tooltip size after render
  useEffect(() => {
    if (tooltipRef.current) {
      const { offsetWidth, offsetHeight } = tooltipRef.current;
      setTooltipSize({ width: offsetWidth, height: offsetHeight });
      setTooltipMeasured(true);
    }
  }, [currentStep, targetRect]);

  // When step changes, navigate if needed and then find the target
  useEffect(() => {
    if (step.page !== pathname) {
      setIsNavigating(true);
      setTargetRect(null);
      router.push(step.page);
    } else {
      // Already on the right page: find target after a short delay for DOM readiness
      setIsNavigating(false);
      const timer = setTimeout(findTarget, 300);
      return () => clearTimeout(timer);
    }
  }, [step, pathname, router, findTarget]);

  // After navigation completes (pathname changed to match step.page)
  useEffect(() => {
    if (isNavigating && pathname === step.page) {
      setIsNavigating(false);
      const timer = setTimeout(findTarget, 500);
      return () => clearTimeout(timer);
    }
  }, [isNavigating, pathname, step.page, findTarget]);

  // Re-measure on resize
  useEffect(() => {
    const onResize = () => findTarget();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [findTarget]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onComplete();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStep < totalSteps - 1) {
          setTooltipMeasured(false);
          setCurrentStep((s) => s + 1);
        } else {
          onComplete();
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentStep > 0) {
          setTooltipMeasured(false);
          setCurrentStep((s) => s - 1);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentStep, totalSteps, onComplete]);

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setTooltipMeasured(false);
      setCurrentStep((s) => s + 1);
    } else {
      onComplete();
    }
  }, [currentStep, totalSteps, onComplete]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setTooltipMeasured(false);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  // Compute spotlight "hole" clip-path
  const spotlightClipPath = useMemo(() => {
    if (!targetRect) return undefined;
    const p = PADDING;
    const x = targetRect.left - p;
    const y = targetRect.top - p;
    const w = targetRect.width + p * 2;
    const h = targetRect.height + p * 2;
    const r = 12; // border-radius of the hole

    // Create polygon with a rectangular hole with rounded corners
    // Outer: full viewport, Inner: rectangle (counterclockwise for hole)
    return `polygon(
      0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
      ${x + r}px ${y}px,
      ${x}px ${y + r}px,
      ${x}px ${y + h - r}px,
      ${x + r}px ${y + h}px,
      ${x + w - r}px ${y + h}px,
      ${x + w}px ${y + h - r}px,
      ${x + w}px ${y + r}px,
      ${x + w - r}px ${y}px,
      ${x + r}px ${y}px
    )`;
  }, [targetRect]);

  // Tooltip positioning
  const tooltipPos = useMemo(() => {
    if (!targetRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const pos = computeTooltipPosition(
      targetRect,
      step.position,
      tooltipSize.width,
      tooltipSize.height,
    );
    return { top: `${pos.top}px`, left: `${pos.left}px`, transform: 'none' };
  }, [targetRect, step.position, tooltipSize]);

  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div
      className="fixed inset-0 z-[9999]"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Dark overlay with spotlight cutout */}
      <div
        className="absolute inset-0 transition-all duration-500 ease-out"
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          clipPath: targetRect ? spotlightClipPath : undefined,
          WebkitClipPath: targetRect ? spotlightClipPath : undefined,
        }}
        onClick={onComplete}
      />

      {/* Spotlight border glow */}
      {targetRect && (
        <div
          className="absolute pointer-events-none transition-all duration-500 ease-out"
          style={{
            top: targetRect.top - PADDING,
            left: targetRect.left - PADDING,
            width: targetRect.width + PADDING * 2,
            height: targetRect.height + PADDING * 2,
            borderRadius: 12,
            boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.5), 0 0 24px rgba(34, 197, 94, 0.15)',
          }}
        />
      )}

      {/* Tooltip card - FIXED at bottom center, doesn't jump */}
      <div
        ref={tooltipRef}
        className="fixed z-[10000] bottom-6 left-1/2 -translate-x-1/2 w-[420px] max-w-[calc(100vw-32px)]"
        style={{
          opacity: isNavigating ? 0 : 1,
          direction: isRtl ? 'rtl' : 'ltr',
          transition: 'opacity 0.3s ease-out',
        }}
      >
        {/* Arrow pointing up to highlighted element */}
        {targetRect && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] border-b-[var(--card)]" />
        )}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1.5 bg-[var(--border)]">
            <div
              className="h-full bg-emerald-500 transition-all duration-500 ease-out"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>

          <div className="p-5">
            {/* Step counter */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                {t('onboarding.stepOf', { current: currentStep + 1, total: totalSteps })}
              </span>
              <button
                type="button"
                onClick={onComplete}
                className="text-xs text-[#a0a3bd] hover:text-[var(--foreground)] transition-colors"
              >
                {t('onboarding.skip')}
              </button>
            </div>

            {/* Title */}
            <h3 className="text-base font-semibold text-[var(--foreground)] mb-2">
              {t(step.title)}
            </h3>

            {/* Description */}
            <p className="text-sm text-[#a0a3bd] leading-relaxed mb-5">
              {t(step.description)}
            </p>

            {/* Navigation buttons */}
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#a0a3bd] hover:text-[var(--foreground)] bg-[var(--background)] border border-[var(--border)] rounded-xl transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  {t('onboarding.previous')}
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors ms-auto shadow-sm"
              >
                {isLastStep ? t('onboarding.finish') : t('onboarding.next')}
                {!isLastStep && (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
                {isLastStep && (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5 pb-4">
            {TOUR_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setTooltipMeasured(false);
                  setCurrentStep(idx);
                }}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  idx === currentStep
                    ? 'bg-emerald-500 w-5'
                    : idx < currentStep
                      ? 'bg-emerald-500/40'
                      : 'bg-[var(--border)]'
                }`}
                aria-label={`Step ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
