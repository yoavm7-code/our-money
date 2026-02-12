'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { users, accounts, categories, twoFactor, type NotificationSettings, type AccountItem, type CategoryItem } from '@/lib/api';
import { COUNTRY_CODES } from '@/lib/countries';
import { useTranslation } from '@/i18n/context';
import AvatarCropper from '@/components/AvatarCropper';

/* ──────────────────────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────────────────────── */

type TabKey = 'profile' | 'business' | 'accounts' | 'categories' | 'security' | 'notifications';

const ACCOUNT_TYPE_OPTIONS = ['BANK', 'CREDIT_CARD', 'INSURANCE', 'PENSION', 'INVESTMENT', 'CASH'] as const;

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BANK: 'settings.bank',
  CREDIT_CARD: 'settings.creditCard',
  INSURANCE: 'settings.insurance',
  PENSION: 'settings.pension',
  INVESTMENT: 'settings.investment',
  CASH: 'settings.cash',
};

const BALANCE_TYPES = ['BANK', 'INVESTMENT', 'PENSION', 'INSURANCE', 'CASH'];

const CATEGORY_ICON_OPTIONS = [
  '🛒', '🍔', '🚗', '🏠', '💡', '🏥', '🎓', '🎬', '💰', '📱',
  '✈️', '👔', '🎁', '⚽', '📚', '💻', '🖨️', '📊', '🔧', '🧹',
  '💳', '📦', '🏦', '🧾', '📝', '🎯', '🔒', '🌐', '📈', '💼',
];

const CATEGORY_COLOR_OPTIONS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e',
  '#eab308', '#f97316', '#ef4444', '#ec4899', '#8b5cf6',
  '#64748b', '#0ea5e9', '#14b8a6', '#84cc16', '#f59e0b',
];

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', { style: 'currency', currency: 'ILS' }).format(n);
}

function getCatDisplayName(c: CategoryItem, t: (k: string) => string): string {
  if (c.slug) {
    const tr = t('categories.' + c.slug);
    if (tr !== 'categories.' + c.slug) return tr;
  }
  return c.name || (c.slug ? c.slug.replace(/_/g, ' ') : '');
}

/* ──────────────────────────────────────────────────────────────
   Account type icons (SVGs)
   ────────────────────────────────────────────────────────────── */

function AccountTypeIcon({ type, className = 'w-5 h-5' }: { type: string; className?: string }) {
  switch (type) {
    case 'BANK':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
        </svg>
      );
    case 'CREDIT_CARD':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /><line x1="5" y1="15" x2="9" y2="15" />
        </svg>
      );
    case 'CASH':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M2 10h2M20 10h2M2 14h2M20 14h2" />
        </svg>
      );
    case 'INVESTMENT':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case 'PENSION':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="5" /><path d="M3 21v-1a9 9 0 0118 0v1" />
        </svg>
      );
    case 'INSURANCE':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      );
  }
}

