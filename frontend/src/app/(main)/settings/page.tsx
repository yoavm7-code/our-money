'use client';

import { useEffect, useRef, useState } from 'react';
import { users, accounts, categories, twoFactor } from '@/lib/api';
import { COUNTRY_CODES } from '@/lib/countries';
import { useTranslation } from '@/i18n/context';
import AvatarCropper from '@/components/AvatarCropper';

const KNOWN_CATEGORY_SLUGS = ['groceries', 'transport', 'utilities', 'rent', 'insurance', 'healthcare', 'dining', 'shopping', 'entertainment', 'other', 'salary', 'income', 'credit_charges', 'transfers', 'fees', 'subscriptions', 'education', 'pets', 'gifts', 'childcare', 'savings', 'pension', 'investment', 'bank_fees', 'online_shopping', 'loan_payment', 'loan_interest', 'standing_order', 'finance', 'unknown'];

const ACCOUNT_TYPE_KEYS: Record<string, string> = {
  BANK: 'settings.bank',
  CREDIT_CARD: 'settings.creditCard',
  INSURANCE: 'settings.insurance',
  PENSION: 'settings.pension',
  INVESTMENT: 'settings.investment',
  CASH: 'settings.cash',
};

const BALANCE_TYPES = ['BANK', 'INVESTMENT', 'PENSION', 'INSURANCE', 'CASH'];

