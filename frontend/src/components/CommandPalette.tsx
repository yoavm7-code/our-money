'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';
import { api } from '@/lib/api';

type SearchResults = {
  transactions: Array<{ id: string; date: string; description: string; amount: number; categoryName: string | null }>;
  accounts: Array<{ id: string; name: string; type: string; balance: string }>;
  categories: Array<{ id: string; name: string; slug: string; isIncome: boolean }>;
};

const PAGES = [
  { href: '/dashboard', key: 'nav.dashboard', icon: 'grid' },
  { href: '/transactions', key: 'nav.transactions', icon: 'list' },
  { href: '/upload', key: 'nav.uploadDocuments', icon: 'upload' },
  { href: '/income', key: 'nav.income', icon: 'trending-up' },
  { href: '/expenses', key: 'nav.expenses', icon: 'trending-down' },
  { href: '/loans-savings', key: 'nav.loansSavings', icon: 'banknotes' },
  { href: '/insurance-funds', key: 'nav.insuranceFunds', icon: 'shield' },
  { href: '/forex', key: 'nav.forex', icon: 'currency' },
  { href: '/goals', key: 'nav.goals', icon: 'target' },
  { href: '/budgets', key: 'nav.budgets', icon: 'wallet' },
  { href: '/recurring', key: 'nav.recurring', icon: 'repeat' },
  { href: '/insights', key: 'nav.insights', icon: 'sparkles' },
  { href: '/settings', key: 'nav.settings', icon: 'settings' },
];

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

export default function CommandPalette() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults(null);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api<SearchResults>('/api/dashboard/search', { params: { q } });
        setResults(data);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelectedIndex(0);
    search(value);
  }

  // Build flat list of all results for keyboard navigation
  const filteredPages = query.length > 0
    ? PAGES.filter((p) => t(p.key).toLowerCase().includes(query.toLowerCase()))
    : [];

  const allItems: Array<{ type: string; label: string; sublabel?: string; href: string }> = [];

  // Pages first
  for (const p of filteredPages) {
    allItems.push({ type: 'page', label: t(p.key), href: p.href });
  }

  // Then search results
  if (results) {
    for (const tx of results.transactions) {
      const amount = formatCurrency(tx.amount, locale);
      const date = new Date(tx.date).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { day: 'numeric', month: 'short' });
      allItems.push({
        type: 'transaction',
        label: tx.description,
        sublabel: `${amount} · ${date}${tx.categoryName ? ` · ${tx.categoryName}` : ''}`,
        href: `/transactions?search=${encodeURIComponent(tx.description)}`,
      });
    }
    for (const acc of results.accounts) {
      allItems.push({
        type: 'account',
        label: acc.name,
        sublabel: t(`accountType.${acc.type}`),
        href: '/settings',
      });
    }
    for (const cat of results.categories) {
      const catName = t(`categories.${cat.slug}`) !== `categories.${cat.slug}` ? t(`categories.${cat.slug}`) : cat.name;
      allItems.push({
        type: 'category',
        label: catName,
        sublabel: cat.isIncome ? t('settings.income') : t('transactionsPage.expense'),
        href: `/transactions?categoryId=${cat.id}`,
      });
    }
  }

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && allItems[selectedIndex]) {
      e.preventDefault();
      navigate(allItems[selectedIndex].href);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-flex px-2 py-0.5 rounded border border-[var(--border)] text-[10px] text-slate-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {query.length < 2 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              {t('search.hint')}
            </div>
          ) : loading && !results ? (
            <div className="px-4 py-6 text-center">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : allItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              {t('search.noResults')}
            </div>
          ) : (
            <>
              {/* Pages section */}
              {filteredPages.length > 0 && (
                <>
                  <div className="px-4 py-1 text-xs font-medium text-slate-400 uppercase">{t('search.pages')}</div>
                  {allItems.filter((i) => i.type === 'page').map((item, idx) => {
                    const globalIdx = allItems.indexOf(item);
                    return (
                      <button
                        key={`page-${idx}`}
                        type="button"
                        className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-start transition-colors ${
                          globalIdx === selectedIndex ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                        </svg>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Transactions section */}
              {results && results.transactions.length > 0 && (
                <>
                  <div className="px-4 py-1 mt-1 text-xs font-medium text-slate-400 uppercase">{t('search.transactions')}</div>
                  {allItems.filter((i) => i.type === 'transaction').map((item, idx) => {
                    const globalIdx = allItems.indexOf(item);
                    return (
                      <button
                        key={`tx-${idx}`}
                        type="button"
                        className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-start transition-colors ${
                          globalIdx === selectedIndex ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400">
                          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate">{item.label}</span>
                          <span className="block text-xs text-slate-400 truncate">{item.sublabel}</span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Accounts section */}
              {results && results.accounts.length > 0 && (
                <>
                  <div className="px-4 py-1 mt-1 text-xs font-medium text-slate-400 uppercase">{t('search.accounts')}</div>
                  {allItems.filter((i) => i.type === 'account').map((item, idx) => {
                    const globalIdx = allItems.indexOf(item);
                    return (
                      <button
                        key={`acc-${idx}`}
                        type="button"
                        className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-start transition-colors ${
                          globalIdx === selectedIndex ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400">
                          <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate">{item.label}</span>
                          <span className="block text-xs text-slate-400 truncate">{item.sublabel}</span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Categories section */}
              {results && results.categories.length > 0 && (
                <>
                  <div className="px-4 py-1 mt-1 text-xs font-medium text-slate-400 uppercase">{t('search.categories')}</div>
                  {allItems.filter((i) => i.type === 'category').map((item, idx) => {
                    const globalIdx = allItems.indexOf(item);
                    return (
                      <button
                        key={`cat-${idx}`}
                        type="button"
                        className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-start transition-colors ${
                          globalIdx === selectedIndex ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400">
                          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate">{item.label}</span>
                          <span className="block text-xs text-slate-400 truncate">{item.sublabel}</span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--border)] text-[10px] text-slate-400">
          <span><kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] font-mono">↑↓</kbd> {t('search.navigate')}</span>
          <span><kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] font-mono">↵</kbd> {t('search.select')}</span>
          <span><kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] font-mono">esc</kbd> {t('search.close')}</span>
        </div>
      </div>
    </div>
  );
}
