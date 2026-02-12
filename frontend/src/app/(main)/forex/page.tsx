'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  forex,
  type ForexAccountItem,
  type ForexTransferItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';
import { useToast } from '@/components/Toast';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/* ──────────────────────────────────────────────────────── */
/*  Helpers                                                 */
/* ──────────────────────────────────────────────────────── */

function formatCurrency(n: number, locale: string, currency = 'ILS') {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatRate(n: number) {
  return n.toFixed(4);
}

const POPULAR_CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'JPY', 'CHF', 'CAD', 'AUD'];

type ActiveTab = 'converter' | 'rates' | 'accounts' | 'transfers';

/* ──────────────────────────────────────────────────────── */
/*  Main Page Component                                     */
/* ──────────────────────────────────────────────────────── */

export default function ForexPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();

  /* ── Active tab ── */
  const [activeTab, setActiveTab] = useState<ActiveTab>('converter');

  /* ── Converter state ── */
  const [convertFrom, setConvertFrom] = useState('USD');
  const [convertTo, setConvertTo] = useState('ILS');
  const [convertAmount, setConvertAmount] = useState('1');
  const [convertResult, setConvertResult] = useState<{ result: number; rate: number } | null>(null);
  const [converting, setConverting] = useState(false);

  /* ── Rates state ── */
  const [ratesBase, setRatesBase] = useState('ILS');
  const [rates, setRates] = useState<Record<string, number>>({});
  const [ratesDate, setRatesDate] = useState('');
  const [loadingRates, setLoadingRates] = useState(false);

  /* ── Rate history chart ── */
  const [historyFrom, setHistoryFrom] = useState('USD');
  const [historyTo, setHistoryTo] = useState('ILS');
  const [historyData, setHistoryData] = useState<Array<{ date: string; rate: number }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  /* ── Accounts state ── */
  const [accountsList, setAccountsList] = useState<ForexAccountItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  /* ── Transfers state ── */
  const [transfersList, setTransfersList] = useState<ForexTransferItem[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  /* ── Currencies list ── */
  const [currencyMap, setCurrencyMap] = useState<Record<string, string>>({});

  /* ── Account form ── */
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', currency: 'USD', balance: '', provider: '', accountNum: '', notes: '' });
  const [savingAccount, setSavingAccount] = useState(false);

  /* ── Transfer form ── */
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState({
    forexAccountId: '', type: 'BUY', fromCurrency: 'USD', toCurrency: 'ILS',
    fromAmount: '', toAmount: '', exchangeRate: '', fee: '', date: new Date().toISOString().slice(0, 10),
    description: '', notes: '',
  });
  const [savingTransfer, setSavingTransfer] = useState(false);

  /* ── Fetch currencies ── */
  useEffect(() => {
    forex.currencies().then(setCurrencyMap).catch(() => {});
  }, []);

  /* ── Fetch accounts ── */
  const fetchAccounts = useCallback(() => {
    setLoadingAccounts(true);
    forex.accounts.list()
      .then(setAccountsList)
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  /* ── Fetch rates ── */
  const fetchRates = useCallback(() => {
    setLoadingRates(true);
    forex.rates(ratesBase)
      .then((res) => { setRates(res.rates); setRatesDate(res.date); })
      .catch(() => {})
      .finally(() => setLoadingRates(false));
  }, [ratesBase]);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  /* ── Fetch history ── */
  const fetchHistory = useCallback(() => {
    setLoadingHistory(true);
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    forex.history(historyFrom, historyTo, start, end)
      .then((res) => setHistoryData(res.rates || []))
      .catch(() => setHistoryData([]))
      .finally(() => setLoadingHistory(false));
  }, [historyFrom, historyTo]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  /* ── Fetch transfers ── */
  const fetchTransfers = useCallback(() => {
    setLoadingTransfers(true);
    forex.transfers.list()
      .then(setTransfersList)
      .catch(() => {})
      .finally(() => setLoadingTransfers(false));
  }, []);

  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  /* ── Convert ── */
  async function handleConvert() {
    if (!convertAmount || parseFloat(convertAmount) <= 0) return;
    setConverting(true);
    try {
      const res = await forex.convert(parseFloat(convertAmount), convertFrom, convertTo);
      setConvertResult({ result: res.result, rate: res.rate });
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    } finally {
      setConverting(false);
    }
  }

  /* ── Swap currencies ── */
  function handleSwap() {
    setConvertFrom(convertTo);
    setConvertTo(convertFrom);
    setConvertResult(null);
  }

  /* ── Save account ── */
  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!accountForm.name) return;
    setSavingAccount(true);
    try {
      await forex.accounts.create({
        name: accountForm.name,
        currency: accountForm.currency,
        balance: parseFloat(accountForm.balance) || 0,
        provider: accountForm.provider || undefined,
        accountNum: accountForm.accountNum || undefined,
        notes: accountForm.notes || undefined,
      });
      toast(t('forex.accountCreated'), 'success');
      setShowAccountForm(false);
      setAccountForm({ name: '', currency: 'USD', balance: '', provider: '', accountNum: '', notes: '' });
      fetchAccounts();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setSavingAccount(false);
    }
  }

  /* ── Save transfer ── */
  async function handleSaveTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transferForm.fromAmount || !transferForm.toAmount || !transferForm.exchangeRate) return;
    setSavingTransfer(true);
    try {
      await forex.transfers.create({
        forexAccountId: transferForm.forexAccountId || undefined,
        type: transferForm.type,
        fromCurrency: transferForm.fromCurrency,
        toCurrency: transferForm.toCurrency,
        fromAmount: parseFloat(transferForm.fromAmount) || 0,
        toAmount: parseFloat(transferForm.toAmount) || 0,
        exchangeRate: parseFloat(transferForm.exchangeRate) || 0,
        fee: transferForm.fee ? parseFloat(transferForm.fee) : undefined,
        date: transferForm.date,
        description: transferForm.description || undefined,
        notes: transferForm.notes || undefined,
      });
      toast(t('forex.transferCreated'), 'success');
      setShowTransferForm(false);
      fetchTransfers();
      fetchAccounts();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setSavingTransfer(false);
    }
  }

  /* ── Delete account ── */
  async function handleDeleteAccount(id: string) {
    if (!confirm(t('forex.confirmDeleteAccount'))) return;
    try {
      await forex.accounts.delete(id);
      toast(t('forex.accountDeleted'), 'success');
      fetchAccounts();
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    }
  }

  /* ── Delete transfer ── */
  async function handleDeleteTransfer(id: string) {
    if (!confirm(t('forex.confirmDeleteTransfer'))) return;
    try {
      await forex.transfers.delete(id);
      toast(t('forex.transferDeleted'), 'success');
      fetchTransfers();
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    }
  }

  /* ── Currency options ── */
  const currencyOptions = Object.entries(currencyMap).length > 0
    ? Object.entries(currencyMap).map(([code, name]) => ({ code, name: `${code} - ${name}` }))
    : POPULAR_CURRENCIES.map((c) => ({ code: c, name: c }));

  /* ── Tab items ── */
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'converter', label: t('forex.converter') },
    { key: 'rates', label: t('forex.exchangeRates') },
    { key: 'accounts', label: t('forex.accounts') },
    { key: 'transfers', label: t('forex.transfers') },
  ];

  /* ── Total balance by currency ── */
  const balanceByCurrency = accountsList.reduce((acc, a) => {
    acc[a.currency] = (acc[a.currency] || 0) + parseFloat(a.balance);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t('forex.title')} <HelpTooltip text={t('help.forex')} className="ms-1" />
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('forex.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setShowAccountForm(true)}>
            {t('forex.addAccount')}
          </button>
          <button type="button" className="btn-primary" onClick={() => setShowTransferForm(true)}>
            {t('forex.logTransfer')}
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {Object.keys(balanceByCurrency).length > 0 && (
        <div className="flex flex-wrap gap-4">
          {Object.entries(balanceByCurrency).map(([currency, balance]) => (
            <div key={currency} className="card flex-1 min-w-[160px]">
              <p className="text-sm text-slate-500">{currency}</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(balance, locale, currency)}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Converter Tab ── */}
      {activeTab === 'converter' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-semibold mb-4">{t('forex.currencyConverter')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.amount')}</label>
                <input
                  type="number"
                  step="0.01"
                  className="input w-full text-lg"
                  value={convertAmount}
                  onChange={(e) => { setConvertAmount(e.target.value); setConvertResult(null); }}
                  placeholder="1.00"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">{t('forex.from')}</label>
                  <select
                    className="input w-full"
                    value={convertFrom}
                    onChange={(e) => { setConvertFrom(e.target.value); setConvertResult(null); }}
                  >
                    {currencyOptions.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="mt-5 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={handleSwap}
                  title={t('forex.swap')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="7 16 3 12 7 8" /><line x1="21" y1="12" x2="3" y2="12" />
                  </svg>
                </button>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">{t('forex.to')}</label>
                  <select
                    className="input w-full"
                    value={convertTo}
                    onChange={(e) => { setConvertTo(e.target.value); setConvertResult(null); }}
                  >
                    {currencyOptions.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                className="btn-primary w-full"
                onClick={handleConvert}
                disabled={converting}
              >
                {converting ? t('common.loading') : t('forex.convert')}
              </button>
              {convertResult && (
                <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 p-4 text-center">
                  <p className="text-sm text-slate-500">
                    {convertAmount} {convertFrom} =
                  </p>
                  <p className="text-3xl font-bold text-primary-600 dark:text-primary-400 my-1">
                    {formatCurrency(convertResult.result, locale, convertTo)}
                  </p>
                  <p className="text-xs text-slate-400">
                    1 {convertFrom} = {formatRate(convertResult.rate)} {convertTo}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Rate History Chart */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{t('forex.rateHistory')}</h2>
              <div className="flex items-center gap-2 text-sm">
                <select
                  className="input py-1"
                  value={historyFrom}
                  onChange={(e) => setHistoryFrom(e.target.value)}
                >
                  {POPULAR_CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <span className="text-slate-400">/</span>
                <select
                  className="input py-1"
                  value={historyTo}
                  onChange={(e) => setHistoryTo(e.target.value)}
                >
                  {POPULAR_CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            {loadingHistory ? (
              <div className="flex items-center justify-center h-48">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">{t('forex.noHistoryData')}</div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => new Date(v).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => v.toFixed(2)}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatRate(value), `${historyFrom}/${historyTo}`]}
                      labelFormatter={(label) => new Date(label).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Rates Tab ── */}
      {activeTab === 'rates' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t('forex.exchangeRates')}</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500">{t('forex.baseCurrency')}:</label>
              <select
                className="input py-1"
                value={ratesBase}
                onChange={(e) => setRatesBase(e.target.value)}
              >
                {POPULAR_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {ratesDate && <span className="text-xs text-slate-400">({ratesDate})</span>}
            </div>
          </div>
          {loadingRates ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : Object.keys(rates).length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">{t('forex.noRates')}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.entries(rates)
                .sort(([a], [b]) => {
                  const aIdx = POPULAR_CURRENCIES.indexOf(a);
                  const bIdx = POPULAR_CURRENCIES.indexOf(b);
                  if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                  if (aIdx !== -1) return -1;
                  if (bIdx !== -1) return 1;
                  return a.localeCompare(b);
                })
                .map(([code, rate]) => (
                  <div
                    key={code}
                    className={`p-3 rounded-xl border transition-colors ${
                      POPULAR_CURRENCIES.includes(code)
                        ? 'border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{code}</span>
                      <span className="text-xs text-slate-400">{currencyMap[code] || ''}</span>
                    </div>
                    <p className="text-lg font-bold mt-1">{formatRate(rate)}</p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Accounts Tab ── */}
      {activeTab === 'accounts' && (
        <div>
          {loadingAccounts ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : accountsList.length === 0 ? (
            <div className="card text-center py-12">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-300 dark:text-slate-600 mb-3">
                <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              <p className="text-slate-500">{t('forex.noAccounts')}</p>
              <button type="button" className="btn-primary mt-4" onClick={() => setShowAccountForm(true)}>
                {t('forex.addAccount')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accountsList.map((account) => (
                <div key={account.id} className="card relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 to-blue-500" />
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{account.name}</h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                        {account.currency}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(account.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(parseFloat(account.balance), locale, account.currency)}</p>
                  {account.provider && (
                    <p className="text-sm text-slate-500 mt-2">{account.provider}</p>
                  )}
                  {account.notes && (
                    <p className="text-xs text-slate-400 mt-1 italic">{account.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Transfers Tab ── */}
      {activeTab === 'transfers' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t('forex.transferHistory')}</h2>
          </div>
          {loadingTransfers ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : transfersList.length === 0 ? (
            <div className="text-center py-8">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-300 dark:text-slate-600 mb-3">
                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
              </svg>
              <p className="text-slate-500">{t('forex.noTransfers')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-start py-2 px-3 font-medium">{t('forex.date')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.type')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.fromAmount')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.toAmount')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.rate')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.fee')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.description')}</th>
                    <th className="text-start py-2 px-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {transfersList.map((tx) => (
                    <tr key={tx.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3 text-slate-500">
                        {new Date(tx.date).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          tx.type === 'BUY'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : tx.type === 'SELL'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        }`}>
                          {tx.type === 'BUY' ? t('forex.buy') : tx.type === 'SELL' ? t('forex.sell') : t('forex.transfer')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium">{parseFloat(tx.fromAmount).toFixed(2)} {tx.fromCurrency}</td>
                      <td className="py-2.5 px-3 font-medium">{parseFloat(tx.toAmount).toFixed(2)} {tx.toCurrency}</td>
                      <td className="py-2.5 px-3 text-slate-500">{formatRate(parseFloat(tx.exchangeRate))}</td>
                      <td className="py-2.5 px-3 text-slate-500">{tx.fee ? parseFloat(tx.fee).toFixed(2) : '-'}</td>
                      <td className="py-2.5 px-3 text-slate-500 truncate max-w-[150px]">{tx.description || '-'}</td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => handleDeleteTransfer(tx.id)}
                          className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add Account Modal ── */}
      {showAccountForm && (
        <div className="modal-overlay" onClick={() => setShowAccountForm(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">{t('forex.addAccount')}</h3>
              <button type="button" onClick={() => setShowAccountForm(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveAccount} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.accountName')}</label>
                <input className="input w-full" value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.currency')}</label>
                  <select className="input w-full" value={accountForm.currency} onChange={(e) => setAccountForm((f) => ({ ...f, currency: e.target.value }))}>
                    {currencyOptions.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.balance')}</label>
                  <input type="number" step="0.01" className="input w-full" value={accountForm.balance} onChange={(e) => setAccountForm((f) => ({ ...f, balance: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.provider')}</label>
                <input className="input w-full" value={accountForm.provider} onChange={(e) => setAccountForm((f) => ({ ...f, provider: e.target.value }))} placeholder={t('common.optional')} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.notes')}</label>
                <textarea className="input w-full h-16 resize-none" value={accountForm.notes} onChange={(e) => setAccountForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={savingAccount}>
                {savingAccount ? t('common.loading') : t('common.save')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Log Transfer Modal ── */}
      {showTransferForm && (
        <div className="modal-overlay" onClick={() => setShowTransferForm(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">{t('forex.logTransfer')}</h3>
              <button type="button" onClick={() => setShowTransferForm(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveTransfer} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.type')}</label>
                  <select className="input w-full" value={transferForm.type} onChange={(e) => setTransferForm((f) => ({ ...f, type: e.target.value }))}>
                    <option value="BUY">{t('forex.buy')}</option>
                    <option value="SELL">{t('forex.sell')}</option>
                    <option value="TRANSFER">{t('forex.transfer')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.date')}</label>
                  <input type="date" className="input w-full" value={transferForm.date} onChange={(e) => setTransferForm((f) => ({ ...f, date: e.target.value }))} required />
                </div>
              </div>
              {accountsList.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.account')}</label>
                  <select className="input w-full" value={transferForm.forexAccountId} onChange={(e) => setTransferForm((f) => ({ ...f, forexAccountId: e.target.value }))}>
                    <option value="">{t('common.optional')}</option>
                    {accountsList.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.fromCurrency')}</label>
                  <select className="input w-full" value={transferForm.fromCurrency} onChange={(e) => setTransferForm((f) => ({ ...f, fromCurrency: e.target.value }))}>
                    {currencyOptions.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.toCurrency')}</label>
                  <select className="input w-full" value={transferForm.toCurrency} onChange={(e) => setTransferForm((f) => ({ ...f, toCurrency: e.target.value }))}>
                    {currencyOptions.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.fromAmount')}</label>
                  <input type="number" step="0.01" className="input w-full" value={transferForm.fromAmount} onChange={(e) => setTransferForm((f) => ({ ...f, fromAmount: e.target.value }))} placeholder="0" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.toAmount')}</label>
                  <input type="number" step="0.01" className="input w-full" value={transferForm.toAmount} onChange={(e) => setTransferForm((f) => ({ ...f, toAmount: e.target.value }))} placeholder="0" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.rate')}</label>
                  <input type="number" step="0.0001" className="input w-full" value={transferForm.exchangeRate} onChange={(e) => setTransferForm((f) => ({ ...f, exchangeRate: e.target.value }))} placeholder="0" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.fee')}</label>
                  <input type="number" step="0.01" className="input w-full" value={transferForm.fee} onChange={(e) => setTransferForm((f) => ({ ...f, fee: e.target.value }))} placeholder={t('common.optional')} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.description')}</label>
                  <input className="input w-full" value={transferForm.description} onChange={(e) => setTransferForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={savingTransfer}>
                {savingTransfer ? t('common.loading') : t('common.save')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
