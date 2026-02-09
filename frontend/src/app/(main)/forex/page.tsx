'use client';

import { useCallback, useEffect, useState } from 'react';
import { forex, dashboard } from '@/lib/api';
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

export default function ForexPage() {
  const { t } = useTranslation();

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

  // Load rates, currencies, and portfolio on mount
  useEffect(() => {
    forex.rates('ILS')
      .then((d) => { setRates(d.rates); setRatesDate(d.date); setPortfolioRates(d.rates); })
      .catch(() => {})
      .finally(() => setLoadingRates(false));
    forex.currencies().then(setAllCurrencies).catch(() => {});
    dashboard.summary().then((s) => setTotalBalance(s.totalBalance)).catch(() => {});
  }, []);

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
        {/* Grid lines */}
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
        {/* X-axis labels */}
        <text x={padding} y={h - 5} fontSize="9" fill="currentColor" className="text-slate-400">{firstDate}</text>
        <text x={padding + chartW / 2} y={h - 5} fontSize="9" fill="currentColor" className="text-slate-400" textAnchor="middle">{midDate}</text>
        <text x={w - padding} y={h - 5} fontSize="9" fill="currentColor" className="text-slate-400" textAnchor="end">{lastDate}</text>
        {/* Area */}
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
        {/* Line */}
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('forex.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('forex.subtitle')}</p>
      </div>

      {/* Top row: Converter + Portfolio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Currency Converter */}
        <div className="card">
          <h2 className="font-medium mb-4">{t('forex.converter')}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('forex.amount')}</label>
              <input
                type="number"
                className="input text-lg"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="any"
              />
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
              <button
                type="button"
                onClick={swapCurrencies}
                className="p-2.5 rounded-lg border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mb-0.5"
                title={t('forex.swap')}
              >
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
            <button
              type="button"
              onClick={handleConvert}
              disabled={converting}
              className="btn-primary w-full"
            >
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
              {/* ILS (base) */}
              <div className="flex items-center justify-between rounded-xl bg-primary-50 dark:bg-primary-900/20 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{CURRENCY_FLAGS.ILS}</span>
                  <div>
                    <p className="font-medium">ILS</p>
                    <p className="text-xs text-slate-500">Israeli New Shekel</p>
                  </div>
                </div>
                <p className="font-bold text-lg">{CURRENCY_SYMBOLS.ILS}{fmt(totalBalance)}</p>
              </div>
              {/* Other currencies */}
              {['USD', 'EUR', 'GBP', 'JPY', 'CHF'].map((cur) => {
                const rate = portfolioRates[cur];
                if (!rate) return null;
                const val = totalBalance * rate;
                return (
                  <div key={cur} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{CURRENCY_FLAGS[cur] || ''}</span>
                      <div>
                        <p className="font-medium">{cur}</p>
                        <p className="text-xs text-slate-500">{allCurrencies[cur] || cur}</p>
                      </div>
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
          {ratesDate && (
            <span className="text-xs text-slate-400">{t('forex.lastUpdated')}: {ratesDate}</span>
          )}
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
              {currencyOptions.map(([code]) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <span className="text-slate-400">/</span>
            <select className="input py-1.5 text-sm w-24" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)}>
              {currencyOptions.map(([code]) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mb-4">
          {Object.entries(PERIOD_DAYS).map(([key]) => {
            const labelKey = key === '30d' ? 'last30Days' : key === '90d' ? 'last90Days' : key === '6m' ? 'last6Months' : 'lastYear';
            return (
              <button
                key={key}
                type="button"
                onClick={() => setHistoryPeriod(key)}
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
                <span>
                  {t('forex.rate')}: {historyData[historyData.length - 1].rate.toFixed(4)} {historyTo}/{historyFrom}
                </span>
                <span>
                  {historyData[historyData.length - 1].rate > historyData[0].rate ? '+' : ''}
                  {((historyData[historyData.length - 1].rate - historyData[0].rate) / historyData[0].rate * 100).toFixed(2)}%
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
