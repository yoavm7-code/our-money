'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/i18n/context';
import { accounts, categories, budgets as budgetsApi, goals as goalsApi, transactions } from '@/lib/api';
import { useOnboarding } from '@/components/OnboardingProvider';

interface TaskDef {
  id: string;
  titleKey: string;
  descKey: string;
  href: string;
  icon: string;
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
      descKey: 'onboardingTasks.addAccountDesc',
      href: '/settings',
      icon: 'bank',
      check: async () => {
        const list = await accounts.list();
        return list.length > 0;
      },
    },
    {
      id: 'upload-doc',
      titleKey: 'onboardingTasks.uploadDocument',
      descKey: 'onboardingTasks.uploadDocumentDesc',
      href: '/upload',
      icon: 'upload',
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
      descKey: 'onboardingTasks.addCategoryDesc',
      href: '/settings',
      icon: 'tag',
      check: async () => {
        const list = await categories.list();
        return list.some((c) => !c.isDefault);
      },
    },
    {
      id: 'create-budget',
      titleKey: 'onboardingTasks.createBudget',
      descKey: 'onboardingTasks.createBudgetDesc',
      href: '/budgets',
      icon: 'wallet',
      check: async () => {
        const list = await budgetsApi.list();
        return list.length > 0;
      },
    },
    {
      id: 'set-goal',
      titleKey: 'onboardingTasks.setGoal',
      descKey: 'onboardingTasks.setGoalDesc',
      href: '/goals',
      icon: 'target',
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

        // Show if not all tasks are completed
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

  const TaskIcon = ({ name }: { name: string }) => {
    switch (name) {
      case 'bank':
        return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>;
      case 'upload':
        return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
      case 'tag':
        return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
      case 'wallet':
        return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 14h.01"/><path d="M2 10h20"/></svg>;
      case 'target':
        return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
      default:
        return null;
    }
  };

  return (
    <div className="card !p-4 border border-primary-200 dark:border-primary-800/50 animate-fadeIn">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <h2 className="font-semibold text-sm flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-500">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          {t('onboardingTasks.title')}
          <span className="text-xs font-normal text-slate-400 ms-1">{completedCount}/{totalCount}</span>
        </h2>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={t('common.close')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-2.5">
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Tasks */}
      <div className="space-y-1">
        {TASKS.map((task) => {
          const isDone = completed.has(task.id);
          return (
            <Link
              key={task.id}
              href={task.href}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200 group ${
                isDone
                  ? 'opacity-60'
                  : 'hover:bg-primary-50 dark:hover:bg-primary-900/10'
              }`}
            >
              <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                isDone
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 group-hover:text-primary-600 dark:group-hover:text-primary-400'
              }`}>
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <TaskIcon name={task.icon} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium leading-tight ${isDone ? 'line-through text-slate-400' : ''}`}>
                  {t(task.titleKey)}
                </p>
              </div>
              {!isDone && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-300 group-hover:text-primary-500 transition-colors rtl:rotate-180">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
