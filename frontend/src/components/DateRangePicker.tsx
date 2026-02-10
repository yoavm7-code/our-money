'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/i18n/context';

type QuickRange =
  | 'allTime'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'last3Months'
  | 'thisYear'
  | 'lastYear'
  | 'last2Years';

export function getQuickRangeDates(range: QuickRange): { from: string; to: string };
export function getQuickRangeDates(range: 'yearRange', yearFrom: number, yearTo: number): { from: string; to: string };
export function getQuickRangeDates(range: QuickRange | 'yearRange', yearFrom?: number, yearTo?: number): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const y = now.getFullYear();

  if (range === 'yearRange' && yearFrom != null && yearTo != null) {
    const start = new Date(yearFrom, 0, 1);
    const end = new Date(yearTo, 11, 31);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }

  switch (range) {
    case 'allTime':
      return { from: '2000-01-01', to: today };
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yd = new Date(now);
      yd.setDate(yd.getDate() - 1);
      const ys = yd.toISOString().slice(0, 10);
      return { from: ys, to: ys };
    }
    case 'last7': {
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 6);
      return { from: d7.toISOString().slice(0, 10), to: today };
    }
    case 'last30': {
      const d30 = new Date(now);
      d30.setDate(d30.getDate() - 29);
      return { from: d30.toISOString().slice(0, 10), to: today };
    }
    case 'thisMonth': {
      const start = new Date(y, now.getMonth(), 1);
      return { from: start.toISOString().slice(0, 10), to: today };
    }
    case 'lastMonth': {
      const lmStart = new Date(y, now.getMonth() - 1, 1);
      const lmEnd = new Date(y, now.getMonth(), 0);
      return { from: lmStart.toISOString().slice(0, 10), to: lmEnd.toISOString().slice(0, 10) };
    }
    case 'last3Months': {
      const start = new Date(y, now.getMonth() - 2, 1);
      return { from: start.toISOString().slice(0, 10), to: today };
    }
    case 'thisYear': {
      const start = new Date(y, 0, 1);
      return { from: start.toISOString().slice(0, 10), to: today };
    }
    case 'lastYear': {
      const start = new Date(y - 1, 0, 1);
      const end = new Date(y - 1, 11, 31);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    case 'last2Years': {
      const start = new Date(y - 2, 0, 1);
      return { from: start.toISOString().slice(0, 10), to: today };
    }
    default:
      return { from: today, to: today };
  }
}

type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
};

// Quick range groups for better organization
const QUICK_RANGES_RECENT: QuickRange[] = ['allTime', 'today', 'yesterday', 'last7', 'last30'];
const QUICK_RANGES_MONTHS: QuickRange[] = ['thisMonth', 'lastMonth', 'last3Months'];
const QUICK_RANGES_YEARS: QuickRange[] = ['thisYear', 'lastYear', 'last2Years'];

export default function DateRangePicker({ from, to, onChange, className = '' }: Props) {
  const { t } = useTranslation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [yearFrom, setYearFrom] = useState<string>('');
  const [yearTo, setYearTo] = useState<string>('');
  const currentYear = new Date().getFullYear();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const applyQuick = (range: QuickRange | 'yearRange', yFrom?: number, yTo?: number) => {
    const { from: f, to: t2 } = range === 'yearRange' && yFrom != null && yTo != null
      ? getQuickRangeDates('yearRange', yFrom, yTo)
      : getQuickRangeDates(range as QuickRange);
    onChange(f, t2);
    setShowDropdown(false);
  };

  const applyYearRange = () => {
    const yF = yearFrom ? parseInt(yearFrom, 10) : null;
    const yT = yearTo ? parseInt(yearTo, 10) : null;
    if (yF != null && yT != null) {
      applyQuick('yearRange', Math.min(yF, yT), Math.max(yF, yT));
    }
  };

  // Get display label for current range
  const getActiveRangeLabel = (): string | null => {
    const allRanges = [...QUICK_RANGES_RECENT, ...QUICK_RANGES_MONTHS, ...QUICK_RANGES_YEARS];
    for (const r of allRanges) {
      const { from: f, to: t2 } = getQuickRangeDates(r);
      if (from === f && to === t2) {
        return t('dateRange.' + r);
      }
    }
    return null;
  };

  const activeLabel = getActiveRangeLabel();

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <input
          type="date"
          className="input w-auto min-w-[130px]"
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
        />
        <span className="text-slate-400">–</span>
        <input
          type="date"
          className="input w-auto min-w-[130px]"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
        />
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>{activeLabel || t('dateRange.quickSelect')}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-2 end-0 z-40 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl p-4 min-w-[320px]">
          {/* Recent */}
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('dateRange.recent')}</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_RANGES_RECENT.map((r) => {
                const { from: f, to: t2 } = getQuickRangeDates(r);
                const isActive = from === f && to === t2;
                return (
                  <button
                    key={r}
                    type="button"
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      isActive
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => applyQuick(r)}
                  >
                    {t('dateRange.' + r)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Months */}
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('dateRange.months')}</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_RANGES_MONTHS.map((r) => {
                const { from: f, to: t2 } = getQuickRangeDates(r);
                const isActive = from === f && to === t2;
                return (
                  <button
                    key={r}
                    type="button"
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      isActive
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => applyQuick(r)}
                  >
                    {t('dateRange.' + r)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Years */}
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('dateRange.years')}</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_RANGES_YEARS.map((r) => {
                const { from: f, to: t2 } = getQuickRangeDates(r);
                const isActive = from === f && to === t2;
                return (
                  <button
                    key={r}
                    type="button"
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      isActive
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => applyQuick(r)}
                  >
                    {t('dateRange.' + r)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom year range */}
          <div className="pt-3 border-t border-[var(--border)]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t('dateRange.customYearRange')}</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="input text-sm w-24 py-1.5"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={t('dateRange.yearFrom')}
                min={1990}
                max={currentYear + 5}
              />
              <span className="text-slate-400">–</span>
              <input
                type="number"
                className="input text-sm w-24 py-1.5"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={t('dateRange.yearTo')}
                min={1990}
                max={currentYear + 5}
              />
              <button
                type="button"
                className="btn-primary text-xs py-1.5 px-3"
                onClick={applyYearRange}
                disabled={!yearFrom || !yearTo}
              >
                {t('dateRange.apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
