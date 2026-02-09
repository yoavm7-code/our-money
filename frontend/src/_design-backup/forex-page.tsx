'use client';

import { useCallback, useEffect, useState } from 'react';
import { forex, dashboard, type ForexAccountItem, type ForexTransferItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

const POPULAR_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'THB', 'TRY'];
const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: '₪', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'Fr', CAD: 'C$',
  AUD: 'A$', CNY: '¥', THB: '฿', TRY: '₺', SEK: 'kr', NOK: 'kr', DKK: 'kr',
  PLN: 'zł', CZK: 'Kč', HUF: 'Ft', ZAR: 'R', BRL: 'R$', MXN: '$', SGD: 'S$',
  HKD: 'HK$', KRW: '₩', INR: '₹', RUB: '₽',
};
const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭', CAD: '🇨🇦',
  AUD: '🇦🇺', CNY: '🇨🇳', THB: '🇹🇭', TRY: '🇹🇷', ILS: '🇮🇱', SEK: '🇸🇪',
  NOK: '🇳🇴', DKK: '🇩🇰', PLN: '🇵🇱', CZK: '🇨🇿', HUF: '🇭🇺', ZAR: '🇿🇦',
  BRL: '🇧🇷', MXN: '🇲🇽', SGD: '🇸🇬', HKD: '🇭🇰', KRW: '🇰🇷', INR: '🇮🇳', RUB: '🇷🇺',
};

const PERIOD_DAYS: Record<string, number> = {
  '30d': 30, '90d': 90, '6m': 180, '1y': 365,
};

type Tab = 'rates' | 'accounts' | 'transfers';

