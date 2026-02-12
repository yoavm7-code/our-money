'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  stocks,
  type StockPortfolioItem,
  type StockHoldingItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';
import { useToast } from '@/components/Toast';

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

function formatPercent(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function getPnlColor(pnl: number): string {
  if (pnl > 0) return 'text-green-600 dark:text-green-400';
  if (pnl < 0) return 'text-red-600 dark:text-red-400';
  return 'text-slate-500';
}

function getPnlBg(pnl: number): string {
  if (pnl > 0) return 'bg-green-50 dark:bg-green-900/10';
  if (pnl < 0) return 'bg-red-50 dark:bg-red-900/10';
  return '';
}

type SearchResult = { symbol: string; description: string; type: string };

/* ──────────────────────────────────────────────────────── */
/*  Main Page Component                                     */
/* ──────────────────────────────────────────────────────── */

export default function StocksPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();

  /* ── Data state ── */
  const [portfolios, setPortfolios] = useState<StockPortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  /* ── Portfolio form ── */
  const [showPortfolioForm, setShowPortfolioForm] = useState(false);
  const [portfolioForm, setPortfolioForm] = useState({ name: '', broker: '', accountNum: '', currency: 'ILS', notes: '' });
  const [savingPortfolio, setSavingPortfolio] = useState(false);

  /* ── Holding form ── */
  const [showHoldingForm, setShowHoldingForm] = useState(false);
  const [holdingPortfolioId, setHoldingPortfolioId] = useState('');
  const [holdingForm, setHoldingForm] = useState({
    ticker: '', name: '', exchange: '', sector: '', shares: '', avgBuyPrice: '',
    currency: 'USD', buyDate: '', notes: '',
  });
  const [savingHolding, setSavingHolding] = useState(false);

  /* ── Stock search ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  /* ── Expanded portfolios ── */
  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<string>>(new Set());

  /* ── Fetch portfolios ── */
  const fetchPortfolios = useCallback(() => {
    setLoading(true);
    stocks.portfolios.list()
      .then((data) => {
        setPortfolios(data);
        // Auto-expand all
        setExpandedPortfolios(new Set(data.map((p) => p.id)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPortfolios(); }, [fetchPortfolios]);

  /* ── Stock search ── */
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      stocks.search(searchQuery)
        .then((results) => {
          setSearchResults(results);
          setShowSearchResults(true);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* ── Expand/collapse ── */
  function toggleExpanded(id: string) {
    setExpandedPortfolios((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* ── Refresh prices ── */
  async function handleRefreshPrices(portfolioId: string) {
    setRefreshingId(portfolioId);
    try {
      const updated = await stocks.portfolios.refreshPrices(portfolioId);
      setPortfolios((prev) => prev.map((p) => p.id === portfolioId ? updated : p));
      toast(t('stocks.pricesRefreshed'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setRefreshingId(null);
    }
  }

  /* ── Save portfolio ── */
  async function handleSavePortfolio(e: React.FormEvent) {
    e.preventDefault();
    if (!portfolioForm.name) return;
    setSavingPortfolio(true);
    try {
      await stocks.portfolios.create({
        name: portfolioForm.name,
        broker: portfolioForm.broker || undefined,
        accountNum: portfolioForm.accountNum || undefined,
        currency: portfolioForm.currency,
        notes: portfolioForm.notes || undefined,
      });
      toast(t('stocks.portfolioCreated'), 'success');
      setShowPortfolioForm(false);
      setPortfolioForm({ name: '', broker: '', accountNum: '', currency: 'ILS', notes: '' });
      fetchPortfolios();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setSavingPortfolio(false);
    }
  }

  /* ── Select from search ── */
  function selectSearchResult(result: SearchResult) {
    setHoldingForm((f) => ({
      ...f,
      ticker: result.symbol,
      name: result.description,
    }));
    setSearchQuery('');
    setShowSearchResults(false);
  }

  /* ── Open add holding ── */
  function openAddHolding(portfolioId: string) {
    setHoldingPortfolioId(portfolioId);
    setHoldingForm({ ticker: '', name: '', exchange: '', sector: '', shares: '', avgBuyPrice: '', currency: 'USD', buyDate: '', notes: '' });
    setShowHoldingForm(true);
  }

  /* ── Save holding ── */
  async function handleSaveHolding(e: React.FormEvent) {
    e.preventDefault();
    if (!holdingForm.ticker || !holdingForm.name || !holdingForm.shares || !holdingForm.avgBuyPrice) return;
    setSavingHolding(true);
    try {
      await stocks.holdings.add(holdingPortfolioId, {
        ticker: holdingForm.ticker,
        name: holdingForm.name,
        exchange: holdingForm.exchange || undefined,
        sector: holdingForm.sector || undefined,
        shares: parseFloat(holdingForm.shares) || 0,
        avgBuyPrice: parseFloat(holdingForm.avgBuyPrice) || 0,
        currency: holdingForm.currency,
        buyDate: holdingForm.buyDate || undefined,
        notes: holdingForm.notes || undefined,
      });
      toast(t('stocks.holdingAdded'), 'success');
      setShowHoldingForm(false);
      fetchPortfolios();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setSavingHolding(false);
    }
  }

  /* ── Delete holding ── */
  async function handleDeleteHolding(portfolioId: string, holdingId: string) {
    if (!confirm(t('stocks.confirmDeleteHolding'))) return;
    try {
      await stocks.holdings.delete(portfolioId, holdingId);
      toast(t('stocks.holdingDeleted'), 'success');
      fetchPortfolios();
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    }
  }

  /* ── Delete portfolio ── */
  async function handleDeletePortfolio(id: string) {
    if (!confirm(t('stocks.confirmDeletePortfolio'))) return;
    try {
      await stocks.portfolios.delete(id);
      toast(t('stocks.portfolioDeleted'), 'success');
      fetchPortfolios();
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    }
  }

  /* ── Calculate totals ── */
  function calcPortfolioTotals(holdings: StockHoldingItem[]) {
    let totalInvested = 0;
    let totalCurrent = 0;
    for (const h of holdings) {
      const invested = h.shares * h.avgBuyPrice;
      const current = h.shares * (h.currentPrice ?? h.avgBuyPrice);
      totalInvested += invested;
      totalCurrent += current;
    }
    const pnl = totalCurrent - totalInvested;
    const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;
    return { totalInvested, totalCurrent, pnl, pnlPercent };
  }

  /* ── Overall totals ── */
  const allHoldings = portfolios.flatMap((p) => p.holdings);
  const overall = calcPortfolioTotals(allHoldings);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t('stocks.title')} <HelpTooltip text={t('help.stocks')} className="ms-1" />
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('stocks.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowPortfolioForm(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('stocks.addPortfolio')}
        </button>
      </div>

      {/* ── Overall Summary ── */}
      {allHoldings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-sm text-slate-500">{t('stocks.totalInvested')}</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(overall.totalInvested, locale)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('stocks.totalValue')}</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(overall.totalCurrent, locale)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('stocks.totalPnl')}</p>
            <p className={`text-xl font-bold mt-1 ${getPnlColor(overall.pnl)}`}>
              {overall.pnl >= 0 ? '+' : ''}{formatCurrency(overall.pnl, locale)}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('stocks.totalPnlPercent')}</p>
            <p className={`text-xl font-bold mt-1 ${getPnlColor(overall.pnlPercent)}`}>
              {formatPercent(overall.pnlPercent)}
            </p>
          </div>
        </div>
      )}

      {/* ── Stock Search ── */}
      <div className="relative">
        <div className="relative">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="input w-full ps-10"
            placeholder={t('stocks.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
            onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
          />
          {searching && (
            <div className="absolute end-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          )}
        </div>
        {showSearchResults && searchResults.length > 0 && (
          <div className="absolute z-50 inset-x-0 top-full mt-1 bg-[var(--card)] rounded-xl shadow-xl border border-[var(--border)] max-h-60 overflow-y-auto">
            {searchResults.map((r) => (
              <button
                key={r.symbol}
                type="button"
                className="w-full text-start px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between"
                onClick={() => selectSearchResult(r)}
              >
                <div>
                  <span className="font-bold text-sm">{r.symbol}</span>
                  <span className="text-sm text-slate-500 ms-2">{r.description}</span>
                </div>
                <span className="text-xs text-slate-400">{r.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Portfolios ── */}
      {portfolios.length === 0 ? (
        <div className="card text-center py-12">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-300 dark:text-slate-600 mb-3">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <p className="text-slate-500">{t('stocks.noPortfolios')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('stocks.noPortfoliosHint')}</p>
          <button type="button" className="btn-primary mt-4" onClick={() => setShowPortfolioForm(true)}>
            {t('stocks.addPortfolio')}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {portfolios.map((portfolio) => {
            const totals = calcPortfolioTotals(portfolio.holdings);
            const isExpanded = expandedPortfolios.has(portfolio.id);

            return (
              <div key={portfolio.id} className="card relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 to-blue-500" />

                {/* Portfolio header */}
                <div className="flex items-start justify-between mb-4">
                  <button type="button" className="flex items-center gap-3 text-start" onClick={() => toggleExpanded(portfolio.id)}>
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <div>
                      <h3 className="font-semibold text-lg">{portfolio.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        {portfolio.broker && <span>{portfolio.broker}</span>}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          {portfolio.holdings.length} {t('stocks.holdings')}
                        </span>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-4">
                    {/* Portfolio value */}
                    <div className="text-end">
                      <p className="text-lg font-bold">{formatCurrency(totals.totalCurrent, locale, portfolio.currency)}</p>
                      <p className={`text-sm font-medium ${getPnlColor(totals.pnl)}`}>
                        {totals.pnl >= 0 ? '+' : ''}{formatCurrency(totals.pnl, locale, portfolio.currency)}
                        <span className="ms-1">({formatPercent(totals.pnlPercent)})</span>
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleRefreshPrices(portfolio.id)}
                        disabled={refreshingId === portfolio.id}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={t('stocks.refreshPrices')}
                      >
                        <svg
                          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          className={refreshingId === portfolio.id ? 'animate-spin' : ''}
                        >
                          <path d="M21 12a9 9 0 11-6.219-8.56" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => openAddHolding(portfolio.id)}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={t('stocks.addHolding')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePortfolio(portfolio.id)}
                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                        title={t('common.delete')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Holdings table */}
                {isExpanded && portfolio.holdings.length > 0 && (
                  <div className="overflow-x-auto -mx-4 px-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-start py-2 px-2 font-medium">{t('stocks.ticker')}</th>
                          <th className="text-start py-2 px-2 font-medium">{t('stocks.name')}</th>
                          <th className="text-end py-2 px-2 font-medium">{t('stocks.shares')}</th>
                          <th className="text-end py-2 px-2 font-medium">{t('stocks.buyPrice')}</th>
                          <th className="text-end py-2 px-2 font-medium">{t('stocks.currentPrice')}</th>
                          <th className="text-end py-2 px-2 font-medium">{t('stocks.value')}</th>
                          <th className="text-end py-2 px-2 font-medium">{t('stocks.pnl')}</th>
                          <th className="text-end py-2 px-2 font-medium">{t('stocks.pnlPercent')}</th>
                          <th className="py-2 px-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.holdings.map((h) => {
                          const currentPrice = h.currentPrice ?? h.avgBuyPrice;
                          const invested = h.shares * h.avgBuyPrice;
                          const currentValue = h.shares * currentPrice;
                          const pnl = currentValue - invested;
                          const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

                          return (
                            <tr
                              key={h.id}
                              className={`border-b border-[var(--border)] last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${getPnlBg(pnl)}`}
                            >
                              <td className="py-2.5 px-2">
                                <span className="font-bold text-primary-600 dark:text-primary-400">{h.ticker}</span>
                              </td>
                              <td className="py-2.5 px-2 text-slate-600 dark:text-slate-300 truncate max-w-[150px]">
                                {h.name}
                                {h.sector && <span className="block text-xs text-slate-400">{h.sector}</span>}
                              </td>
                              <td className="py-2.5 px-2 text-end font-medium">{h.shares}</td>
                              <td className="py-2.5 px-2 text-end text-slate-500">{h.avgBuyPrice.toFixed(2)}</td>
                              <td className="py-2.5 px-2 text-end font-medium">
                                {currentPrice.toFixed(2)}
                                {h.priceUpdatedAt && (
                                  <span className="block text-xs text-slate-400">
                                    {new Date(h.priceUpdatedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-2 text-end font-medium">
                                {formatCurrency(currentValue, locale, h.currency)}
                              </td>
                              <td className={`py-2.5 px-2 text-end font-bold ${getPnlColor(pnl)}`}>
                                {pnl >= 0 ? '+' : ''}{formatCurrency(pnl, locale, h.currency)}
                              </td>
                              <td className={`py-2.5 px-2 text-end font-bold ${getPnlColor(pnlPercent)}`}>
                                {formatPercent(pnlPercent)}
                              </td>
                              <td className="py-2.5 px-2">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHolding(portfolio.id, h.id)}
                                  className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {isExpanded && portfolio.holdings.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-slate-500">{t('stocks.noHoldings')}</p>
                    <button
                      type="button"
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline mt-1"
                      onClick={() => openAddHolding(portfolio.id)}
                    >
                      {t('stocks.addHolding')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Portfolio Modal ── */}
      {showPortfolioForm && (
        <div className="modal-overlay" onClick={() => setShowPortfolioForm(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">{t('stocks.addPortfolio')}</h3>
              <button type="button" onClick={() => setShowPortfolioForm(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSavePortfolio} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('stocks.portfolioName')}</label>
                <input className="input w-full" value={portfolioForm.name} onChange={(e) => setPortfolioForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.broker')}</label>
                  <input className="input w-full" value={portfolioForm.broker} onChange={(e) => setPortfolioForm((f) => ({ ...f, broker: e.target.value }))} placeholder={t('common.optional')} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.currency')}</label>
                  <select className="input w-full" value={portfolioForm.currency} onChange={(e) => setPortfolioForm((f) => ({ ...f, currency: e.target.value }))}>
                    <option value="ILS">ILS</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('stocks.notes')}</label>
                <textarea className="input w-full h-16 resize-none" value={portfolioForm.notes} onChange={(e) => setPortfolioForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={savingPortfolio}>
                {savingPortfolio ? t('common.loading') : t('common.save')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Holding Modal ── */}
      {showHoldingForm && (
        <div className="modal-overlay" onClick={() => setShowHoldingForm(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">{t('stocks.addHolding')}</h3>
              <button type="button" onClick={() => setShowHoldingForm(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveHolding} className="p-4 space-y-4">
              {/* Inline search */}
              <div className="relative">
                <label className="block text-sm font-medium mb-1">{t('stocks.searchStock')}</label>
                <input
                  className="input w-full"
                  placeholder={t('stocks.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {showSearchResults && searchResults.length > 0 && (
                  <div className="absolute z-50 inset-x-0 top-full mt-1 bg-[var(--card)] rounded-xl shadow-xl border border-[var(--border)] max-h-40 overflow-y-auto">
                    {searchResults.map((r) => (
                      <button
                        key={r.symbol}
                        type="button"
                        className="w-full text-start px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
                        onClick={() => selectSearchResult(r)}
                      >
                        <b>{r.symbol}</b> - {r.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.ticker')}</label>
                  <input className="input w-full" value={holdingForm.ticker} onChange={(e) => setHoldingForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.name')}</label>
                  <input className="input w-full" value={holdingForm.name} onChange={(e) => setHoldingForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.shares')}</label>
                  <input type="number" step="0.001" className="input w-full" value={holdingForm.shares} onChange={(e) => setHoldingForm((f) => ({ ...f, shares: e.target.value }))} placeholder="0" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.buyPrice')}</label>
                  <input type="number" step="0.01" className="input w-full" value={holdingForm.avgBuyPrice} onChange={(e) => setHoldingForm((f) => ({ ...f, avgBuyPrice: e.target.value }))} placeholder="0" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.currency')}</label>
                  <select className="input w-full" value={holdingForm.currency} onChange={(e) => setHoldingForm((f) => ({ ...f, currency: e.target.value }))}>
                    <option value="USD">USD</option>
                    <option value="ILS">ILS</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.buyDate')}</label>
                  <input type="date" className="input w-full" value={holdingForm.buyDate} onChange={(e) => setHoldingForm((f) => ({ ...f, buyDate: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.exchange')}</label>
                  <input className="input w-full" value={holdingForm.exchange} onChange={(e) => setHoldingForm((f) => ({ ...f, exchange: e.target.value }))} placeholder={t('common.optional')} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.sector')}</label>
                  <input className="input w-full" value={holdingForm.sector} onChange={(e) => setHoldingForm((f) => ({ ...f, sector: e.target.value }))} placeholder={t('common.optional')} />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={savingHolding}>
                {savingHolding ? t('common.loading') : t('common.save')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
