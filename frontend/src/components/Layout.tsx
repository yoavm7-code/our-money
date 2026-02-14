'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';
import { users } from '@/lib/api';
import TipsPanel from '@/components/TipsPanel';
import AvatarCropper from '@/components/AvatarCropper';
import CommandPalette from '@/components/CommandPalette';
import { useTheme } from '@/components/ThemeProvider';
import AlertsBell from '@/components/AlertsBell';
import OnboardingProvider, { useOnboarding } from '@/components/OnboardingProvider';
import QuickAdd from '@/components/QuickAdd';
import VoiceTransaction from '@/components/VoiceTransaction';

type NavItem = { href: string; key: string; icon: string };

const topNavItems: NavItem[] = [
  { href: '/dashboard', key: 'nav.dashboard', icon: 'grid' },
  { href: '/transactions', key: 'nav.transactions', icon: 'list' },
  { href: '/upload', key: 'nav.uploadDocuments', icon: 'upload' },
];

const navGroups: { id: string; labelKey: string; items: NavItem[] }[] = [
  {
    id: 'planning',
    labelKey: 'nav.planning',
    items: [
      { href: '/goals', key: 'nav.goals', icon: 'target' },
      { href: '/budgets', key: 'nav.budgets', icon: 'wallet' },
      { href: '/recurring', key: 'nav.recurring', icon: 'repeat' },
    ],
  },
  {
    id: 'assets',
    labelKey: 'nav.assets',
    items: [
      { href: '/loans-savings', key: 'nav.loansSavings', icon: 'banknotes' },
      { href: '/mortgages', key: 'nav.mortgages', icon: 'home' },
      { href: '/stocks', key: 'nav.stocks', icon: 'bar-chart' },
      { href: '/insurance-funds', key: 'nav.insuranceFunds', icon: 'shield' },
      { href: '/forex', key: 'nav.forex', icon: 'currency' },
    ],
  },
  {
    id: 'analysis',
    labelKey: 'nav.analysis',
    items: [
      { href: '/insights', key: 'nav.insights', icon: 'sparkles' },
      { href: '/reports', key: 'nav.reports', icon: 'file-text' },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { href: '/settings', key: 'nav.settings', icon: 'settings' },
];

function NavIcon({ name, className }: { name: string; className?: string }) {
  const cn = className || 'w-5 h-5';
  switch (name) {
    case 'grid':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case 'list':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
    case 'upload':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    case 'trending-up':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
    case 'trending-down':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>;
    case 'banknotes':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>;
    case 'shield':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case 'currency':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
    case 'target':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
    case 'wallet':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 14h.01"/><path d="M2 10h20"/></svg>;
    case 'repeat':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>;
    case 'sparkles':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z"/></svg>;
    case 'file-text':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
    case 'home':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case 'bar-chart':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>;
    case 'settings':
      return <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
    default:
      return null;
  }
}

function StartTourButton() {
  const { t } = useTranslation();
  const { startTour } = useOnboarding();
  return (
    <button
      type="button"
      onClick={startTour}
      className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm text-[#a0a3bd] hover:bg-white/5 hover:text-white transition-all duration-150"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>{t('onboarding.startTour')}</span>
    </button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['planning', 'assets', 'analysis']));
  const toggleGroup = (g: string) => setOpenGroups(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const [userInfo, setUserInfo] = useState<{ name: string | null; email: string; avatarUrl?: string | null } | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarCropFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  }, []);

  const handleAvatarCrop = useCallback(async (blob: Blob) => {
    setAvatarCropFile(null);
    setAvatarUploading(true);
    try {
      const file = new File([blob], 'avatar.png', { type: 'image/png' });
      const result = await users.uploadAvatar(file);
      setUserInfo((prev) => prev ? { ...prev, avatarUrl: result.avatarUrl } : prev);
      setProfileMenuOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setAvatarUploading(false);
    }
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token) { router.replace('/login'); return; }
    users.me().then((u) => setUserInfo({ name: u.name, email: u.email, avatarUrl: (u as { avatarUrl?: string }).avatarUrl })).catch(() => {});
  }, [router]);

  // Listen for avatar changes from settings page
  useEffect(() => {
    function onAvatarChanged(e: Event) {
      const detail = (e as CustomEvent).detail as { avatarUrl: string | null };
      setUserInfo((prev) => prev ? { ...prev, avatarUrl: detail.avatarUrl } : prev);
    }
    window.addEventListener('avatar-changed', onAvatarChanged);
    return () => window.removeEventListener('avatar-changed', onAvatarChanged);
  }, []);

  function logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      router.push('/login');
    }
  }

  const toggleLocale = () => setLocale(locale === 'he' ? 'en' : 'he');

  const userInitial = userInfo?.name?.charAt(0)?.toUpperCase() || userInfo?.email?.charAt(0)?.toUpperCase() || '?';
  const userDisplayName = userInfo?.name || userInfo?.email?.split('@')[0] || '';

  const sidebarContent = (
    <>
      {/* Logo / brand */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <Link href="/dashboard" className="text-lg font-bold text-white tracking-tight">
          {t('common.appName')}
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLocale}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-white/15 text-[#a0a3bd] hover:text-white hover:border-white/25 transition-colors hidden md:inline-flex"
            title={locale === 'he' ? 'English' : 'עברית'}
          >
            {locale === 'he' ? 'EN' : 'HE'}
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg text-[#a0a3bd] hover:text-white hover:bg-white/10 transition-colors md:hidden"
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* User profile section */}
      {userInfo && (
        <div className="relative px-3 pt-4 pb-2">
          <button
            type="button"
            onClick={() => setProfileMenuOpen((o) => !o)}
            className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm hover:bg-white/8 transition-colors"
          >
            {userInfo.avatarUrl ? (
              <img
                src={userInfo.avatarUrl}
                alt=""
                className="w-9 h-9 rounded-full object-cover ring-2 ring-teal-500/50"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-teal-500/50">
                {userInitial}
              </div>
            )}
            <div className="flex-1 min-w-0 text-start">
              <p className="font-medium truncate text-sm text-white">{userDisplayName}</p>
              <p className="text-xs text-[#a0a3bd] truncate">{userInfo.email}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 text-[#a0a3bd] transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {profileMenuOpen && (
            <div className="mt-1 rounded-xl bg-[#252540] border border-white/10 shadow-lg overflow-hidden animate-fadeIn">
              <Link
                href="/settings"
                onClick={() => setProfileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#a0a3bd] hover:text-white hover:bg-white/8 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>{t('profile.editProfile')}</span>
              </Link>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#a0a3bd] hover:text-white hover:bg-white/8 transition-colors w-full text-start"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span>{avatarUploading ? '...' : t('profile.uploadAvatar')}</span>
                <span className="text-xs text-[#6b6d85] ms-auto">{t('profile.avatarMaxSize')}</span>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarFileSelect}
              />
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {/* Top-level items */}
        {topNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-teal-500/15 text-teal-400'
                  : 'text-[#a0a3bd] hover:bg-white/5 hover:text-white'
              }`}
            >
              <NavIcon name={item.icon} />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}

        {/* Quick Add button */}
        <button
          type="button"
          onClick={() => setShowQuickAdd(true)}
          className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium text-teal-400 hover:bg-teal-500/15 transition-all duration-150 mt-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span>{t('quickAdd.title')}</span>
        </button>

        {/* Collapsible groups */}
        {navGroups.map((group) => (
          <div key={group.id}>
            <div
              onClick={() => toggleGroup(group.id)}
              className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-400 mt-4"
            >
              <span>{t(group.labelKey)}</span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${openGroups.has(group.id) ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {openGroups.has(group.id) && group.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-teal-500/15 text-teal-400'
                      : 'text-[#a0a3bd] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <NavIcon name={item.icon} />
                  <span>{t(item.key)}</span>
                </Link>
              );
            })}
          </div>
        ))}

        {/* Bottom items */}
        {bottomNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 mt-4 ${
                isActive
                  ? 'bg-teal-500/15 text-teal-400'
                  : 'text-[#a0a3bd] hover:bg-white/5 hover:text-white'
              }`}
            >
              <NavIcon name={item.icon} />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer actions */}
      <div className="p-3 border-t border-white/10 space-y-0.5">
        {/* Search shortcut */}
        <button
          type="button"
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm text-[#a0a3bd] hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>{t('search.placeholder').split(',')[0]}</span>
          <kbd className="ms-auto text-[10px] px-1.5 py-0.5 rounded border border-white/20 text-[#6b6d85] font-mono">⌘K</kbd>
        </button>
        {/* Dark mode toggle */}
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
          className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm text-[#a0a3bd] hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          {resolvedTheme === 'dark' ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          )}
          <span>{t(`darkMode.${resolvedTheme}`)}</span>
        </button>
        {/* Language toggle */}
        <button
          type="button"
          onClick={toggleLocale}
          className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm text-[#a0a3bd] hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          <span>{locale === 'he' ? 'English' : 'עברית'}</span>
        </button>
        {/* Start tour */}
        <StartTourButton />
        {/* Sign out */}
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm text-[#a0a3bd] hover:bg-white/5 hover:text-red-400 transition-all duration-150"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span>{t('common.signOut')}</span>
        </button>
      </div>
    </>
  );

  return (
    <OnboardingProvider>
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-30">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="p-2 -m-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Open menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
        </button>
        <Link href="/dashboard" className="text-lg font-bold gradient-text">
          {t('common.appName')}
        </Link>
        <div className="flex items-center gap-1">
          <AlertsBell />
          <button
            type="button"
            onClick={toggleLocale}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={locale === 'he' ? 'English' : 'עברית'}
          >
            {locale === 'he' ? 'EN' : 'HE'}
          </button>
        </div>
      </div>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          style={{ animation: 'fadeIn 0.2s ease-out' }}
        />
      )}

      {/* Sidebar: drawer on mobile, sticky on desktop - DARK THEME */}
      <aside
        className={`
          fixed inset-y-0 start-0 z-50 w-72 bg-[var(--sidebar-bg)]
          transform transition-transform duration-300 ease-out
          ${drawerOpen ? 'translate-x-0 rtl:-translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'}
          md:sticky md:top-0 md:z-auto md:w-60 md:h-screen md:!translate-x-0
          flex flex-col shadow-xl md:shadow-none
        `}
      >
        {sidebarContent}
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-x-hidden min-h-0 bg-[var(--background)]">
        {/* Desktop top bar with alerts */}
        <div className="hidden md:flex items-center justify-end gap-2 mb-4">
          <AlertsBell />
        </div>
        {children}
      </main>

      <TipsPanel />
      <CommandPalette />

      {/* Avatar cropper modal */}
      {avatarCropFile && (
        <AvatarCropper
          file={avatarCropFile}
          onCrop={handleAvatarCrop}
          onCancel={() => setAvatarCropFile(null)}
        />
      )}

      {/* Quick Add modal */}
      <QuickAdd open={showQuickAdd} onClose={() => setShowQuickAdd(false)} />

      {/* Voice transaction FAB */}
      <VoiceTransaction />
    </div>
    </OnboardingProvider>
  );
}
