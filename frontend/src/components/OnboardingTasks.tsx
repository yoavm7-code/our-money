'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/i18n/context';
import { accounts, categories, budgets as budgetsApi, goals as goalsApi, transactions } from '@/lib/api';
import { useOnboarding } from '@/components/OnboardingProvider';

interface TaskDef {
  id: string;
  titleKey: string;
  href: string;
  check: () => Promise<boolean>;
}

const DISMISSED_KEY = 'our-money-onboarding-tasks-dismissed';

export default function OnboardingTasks() {
  const { t } = useTranslation();
  const { isTouring } = useOnboarding();
  const [visible, setVisible] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const TASKS: TaskDef[] = [
    {
      id: 'add-account',
      titleKey: 'onboardingTasks.addAccount',
      href: '/settings',
      check: async () => {
        const list = await accounts.list();
        return list.length > 0;
      },
    },
    {
      id: 'upload-doc',
      titleKey: 'onboardingTasks.uploadDocument',
      href: '/upload',
      check: async () => {
        try {
          const result = await transactions.list({ limit: 1 });
          return result.total > 0;
        } catch { return false; }
      },
    },
    {
      id: 'add-category',
      titleKey: 'onboardingTasks.addCategory',
      href: '/settings',
      check: async () => {
        const list = await categories.list();
        return list.some((c) => !c.isDefault);
      },
    },
    {
      id: 'create-budget',
      titleKey: 'onboardingTasks.createBudget',
      href: '/budgets',
      check: async () => {
        const list = await budgetsApi.list();
        return list.length > 0;
      },
    },
    {
      id: 'set-goal',
      titleKey: 'onboardingTasks.setGoal',
      href: '/goals',
      check: async () => {
        const list = await goalsApi.list();
        return list.length > 0;
      },
    },
  ];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') {
      setVisible(false);
      setLoading(false);
      return;
    }

    const checkTasks = async () => {
      try {
        const results = await Promise.allSettled(
          TASKS.map(async (task) => {
            const done = await task.check();
            return { id: task.id, done };
          })
        );

        const doneSet = new Set<string>();
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.done) {
            doneSet.add(r.value.id);
          }
        }
        setCompleted(doneSet);
        setVisible(doneSet.size < TASKS.length);
      } catch {
        setVisible(false);
      } finally {
        setLoading(false);
      }
    };

    checkTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
  };

  if (loading || !visible || isTouring) return null;

  const completedCount = completed.size;
  const totalCount = TASKS.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] px-5 py-4 animate-fadeIn">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600 dark:text-primary-400">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold">{t('onboardingTasks.title')}</h2>
            <p className="text-xs text-slate-400">{completedCount} {t('onboardingTasks.completedOf')} {totalCount} {t('onboardingTasks.completedSuffix')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-primary-600 dark:text-primary-400">{progressPct}%</span>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={t('common.close')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Tasks grid - horizontal cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {TASKS.map((task) => {
          const isDone = completed.has(task.id);
          return (
            <Link
              key={task.id}
              href={task.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all duration-200 ${
                isDone
                  ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/40'
                  : 'bg-slate-50 dark:bg-slate-800/50 border-[var(--border)] hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/10'
              }`}
            >
              <span className="text-sm">{t(task.titleKey)}</span>
              <div className={`shrink-0 ms-auto w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                isDone
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-slate-300 dark:border-slate-600'
              }`}>
                {isDone && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
