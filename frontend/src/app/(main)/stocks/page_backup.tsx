'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { stocks, type StockPortfolioItem, type StockHoldingItem, type StockProviderInfo, type StockQuote } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import VoiceInputButton from '@/components/VoiceInputButton';

/* ───── helpers ───── */

function fmtCurrency(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtPercent(value: number) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function fmtDate(iso: string | null, locale: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function gainColor(gain: number) {
  if (gain > 0) return 'text-green-600 dark:text-green-400';
  if (gain < 0) return 'text-red-600 dark:text-red-400';
  return '';
}

const POPULAR_TICKERS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'TEVA', name: 'Teva Pharma' },
];

/* ───── page component ───── */

export default function StocksPage() {
  const { t, locale } = useTranslation();

  /* ── data state ── */
  const [portfolios, setPortfolios] = useState<StockPortfolioItem[]>([]);
  const [provider, setProvider] = useState<StockProviderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  /* ── stock explorer ── */
  const [exploreQuery, setExploreQuery] = useState('');
  const [exploreResults, setExploreResults] = useState<Array<{ symbol: string; description: string; type: string }>>([]);
  const [exploreSearching, setExploreSearching] = useState(false);
  const exploreTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedStock, setSelectedStock] = useState<{ symbol: string; name: string } | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<StockQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [trackingStock, setTrackingStock] = useState(false);
  const [trackSuccess, setTrackSuccess] = useState(false);

  /* ── portfolio modal ── */
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<StockPortfolioItem | null>(null);
  const [portfolioForm, setPortfolioForm] = useState({
    name: '', broker: '', accountNum: '', currency: 'ILS', notes: '',
  });
  const [savingPortfolio, setSavingPortfolio] = useState(false);

  /* ── holding modal ── */
  const [showHoldingModal, setShowHoldingModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<StockHoldingItem | null>(null);
  const [holdingPortfolioId, setHoldingPortfolioId] = useState<string>('');
  const [holdingForm, setHoldingForm] = useState({
    ticker: '', name: '', exchange: '', sector: '',
    shares: '', avgBuyPrice: '', currency: 'USD', buyDate: '', notes: '',
  });
  const [savingHolding, setSavingHolding] = useState(false);

  /* ── ticker search (inside holding modal) ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; description: string; type: string }>>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ───── data loading ───── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [portfolioList, providerInfo] = await Promise.all([
        stocks.portfolios.list(),
        stocks.provider().catch(() => null),
      ]);
      setPortfolios(portfolioList);
      setProvider(providerInfo);
    } catch {
      setError(t('common.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ───── stock explorer search ───── */

  const handleExploreSearch = (q: string) => {
    setExploreQuery(q);
    if (exploreTimeout.current) clearTimeout(exploreTimeout.current);
    if (q.length < 1) {
      setExploreResults([]);
      return;
    }
    exploreTimeout.current = setTimeout(async () => {
      setExploreSearching(true);
      try {
        const results = await stocks.search(q);
        setExploreResults(results);
      } catch {
        setExploreResults([]);
      } finally {
        setExploreSearching(false);
      }
    }, 400);
  };

  const handleSelectStock = async (symbol: string, name: string) => {
    setSelectedStock({ symbol, name });
    setExploreQuery('');
    setExploreResults([]);
    setLoadingQuote(true);
    setSelectedQuote(null);
    try {
      const quote = await stocks.quote(symbol);
      setSelectedQuote(quote);
    } catch {
      setSelectedQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleTrackStock = async () => {
    if (!selectedStock || trackingStock) return;
    setTrackingStock(true);
    setTrackSuccess(false);

    try {
      let targetPortfolioId = portfolios[0]?.id;

      // Auto-create default portfolio if none exists
      if (!targetPortfolioId) {
        const newPortfolio = await stocks.portfolios.create({
          name: t('stocks.defaultPortfolioName'),
          currency: 'USD',
        });
        targetPortfolioId = newPortfolio.id;
        setPortfolios([{ ...newPortfolio, holdings: [] }]);
      }

      // Directly add holding with sensible defaults
      const newHolding = await stocks.holdings.add(targetPortfolioId, {
        ticker: selectedStock.symbol,
        name: selectedStock.name,
        shares: 1,
        avgBuyPrice: selectedQuote?.price ?? 0,
        currency: 'USD',
        buyDate: new Date().toISOString().slice(0, 10),
      });

      // Dynamically update portfolios state without refetching
      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === targetPortfolioId
            ? { ...p, holdings: [...(p.holdings || []), newHolding] }
            : p,
        ),
      );

      setTrackSuccess(true);

      // Clear after brief success animation
      setTimeout(() => {
        setSelectedStock(null);
        setSelectedQuote(null);
        setTrackSuccess(false);
      }, 1500);
    } catch {
      setError(t('common.somethingWentWrong'));
    } finally {
      setTrackingStock(false);
    }
  };

  /* ───── refresh prices ───── */

  const handleRefreshPrices = async (portfolioId: string) => {
    setRefreshingId(portfolioId);
    try {
      const updated = await stocks.portfolios.refreshPrices(portfolioId);
      setPortfolios((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
    } catch {
      setError(t('common.somethingWentWrong'));
    } finally {
      setRefreshingId(null);
    }
  };

  /* ───── portfolio CRUD ───── */

  const openAddPortfolio = () => {
    setEditingPortfolio(null);
    setPortfolioForm({ name: '', broker: '', accountNum: '', currency: 'ILS', notes: '' });
    setShowPortfolioModal(true);
  };

  const openEditPortfolio = (p: StockPortfolioItem) => {
    setEditingPortfolio(p);
    setPortfolioForm({
      name: p.name,
      broker: p.broker || '',
      accountNum: p.accountNum || '',
      currency: p.currency,
      notes: p.notes || '',
    });
    setShowPortfolioModal(true);
  };

  const handleSavePortfolio = async () => {
    if (!portfolioForm.name.trim()) return;
    setSavingPortfolio(true);
    try {
      const body = {
        name: portfolioForm.name.trim(),
        broker: portfolioForm.broker || undefined,
        accountNum: portfolioForm.accountNum || undefined,
        currency: portfolioForm.currency || undefined,
        notes: portfolioForm.notes || undefined,
      };
      if (editingPortfolio) {
        await stocks.portfolios.update(editingPortfolio.id, body);
        // Update local state dynamically
        setPortfolios((prev) =>
          prev.map((p) =>
            p.id === editingPortfolio.id
              ? {
                  ...p,
                  name: body.name,
                  broker: body.broker ?? p.broker,
                  accountNum: body.accountNum ?? p.accountNum,
                  currency: body.currency ?? p.currency,
                  notes: body.notes ?? p.notes,
                }
              : p,
          ),
        );
      } else {
        const newPortfolio = await stocks.portfolios.create(body);
        // Add to local state dynamically
        setPortfolios((prev) => [...prev, { ...newPortfolio, holdings: newPortfolio.holdings || [] }]);
      }
      setShowPortfolioModal(false);
    } catch {
      setError(t('common.somethingWentWrong'));
    } finally {
      setSavingPortfolio(false);
    }
  };

  const handleDeletePortfolio = async (id: string) => {
    if (!confirm(t('common.confirm'))) return;
    try {
      await stocks.portfolios.delete(id);
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError(t('common.somethingWentWrong'));
    }
  };

  /* ───── holding CRUD ───── */

  const openAddHolding = (portfolioId: string) => {
    setEditingHolding(null);
    setHoldingPortfolioId(portfolioId);
    setHoldingForm({ ticker: '', name: '', exchange: '', sector: '', shares: '', avgBuyPrice: '', currency: 'USD', buyDate: '', notes: '' });
    setSearchQuery('');
    setSearchResults([]);
    setShowHoldingModal(true);
  };

  const openEditHolding = (h: StockHoldingItem) => {
    setEditingHolding(h);
    setHoldingPortfolioId(h.portfolioId);
    setHoldingForm({
      ticker: h.ticker,
      name: h.name,
      exchange: h.exchange || '',
      sector: h.sector || '',
      shares: String(h.shares),
      avgBuyPrice: String(h.avgBuyPrice),
      currency: h.currency,
      buyDate: h.buyDate ? h.buyDate.slice(0, 10) : '',
      notes: h.notes || '',
    });
    setSearchQuery('');
    setSearchResults([]);
    setShowHoldingModal(true);
  };

  const handleSaveHolding = async () => {
    if (!holdingForm.ticker.trim() || !holdingForm.name.trim() || !holdingForm.shares || !holdingForm.avgBuyPrice) return;
    setSavingHolding(true);
    try {
      const body = {
        ticker: holdingForm.ticker.trim(),
        name: holdingForm.name.trim(),
        exchange: holdingForm.exchange || undefined,
        sector: holdingForm.sector || undefined,
        shares: parseFloat(holdingForm.shares) || 0,
        avgBuyPrice: parseFloat(holdingForm.avgBuyPrice) || 0,
        currency: holdingForm.currency || undefined,
        buyDate: holdingForm.buyDate || undefined,
        notes: holdingForm.notes || undefined,
      };
      if (editingHolding) {
        await stocks.holdings.update(holdingPortfolioId, editingHolding.id, body);
        // Update the holding in local state
        setPortfolios((prev) =>
          prev.map((p) =>
            p.id === holdingPortfolioId
              ? {
                  ...p,
                  holdings: p.holdings.map((h) =>
                    h.id === editingHolding.id
                      ? {
                          ...h,
                          ticker: body.ticker,
                          name: body.name,
                          exchange: body.exchange ?? h.exchange,
                          sector: body.sector ?? h.sector,
                          shares: body.shares,
                          avgBuyPrice: body.avgBuyPrice,
                          currency: body.currency ?? h.currency,
                          buyDate: body.buyDate ?? h.buyDate,
                          notes: body.notes ?? h.notes,
                        }
                      : h,
                  ),
                }
              : p,
          ),
        );
      } else {
        const newHolding = await stocks.holdings.add(holdingPortfolioId, body);
        // Add to local state dynamically
        setPortfolios((prev) =>
          prev.map((p) =>
            p.id === holdingPortfolioId
              ? { ...p, holdings: [...(p.holdings || []), newHolding] }
              : p,
          ),
        );
      }
      setShowHoldingModal(false);
      setSelectedStock(null);
      setSelectedQuote(null);
    } catch {
      setError(t('common.somethingWentWrong'));
    } finally {
      setSavingHolding(false);
    }
  };

  const handleDeleteHolding = async (portfolioId: string, holdingId: string) => {
    if (!confirm(t('common.confirm'))) return;
    try {
      await stocks.holdings.delete(portfolioId, holdingId);
      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === portfolioId
            ? { ...p, holdings: p.holdings.filter((h) => h.id !== holdingId) }
            : p,
        ),
      );
    } catch {
      setError(t('common.somethingWentWrong'));
    }
  };

  /* ───── ticker search (inside holding modal) ───── */

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await stocks.search(q);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const selectSearchResult = (result: { symbol: string; description: string }) => {
    setHoldingForm((f) => ({
      ...f,
      ticker: result.symbol,
      name: result.description,
    }));
    setSearchQuery('');
    setSearchResults([]);
  };

  /* ───── summary calculations ───── */

  const allHoldings = portfolios.flatMap((p) => (p.holdings || []).filter((h) => h.isActive));

  const totalPortfolioValue = allHoldings.reduce((sum, h) => {
    const price = h.currentPrice ?? h.avgBuyPrice;
    return sum + h.shares * price;
  }, 0);

  const totalCost = allHoldings.reduce((sum, h) => sum + h.shares * h.avgBuyPrice, 0);
  const totalGainLoss = totalPortfolioValue - totalCost;
  const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

  const hasApiKey = provider?.hasApiKey ?? false;

  /* ───── loading state ───── */

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
          <h1 className="text-2xl font-bold">{t('stocks.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('stocks.description')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={openAddPortfolio}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {t('stocks.addPortfolio')}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
          <button type="button" className="ms-2 underline" onClick={() => setError('')}>{t('common.close')}</button>
        </div>
      )}

      {/* ── Stock Explorer ── */}
      <div className="card bg-gradient-to-br from-primary-50/50 to-blue-50/50 dark:from-primary-900/10 dark:to-blue-900/10 border-primary-200 dark:border-primary-800">
        <div className="flex items-center gap-2 mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-500 shrink-0"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <h2 className="font-semibold">{t('stocks.exploreTitle')}</h2>
        </div>
        <p className="text-sm text-slate-500 mb-3">{t('stocks.exploreDesc')}</p>

        {/* Search input */}
        {hasApiKey ? (
          <div className="relative">
            <input
              className="input text-base py-3 ps-10"
              value={exploreQuery}
              onChange={(e) => handleExploreSearch(e.target.value)}
              placeholder={t('stocks.explorePlaceholder')}
            />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            {exploreSearching && (
              <div className="absolute end-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            )}

            {/* Search results dropdown */}
            {exploreResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {exploreResults.map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    className="w-full text-start px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm flex items-center justify-between border-b border-[var(--border)] last:border-0"
                    onClick={() => handleSelectStock(r.symbol, r.description)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-primary-600 dark:text-primary-400 font-mono">{r.symbol}</span>
                      <span className="text-slate-700 dark:text-slate-300">{r.description}</span>
                    </div>
                    <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{r.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
            {t('stocks.providerNoKey')}
          </div>
        )}

        {/* Popular stocks chips */}
        {hasApiKey && !selectedStock && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-slate-400">{t('stocks.popularStocks')}:</span>
            {POPULAR_TICKERS.map((s) => (
              <button
                key={s.symbol}
                type="button"
                onClick={() => handleSelectStock(s.symbol, s.name)}
                className="text-xs px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-[var(--border)] hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors font-medium"
              >
                {s.symbol}
              </button>
            ))}
          </div>
        )}

        {/* Selected stock preview card */}
        {selectedStock && (
          <div className="mt-4 p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-[var(--border)] animate-fadeIn">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-bold font-mono text-primary-600 dark:text-primary-400">{selectedStock.symbol}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedStock(null); setSelectedQuote(null); }}
                    className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{selectedStock.name}</p>
              </div>

              {loadingQuote ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                  {t('stocks.loadingPrice')}
                </div>
              ) : selectedQuote ? (
                <div className="text-end">
                  <p className="text-2xl font-bold font-mono">${selectedQuote.price.toFixed(2)}</p>
                  <p className={`text-sm font-medium ${gainColor(selectedQuote.change)}`}>
                    {selectedQuote.change >= 0 ? '+' : ''}{selectedQuote.change.toFixed(2)} ({fmtPercent(selectedQuote.changePercent)})
                  </p>
                  <div className="flex gap-3 mt-1 text-xs text-slate-400">
                    <span>{t('stocks.dayHigh')}: ${selectedQuote.high.toFixed(2)}</span>
                    <span>{t('stocks.dayLow')}: ${selectedQuote.low.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-slate-400">{t('stocks.priceUnavailable')}</span>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleTrackStock}
                disabled={trackingStock || trackSuccess}
                className={`text-sm flex-1 ${trackSuccess ? 'btn-primary bg-green-500 hover:bg-green-500 border-green-500' : 'btn-primary'}`}
              >
                {trackSuccess ? (
                  <span className="flex items-center justify-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    {t('stocks.stockAdded')}
                  </span>
                ) : trackingStock ? (
                  <span className="flex items-center justify-center gap-1">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t('stocks.adding')}
                  </span>
                ) : (
                  <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    {t('stocks.trackStock')}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedStock(null); setSelectedQuote(null); setTrackSuccess(false); }}
                className="btn-secondary text-sm"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Provider banner ── */}
      {provider && (
        <div className="card flex flex-wrap items-center justify-between gap-3 bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500 shrink-0"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" /></svg>
            <span>
              {t('stocks.providerPoweredBy')}{' '}
              <a href={provider.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                {provider.name}
              </a>
            </span>
            {!provider.hasApiKey && (
              <span className="text-amber-600 dark:text-amber-400 text-xs font-medium ms-2">
                ({t('stocks.providerNoKey')})
              </span>
            )}
          </div>
          {provider.description && (
            <span className="text-xs text-slate-500">{provider.description}</span>
          )}
        </div>
      )}

      {/* ── Summary cards ── */}
      {allHoldings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="text-sm text-slate-500">{t('stocks.totalValue')}</p>
            <p className="text-2xl font-bold mt-1">
              {fmtCurrency(totalPortfolioValue, 'ILS', locale)}
            </p>
          </div>
          <div className="card text-center">
            <p className="text-sm text-slate-500">{t('stocks.gainLoss')}</p>
            <p className={`text-2xl font-bold mt-1 ${gainColor(totalGainLoss)}`}>
              {fmtCurrency(totalGainLoss, 'ILS', locale)}
              <span className="text-sm font-medium ms-1">({fmtPercent(totalGainLossPercent)})</span>
            </p>
          </div>
          <div className="card text-center">
            <p className="text-sm text-slate-500">{t('stocks.summaryCount')}</p>
            <p className="text-2xl font-bold mt-1">{allHoldings.length}</p>
          </div>
        </div>
      )}

      {/* ── Portfolio cards ── */}
      {portfolios.length > 0 && (
        <div className="space-y-6">
          {portfolios.map((portfolio) => {
            const activeHoldings = (portfolio.holdings || []).filter((h) => h.isActive);
            const portfolioValue = activeHoldings.reduce((sum, h) => {
              const price = h.currentPrice ?? h.avgBuyPrice;
              return sum + h.shares * price;
            }, 0);
            const portfolioCost = activeHoldings.reduce((sum, h) => sum + h.shares * h.avgBuyPrice, 0);
            const portfolioGain = portfolioValue - portfolioCost;
            const portfolioGainPct = portfolioCost > 0 ? (portfolioGain / portfolioCost) * 100 : 0;
            const isRefreshing = refreshingId === portfolio.id;

            return (
              <div key={portfolio.id} className="card p-0 overflow-hidden">
                {/* portfolio header */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-[var(--border)]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-lg truncate">{portfolio.name}</h2>
                      <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-500">
                        {portfolio.currency}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 mt-1">
                      {portfolio.broker && <span>{t('stocks.broker')}: {portfolio.broker}</span>}
                      {portfolio.accountNum && <span>{t('stocks.accountNum')}: {portfolio.accountNum}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {activeHoldings.length > 0 && (
                      <div className="text-end">
                        <p className="text-sm font-bold">{fmtCurrency(portfolioValue, portfolio.currency, locale)}</p>
                        <p className={`text-xs font-medium ${gainColor(portfolioGain)}`}>
                          {fmtCurrency(portfolioGain, portfolio.currency, locale)} ({fmtPercent(portfolioGainPct)})
                        </p>
                      </div>
                    )}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleRefreshPrices(portfolio.id)}
                        disabled={isRefreshing}
                        className="btn-secondary text-xs px-3 py-1.5"
                        title={t('stocks.refreshPrices')}
                      >
                        {isRefreshing ? (
                          <span className="flex items-center gap-1">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                            {t('stocks.refreshing')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" /></svg>
                            {t('stocks.refreshPrices')}
                          </span>
                        )}
                      </button>
                      <button type="button" onClick={() => openEditPortfolio(portfolio)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t('stocks.editPortfolio')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                      </button>
                      <button type="button" onClick={() => handleDeletePortfolio(portfolio.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors" title={t('common.delete')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* holdings table */}
                {activeHoldings.length === 0 ? (
                  <div className="text-center py-8 px-5">
                    <p className="text-sm text-slate-400 mb-3">{t('stocks.noHoldings')}</p>
                    <button type="button" className="btn-primary text-sm" onClick={() => openAddHolding(portfolio.id)}>
                      {t('stocks.addHolding')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-slate-50/50 dark:bg-slate-800/30">
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.ticker')}</th>
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.companyName')}</th>
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.exchange')}</th>
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.sector')}</th>
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.shares')}</th>
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.avgBuyPrice')}</th>
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.currentPrice')}</th>
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.totalValue')}</th>
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.gainLoss')}</th>
                            <th className="text-start py-2.5 px-4 font-medium">{t('stocks.lastUpdate')}</th>
                            <th className="py-2.5 px-4"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeHoldings.map((h) => {
                            const currentPrice = h.currentPrice ?? h.avgBuyPrice;
                            const holdingValue = h.shares * currentPrice;
                            const holdingCost = h.shares * h.avgBuyPrice;
                            const gain = holdingValue - holdingCost;
                            const gainPct = holdingCost > 0 ? (gain / holdingCost) * 100 : 0;
                            const priceGain = currentPrice - h.avgBuyPrice;

                            return (
                              <tr key={h.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="py-2.5 px-4">
                                  <span className={`font-bold ${h.currentPrice !== null ? (priceGain >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400') : 'text-primary-600 dark:text-primary-400'}`}>
                                    {h.ticker}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 max-w-[180px] truncate">{h.name}</td>
                                <td className="py-2.5 px-4 text-slate-500 text-xs">{h.exchange || '-'}</td>
                                <td className="py-2.5 px-4 text-slate-500 text-xs">{h.sector || '-'}</td>
                                <td className="py-2.5 px-4 font-mono">{h.shares}</td>
                                <td className="py-2.5 px-4 font-mono">{fmtCurrency(h.avgBuyPrice, h.currency, locale)}</td>
                                <td className={`py-2.5 px-4 font-mono font-medium ${gainColor(priceGain)}`}>
                                  {h.currentPrice !== null
                                    ? fmtCurrency(h.currentPrice, h.currency, locale)
                                    : <span className="text-slate-400">-</span>
                                  }
                                </td>
                                <td className="py-2.5 px-4 font-mono font-medium">{fmtCurrency(holdingValue, h.currency, locale)}</td>
                                <td className={`py-2.5 px-4 ${gainColor(gain)}`}>
                                  <div className="font-mono font-medium">{fmtCurrency(gain, h.currency, locale)}</div>
                                  <div className="text-xs">{fmtPercent(gainPct)}</div>
                                </td>
                                <td className="py-2.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                                  {fmtDate(h.priceUpdatedAt, locale)}
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="flex gap-1">
                                    <button type="button" onClick={() => openEditHolding(h)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title={t('stocks.editHolding')}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                                    </button>
                                    <button type="button" onClick={() => handleDeleteHolding(portfolio.id, h.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title={t('common.delete')}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* add holding button at bottom */}
                    <div className="p-4 border-t border-[var(--border)]">
                      <button type="button" className="btn-secondary text-sm" onClick={() => openAddHolding(portfolio.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        {t('stocks.addHolding')}
                      </button>
                    </div>
                  </>
                )}

                {/* portfolio notes */}
                {portfolio.notes && (
                  <div className="px-5 pb-4">
                    <p className="text-xs text-slate-500 italic">{portfolio.notes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state (no portfolios at all) ── */}
      {portfolios.length === 0 && (
        <div className="card text-center py-10">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-300 dark:text-slate-600 mb-4"><path d="M3 3v18h18" /><path d="M7 16l4-8 4 5 5-9" /></svg>
          <p className="text-slate-500 mb-2">{t('stocks.noPortfolios')}</p>
          <p className="text-sm text-slate-400 mb-4">{t('stocks.noPortfoliosHint')}</p>
          <button type="button" className="btn-primary" onClick={openAddPortfolio}>
            {t('stocks.addPortfolio')}
          </button>
        </div>
      )}

      {/* ══════════ Portfolio Modal ══════════ */}
      {showPortfolioModal && (
        <div className="modal-overlay" onClick={() => setShowPortfolioModal(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">
                {editingPortfolio ? t('stocks.editPortfolio') : t('stocks.addPortfolio')}
              </h3>
              <button type="button" onClick={() => setShowPortfolioModal(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('stocks.portfolioName')}</label>
                <div className="relative flex items-center">
                  <input
                    className="input pe-9"
                    value={portfolioForm.name}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, name: e.target.value })}
                    placeholder={t('stocks.portfolioName')}
                  />
                  <div className="absolute end-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => setPortfolioForm((f) => ({ ...f, name: text }))} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.broker')}</label>
                  <input
                    className="input"
                    value={portfolioForm.broker}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, broker: e.target.value })}
                    placeholder={t('common.optional')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.accountNum')}</label>
                  <input
                    className="input"
                    value={portfolioForm.accountNum}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, accountNum: e.target.value })}
                    placeholder={t('common.optional')}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('stocks.currency')}</label>
                <select
                  className="input"
                  value={portfolioForm.currency}
                  onChange={(e) => setPortfolioForm({ ...portfolioForm, currency: e.target.value })}
                >
                  <option value="ILS">ILS</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('stocks.notes')}</label>
                <div className="relative">
                  <textarea
                    className="input h-20 resize-none pe-9"
                    value={portfolioForm.notes}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, notes: e.target.value })}
                    placeholder={t('common.optional')}
                  />
                  <div className="absolute end-2 top-2">
                    <VoiceInputButton onResult={(text) => setPortfolioForm((f) => ({ ...f, notes: f.notes ? f.notes + ' ' + text : text }))} />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPortfolioModal(false)} className="btn-secondary flex-1">
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSavePortfolio}
                  disabled={!portfolioForm.name.trim() || savingPortfolio}
                  className="btn-primary flex-1"
                >
                  {savingPortfolio ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ Holding Modal ══════════ */}
      {showHoldingModal && (
        <div className="modal-overlay" onClick={() => setShowHoldingModal(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">
                {editingHolding ? t('stocks.editHolding') : t('stocks.addHolding')}
              </h3>
              <button type="button" onClick={() => setShowHoldingModal(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Ticker search */}
              {!editingHolding && (
                <div className="relative">
                  <label className="block text-sm font-medium mb-1">{t('stocks.searchTicker')}</label>
                  <input
                    className="input"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder={t('stocks.searchTicker')}
                  />
                  {searching && (
                    <div className="absolute end-3 top-[2.2rem]">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                    </div>
                  )}
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {searchResults.map((r) => (
                        <button
                          key={r.symbol}
                          type="button"
                          className="w-full text-start px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm flex items-center justify-between"
                          onClick={() => selectSearchResult(r)}
                        >
                          <div>
                            <span className="font-bold text-primary-600 dark:text-primary-400">{r.symbol}</span>
                            <span className="text-slate-500 ms-2">{r.description}</span>
                          </div>
                          <span className="text-xs text-slate-400">{r.type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Ticker & Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.ticker')}</label>
                  <input
                    className="input font-mono"
                    value={holdingForm.ticker}
                    onChange={(e) => setHoldingForm({ ...holdingForm, ticker: e.target.value.toUpperCase() })}
                    placeholder="AAPL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.companyName')}</label>
                  <div className="relative flex items-center">
                    <input
                      className="input pe-9"
                      value={holdingForm.name}
                      onChange={(e) => setHoldingForm({ ...holdingForm, name: e.target.value })}
                      placeholder={t('stocks.companyName')}
                    />
                    <div className="absolute end-2 top-1/2 -translate-y-1/2">
                      <VoiceInputButton onResult={(text) => setHoldingForm((f) => ({ ...f, name: text }))} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Exchange & Sector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.exchange')}</label>
                  <input
                    className="input"
                    value={holdingForm.exchange}
                    onChange={(e) => setHoldingForm({ ...holdingForm, exchange: e.target.value })}
                    placeholder={t('common.optional')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.sector')}</label>
                  <input
                    className="input"
                    value={holdingForm.sector}
                    onChange={(e) => setHoldingForm({ ...holdingForm, sector: e.target.value })}
                    placeholder={t('common.optional')}
                  />
                </div>
              </div>

              {/* Shares & Avg Buy Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.shares')}</label>
                  <input
                    type="number"
                    step="any"
                    className="input"
                    value={holdingForm.shares}
                    onChange={(e) => setHoldingForm({ ...holdingForm, shares: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.avgBuyPrice')}</label>
                  <input
                    type="number"
                    step="any"
                    className="input"
                    value={holdingForm.avgBuyPrice}
                    onChange={(e) => setHoldingForm({ ...holdingForm, avgBuyPrice: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Currency & Buy Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.currency')}</label>
                  <select
                    className="input"
                    value={holdingForm.currency}
                    onChange={(e) => setHoldingForm({ ...holdingForm, currency: e.target.value })}
                  >
                    <option value="ILS">ILS</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.buyDate')}</label>
                  <input
                    type="date"
                    className="input"
                    value={holdingForm.buyDate}
                    onChange={(e) => setHoldingForm({ ...holdingForm, buyDate: e.target.value })}
                  />
                </div>
              </div>

              {/* Portfolio selector (when multiple portfolios exist) */}
              {portfolios.length > 1 && (
                <div>
                  <label className="block text-sm font-medium mb-1">{t('stocks.targetPortfolio')}</label>
                  <select
                    className="input"
                    value={holdingPortfolioId}
                    onChange={(e) => setHoldingPortfolioId(e.target.value)}
                  >
                    {portfolios.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('stocks.notes')}</label>
                <div className="relative">
                  <textarea
                    className="input h-20 resize-none pe-9"
                    value={holdingForm.notes}
                    onChange={(e) => setHoldingForm({ ...holdingForm, notes: e.target.value })}
                    placeholder={t('common.optional')}
                  />
                  <div className="absolute end-2 top-2">
                    <VoiceInputButton onResult={(text) => setHoldingForm((f) => ({ ...f, notes: f.notes ? f.notes + ' ' + text : text }))} />
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowHoldingModal(false)} className="btn-secondary flex-1">
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveHolding}
                  disabled={!holdingForm.ticker.trim() || !holdingForm.name.trim() || !holdingForm.shares || !holdingForm.avgBuyPrice || savingHolding}
                  className="btn-primary flex-1"
                >
                  {savingHolding ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
