'use client';

import { useEffect, useState } from 'react';
import { accounts } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', { style: 'currency', currency: 'ILS' }).format(n);
}

const INSURANCE_FUND_TYPES = ['INSURANCE', 'PENSION', 'INVESTMENT'];
const TYPE_KEYS: Record<string, string> = {
  INSURANCE: 'settings.insurance',
  PENSION: 'settings.pension',
  INVESTMENT: 'settings.investment',
};

export default function InsuranceFundsPage() {
  const { t, locale } = useTranslation();
  const [list, setList] = useState<Array<{ id: string; name: string; type: string; balance: string; currency: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    accounts
      .list()
      .then((a) => setList(a.filter((x) => INSURANCE_FUND_TYPES.includes(x.type))))
      .catch((e) => setError(e instanceof Error ? e.message : t('common.failedToLoad')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div className="space-y-8 animate-fadeIn">
      <h1 className="text-2xl font-bold">{t('insuranceFunds.title')}</h1>
      <p className="text-slate-600 dark:text-slate-400">
        {t('insuranceFunds.description')}
      </p>
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      ) : list.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          {t('insuranceFunds.noAccounts')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((a) => (
            <div key={a.id} className="card">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t(TYPE_KEYS[a.type] ?? a.type)}</p>
              <p className="text-xl font-semibold mt-1">{a.name}</p>
              <p className="text-lg font-medium mt-2 text-primary-600 dark:text-primary-400">
                {formatCurrency(Number(a.balance), locale)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