export default function ForexPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('rates');

  // Converter state
  const [amount, setAmount] = useState('1');
  const [fromCurrency, setFromCurrency] = useState('ILS');
  const [toCurrency, setToCurrency] = useState('USD');
  const [convertResult, setConvertResult] = useState<{ result: number; rate: number } | null>(null);
  const [converting, setConverting] = useState(false);

  // Rates state
  const [rates, setRates] = useState<Record<string, number>>({});
  const [ratesDate, setRatesDate] = useState('');
  const [loadingRates, setLoadingRates] = useState(true);

  // History state
  const [historyFrom, setHistoryFrom] = useState('ILS');
  const [historyTo, setHistoryTo] = useState('USD');
  const [historyPeriod, setHistoryPeriod] = useState('90d');
  const [historyData, setHistoryData] = useState<Array<{ date: string; rate: number }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Portfolio state
  const [totalBalance, setTotalBalance] = useState<number | null>(null);
  const [portfolioRates, setPortfolioRates] = useState<Record<string, number>>({});

  // All currencies list
  const [allCurrencies, setAllCurrencies] = useState<Record<string, string>>({});

  // Forex accounts state
  const [forexAccounts, setForexAccounts] = useState<ForexAccountItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ForexAccountItem | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', currency: 'USD', balance: '', provider: '', accountNum: '', notes: '' });

  // Forex transfers state
  const [forexTransfers, setForexTransfers] = useState<ForexTransferItem[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<ForexTransferItem | null>(null);
  const [transferForm, setTransferForm] = useState({
    type: 'BUY' as 'BUY' | 'SELL' | 'TRANSFER', forexAccountId: '', fromCurrency: 'ILS', toCurrency: 'USD',
    fromAmount: '', toAmount: '', exchangeRate: '', fee: '', date: new Date().toISOString().slice(0, 10), description: '', notes: '',
  });
  const [filterAccountId, setFilterAccountId] = useState('');

  // Load rates, currencies, and portfolio on mount
  useEffect(() => {
    forex.rates('ILS')
      .then((d) => { setRates(d.rates); setRatesDate(d.date); setPortfolioRates(d.rates); })
      .catch(() => {})
      .finally(() => setLoadingRates(false));
    forex.currencies().then(setAllCurrencies).catch(() => {});
    dashboard.summary().then((s) => setTotalBalance(s.totalBalance)).catch(() => {});
  }, []);

  // Load accounts and transfers when their tabs are shown
  useEffect(() => {
    if (tab === 'accounts' && forexAccounts.length === 0) {
      setLoadingAccounts(true);
      forex.accounts.list().then(setForexAccounts).catch(() => {}).finally(() => setLoadingAccounts(false));
    }
    if (tab === 'transfers') {
      setLoadingTransfers(true);
      Promise.all([
        forex.transfers.list(filterAccountId || undefined),
        forexAccounts.length === 0 ? forex.accounts.list() : Promise.resolve(null),
      ]).then(([transfers, accts]) => {
        setForexTransfers(transfers);
        if (accts) setForexAccounts(accts);
      }).catch(() => {}).finally(() => setLoadingTransfers(false));
    }
  }, [tab, filterAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convert handler
  const handleConvert = useCallback(async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    setConverting(true);
    try {
      const res = await forex.convert(n, fromCurrency, toCurrency);
      setConvertResult({ result: res.result, rate: res.rate });
    } catch {
      setConvertResult(null);
    } finally {
      setConverting(false);
    }
  }, [amount, fromCurrency, toCurrency]);

  // Auto-convert on change
  useEffect(() => {
    const n = parseFloat(amount);
    if (n > 0 && fromCurrency && toCurrency) {
      handleConvert();
    }
  }, [fromCurrency, toCurrency]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const days = PERIOD_DAYS[historyPeriod] || 90;
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const res = await forex.history(historyFrom, historyTo, start, end);
      setHistoryData(res.rates);
    } catch {
      setHistoryData([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyFrom, historyTo, historyPeriod]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setConvertResult(null);
  };

  const currencyOptions = Object.keys(allCurrencies).length > 0
    ? Object.entries(allCurrencies).sort(([a], [b]) => {
        if (a === 'ILS') return -1;
        if (b === 'ILS') return 1;
        const ap = POPULAR_CURRENCIES.indexOf(a);
        const bp = POPULAR_CURRENCIES.indexOf(b);
        if (ap >= 0 && bp >= 0) return ap - bp;
        if (ap >= 0) return -1;
        if (bp >= 0) return 1;
        return a.localeCompare(b);
      })
    : [['ILS', 'Israeli New Shekel'], ...POPULAR_CURRENCIES.map((c) => [c, c])];

  // Account CRUD handlers
  const openAddAccount = () => {
    setEditingAccount(null);
    setAccountForm({ name: '', currency: 'USD', balance: '', provider: '', accountNum: '', notes: '' });
    setShowAccountModal(true);
  };
  const openEditAccount = (a: ForexAccountItem) => {
    setEditingAccount(a);
    setAccountForm({
      name: a.name, currency: a.currency, balance: String(Number(a.balance)),
      provider: a.provider || '', accountNum: a.accountNum || '', notes: a.notes || '',
    });
    setShowAccountModal(true);
  };
  const handleSaveAccount = async () => {
    const body = {
      name: accountForm.name,
      currency: accountForm.currency,
      balance: parseFloat(accountForm.balance) || 0,
      provider: accountForm.provider || undefined,
      accountNum: accountForm.accountNum || undefined,
      notes: accountForm.notes || undefined,
    };
    if (editingAccount) {
      await forex.accounts.update(editingAccount.id, body);
    } else {
      await forex.accounts.create(body);
    }
    setShowAccountModal(false);
    const list = await forex.accounts.list();
    setForexAccounts(list);
  };
  const handleDeleteAccount = async (id: string) => {
    if (!confirm(t('forex.deleteConfirm'))) return;
    await forex.accounts.delete(id);
    setForexAccounts(forexAccounts.filter((a) => a.id !== id));
  };

  // Transfer CRUD handlers
  const openAddTransfer = () => {
    setEditingTransfer(null);
    setTransferForm({
      type: 'BUY', forexAccountId: '', fromCurrency: 'ILS', toCurrency: 'USD',
      fromAmount: '', toAmount: '', exchangeRate: '', fee: '', date: new Date().toISOString().slice(0, 10), description: '', notes: '',
    });
    setShowTransferModal(true);
  };
  const openEditTransfer = (tr: ForexTransferItem) => {
    setEditingTransfer(tr);
    setTransferForm({
      type: tr.type,
      forexAccountId: tr.forexAccount?.id || '',
      fromCurrency: tr.fromCurrency,
      toCurrency: tr.toCurrency,
      fromAmount: String(Number(tr.fromAmount)),
      toAmount: String(Number(tr.toAmount)),
      exchangeRate: String(Number(tr.exchangeRate)),
      fee: tr.fee ? String(Number(tr.fee)) : '',
      date: typeof tr.date === 'string' ? tr.date.slice(0, 10) : '',
      description: tr.description || '',
      notes: tr.notes || '',
    });
    setShowTransferModal(true);
  };
  const handleSaveTransfer = async () => {
    const body = {
      type: transferForm.type,
      forexAccountId: transferForm.forexAccountId || undefined,
      fromCurrency: transferForm.fromCurrency,
      toCurrency: transferForm.toCurrency,
      fromAmount: parseFloat(transferForm.fromAmount) || 0,
      toAmount: parseFloat(transferForm.toAmount) || 0,
      exchangeRate: parseFloat(transferForm.exchangeRate) || 0,
      fee: transferForm.fee ? parseFloat(transferForm.fee) : undefined,
      date: transferForm.date,
      description: transferForm.description || undefined,
      notes: transferForm.notes || undefined,
    };
    if (editingTransfer) {
      await forex.transfers.update(editingTransfer.id, body);
    } else {
      await forex.transfers.create(body);
    }
    setShowTransferModal(false);
    const list = await forex.transfers.list(filterAccountId || undefined);
    setForexTransfers(list);
    forex.accounts.list().then(setForexAccounts).catch(() => {});
  };
  const handleDeleteTransfer = async (id: string) => {
    if (!confirm(t('forex.deleteConfirm'))) return;
    await forex.transfers.delete(id);
    setForexTransfers(forexTransfers.filter((tr) => tr.id !== id));
  };

  // Auto-calc exchange rate when amounts change
  useEffect(() => {
    const from = parseFloat(transferForm.fromAmount);
    const to = parseFloat(transferForm.toAmount);
    if (from > 0 && to > 0 && !transferForm.exchangeRate) {
      setTransferForm((f) => ({ ...f, exchangeRate: (to / from).toFixed(6) }));
    }
  }, [transferForm.fromAmount, transferForm.toAmount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mini sparkline SVG for history chart
  const renderChart = () => {
    if (historyData.length < 2) return <p className="text-center text-sm text-slate-400 py-12">{t('forex.noData')}</p>;
    const values = historyData.map((d) => d.rate);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 800;
    const h = 200;
    const padding = 30;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    const points = historyData.map((d, i) => {
      const x = padding + (i / (historyData.length - 1)) * chartW;
      const y = padding + chartH - ((d.rate - min) / range) * chartH;
      return `${x},${y}`;
    });

    const firstDate = historyData[0].date;
    const midIdx = Math.floor(historyData.length / 2);
    const midDate = historyData[midIdx].date;
    const lastDate = historyData[historyData.length - 1].date;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48 md:h-56" preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padding + chartH - f * chartH;
          const val = min + f * range;
          return (
            <g key={f}>
              <line x1={padding} y1={y} x2={w - padding} y2={y} stroke="var(--border)" strokeWidth="0.5" />
              <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="9" fill="currentColor" className="text-slate-400">{val.toFixed(4)}</text>
            </g>
          );
        })}
        <text x={padding} y={h - 5} fontSize="9" fill="currentColor" className="text-slate-400">{firstDate}</text>
        <text x={padding + chartW / 2} y={h - 5} fontSize="9" fill="currentColor" className="text-slate-400" textAnchor="middle">{midDate}</text>
        <text x={w - padding} y={h - 5} fontSize="9" fill="currentColor" className="text-slate-400" textAnchor="end">{lastDate}</text>
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16,185,129)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points={`${padding},${padding + chartH} ${points.join(' ')} ${w - padding},${padding + chartH}`}
          fill="url(#chartGradient)"
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="rgb(16,185,129)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  const fmt = (n: number, decimals = 2) =>
    n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  // Calculate total forex value in ILS
  const totalForexILS = forexAccounts.reduce((sum, a) => {
    const balance = Number(a.balance);
    if (a.currency === 'ILS') return sum + balance;
    const rate = rates[a.currency];
    return sum + (rate ? balance / rate : 0);
  }, 0);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'rates', label: t('forex.tabRates') },
    { key: 'accounts', label: t('forex.tabAccounts') },
    { key: 'transfers', label: t('forex.tabTransfers') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('forex.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('forex.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Rates & Converter ═══ */}
      {tab === 'rates' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Currency Converter */}
            <div className="card">
              <h2 className="font-medium mb-4">{t('forex.converter')}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.amount')}</label>
                  <input type="number" className="input text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="any" />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">{t('forex.from')}</label>
                    <select className="input" value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)}>
                      {currencyOptions.map(([code]) => (
                        <option key={code} value={code}>{CURRENCY_FLAGS[code] || ''} {code}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={swapCurrencies} className="p-2.5 rounded-lg border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mb-0.5" title={t('forex.swap')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
                  </button>
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">{t('forex.to')}</label>
                    <select className="input" value={toCurrency} onChange={(e) => setToCurrency(e.target.value)}>
                      {currencyOptions.map(([code]) => (
                        <option key={code} value={code}>{CURRENCY_FLAGS[code] || ''} {code}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button type="button" onClick={handleConvert} disabled={converting} className="btn-primary w-full">
                  {converting ? t('common.loading') : t('forex.convert')}
                </button>
                {convertResult && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-500 mb-1">{t('forex.result')}</p>
                    <p className="text-3xl font-bold">
                      {CURRENCY_SYMBOLS[toCurrency] || ''}{fmt(convertResult.result)}
                      <span className="text-base font-normal text-slate-500 ms-2">{toCurrency}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      1 {fromCurrency} = {convertResult.rate.toFixed(4)} {toCurrency}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Portfolio Value */}
            <div className="card">
              <h2 className="font-medium mb-2">{t('forex.portfolio')}</h2>
              <p className="text-sm text-slate-500 mb-4">{t('forex.portfolioDesc')}</p>
              {totalBalance != null && Object.keys(portfolioRates).length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-primary-50 dark:bg-primary-900/20 p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{CURRENCY_FLAGS.ILS}</span>
                      <div><p className="font-medium">ILS</p><p className="text-xs text-slate-500">Israeli New Shekel</p></div>
                    </div>
                    <p className="font-bold text-lg">{CURRENCY_SYMBOLS.ILS}{fmt(totalBalance)}</p>
                  </div>
                  {['USD', 'EUR', 'GBP', 'JPY', 'CHF'].map((cur) => {
                    const rate = portfolioRates[cur];
                    if (!rate) return null;
                    const val = totalBalance * rate;
                    return (
                      <div key={cur} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{CURRENCY_FLAGS[cur] || ''}</span>
                          <div><p className="font-medium">{cur}</p><p className="text-xs text-slate-500">{allCurrencies[cur] || cur}</p></div>
                        </div>
                        <p className="font-bold text-lg">{CURRENCY_SYMBOLS[cur] || ''}{fmt(val, cur === 'JPY' ? 0 : 2)}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-sm text-slate-400 py-8">
                  {loadingRates ? t('forex.loading') : t('forex.noData')}
                </p>
              )}
            </div>
          </div>

          {/* Rate Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium">{t('forex.rateTable')}</h2>
              {ratesDate && <span className="text-xs text-slate-400">{t('forex.lastUpdated')}: {ratesDate}</span>}
            </div>
            {loadingRates ? (
              <p className="text-center text-sm text-slate-400 py-8">{t('forex.loading')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-start py-2 px-3 font-medium">{t('forex.currency')}</th>
                      <th className="text-start py-2 px-3 font-medium">{t('forex.rateVsILS')}</th>
                      <th className="text-start py-2 px-3 font-medium">1 {t('forex.currency')} = ₪</th>
                    </tr>
                  </thead>
                  <tbody>
                    {POPULAR_CURRENCIES.filter((c) => rates[c]).map((code) => {
                      const rate = rates[code];
                      const inverse = 1 / rate;
                      return (
                        <tr key={code} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{CURRENCY_FLAGS[code] || ''}</span>
                              <div>
                                <span className="font-medium">{code}</span>
                                <span className="text-xs text-slate-500 ms-2">{allCurrencies[code] || ''}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono">{rate.toFixed(4)}</td>
                          <td className="py-2.5 px-3 font-mono">{CURRENCY_SYMBOLS.ILS}{inverse.toFixed(4)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* History Chart */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="font-medium">{t('forex.history')}</h2>
              <div className="flex items-center gap-2">
                <select className="input py-1.5 text-sm w-24" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)}>
                  {currencyOptions.map(([code]) => (<option key={code} value={code}>{code}</option>))}
                </select>
                <span className="text-slate-400">/</span>
                <select className="input py-1.5 text-sm w-24" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)}>
                  {currencyOptions.map(([code]) => (<option key={code} value={code}>{code}</option>))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mb-4">
              {Object.entries(PERIOD_DAYS).map(([key]) => {
                const labelKey = key === '30d' ? 'last30Days' : key === '90d' ? 'last90Days' : key === '6m' ? 'last6Months' : 'lastYear';
                return (
                  <button key={key} type="button" onClick={() => setHistoryPeriod(key)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      historyPeriod === key
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
                        : 'border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t(`forex.${labelKey}`)}
                  </button>
                );
              })}
            </div>
            {loadingHistory ? (
              <p className="text-center text-sm text-slate-400 py-12">{t('forex.loading')}</p>
            ) : (
              <>
                {renderChart()}
                {historyData.length >= 2 && (
                  <div className="flex justify-between text-xs text-slate-400 mt-2 px-2">
                    <span>{t('forex.rate')}: {historyData[historyData.length - 1].rate.toFixed(4)} {historyTo}/{historyFrom}</span>
                    <span>
                      {historyData[historyData.length - 1].rate > historyData[0].rate ? '+' : ''}
                      {((historyData[historyData.length - 1].rate - historyData[0].rate) / historyData[0].rate * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ═══ TAB: Forex Accounts ═══ */}
      {tab === 'accounts' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-sm text-slate-500">{t('forex.numAccounts')}</p>
              <p className="text-2xl font-bold mt-1">{forexAccounts.length}</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-slate-500">{t('forex.totalValue')}</p>
              <p className="text-2xl font-bold mt-1">{CURRENCY_SYMBOLS.ILS}{fmt(totalForexILS)}</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-slate-500">{t('forex.numTransfers')}</p>
              <p className="text-2xl font-bold mt-1">{forexAccounts.reduce((s, a) => s + (a._count?.transfers || 0), 0)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">{t('forex.accounts')}</h2>
              <p className="text-sm text-slate-500">{t('forex.accountsDesc')}</p>
            </div>
            <button type="button" onClick={openAddAccount} className="btn-primary text-sm">
              + {t('forex.addAccount')}
            </button>
          </div>

          {loadingAccounts ? (
            <p className="text-center text-sm text-slate-400 py-8">{t('forex.loading')}</p>
          ) : forexAccounts.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-slate-400">{t('forex.noAccounts')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {forexAccounts.map((a) => {
                const balanceILS = a.currency === 'ILS' ? Number(a.balance) : (rates[a.currency] ? Number(a.balance) / rates[a.currency] : null);
                return (
                  <div key={a.id} className="card relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{CURRENCY_FLAGS[a.currency] || '💱'}</span>
                        <div>
                          <h3 className="font-medium">{a.name}</h3>
                          {a.provider && <p className="text-xs text-slate-500">{a.provider}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEditAccount(a)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </button>
                        <button type="button" onClick={() => handleDeleteAccount(a.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors" title="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-sm text-slate-500">{t('forex.accountBalance')}</span>
                        <span className="text-xl font-bold">{CURRENCY_SYMBOLS[a.currency] || ''}{fmt(Number(a.balance))}</span>
                      </div>
                      {balanceILS != null && a.currency !== 'ILS' && (
                        <div className="flex justify-between items-end">
                          <span className="text-xs text-slate-400">ILS</span>
                          <span className="text-sm text-slate-500">{CURRENCY_SYMBOLS.ILS}{fmt(balanceILS)}</span>
                        </div>
                      )}
                      {a.accountNum && (
                        <p className="text-xs text-slate-400">{t('forex.accountNumber')}: {a.accountNum}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ TAB: Forex Transfers ═══ */}
      {tab === 'transfers' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-medium">{t('forex.transfers')}</h2>
              <p className="text-sm text-slate-500">{t('forex.transfersDesc')}</p>
            </div>
            <div className="flex items-center gap-2">
              <select className="input py-1.5 text-sm" value={filterAccountId} onChange={(e) => setFilterAccountId(e.target.value)}>
                <option value="">{t('forex.transferNoAccount')} - {t('common.all') || 'All'}</option>
                {forexAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                ))}
              </select>
              <button type="button" onClick={openAddTransfer} className="btn-primary text-sm whitespace-nowrap">
                + {t('forex.addTransfer')}
              </button>
            </div>
          </div>

          {loadingTransfers ? (
            <p className="text-center text-sm text-slate-400 py-8">{t('forex.loading')}</p>
          ) : forexTransfers.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-slate-400">{t('forex.noTransfers')}</p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-start py-2 px-3 font-medium">{t('forex.transferDate')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.transferType')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.from')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.to')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.transferRate')}</th>
                    <th className="text-start py-2 px-3 font-medium">{t('forex.transferAccount')}</th>
                    <th className="text-start py-2 px-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {forexTransfers.map((tr) => {
                    const typeColor = tr.type === 'BUY' ? 'text-green-600 dark:text-green-400' : tr.type === 'SELL' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
                    const typeLabel = tr.type === 'BUY' ? t('forex.typeBuy') : tr.type === 'SELL' ? t('forex.typeSell') : t('forex.typeTransfer');
                    return (
                      <tr key={tr.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-2.5 px-3">{typeof tr.date === 'string' ? tr.date.slice(0, 10) : ''}</td>
                        <td className={`py-2.5 px-3 font-medium ${typeColor}`}>{typeLabel}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono">{fmt(Number(tr.fromAmount))}</span>
                          <span className="text-xs text-slate-500 ms-1">{tr.fromCurrency}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono">{fmt(Number(tr.toAmount))}</span>
                          <span className="text-xs text-slate-500 ms-1">{tr.toCurrency}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono">{Number(tr.exchangeRate).toFixed(4)}</td>
                        <td className="py-2.5 px-3 text-sm text-slate-500">{tr.forexAccount?.name || '-'}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex gap-1">
                            <button type="button" onClick={() => openEditTransfer(tr)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            </button>
                            <button type="button" onClick={() => handleDeleteTransfer(tr.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ Account Modal ═══ */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAccountModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editingAccount ? t('forex.editAccount') : t('forex.addAccount')}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.accountName')}</label>
                <input className="input" value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder={t('forex.accountNamePlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.accountCurrency')}</label>
                  <select className="input" value={accountForm.currency} onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}>
                    {currencyOptions.map(([code]) => (
                      <option key={code} value={code}>{CURRENCY_FLAGS[code] || ''} {code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.accountBalance')}</label>
                  <input type="number" className="input" value={accountForm.balance} onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })} step="any" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.accountProvider')}</label>
                <input className="input" value={accountForm.provider} onChange={(e) => setAccountForm({ ...accountForm, provider: e.target.value })} placeholder={t('forex.accountProviderPlaceholder')} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.accountNumber')}</label>
                <input className="input" value={accountForm.accountNum} onChange={(e) => setAccountForm({ ...accountForm, accountNum: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.accountNotes')}</label>
                <textarea className="input" rows={2} value={accountForm.notes} onChange={(e) => setAccountForm({ ...accountForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowAccountModal(false)} className="btn-secondary flex-1">{t('common.cancel')}</button>
              <button type="button" onClick={handleSaveAccount} disabled={!accountForm.name || !accountForm.currency} className="btn-primary flex-1">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Transfer Modal ═══ */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTransferModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editingTransfer ? t('forex.editTransfer') : t('forex.addTransfer')}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.transferType')}</label>
                  <select className="input" value={transferForm.type} onChange={(e) => setTransferForm({ ...transferForm, type: e.target.value as 'BUY' | 'SELL' | 'TRANSFER' })}>
                    <option value="BUY">{t('forex.typeBuy')}</option>
                    <option value="SELL">{t('forex.typeSell')}</option>
                    <option value="TRANSFER">{t('forex.typeTransfer')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.transferDate')}</label>
                  <input type="date" className="input" value={transferForm.date} onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.transferFromCurrency')}</label>
                  <select className="input" value={transferForm.fromCurrency} onChange={(e) => setTransferForm({ ...transferForm, fromCurrency: e.target.value })}>
                    {currencyOptions.map(([code]) => (<option key={code} value={code}>{CURRENCY_FLAGS[code] || ''} {code}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.transferToCurrency')}</label>
                  <select className="input" value={transferForm.toCurrency} onChange={(e) => setTransferForm({ ...transferForm, toCurrency: e.target.value })}>
                    {currencyOptions.map(([code]) => (<option key={code} value={code}>{CURRENCY_FLAGS[code] || ''} {code}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.transferFromAmount')}</label>
                  <input type="number" className="input" value={transferForm.fromAmount} onChange={(e) => setTransferForm({ ...transferForm, fromAmount: e.target.value })} step="any" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.transferToAmount')}</label>
                  <input type="number" className="input" value={transferForm.toAmount} onChange={(e) => setTransferForm({ ...transferForm, toAmount: e.target.value })} step="any" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.transferRate')}</label>
                  <input type="number" className="input" value={transferForm.exchangeRate} onChange={(e) => setTransferForm({ ...transferForm, exchangeRate: e.target.value })} step="any" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('forex.transferFee')}</label>
                  <input type="number" className="input" value={transferForm.fee} onChange={(e) => setTransferForm({ ...transferForm, fee: e.target.value })} step="any" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.transferAccount')}</label>
                <select className="input" value={transferForm.forexAccountId} onChange={(e) => setTransferForm({ ...transferForm, forexAccountId: e.target.value })}>
                  <option value="">{t('forex.transferNoAccount')}</option>
                  {forexAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.transferDescription')}</label>
                <input className="input" value={transferForm.description} onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('forex.transferNotes')}</label>
                <textarea className="input" rows={2} value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowTransferModal(false)} className="btn-secondary flex-1">{t('common.cancel')}</button>
              <button type="button" onClick={handleSaveTransfer} disabled={!transferForm.fromAmount || !transferForm.toAmount || !transferForm.exchangeRate} className="btn-primary flex-1">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