/* ──────────────────────────────────────────────────────────────
   Toggle Switch component
   ────────────────────────────────────────────────────────────── */

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'ltr:translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function SettingsPage() {
  const { t, locale } = useTranslation();

  /* ── Tab state ── */
  const [activeTab, setActiveTab] = useState<TabKey>('profile');

  /* ── Global data ── */
  const [user, setUser] = useState<{
    id: string; email: string; name: string | null; countryCode?: string | null;
    avatarUrl?: string | null; phone?: string | null; twoFactorMethod?: string | null;
  } | null>(null);
  const [accountsList, setAccountsList] = useState<AccountItem[]>([]);
  const [categoriesList, setCategoriesList] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  /* ── Profile state ── */
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '', countryCode: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  /* ── Business state ── */
  const [businessForm, setBusinessForm] = useState({
    businessName: '', businessNumber: '', vatId: '', businessAddress: '',
    businessPhone: '', businessEmail: '', defaultCurrency: 'ILS',
    vatRate: '17', invoicePrefix: 'INV-',
  });
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const businessLogoRef = useRef<HTMLInputElement>(null);

  /* ── Account state ── */
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({
    name: '', type: 'BANK' as string, provider: '', balance: '', currency: 'ILS',
    linkedBankAccountId: '',
  });
  const [savingAccount, setSavingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);

  /* ── Category state ── */
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '', icon: '📊', color: '#6366f1', isIncome: false,
    isTaxDeductible: false, deductionRate: '100',
  });
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);

  /* ── 2FA state ── */
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<string | null>(null);
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFASetup, setTwoFASetup] = useState<{ secret: string; qrCode: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAMsg, setTwoFAMsg] = useState('');
  const [twoFAMethodSelection, setTwoFAMethodSelection] = useState<string | null>(null);
  const [twoFADisabling, setTwoFADisabling] = useState(false);
  const [twoFADisableCode, setTwoFADisableCode] = useState('');
  const [twoFACodeSent, setTwoFACodeSent] = useState(false);

  /* ── Notification state ── */
  const [notifSettings, setNotifSettings] = useState<NotificationSettings & {
    notifyInvoiceOverdue?: boolean;
  }>({
    notifyLogin: false,
    notifyLargeTransaction: false,
    notifyBudgetExceeded: false,
    notifyGoalDeadline: false,
    notifyWeeklyReport: false,
    notifyMonthlyReport: false,
    largeTransactionThreshold: null,
    notifyInvoiceOverdue: false,
  });
  const [notifLoading, setNotifLoading] = useState(true);
  const notifSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ══════════════════════════════════════════════════════════════
     DATA LOADING
     ══════════════════════════════════════════════════════════════ */

  useEffect(() => {
    Promise.all([
      users.me(),
      accounts.list(),
      categories.list(),
      twoFactor.status(),
      twoFactor.getMethod(),
    ])
      .then(([u, a, c, tfa, tfaMethod]) => {
        setUser(u);
        setAccountsList(a);
        setCategoriesList(c);
        setTwoFAEnabled(tfa.enabled);
        setTwoFAMethod(tfaMethod.method);
        // Pre-fill profile form
        setProfileForm((f) => ({
          ...f,
          name: u.name ?? '',
          email: u.email,
          phone: u.phone ?? '',
          countryCode: u.countryCode ?? '',
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    users.getNotificationSettings()
      .then((ns) => setNotifSettings((prev) => ({ ...prev, ...ns })))
      .catch(() => {})
      .finally(() => setNotifLoading(false));
  }, []);

  /* ══════════════════════════════════════════════════════════════
     PROFILE HANDLERS
     ══════════════════════════════════════════════════════════════ */

  function handleAvatarFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarCropFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  }

  async function handleAvatarCrop(blob: Blob) {
    setAvatarCropFile(null);
    setAvatarUploading(true);
    try {
      const file = new File([blob], 'avatar.png', { type: 'image/png' });
      const result = await users.uploadAvatar(file);
      setUser((u) => u ? { ...u, avatarUrl: result.avatarUrl } : u);
      window.dispatchEvent(new CustomEvent('avatar-changed', { detail: { avatarUrl: result.avatarUrl } }));
      setMsg(t('settings.savedSuccessfully'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleDeleteAvatar() {
    try {
      await users.deleteAvatar();
      setUser((u) => u ? { ...u, avatarUrl: null } : u);
      window.dispatchEvent(new CustomEvent('avatar-changed', { detail: { avatarUrl: null } }));
    } catch {}
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
      setMsg(t('auth.passwordsDoNotMatch'));
      return;
    }
    setUpdatingProfile(true);
    setMsg('');
    try {
      const body: Record<string, string | undefined | null> = {};
      if (profileForm.name.trim()) body.name = profileForm.name.trim();
      if (profileForm.email.trim()) body.email = profileForm.email.trim();
      if (profileForm.newPassword) body.password = profileForm.newPassword;
      body.countryCode = profileForm.countryCode || null;

      await users.update(body as Parameters<typeof users.update>[0]);
      setUser((u) =>
        u
          ? {
              ...u,
              name: profileForm.name.trim() || u.name,
              email: profileForm.email.trim() || u.email,
              countryCode: profileForm.countryCode || null,
            }
          : u
      );
      setProfileForm((f) => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }));
      setMsg(t('settings.savedSuccessfully'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setUpdatingProfile(false);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     BUSINESS HANDLERS
     ══════════════════════════════════════════════════════════════ */

  function handleBusinessLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBusinessLogo(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    if (businessLogoRef.current) businessLogoRef.current.value = '';
  }

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    setSavingBusiness(true);
    setMsg('');
    try {
      // In production this would call a business settings API
      await new Promise((r) => setTimeout(r, 500));
      setMsg(t('settings.savedSuccessfully'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setSavingBusiness(false);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     ACCOUNT HANDLERS
     ══════════════════════════════════════════════════════════════ */

  function openAddAccount() {
    setEditingAccountId(null);
    setAccountForm({ name: '', type: 'BANK', provider: '', balance: '', currency: 'ILS', linkedBankAccountId: '' });
    setShowAccountModal(true);
  }

  async function openEditAccount(id: string) {
    try {
      const a = await accounts.get(id);
      setEditingAccountId(id);
      setAccountForm({
        name: a.name,
        type: a.type,
        provider: '',
        balance: String(Number(a.balance ?? 0)),
        currency: a.currency || 'ILS',
        linkedBankAccountId: '',
      });
      setShowAccountModal(true);
    } catch {
      setMsg(t('common.failedToLoad'));
    }
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!accountForm.name.trim()) return;
    setSavingAccount(true);
    setMsg('');
    try {
      if (editingAccountId) {
        const body: Parameters<typeof accounts.update>[1] = {
          name: accountForm.name.trim(),
          type: accountForm.type,
        };
        if (BALANCE_TYPES.includes(accountForm.type)) {
          body.balance = parseFloat(accountForm.balance) || 0;
        }
        if (accountForm.type === 'CREDIT_CARD' && accountForm.linkedBankAccountId) {
          body.linkedBankAccountId = accountForm.linkedBankAccountId;
        }
        await accounts.update(editingAccountId, body);
      } else {
        const body: Parameters<typeof accounts.create>[0] = {
          name: accountForm.name.trim(),
          type: accountForm.type,
          currency: accountForm.currency,
        };
        if (accountForm.provider) body.provider = accountForm.provider;
        if (BALANCE_TYPES.includes(accountForm.type) && accountForm.balance) {
          body.balance = parseFloat(accountForm.balance) || 0;
        }
        if (accountForm.type === 'CREDIT_CARD' && accountForm.linkedBankAccountId) {
          body.linkedBankAccountId = accountForm.linkedBankAccountId;
        }
        await accounts.create(body);
      }
      setShowAccountModal(false);
      const refreshed = await accounts.list();
      setAccountsList(refreshed);
      setMsg(t('settings.savedSuccessfully'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm(t('common.confirm_delete_message'))) return;
    setDeletingAccountId(id);
    try {
      await accounts.delete(id);
      setAccountsList((prev) => prev.filter((a) => a.id !== id));
      setMsg(t('settings.savedSuccessfully'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setDeletingAccountId(null);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     CATEGORY HANDLERS
     ══════════════════════════════════════════════════════════════ */

  function openAddCategory() {
    setEditingCategoryId(null);
    setCategoryForm({
      name: '', icon: '📊', color: '#6366f1', isIncome: false,
      isTaxDeductible: false, deductionRate: '100',
    });
    setShowCategoryModal(true);
  }

  function openEditCategory(c: CategoryItem) {
    setEditingCategoryId(c.id);
    setCategoryForm({
      name: c.name,
      icon: c.icon || '📊',
      color: c.color || '#6366f1',
      isIncome: c.isIncome,
      isTaxDeductible: false,
      deductionRate: '100',
    });
    setShowCategoryModal(true);
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryForm.name.trim()) return;
    setSavingCategory(true);
    setMsg('');
    try {
      const body = {
        name: categoryForm.name.trim(),
        icon: categoryForm.icon,
        color: categoryForm.color,
        isIncome: categoryForm.isIncome,
        excludeFromExpenseTotal: !categoryForm.isIncome && !categoryForm.isTaxDeductible ? true : undefined,
      };
      if (editingCategoryId) {
        await categories.update(editingCategoryId, body);
      } else {
        await categories.create(body);
      }
      setShowCategoryModal(false);
      const refreshed = await categories.list();
      setCategoriesList(refreshed);
      setMsg(t('settings.savedSuccessfully'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm(t('common.confirm_delete_message'))) return;
    setDeletingCategoryId(id);
    try {
      await categories.delete(id);
      setCategoriesList((prev) => prev.filter((c) => c.id !== id));
      setMsg(t('settings.savedSuccessfully'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setDeletingCategoryId(null);
    }
  }

  function handleCategoryDragStart(id: string) {
    setDraggedCategoryId(id);
  }

  function handleCategoryDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggedCategoryId || draggedCategoryId === targetId) return;
    setCategoriesList((prev) => {
      const items = [...prev];
      const fromIdx = items.findIndex((c) => c.id === draggedCategoryId);
      const toIdx = items.findIndex((c) => c.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, moved);
      return items;
    });
  }

  function handleCategoryDragEnd() {
    setDraggedCategoryId(null);
  }

  /* ══════════════════════════════════════════════════════════════
     2FA HANDLERS
     ══════════════════════════════════════════════════════════════ */

  async function handleSelectTwoFAMethod(method: string) {
    setTwoFAMethodSelection(method);
    setTwoFACode('');
    setTwoFACodeSent(false);
    setTwoFAMsg('');
    setTwoFASetup(null);
    if (method === 'totp') {
      setTwoFALoading(true);
      try {
        const data = await twoFactor.generate();
        setTwoFASetup(data);
      } catch (err) {
        setTwoFAMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
      } finally {
        setTwoFALoading(false);
      }
    }
  }

  async function handleSendCode() {
    setTwoFALoading(true);
    setTwoFAMsg('');
    try {
      await twoFactor.sendCode();
      setTwoFACodeSent(true);
      setTwoFAMsg(locale === 'he' ? 'קוד נשלח בהצלחה' : 'Code sent successfully');
    } catch (err) {
      setTwoFAMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setTwoFALoading(false);
    }
  }

  async function handleEnable2FA(e: React.FormEvent) {
    e.preventDefault();
    setTwoFALoading(true);
    setTwoFAMsg('');
    try {
      await twoFactor.enable(twoFACode);
      if (twoFAMethodSelection) {
        await twoFactor.setMethod(twoFAMethodSelection);
        setTwoFAMethod(twoFAMethodSelection);
      }
      setTwoFAEnabled(true);
      setTwoFASetup(null);
      setTwoFAMethodSelection(null);
      setTwoFACode('');
      setTwoFACodeSent(false);
      setTwoFAMsg(locale === 'he' ? 'אימות דו-שלבי הופעל בהצלחה' : '2FA enabled successfully');
    } catch (err) {
      setTwoFAMsg(err instanceof Error ? err.message : (locale === 'he' ? 'קוד שגוי' : 'Invalid code'));
    } finally {
      setTwoFALoading(false);
    }
  }

  async function handleDisable2FA(e: React.FormEvent) {
    e.preventDefault();
    setTwoFALoading(true);
    setTwoFAMsg('');
    try {
      await twoFactor.disable(twoFADisableCode);
      setTwoFAEnabled(false);
      setTwoFADisabling(false);
      setTwoFADisableCode('');
      setTwoFAMsg(locale === 'he' ? 'אימות דו-שלבי בוטל' : '2FA disabled');
    } catch (err) {
      setTwoFAMsg(err instanceof Error ? err.message : (locale === 'he' ? 'קוד שגוי' : 'Invalid code'));
    } finally {
      setTwoFALoading(false);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     NOTIFICATION HANDLERS
     ══════════════════════════════════════════════════════════════ */

  const saveNotifSettings = useCallback((updated: NotificationSettings) => {
    if (notifSaveTimerRef.current) clearTimeout(notifSaveTimerRef.current);
    notifSaveTimerRef.current = setTimeout(() => {
      users.updateNotificationSettings(updated).catch(() => {});
    }, 500);
  }, []);

  function handleNotifToggle(key: keyof NotificationSettings) {
    setNotifSettings((prev) => {
      const updated = { ...prev, [key]: !prev[key as keyof typeof prev] };
      if (key === 'notifyLargeTransaction' && !updated.notifyLargeTransaction) {
        updated.largeTransactionThreshold = null;
      }
      saveNotifSettings(updated as NotificationSettings);
      return updated;
    });
  }

  function handleThresholdChange(value: string) {
    const num = value === '' ? null : Number(value);
    setNotifSettings((prev) => {
      const updated = { ...prev, largeTransactionThreshold: num };
      saveNotifSettings(updated as NotificationSettings);
      return updated;
    });
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER: TAB NAVIGATION
     ══════════════════════════════════════════════════════════════ */

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    {
      key: 'profile',
      label: t('settings.profile'),
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    },
    {
      key: 'business',
      label: t('settings.business'),
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /><line x1="12" y1="12" x2="12" y2="12.01" /></svg>,
    },
    {
      key: 'accounts',
      label: t('settings.accounts'),
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" /></svg>,
    },
    {
      key: 'categories',
      label: t('common.categories'),
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg>,
    },
    {
      key: 'security',
      label: t('settings.security'),
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
    },
    {
      key: 'notifications',
      label: t('settings.notifications'),
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>,
    },
  ];

  /* ══════════════════════════════════════════════════════════════
     LOADING STATE
     ══════════════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */

  const incomeCats = categoriesList.filter((c) => c.isIncome);
  const expenseCats = categoriesList.filter((c) => !c.isIncome);
  const bankAccounts = accountsList.filter((a) => a.type === 'BANK');

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {locale === 'he' ? 'נהל את ההגדרות והפרטים של החשבון שלך' : 'Manage your account settings and preferences'}
        </p>
      </div>

      {/* Toast message */}
      {msg && (
        <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30 px-4 py-3 text-sm text-primary-700 dark:text-primary-300 flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="text-primary-500 hover:text-primary-700 ms-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Tab navigation */}
      <div className="border-b border-[var(--border)] overflow-x-auto no-scrollbar">
        <nav className="flex gap-1 min-w-max" aria-label="Settings tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ════════════════════════════════════════════════════════
         PROFILE TAB
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'profile' && (
        <div className="max-w-2xl space-y-6">
          {/* Avatar section */}
          <div className="card">
            <h2 className="font-semibold mb-4">{locale === 'he' ? 'תמונת פרופיל' : 'Profile Photo'}</h2>
            <div className="flex items-center gap-5">
              <div className="relative group">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover ring-2 ring-primary-500/30"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-2xl font-bold ring-2 ring-primary-500/30">
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                </button>
              </div>
              <div className="space-y-2">
                <p className="font-medium">{user?.name || user?.email?.split('@')[0]}</p>
                <p className="text-sm text-slate-500">{user?.email}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    {avatarUploading ? t('common.loading') : t('profile.uploadAvatar')}
                  </button>
                  {user?.avatarUrl && (
                    <button
                      type="button"
                      onClick={handleDeleteAvatar}
                      className="text-sm text-red-500 hover:underline"
                    >
                      {t('profile.removeAvatar')}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarFileSelect}
            />
          </div>

          {/* Profile form */}
          <div className="card">
            <h2 className="font-semibold mb-4">{locale === 'he' ? 'פרטים אישיים' : 'Personal Details'}</h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('common.name')}</label>
                  <input
                    type="text"
                    className="input"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={user?.name ?? ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.email')}</label>
                  <input
                    type="email"
                    className="input"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{locale === 'he' ? 'טלפון' : 'Phone'}</label>
                  <input
                    type="tel"
                    className="input"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+972-50-000-0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{locale === 'he' ? 'מדינה' : 'Country'}</label>
                  <select
                    className="input"
                    value={profileForm.countryCode}
                    onChange={(e) => setProfileForm((f) => ({ ...f, countryCode: e.target.value }))}
                  >
                    <option value="">--</option>
                    {COUNTRY_CODES.map((code) => (
                      <option key={code} value={code}>{t(`countries.${code}`)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Password change */}
              <div className="pt-4 border-t border-[var(--border)]">
                <h3 className="text-sm font-semibold mb-3">{t('settings.changePassword')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('settings.currentPassword')}</label>
                    <input
                      type="password"
                      className="input"
                      value={profileForm.currentPassword}
                      onChange={(e) => setProfileForm((f) => ({ ...f, currentPassword: e.target.value }))}
                      placeholder="********"
                      autoComplete="current-password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('settings.newPassword')}</label>
                    <input
                      type="password"
                      className="input"
                      value={profileForm.newPassword}
                      onChange={(e) => setProfileForm((f) => ({ ...f, newPassword: e.target.value }))}
                      placeholder="********"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('settings.confirmNewPassword')}</label>
                    <input
                      type="password"
                      className="input"
                      value={profileForm.confirmPassword}
                      onChange={(e) => setProfileForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                      placeholder="********"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" className="btn-primary" disabled={updatingProfile}>
                  {updatingProfile ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         BUSINESS TAB
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'business' && (
        <div className="max-w-2xl space-y-6">
          <div className="card">
            <h2 className="font-semibold mb-4">{t('settings.business')}</h2>
            <form onSubmit={handleSaveBusiness} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.businessName')}</label>
                  <input
                    type="text"
                    className="input"
                    value={businessForm.businessName}
                    onChange={(e) => setBusinessForm((f) => ({ ...f, businessName: e.target.value }))}
                    placeholder={locale === 'he' ? 'שם העסק שלך' : 'Your business name'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.businessNumber')}</label>
                  <input
                    type="text"
                    className="input"
                    value={businessForm.businessNumber}
                    onChange={(e) => setBusinessForm((f) => ({ ...f, businessNumber: e.target.value }))}
                    placeholder={locale === 'he' ? 'מספר ח.פ. / עוסק מורשה' : 'Business registration number'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.vatNumber')}</label>
                  <input
                    type="text"
                    className="input"
                    value={businessForm.vatId}
                    onChange={(e) => setBusinessForm((f) => ({ ...f, vatId: e.target.value }))}
                    placeholder={locale === 'he' ? 'מספר עוסק מורשה' : 'VAT registration number'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.businessAddress')}</label>
                  <input
                    type="text"
                    className="input"
                    value={businessForm.businessAddress}
                    onChange={(e) => setBusinessForm((f) => ({ ...f, businessAddress: e.target.value }))}
                    placeholder={locale === 'he' ? 'כתובת העסק' : 'Business address'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.businessPhone')}</label>
                  <input
                    type="tel"
                    className="input"
                    value={businessForm.businessPhone}
                    onChange={(e) => setBusinessForm((f) => ({ ...f, businessPhone: e.target.value }))}
                    placeholder="+972-3-000-0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('settings.businessEmail')}</label>
                  <input
                    type="email"
                    className="input"
                    value={businessForm.businessEmail}
                    onChange={(e) => setBusinessForm((f) => ({ ...f, businessEmail: e.target.value }))}
                    placeholder="info@business.co.il"
                  />
                </div>
              </div>

              {/* Logo upload */}
              <div className="pt-4 border-t border-[var(--border)]">
                <label className="block text-sm font-medium mb-2">{t('settings.businessLogo')}</label>
                <div className="flex items-center gap-4">
                  {businessLogo ? (
                    <div className="relative group">
                      <img src={businessLogo} alt="Logo" className="w-16 h-16 rounded-lg object-contain border border-[var(--border)] bg-white p-1" />
                      <button
                        type="button"
                        onClick={() => setBusinessLogo(null)}
                        className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => businessLogoRef.current?.click()}
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:border-primary-400 hover:text-primary-500 transition-colors"
                    >
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    </button>
                  )}
                  <div className="text-sm text-slate-500">
                    <p>{locale === 'he' ? 'העלה לוגו לחשבוניות' : 'Upload logo for invoices'}</p>
                    <p className="text-xs">{locale === 'he' ? 'PNG, JPG עד 2MB' : 'PNG, JPG up to 2MB'}</p>
                  </div>
                </div>
                <input
                  ref={businessLogoRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleBusinessLogoUpload}
                />
              </div>

              {/* Invoice settings */}
              <div className="pt-4 border-t border-[var(--border)]">
                <h3 className="text-sm font-semibold mb-3">{t('settings.invoiceSettings')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('settings.currency')}</label>
                    <select
                      className="input"
                      value={businessForm.defaultCurrency}
                      onChange={(e) => setBusinessForm((f) => ({ ...f, defaultCurrency: e.target.value }))}
                    >
                      <option value="ILS">{locale === 'he' ? 'שקל (ILS)' : 'ILS'}</option>
                      <option value="USD">{locale === 'he' ? 'דולר (USD)' : 'USD'}</option>
                      <option value="EUR">{locale === 'he' ? 'אירו (EUR)' : 'EUR'}</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('settings.defaultTaxRate')}</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="input"
                        min="0"
                        max="100"
                        step="0.5"
                        value={businessForm.vatRate}
                        onChange={(e) => setBusinessForm((f) => ({ ...f, vatRate: e.target.value }))}
                      />
                      <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('settings.invoicePrefix')}</label>
                    <input
                      type="text"
                      className="input"
                      value={businessForm.invoicePrefix}
                      onChange={(e) => setBusinessForm((f) => ({ ...f, invoicePrefix: e.target.value }))}
                      placeholder="INV-"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" className="btn-primary" disabled={savingBusiness}>
                  {savingBusiness ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         ACCOUNTS TAB
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'accounts' && (
        <div className="max-w-3xl space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{t('settings.accounts')}</h2>
              <button type="button" onClick={openAddAccount} className="btn-primary text-sm">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {t('settings.addAccount')}
                </span>
              </button>
            </div>

            {accountsList.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" /></svg>
                <p>{t('common.noData')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {accountsList.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
                        <AccountTypeIcon type={a.type} className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{a.name}</p>
                        <p className="text-xs text-slate-500">
                          {t(ACCOUNT_TYPE_LABELS[a.type] ?? a.type)}
                          {a.currency && a.currency !== 'ILS' && <span className="ms-1">({a.currency})</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {a.type !== 'CREDIT_CARD' && a.balance != null && (
                        <span className={`font-semibold text-sm ${Number(a.balance) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrency(Number(a.balance), locale)}
                        </span>
                      )}
                      <span className="badge-primary text-xs">{t(ACCOUNT_TYPE_LABELS[a.type] ?? a.type)}</span>
                      <button
                        type="button"
                        onClick={() => openEditAccount(a.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(a.id)}
                        disabled={deletingAccountId === a.id}
                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-red-500"
                      >
                        {deletingAccountId === a.id ? (
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                        ) : (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account Modal */}
          {showAccountModal && (
            <div className="modal-overlay" onClick={() => setShowAccountModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-semibold text-lg mb-4">
                  {editingAccountId ? t('settings.editAccount') : t('settings.addAccount')}
                </h3>
                <form onSubmit={handleSaveAccount} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('common.name')}</label>
                    <input
                      type="text"
                      className="input"
                      value={accountForm.name}
                      onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={locale === 'he' ? 'למשל: לאומי, ויזה' : 'e.g. Leumi, Visa'}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">{t('common.type')}</label>
                      <select
                        className="input"
                        value={accountForm.type}
                        onChange={(e) => setAccountForm((f) => ({ ...f, type: e.target.value }))}
                      >
                        {ACCOUNT_TYPE_OPTIONS.map((type) => (
                          <option key={type} value={type}>{t(ACCOUNT_TYPE_LABELS[type])}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">{locale === 'he' ? 'ספק / בנק' : 'Provider'}</label>
                      <input
                        type="text"
                        className="input"
                        value={accountForm.provider}
                        onChange={(e) => setAccountForm((f) => ({ ...f, provider: e.target.value }))}
                        placeholder={locale === 'he' ? 'שם הבנק / הספק' : 'Bank / provider name'}
                      />
                    </div>
                  </div>
                  {BALANCE_TYPES.includes(accountForm.type) && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">{t('settings.initialBalance')}</label>
                        <input
                          type="number"
                          step="0.01"
                          className="input"
                          value={accountForm.balance}
                          onChange={(e) => setAccountForm((f) => ({ ...f, balance: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">{t('common.currency')}</label>
                        <select
                          className="input"
                          value={accountForm.currency}
                          onChange={(e) => setAccountForm((f) => ({ ...f, currency: e.target.value }))}
                        >
                          <option value="ILS">ILS</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {accountForm.type === 'CREDIT_CARD' && bankAccounts.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium mb-1.5">{locale === 'he' ? 'חשבון בנק מקושר' : 'Linked Bank Account'}</label>
                      <select
                        className="input"
                        value={accountForm.linkedBankAccountId}
                        onChange={(e) => setAccountForm((f) => ({ ...f, linkedBankAccountId: e.target.value }))}
                      >
                        <option value="">{locale === 'he' ? 'ללא' : 'None'}</option>
                        {bankAccounts.map((ba) => (
                          <option key={ba.id} value={ba.id}>{ba.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2 justify-end pt-2">
                    <button type="button" className="btn-secondary" onClick={() => setShowAccountModal(false)}>
                      {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn-primary" disabled={savingAccount}>
                      {savingAccount ? t('common.loading') : t('common.save')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         CATEGORIES TAB
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'categories' && (
        <div className="max-w-3xl space-y-6">
          {/* Income categories */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {locale === 'he' ? 'קטגוריות הכנסה' : 'Income Categories'}
                <span className="text-xs font-normal text-slate-400">({incomeCats.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  openAddCategory();
                  setCategoryForm((f) => ({ ...f, isIncome: true }));
                }}
                className="btn-ghost text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {t('common.add')}
                </span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {incomeCats.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => handleCategoryDragStart(c.id)}
                  onDragOver={(e) => handleCategoryDragOver(e, c.id)}
                  onDragEnd={handleCategoryDragEnd}
                  className={`flex items-center justify-between p-2.5 rounded-xl border border-[var(--border)] cursor-grab active:cursor-grabbing hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                    draggedCategoryId === c.id ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                      style={{ backgroundColor: (c.color || '#6366f1') + '20', color: c.color || '#6366f1' }}
                    >
                      {c.icon || '💰'}
                    </span>
                    <span className="text-sm font-medium">{getCatDisplayName(c, t)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditCategory(c)}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(c.id)}
                      disabled={deletingCategoryId === c.id}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Expense categories */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {locale === 'he' ? 'קטגוריות הוצאה' : 'Expense Categories'}
                <span className="text-xs font-normal text-slate-400">({expenseCats.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  openAddCategory();
                  setCategoryForm((f) => ({ ...f, isIncome: false }));
                }}
                className="btn-ghost text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {t('common.add')}
                </span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {expenseCats.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => handleCategoryDragStart(c.id)}
                  onDragOver={(e) => handleCategoryDragOver(e, c.id)}
                  onDragEnd={handleCategoryDragEnd}
                  className={`flex items-center justify-between p-2.5 rounded-xl border border-[var(--border)] cursor-grab active:cursor-grabbing hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                    draggedCategoryId === c.id ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                      style={{ backgroundColor: (c.color || '#ef4444') + '20', color: c.color || '#ef4444' }}
                    >
                      {c.icon || '📊'}
                    </span>
                    <div>
                      <span className="text-sm font-medium">{getCatDisplayName(c, t)}</span>
                      {c.excludeFromExpenseTotal && (
                        <span className="ms-2 badge bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px]">
                          {t('settings.excludeFromExpenseTotal')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditCategory(c)}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(c.id)}
                      disabled={deletingCategoryId === c.id}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category Modal */}
          {showCategoryModal && (
            <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-semibold text-lg mb-4">
                  {editingCategoryId ? t('settings.editCategory') : t('settings.addCategory')}
                </h3>
                <form onSubmit={handleSaveCategory} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('settings.categoryName')}</label>
                    <input
                      type="text"
                      className="input"
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={locale === 'he' ? 'שם הקטגוריה' : 'Category name'}
                      required
                      autoFocus
                    />
                  </div>

                  {/* Icon picker */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('settings.categoryIcon')}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORY_ICON_OPTIONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setCategoryForm((f) => ({ ...f, icon }))}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                            categoryForm.icon === icon
                              ? 'bg-primary-100 dark:bg-primary-900/40 ring-2 ring-primary-500 scale-110'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color picker */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('settings.categoryColor')}</label>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORY_COLOR_OPTIONS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setCategoryForm((f) => ({ ...f, color }))}
                          className={`w-8 h-8 rounded-full transition-all ${
                            categoryForm.color === color ? 'ring-2 ring-offset-2 ring-primary-500 scale-110' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Is Income toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t('settings.isIncomeCategory')}</span>
                    <Toggle
                      checked={categoryForm.isIncome}
                      onChange={() => setCategoryForm((f) => ({ ...f, isIncome: !f.isIncome }))}
                    />
                  </div>

                  {/* Tax deductible */}
                  {!categoryForm.isIncome && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{locale === 'he' ? 'מוכר לצורכי מס' : 'Tax Deductible'}</span>
                        <Toggle
                          checked={categoryForm.isTaxDeductible}
                          onChange={() => setCategoryForm((f) => ({ ...f, isTaxDeductible: !f.isTaxDeductible }))}
                        />
                      </div>
                      {categoryForm.isTaxDeductible && (
                        <div>
                          <label className="block text-sm font-medium mb-1.5">
                            {locale === 'he' ? 'אחוז ניכוי' : 'Deduction Rate'} (%)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="input w-32"
                            value={categoryForm.deductionRate}
                            onChange={(e) => setCategoryForm((f) => ({ ...f, deductionRate: e.target.value }))}
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex gap-2 justify-end pt-2">
                    <button type="button" className="btn-secondary" onClick={() => setShowCategoryModal(false)}>
                      {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn-primary" disabled={savingCategory}>
                      {savingCategory ? t('common.loading') : t('common.save')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         SECURITY TAB
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'security' && (
        <div className="max-w-2xl space-y-6">
          {/* 2FA section */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">{t('settings.twoFactor')}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {locale === 'he' ? 'הוסף שכבת אבטחה נוספת לחשבון שלך' : 'Add an extra layer of security to your account'}
                </p>
              </div>
              <div className={`badge ${twoFAEnabled ? 'badge-success' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                {twoFAEnabled ? t('common.enabled') : t('common.disabled')}
              </div>
            </div>

            {twoFAEnabled ? (
              <div className="space-y-4">
                {/* Current method display */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">{t('settings.twoFactorEnabled')}</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {twoFAMethod === 'totp' && (locale === 'he' ? 'אפליקציית TOTP' : 'TOTP App')}
                      {twoFAMethod === 'email' && (locale === 'he' ? 'אימות באימייל' : 'Email')}
                      {twoFAMethod === 'sms' && (locale === 'he' ? 'אימות ב-SMS' : 'SMS')}
                    </p>
                  </div>
                </div>

                {!twoFADisabling ? (
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => { setTwoFADisabling(true); setTwoFAMsg(''); }}
                  >
                    {t('settings.disable2FA')}
                  </button>
                ) : (
                  <form onSubmit={handleDisable2FA} className="space-y-3 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {locale === 'he' ? 'הזן את הקוד מאפליקציית האימות כדי לכבות 2FA' : 'Enter your verification code to disable 2FA'}
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      className="input text-center text-lg tracking-widest w-40"
                      value={twoFADisableCode}
                      onChange={(e) => setTwoFADisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="btn-danger text-sm" disabled={twoFALoading || twoFADisableCode.length < 6}>
                        {twoFALoading ? t('common.loading') : t('settings.disable2FA')}
                      </button>
                      <button type="button" className="btn-secondary text-sm" onClick={() => { setTwoFADisabling(false); setTwoFADisableCode(''); }}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : twoFAMethodSelection ? (
              <div className="space-y-4">
                {/* TOTP setup */}
                {twoFAMethodSelection === 'totp' && twoFASetup && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {locale === 'he' ? 'סרוק את קוד ה-QR באפליקציית האימות שלך (Google Authenticator, Authy וכו\')' : 'Scan the QR code with your authenticator app'}
                    </p>
                    <div className="flex justify-center">
                      <img src={twoFASetup.qrCode} alt="QR Code" className="w-48 h-48 rounded-lg" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">{locale === 'he' ? 'מפתח ידני:' : 'Manual key:'}</p>
                      <code className="block bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg text-xs break-all select-all font-mono">
                        {twoFASetup.secret}
                      </code>
                    </div>
                    <form onSubmit={handleEnable2FA} className="space-y-3">
                      <p className="text-sm font-medium">{locale === 'he' ? 'הזן את הקוד שמוצג באפליקציה:' : 'Enter the code from your app:'}</p>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        className="input text-center text-lg tracking-widest w-40"
                        value={twoFACode}
                        onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button type="submit" className="btn-primary text-sm" disabled={twoFALoading || twoFACode.length < 6}>
                          {twoFALoading ? t('common.loading') : t('settings.enable2FA')}
                        </button>
                        <button type="button" className="btn-secondary text-sm" onClick={() => { setTwoFASetup(null); setTwoFACode(''); setTwoFAMethodSelection(null); }}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
                {twoFAMethodSelection === 'totp' && !twoFASetup && (
                  <div className="flex items-center gap-2 py-8 justify-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                    <span className="text-sm text-slate-500">{t('common.loading')}</span>
                  </div>
                )}

                {/* Email / SMS setup */}
                {(twoFAMethodSelection === 'email' || twoFAMethodSelection === 'sms') && (
                  <div className="space-y-4">
                    {!twoFACodeSent ? (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {twoFAMethodSelection === 'email'
                            ? (locale === 'he' ? 'נשלח קוד אימות לכתובת האימייל שלך' : 'We\'ll send a verification code to your email')
                            : (locale === 'he' ? 'נשלח קוד אימות ב-SMS' : 'We\'ll send a verification code via SMS')
                          }
                        </p>
                        <div className="flex gap-2">
                          <button type="button" className="btn-primary text-sm" onClick={handleSendCode} disabled={twoFALoading}>
                            {twoFALoading ? t('common.loading') : (locale === 'he' ? 'שלח קוד' : 'Send Code')}
                          </button>
                          <button type="button" className="btn-secondary text-sm" onClick={() => setTwoFAMethodSelection(null)}>
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleEnable2FA} className="space-y-3">
                        <p className="text-sm font-medium">{locale === 'he' ? 'הזן את הקוד שקיבלת:' : 'Enter the code you received:'}</p>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          className="input text-center text-lg tracking-widest w-40"
                          value={twoFACode}
                          onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button type="submit" className="btn-primary text-sm" disabled={twoFALoading || twoFACode.length < 6}>
                            {twoFALoading ? t('common.loading') : t('settings.enable2FA')}
                          </button>
                          <button type="button" className="btn-secondary text-sm" onClick={() => { setTwoFAMethodSelection(null); setTwoFACode(''); setTwoFACodeSent(false); }}>
                            {t('common.cancel')}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium mb-3">{locale === 'he' ? 'בחר שיטת אימות:' : 'Choose verification method:'}</p>
                <div className="space-y-2">
                  {[
                    {
                      id: 'totp',
                      label: locale === 'he' ? 'אפליקציית אימות (TOTP)' : 'Authenticator App (TOTP)',
                      desc: locale === 'he' ? 'Google Authenticator, Authy וכו\'' : 'Google Authenticator, Authy, etc.',
                      icon: (
                        <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12" y2="18.01" /></svg>
                      ),
                      color: 'bg-primary-100 dark:bg-primary-900/30',
                    },
                    {
                      id: 'email',
                      label: locale === 'he' ? 'אימות באימייל' : 'Email Verification',
                      desc: locale === 'he' ? 'קבלת קוד לכתובת האימייל שלך' : 'Receive code via email',
                      icon: (
                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></svg>
                      ),
                      color: 'bg-blue-100 dark:bg-blue-900/30',
                    },
                    {
                      id: 'sms',
                      label: locale === 'he' ? 'אימות ב-SMS' : 'SMS Verification',
                      desc: locale === 'he' ? 'קבלת קוד ב-SMS לטלפון' : 'Receive code via SMS',
                      icon: (
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                      ),
                      color: 'bg-green-100 dark:bg-green-900/30',
                    },
                  ].map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      className="w-full text-start border border-[var(--border)] rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      onClick={() => handleSelectTwoFAMethod(method.id)}
                      disabled={twoFALoading}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full ${method.color} flex items-center justify-center flex-shrink-0`}>
                          {method.icon}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{method.label}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{method.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {twoFAMsg && <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">{twoFAMsg}</p>}
          </div>

          {/* Active sessions placeholder */}
          <div className="card">
            <h2 className="font-semibold mb-2">{locale === 'he' ? 'מפגשים פעילים' : 'Active Sessions'}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {locale === 'he' ? 'רשימת המכשירים המחוברים לחשבון שלך' : 'Devices currently signed in to your account'}
            </p>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[var(--border)]">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{locale === 'he' ? 'מפגש נוכחי' : 'Current Session'}</p>
                <p className="text-xs text-slate-500">{locale === 'he' ? 'המכשיר הנוכחי שלך' : 'This device'}</p>
              </div>
              <span className="badge-success">{locale === 'he' ? 'פעיל' : 'Active'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         NOTIFICATIONS TAB
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'notifications' && (
        <div className="max-w-2xl">
          <div className="card">
            <h2 className="font-semibold mb-1">{t('settings.notifications')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {locale === 'he' ? 'בחר אילו התראות תרצה לקבל' : 'Choose which notifications you want to receive'}
            </p>

            {notifLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-1">
                {/* Login alerts */}
                <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{locale === 'he' ? 'התראות התחברות' : 'Login Alerts'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{locale === 'he' ? 'קבל התראה כשמישהו מתחבר לחשבון שלך' : 'Get notified when someone logs into your account'}</p>
                  </div>
                  <Toggle checked={notifSettings.notifyLogin} onChange={() => handleNotifToggle('notifyLogin')} />
                </div>

                {/* Large transaction */}
                <div className="py-3 border-b border-[var(--border)]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{locale === 'he' ? 'התראה על תנועה גדולה' : 'Large Transaction Alerts'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{locale === 'he' ? 'קבל התראה על תנועות מעל לסכום מסוים' : 'Alerts for transactions above a set threshold'}</p>
                    </div>
                    <Toggle checked={notifSettings.notifyLargeTransaction} onChange={() => handleNotifToggle('notifyLargeTransaction')} />
                  </div>
                  {notifSettings.notifyLargeTransaction && (
                    <div className="mt-3 ms-0">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {t('settings.largeTransactionThreshold')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="100"
                          className="input w-36 text-sm"
                          value={notifSettings.largeTransactionThreshold ?? ''}
                          onChange={(e) => handleThresholdChange(e.target.value)}
                          placeholder="1000"
                        />
                        <span className="text-sm text-slate-400">ILS</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Budget exceeded */}
                <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{locale === 'he' ? 'חריגה מתקציב' : 'Budget Exceeded'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{locale === 'he' ? 'קבל התראה כשחורגים מהתקציב' : 'Notify when you exceed a budget limit'}</p>
                  </div>
                  <Toggle checked={notifSettings.notifyBudgetExceeded} onChange={() => handleNotifToggle('notifyBudgetExceeded')} />
                </div>

                {/* Goal deadline */}
                <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{locale === 'he' ? 'מועד יעד מתקרב' : 'Goal Deadline Approaching'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{locale === 'he' ? 'תזכורת כשמועד יעד מתקרב' : 'Reminder when a goal deadline is near'}</p>
                  </div>
                  <Toggle checked={notifSettings.notifyGoalDeadline} onChange={() => handleNotifToggle('notifyGoalDeadline')} />
                </div>

                {/* Invoice overdue */}
                <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{locale === 'he' ? 'חשבונית באיחור' : 'Invoice Overdue'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{locale === 'he' ? 'קבל התראה על חשבוניות שעבר מועד תשלומן' : 'Alert when an invoice is past due'}</p>
                  </div>
                  <Toggle
                    checked={!!notifSettings.notifyInvoiceOverdue}
                    onChange={() => setNotifSettings((p) => ({ ...p, notifyInvoiceOverdue: !p.notifyInvoiceOverdue }))}
                  />
                </div>

                {/* Weekly report */}
                <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{locale === 'he' ? 'דו"ח שבועי' : 'Weekly Report'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{locale === 'he' ? 'קבל סיכום שבועי באימייל' : 'Receive a weekly email summary'}</p>
                  </div>
                  <Toggle checked={notifSettings.notifyWeeklyReport} onChange={() => handleNotifToggle('notifyWeeklyReport')} />
                </div>

                {/* Monthly report */}
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{locale === 'he' ? 'דו"ח חודשי' : 'Monthly Report'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{locale === 'he' ? 'קבל סיכום חודשי מפורט באימייל' : 'Receive a detailed monthly report via email'}</p>
                  </div>
                  <Toggle checked={notifSettings.notifyMonthlyReport} onChange={() => handleNotifToggle('notifyMonthlyReport')} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Avatar cropper modal */}
      {avatarCropFile && (
        <AvatarCropper
          file={avatarCropFile}
          onCrop={handleAvatarCrop}
          onCancel={() => setAvatarCropFile(null)}
        />
      )}
    </div>
  );
}