export default function SettingsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<{ email: string; name: string | null; countryCode?: string | null; avatarUrl?: string | null } | null>(null);
  const [accountsList, setAccountsList] = useState<Array<{ id: string; name: string; type: string; balance: string | null; balanceDate?: string | null }>>([]);
  const [categoriesList, setCategoriesList] = useState<Array<{ id: string; name: string; slug?: string; isIncome: boolean; isDefault?: boolean; excludeFromExpenseTotal?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [newAccount, setNewAccount] = useState({ name: '', type: 'BANK', balance: '', balanceDate: '', addBalance: false, linkedBankAccountId: '' });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIsIncome, setNewCategoryIsIncome] = useState(false);
  const [newCategoryExcludeFromExpense, setNewCategoryExcludeFromExpense] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [updatingCategoryId, setUpdatingCategoryId] = useState<string | null>(null);
  const [msgCat, setMsgCat] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccount, setEditAccount] = useState({ name: '', type: 'BANK', balance: '', balanceDate: '', addBalance: false, linkedBankAccountId: '' });
  const [updating, setUpdating] = useState(false);
  const [removingCategoryId, setRemovingCategoryId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', password: '', countryCode: '' });
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFASetup, setTwoFASetup] = useState<{ secret: string; qrCode: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAMsg, setTwoFAMsg] = useState('');
  const [twoFADisabling, setTwoFADisabling] = useState(false);
  const [twoFADisableCode, setTwoFADisableCode] = useState('');

  useEffect(() => {
    Promise.all([users.me(), accounts.list(), categories.list(), twoFactor.status()])
      .then(([u, a, c, tfa]) => {
        setUser({ email: u.email, name: u.name, countryCode: u.countryCode, avatarUrl: u.avatarUrl });
        setAccountsList(a);
        setCategoriesList(c);
        setTwoFAEnabled(tfa.enabled);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccount.name.trim()) return;
    setAdding(true);
    setMsg('');
    const isBalanceType = BALANCE_TYPES.includes(newAccount.type);
    const balanceToSend = isBalanceType && newAccount.addBalance ? parseFloat(newAccount.balance) || 0 : 0;
    try {
      const createBody: { name: string; type: string; balance: number; balanceDate?: string; linkedBankAccountId?: string } = {
        name: newAccount.name.trim(),
        type: newAccount.type,
        balance: balanceToSend,
      };
      if (isBalanceType && newAccount.addBalance && newAccount.balanceDate) {
        createBody.balanceDate = newAccount.balanceDate;
      }
      if (newAccount.type === 'CREDIT_CARD' && newAccount.linkedBankAccountId) {
        createBody.linkedBankAccountId = newAccount.linkedBankAccountId;
      }
      await accounts.create(createBody);
      setMsg(t('settings.accountAdded'));
      setNewAccount({ name: '', type: 'BANK', balance: '', balanceDate: '', addBalance: false, linkedBankAccountId: '' });
      accounts.list().then(setAccountsList).catch(() => {});
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('common.failedToLoad'));
    } finally {
      setAdding(false);
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setAddingCategory(true);
    setMsgCat('');
    try {
      const created = await categories.create({
        name: newCategoryName.trim(),
        isIncome: newCategoryIsIncome,
        ...(!newCategoryIsIncome && { excludeFromExpenseTotal: newCategoryExcludeFromExpense }),
      });
      setCategoriesList((prev) => [...prev, { id: (created as { id: string }).id, name: newCategoryName.trim(), slug: (created as { slug?: string }).slug ?? '', isIncome: newCategoryIsIncome, excludeFromExpenseTotal: newCategoryIsIncome ? undefined : newCategoryExcludeFromExpense }]);
      setMsgCat(t('settings.categoryAdded'));
      setNewCategoryName('');
      setNewCategoryIsIncome(false);
      setNewCategoryExcludeFromExpense(false);
    } catch (err) {
      setMsgCat(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setAddingCategory(false);
    }
  }

  async function handleEditAccount(id: string) {
    try {
      const a = await accounts.get(id) as { id: string; name: string; type: string; balance: string; balanceDate?: string | null; linkedBankAccountId?: string };
      setEditingAccountId(id);
      const bDate = a.balanceDate ? new Date(a.balanceDate).toISOString().slice(0, 10) : '';
      setEditAccount({
        name: a.name,
        type: a.type,
        balance: String(Number(a.balance ?? 0)),
        balanceDate: bDate,
        addBalance: BALANCE_TYPES.includes(a.type) && Number(a.balance ?? 0) !== 0,
        linkedBankAccountId: a.linkedBankAccountId ?? '',
      });
    } catch {
      setMsg(t('common.failedToLoad'));
    }
  }

  async function handleUpdateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAccountId || !editAccount.name.trim()) return;
    setUpdating(true);
    setMsg('');
    const isBalanceType = BALANCE_TYPES.includes(editAccount.type);
    const balanceToSend = isBalanceType && editAccount.addBalance ? parseFloat(editAccount.balance) || 0 : 0;
    try {
      const updateBody: { name: string; type: string; balance?: number; balanceDate?: string | null; linkedBankAccountId?: string | null } = {
        name: editAccount.name.trim(),
        type: editAccount.type,
        balance: isBalanceType ? balanceToSend : undefined,
      };
      if (isBalanceType && editAccount.addBalance) {
        updateBody.balanceDate = editAccount.balanceDate || null;
      }
      if (editAccount.type === 'CREDIT_CARD') {
        updateBody.linkedBankAccountId = editAccount.linkedBankAccountId || null;
      }
      await accounts.update(editingAccountId, updateBody);
      setMsg(t('settings.accountUpdated'));
      setEditingAccountId(null);
      accounts.list().then(setAccountsList).catch(() => {});
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('common.failedToLoad'));
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setUpdatingProfile(true);
    setMsg('');
    try {
      await users.update({
        name: profileForm.name.trim() || undefined,
        email: profileForm.email.trim() || undefined,
        password: profileForm.password || undefined,
        countryCode: profileForm.countryCode || null,
      });
      setUser((u) => (u ? {
        ...u,
        name: profileForm.name.trim() || null,
        email: profileForm.email.trim() || u.email,
        countryCode: profileForm.countryCode || null,
      } : null));
      setProfileForm({ name: '', email: '', password: '', countryCode: '' });
      setEditingProfile(false);
      setMsg(t('settings.profileUpdated'));
    } catch (err) {
      const msgText = err instanceof Error ? err.message : t('common.failedToLoad');
      setMsg(msgText.includes('already in use') || msgText.includes('Email already') ? t('settings.emailInUse') : msgText);
    } finally {
      setUpdatingProfile(false);
    }
  }

  async function handleSetup2FA() {
    setTwoFALoading(true);
    setTwoFAMsg('');
    try {
      const data = await twoFactor.generate();
      setTwoFASetup(data);
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
      setTwoFAEnabled(true);
      setTwoFASetup(null);
      setTwoFACode('');
      setTwoFAMsg(t('settings.twoFactorActivated'));
    } catch (err) {
      setTwoFAMsg(err instanceof Error ? err.message : t('settings.twoFactorInvalidCode'));
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
      setTwoFAMsg(t('settings.twoFactorDeactivated'));
    } catch (err) {
      setTwoFAMsg(err instanceof Error ? err.message : t('settings.twoFactorInvalidCode'));
    } finally {
      setTwoFALoading(false);
    }
  }

  function openEditProfile() {
    setProfileForm({ name: user?.name ?? '', email: user?.email ?? '', password: '', countryCode: user?.countryCode ?? '' });
    setEditingProfile(true);
  }

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
      setMsg(t('profile.avatarUpdated'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm(t('settings.confirmDeleteAccount'))) return;
    setDeletingAccountId(id);
    try {
      await accounts.delete(id);
      setMsg(t('settings.accountRemoved'));
      setAccountsList((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setDeletingAccountId(null);
    }
  }

  async function handleToggleExcludeFromExpense(c: { id: string; excludeFromExpenseTotal?: boolean }) {
    setUpdatingCategoryId(c.id);
    try {
      await categories.update(c.id, { excludeFromExpenseTotal: !c.excludeFromExpenseTotal });
      setCategoriesList((prev) => prev.map((x) => (x.id === c.id ? { ...x, excludeFromExpenseTotal: !c.excludeFromExpenseTotal } : x)));
    } catch {
      setMsgCat(t('common.failedToLoad'));
    } finally {
      setUpdatingCategoryId(null);
    }
  }

  async function handleRemoveCategory(id: string) {
    if (!confirm(t('settings.confirmRemoveCategory'))) return;
    setRemovingCategoryId(id);
    try {
      await categories.delete(id);
      setMsgCat(t('settings.categoryRemoved'));
      setCategoriesList((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setMsgCat(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setRemovingCategoryId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

      <div className="card max-w-md">
        <h2 className="font-medium mb-4">{t('settings.profile')}</h2>
        <div className="flex items-center gap-4 mb-3">
          <div className="relative group">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="w-16 h-16 rounded-full object-cover ring-2 ring-primary-500/30"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
              />
            ) : null}
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xl font-bold ring-2 ring-primary-500/30 ${user?.avatarUrl ? 'hidden' : ''}`}>
              {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title={t('profile.uploadAvatar')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </button>
          </div>
          <div>
            <p className="font-medium">{user?.name || user?.email?.split('@')[0]}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
            {user?.countryCode && (
              <p className="text-xs text-slate-500 mt-0.5">
                {t('settings.country')}: {t(`countries.${user.countryCode}`)}
              </p>
            )}
            {user?.avatarUrl && (
              <button
                type="button"
                className="text-xs text-red-500 hover:text-red-700 mt-1"
                onClick={async () => {
                  try {
                    await users.deleteAvatar();
                    setUser((u) => u ? { ...u, avatarUrl: null } : u);
                    window.dispatchEvent(new CustomEvent('avatar-changed', { detail: { avatarUrl: null } }));
                  } catch {}
                }}
              >
                {t('profile.deleteAvatar')}
              </button>
            )}
          </div>
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleAvatarFileSelect}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('settings.countryWhy')}</p>
        <button
          type="button"
          className="text-sm text-primary-600 hover:underline"
          onClick={openEditProfile}
        >
          {t('settings.editProfile')}
        </button>
      </div>

      {editingProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingProfile(false)}>
          <div className="bg-[var(--card)] rounded-xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-4">{t('settings.editProfile')}</h3>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {/* Avatar upload in edit modal */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="w-14 h-14 rounded-full object-cover ring-2 ring-primary-500/30"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                    />
                  ) : null}
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-lg font-bold ring-2 ring-primary-500/30 ${user?.avatarUrl ? 'hidden' : ''}`}>
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="text-sm text-primary-600 hover:underline flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                  {avatarUploading ? t('common.loading') : t('profile.uploadAvatar')}
                  <span className="text-xs text-slate-400">{t('profile.avatarMaxSize')}</span>
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.displayName')}</label>
                <input
                  type="text"
                  className="input w-full"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={user?.name ?? user?.email ?? ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.email')}</label>
                <input
                  type="email"
                  className="input w-full"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.country')}</label>
                <select
                  className="input w-full"
                  value={profileForm.countryCode}
                  onChange={(e) => setProfileForm((f) => ({ ...f, countryCode: e.target.value }))}
                >
                  <option value="">–</option>
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>{t(`countries.${code}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.newPassword')}</label>
                <input
                  type="password"
                  className="input w-full"
                  value={profileForm.password}
                  onChange={(e) => setProfileForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <p className="text-xs text-slate-500 mt-1">{t('settings.newPasswordHint')}</p>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={updatingProfile}>
                  {updatingProfile ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setEditingProfile(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2FA Section */}
      <div className="card max-w-md">
        <h2 className="font-medium mb-2">{t('settings.twoFactorAuth')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('settings.twoFactorDescription')}</p>

        {twoFAEnabled ? (
          <div>
            <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-3">{t('settings.twoFactorEnabled')}</p>
            {!twoFADisabling ? (
              <button
                type="button"
                className="text-sm text-red-600 hover:underline"
                onClick={() => { setTwoFADisabling(true); setTwoFAMsg(''); }}
              >
                {t('settings.twoFactorDisable')}
              </button>
            ) : (
              <form onSubmit={handleDisable2FA} className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">{t('settings.twoFactorDisablePrompt')}</p>
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
                  <button type="submit" className="btn-primary text-sm" disabled={twoFALoading || twoFADisableCode.length < 6}>
                    {twoFALoading ? t('common.loading') : t('settings.twoFactorDisable')}
                  </button>
                  <button type="button" className="btn-secondary text-sm" onClick={() => { setTwoFADisabling(false); setTwoFADisableCode(''); }}>
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : twoFASetup ? (
          <div className="space-y-4">
            <p className="text-sm">{t('settings.twoFactorScanQR')}</p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={twoFASetup.qrCode} alt="QR Code" className="w-48 h-48 rounded-lg" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">{t('settings.twoFactorManualKey')}:</p>
              <code className="block bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded text-xs break-all select-all">{twoFASetup.secret}</code>
            </div>
            <form onSubmit={handleEnable2FA} className="space-y-3">
              <p className="text-sm">{t('settings.twoFactorVerifyCode')}</p>
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
                  {twoFALoading ? t('common.loading') : t('settings.twoFactorEnable')}
                </button>
                <button type="button" className="btn-secondary text-sm" onClick={() => { setTwoFASetup(null); setTwoFACode(''); }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{t('settings.twoFactorDisabled')}</p>
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={handleSetup2FA}
              disabled={twoFALoading}
            >
              {twoFALoading ? t('common.loading') : t('settings.twoFactorEnable')}
            </button>
          </div>
        )}
        {twoFAMsg && <p className="text-sm text-slate-600 mt-3">{twoFAMsg}</p>}
      </div>

      <div className="card max-w-lg">
        <h2 className="font-medium mb-4">{t('settings.accounts')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t('settings.accountsDescription')}
        </p>
        <form onSubmit={handleAddAccount} className="space-y-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-sm font-medium mb-1">{t('settings.name')}</label>
              <input
                type="text"
                className="input"
                value={newAccount.name}
                onChange={(e) => setNewAccount((a) => ({ ...a, name: e.target.value }))}
                placeholder={t('settings.namePlaceholder')}
                required
              />
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium mb-1">{t('settings.type')}</label>
              <select
                className="input"
                value={newAccount.type}
                onChange={(e) => setNewAccount((a) => ({ ...a, type: e.target.value, addBalance: false }))}
              >
                <option value="BANK">{t('settings.bank')}</option>
                <option value="CREDIT_CARD">{t('settings.creditCard')}</option>
                <option value="INSURANCE">{t('settings.insurance')}</option>
                <option value="PENSION">{t('settings.pension')}</option>
                <option value="INVESTMENT">{t('settings.investment')}</option>
                <option value="CASH">{t('settings.cash')}</option>
              </select>
            </div>
            {newAccount.type === 'CREDIT_CARD' && (
              <div className="w-full">
                <label className="block text-sm font-medium mb-1">{t('settings.linkedBankAccount')}</label>
                <select
                  className="input"
                  value={newAccount.linkedBankAccountId}
                  onChange={(e) => setNewAccount((a) => ({ ...a, linkedBankAccountId: e.target.value }))}
                >
                  <option value="">{t('settings.noLinkedAccount')}</option>
                  {accountsList.filter((a) => a.type === 'BANK').map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">{t('settings.linkedBankAccountHint')}</p>
              </div>
            )}
            {BALANCE_TYPES.includes(newAccount.type) && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="add-balance"
                    checked={newAccount.addBalance}
                    onChange={(e) => setNewAccount((a) => ({ ...a, addBalance: e.target.checked, balance: e.target.checked ? a.balance : '' }))}
                    className="rounded"
                  />
                  <label htmlFor="add-balance" className="text-sm">{t('settings.addInitialBalance')}</label>
                </div>
                {newAccount.addBalance && (
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="w-28">
                      <label className="block text-sm font-medium mb-1">{t('settings.initialBalance')}</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={newAccount.balance}
                        onChange={(e) => setNewAccount((a) => ({ ...a, balance: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="w-40">
                      <label className="block text-sm font-medium mb-1">{t('settings.balanceDate')}</label>
                      <input
                        type="date"
                        className="input"
                        value={newAccount.balanceDate}
                        onChange={(e) => setNewAccount((a) => ({ ...a, balanceDate: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            <button type="submit" className="btn-primary" disabled={adding}>
              {adding ? t('settings.adding') : t('common.add')}
            </button>
          </div>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </form>
        <ul className="space-y-2">
          {accountsList.map((a) => (
            <li key={a.id} className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0 gap-2">
              <span>{a.name} <span className="text-slate-500 text-sm">({t(ACCOUNT_TYPE_KEYS[a.type] ?? a.type)})</span></span>
              <span className="flex items-center gap-2">
                <span className="font-medium">
                  {a.type !== 'CREDIT_CARD' && a.balance != null ? Number(a.balance).toLocaleString('he-IL') + ' ILS' : '–'}
                </span>
                <button
                  type="button"
                  className="text-sm text-primary-600 hover:underline"
                  onClick={() => handleEditAccount(a.id)}
                >
                  {t('settings.editAccount')}
                </button>
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => handleDeleteAccount(a.id)}
                  disabled={deletingAccountId === a.id}
                  title={t('settings.deleteAccount')}
                >
                  {deletingAccountId === a.id ? '…' : t('settings.deleteAccount')}
                </button>
              </span>
            </li>
          ))}
        </ul>
        {editingAccountId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingAccountId(null)}>
            <div className="bg-[var(--card)] rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-medium mb-4">{t('settings.editAccount')}</h3>
              <form onSubmit={handleUpdateAccount} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.name')}</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={editAccount.name}
                    onChange={(e) => setEditAccount((a) => ({ ...a, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.type')}</label>
                  <select
                    className="input w-full"
                    value={editAccount.type}
                    onChange={(e) => setEditAccount((a) => ({ ...a, type: e.target.value, addBalance: false }))}
                  >
                    <option value="BANK">{t('settings.bank')}</option>
                    <option value="CREDIT_CARD">{t('settings.creditCard')}</option>
                    <option value="INSURANCE">{t('settings.insurance')}</option>
                    <option value="PENSION">{t('settings.pension')}</option>
                    <option value="INVESTMENT">{t('settings.investment')}</option>
                    <option value="CASH">{t('settings.cash')}</option>
                  </select>
                </div>
                {editAccount.type === 'CREDIT_CARD' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('settings.linkedBankAccount')}</label>
                    <select
                      className="input w-full"
                      value={editAccount.linkedBankAccountId}
                      onChange={(e) => setEditAccount((a) => ({ ...a, linkedBankAccountId: e.target.value }))}
                    >
                      <option value="">{t('settings.noLinkedAccount')}</option>
                      {accountsList.filter((a) => a.type === 'BANK' && a.id !== editingAccountId).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">{t('settings.linkedBankAccountHint')}</p>
                  </div>
                )}
                {BALANCE_TYPES.includes(editAccount.type) && (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="edit-add-balance"
                        checked={editAccount.addBalance}
                        onChange={(e) => setEditAccount((a) => ({ ...a, addBalance: e.target.checked, balance: e.target.checked ? a.balance : '' }))}
                        className="rounded"
                      />
                      <label htmlFor="edit-add-balance" className="text-sm">{t('settings.addInitialBalance')}</label>
                    </div>
                    {editAccount.addBalance && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">{t('settings.initialBalance')}</label>
                          <input
                            type="number"
                            step="0.01"
                            className="input w-full"
                            value={editAccount.balance}
                            onChange={(e) => setEditAccount((a) => ({ ...a, balance: e.target.value }))}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">{t('settings.balanceDate')}</label>
                          <input
                            type="date"
                            className="input w-full"
                            value={editAccount.balanceDate}
                            onChange={(e) => setEditAccount((a) => ({ ...a, balanceDate: e.target.value }))}
                          />
                          <p className="text-xs text-slate-500 mt-1">{t('settings.balanceDateHint')}</p>
                        </div>
                      </>
                    )}
                  </>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary" disabled={updating}>
                    {updating ? t('settings.adding') : t('common.save')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setEditingAccountId(null)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Avatar cropper modal */}
      {avatarCropFile && (
        <AvatarCropper
          file={avatarCropFile}
          onCrop={handleAvatarCrop}
          onCancel={() => setAvatarCropFile(null)}
        />
      )}

      <div className="card max-w-lg">
        <h2 className="font-medium mb-4">{t('common.categories')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t('settings.categoriesDescription')}
        </p>
        <form onSubmit={handleAddCategory} className="space-y-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-sm font-medium mb-1">{t('settings.categoryName')}</label>
              <input
                type="text"
                className="input"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={t('settings.categoryNamePlaceholder')}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cat-income"
                checked={newCategoryIsIncome}
                onChange={(e) => setNewCategoryIsIncome(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="cat-income" className="text-sm">{t('settings.incomeCategory')}</label>
            </div>
            {!newCategoryIsIncome && (
              <div className="flex items-center gap-2 w-full">
                <input
                  type="checkbox"
                  id="cat-exclude-expense"
                  checked={newCategoryExcludeFromExpense}
                  onChange={(e) => setNewCategoryExcludeFromExpense(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="cat-exclude-expense" className="text-sm" title={t('settings.excludeFromExpenseTotalHint')}>
                  {t('settings.excludeFromExpenseTotal')}
                </label>
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={addingCategory}>
              {addingCategory ? t('settings.adding') : t('settings.addCategory')}
            </button>
          </div>
          {msgCat && <p className="text-sm text-slate-600">{msgCat}</p>}
        </form>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('settings.excludeFromExpenseTotalHint')}</p>
        <ul className="flex flex-wrap gap-2">
          {categoriesList.map((c) => {
            let displayName = c.name;
            if (c.slug) {
              const tr = t('categories.' + c.slug);
              if (tr !== 'categories.' + c.slug) displayName = tr;
            }
            if (!displayName && c.slug) displayName = c.slug.replace(/_/g, ' ');
            return (
              <li
                key={c.id}
                className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm flex items-center gap-2"
              >
                <span>{displayName} {c.isIncome && `(${t('settings.income')})`}</span>
                {!c.isIncome && (
                  <label className="flex items-center gap-1 cursor-pointer" title={t('settings.excludeFromExpenseTotalHint')}>
                    <input
                      type="checkbox"
                      checked={!!c.excludeFromExpenseTotal}
                      onChange={() => handleToggleExcludeFromExpense(c)}
                      disabled={updatingCategoryId === c.id}
                      className="rounded"
                    />
                    <span className="text-xs whitespace-nowrap">{t('settings.excludeFromExpenseTotal')}</span>
                  </label>
                )}
                <button
                    type="button"
                    className="text-red-600 hover:underline text-xs -mr-1"
                    onClick={() => handleRemoveCategory(c.id)}
                    disabled={removingCategoryId === c.id}
                    title={t('settings.removeCategory')}
                  >
                    ×
                  </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
