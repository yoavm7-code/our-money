'use client';

import { useEffect, useState } from 'react';
import { users, accounts, categories } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

const KNOWN_CATEGORY_SLUGS = ['groceries', 'transport', 'utilities', 'rent', 'insurance', 'healthcare', 'dining', 'shopping', 'entertainment', 'other', 'salary'];

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
  const [user, setUser] = useState<{ email: string; name: string | null } | null>(null);
  const [accountsList, setAccountsList] = useState<Array<{ id: string; name: string; type: string; balance: string | null }>>([]);
  const [categoriesList, setCategoriesList] = useState<Array<{ id: string; name: string; slug?: string; isIncome: boolean; isDefault?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [newAccount, setNewAccount] = useState({ name: '', type: 'BANK', balance: '', addBalance: false });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIsIncome, setNewCategoryIsIncome] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [msgCat, setMsgCat] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccount, setEditAccount] = useState({ name: '', type: 'BANK', balance: '', addBalance: false });
  const [updating, setUpdating] = useState(false);
  const [removingCategoryId, setRemovingCategoryId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', password: '' });
  const [updatingProfile, setUpdatingProfile] = useState(false);

  useEffect(() => {
    Promise.all([users.me(), accounts.list(), categories.list()])
      .then(([u, a, c]) => {
        setUser(u);
        setAccountsList(a);
        setCategoriesList(c);
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
      await accounts.create({
        name: newAccount.name.trim(),
        type: newAccount.type,
        balance: balanceToSend,
      });
      setMsg(t('settings.accountAdded'));
      setNewAccount({ name: '', type: 'BANK', balance: '', addBalance: false });
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
      });
      setCategoriesList((prev) => [...prev, { id: (created as { id: string }).id, name: newCategoryName.trim(), slug: (created as { slug?: string }).slug ?? '', isIncome: newCategoryIsIncome }]);
      setMsgCat(t('settings.categoryAdded'));
      setNewCategoryName('');
      setNewCategoryIsIncome(false);
    } catch (err) {
      setMsgCat(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally {
      setAddingCategory(false);
    }
  }

  async function handleEditAccount(id: string) {
    try {
      const a = await accounts.get(id) as { id: string; name: string; type: string; balance: string };
      setEditingAccountId(id);
      setEditAccount({
        name: a.name,
        type: a.type,
        balance: String(Number(a.balance ?? 0)),
        addBalance: BALANCE_TYPES.includes(a.type) && Number(a.balance ?? 0) !== 0,
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
      await accounts.update(editingAccountId, {
        name: editAccount.name.trim(),
        type: editAccount.type,
        balance: isBalanceType ? balanceToSend : undefined,
      });
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
      });
      setUser((u) => (u ? {
        ...u,
        name: profileForm.name.trim() || null,
        email: profileForm.email.trim() || u.email,
      } : null));
      setProfileForm({ name: '', email: '', password: '' });
      setEditingProfile(false);
      setMsg(t('settings.profileUpdated'));
    } catch (err) {
      const msgText = err instanceof Error ? err.message : t('common.failedToLoad');
      setMsg(msgText.includes('already in use') || msgText.includes('Email already') ? t('settings.emailInUse') : msgText);
    } finally {
      setUpdatingProfile(false);
    }
  }

  function openEditProfile() {
    setProfileForm({ name: user?.name ?? '', email: user?.email ?? '', password: '' });
    setEditingProfile(true);
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
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

      <div className="card max-w-md">
        <h2 className="font-medium mb-4">{t('settings.profile')}</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-2">
          {user?.email} {user?.name && `(${user.name})`}
        </p>
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
                  {a.balance != null ? Number(a.balance).toLocaleString('he-IL') + ' ILS' : '–'}
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
            <button type="submit" className="btn-primary" disabled={addingCategory}>
              {addingCategory ? t('settings.adding') : t('settings.addCategory')}
            </button>
          </div>
          {msgCat && <p className="text-sm text-slate-600">{msgCat}</p>}
        </form>
        <ul className="flex flex-wrap gap-2">
          {categoriesList.map((c) => {
            const displayName = c.slug && KNOWN_CATEGORY_SLUGS.includes(c.slug)
              ? t('categories.' + c.slug)
              : c.name;
            return (
              <li
                key={c.id}
                className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm flex items-center gap-1"
              >
                <span>{displayName} {c.isIncome && `(${t('settings.income')})`}</span>
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
