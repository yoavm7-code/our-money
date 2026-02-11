'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/context';
import { adminApi } from '@/lib/adminApi';

/* ---------- Types ---------- */
type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  countryCode: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  emailVerified: boolean;
  twoFactorMethod: string | null;
  createdAt: string;
  _count?: { accounts: number; transactions: number };
};

type UsersResponse = {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
};

/* ---------- Component ---------- */
export default function AdminUsersPage() {
  const { t } = useTranslation();
  const router = useRouter();

  // List state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 15;

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCountry, setFormCountry] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formEmailVerified, setFormEmailVerified] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set('search', search);
      const data = await adminApi<UsersResponse>(`/api/admin/users?${params}`);
      setUsers(data.items);
      setTotal(data.total);
    } catch {
      // handled by adminApi redirect on 401
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.ceil(total / limit);

  /* ---------- Helpers ---------- */
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormCountry('');
    setFormPassword('');
    setFormIsAdmin(false);
    setFormEmailVerified(false);
    setFormError('');
  };

  /* ---------- Actions ---------- */
  const openAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEdit = (user: AdminUser) => {
    setSelectedUser(user);
    setFormName(user.name || '');
    setFormEmail(user.email);
    setFormPhone(user.phone || '');
    setFormCountry(user.countryCode || '');
    setFormIsAdmin(user.isAdmin);
    setFormEmailVerified(user.emailVerified);
    setFormError('');
    setShowEditModal(true);
  };

  const openDelete = (user: AdminUser) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const openReset = (user: AdminUser) => {
    setSelectedUser(user);
    setFormPassword('');
    setFormError('');
    setShowResetModal(true);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formPassword.length < 8) {
      setFormError(t('admin.passwordMinLength'));
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      await adminApi('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          password: formPassword,
          phone: formPhone || undefined,
          countryCode: formCountry || undefined,
          isAdmin: formIsAdmin,
        }),
      });
      setShowAddModal(false);
      showSuccess(t('admin.userCreated'));
      fetchUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setFormSaving(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormSaving(true);
    setFormError('');
    try {
      await adminApi(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          phone: formPhone || null,
          countryCode: formCountry || null,
          isAdmin: formIsAdmin,
          emailVerified: formEmailVerified,
        }),
      });
      setShowEditModal(false);
      showSuccess(t('admin.userUpdated'));
      fetchUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setFormSaving(true);
    try {
      await adminApi(`/api/admin/users/${selectedUser.id}`, { method: 'DELETE' });
      setShowDeleteModal(false);
      showSuccess(t('admin.userDeleted'));
      fetchUsers();
    } catch {
      // error handled
    } finally {
      setFormSaving(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (formPassword.length < 8) {
      setFormError(t('admin.passwordMinLength'));
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      await adminApi(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: formPassword }),
      });
      setShowResetModal(false);
      showSuccess(t('admin.passwordReset'));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setFormSaving(false);
    }
  };

  const handleBackup = async (user: AdminUser) => {
    try {
      const data = await adminApi<Record<string, unknown>>(`/api/admin/users/${user.id}/backup`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-${user.email}-backup.json`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess(t('admin.backupDownloaded'));
    } catch {
      // error
    }
  };

  /* ---------- Render ---------- */
  return (
    <div className="space-y-6">
      {/* Success message */}
      {successMsg && (
        <div className="px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm">
          {successMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('admin.users')}</h1>
          <p className="text-sm text-[var(--foreground)] opacity-60">
            {total} {t('admin.records')}
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary inline-flex items-center gap-2 whitespace-nowrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('admin.addUser')}
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <svg
          className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--foreground)] opacity-40"
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className="input ps-10"
          placeholder={t('admin.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Users table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]" style={{ background: 'var(--card)' }}>
              <th className="text-start px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.name')}</th>
              <th className="text-start px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.email')}</th>
              <th className="text-start px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.country')}</th>
              <th className="text-center px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.isAdmin')}</th>
              <th className="text-center px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.emailVerified')}</th>
              <th className="text-center px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.twoFactor')}</th>
              <th className="text-start px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.created')}</th>
              <th className="text-center px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.accounts')}</th>
              <th className="text-center px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.transactions')}</th>
              <th className="text-center px-4 py-3 font-semibold text-[var(--foreground)] opacity-70">{t('admin.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--border)]">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-[var(--foreground)] opacity-50">
                  {t('admin.noData')}
                </td>
              </tr>
            ) : (
              users.map((user, idx) => (
                <tr
                  key={user.id}
                  className={`border-b border-[var(--border)] cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    idx % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-800/20'
                  }`}
                  onClick={() => router.push(`/admin/users/${user.id}`)}
                >
                  {/* Name + Avatar */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-[var(--foreground)] opacity-50">
                          {(user.name || user.email)[0].toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-[var(--foreground)]">
                        {user.name || '--'}
                      </span>
                    </div>
                  </td>
                  {/* Email */}
                  <td className="px-4 py-3 text-[var(--foreground)] opacity-80">{user.email}</td>
                  {/* Country */}
                  <td className="px-4 py-3 text-[var(--foreground)] opacity-80">
                    {user.countryCode || '--'}
                  </td>
                  {/* Admin badge */}
                  <td className="px-4 py-3 text-center">
                    {user.isAdmin && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                        {t('admin.isAdmin')}
                      </span>
                    )}
                  </td>
                  {/* Email verified */}
                  <td className="px-4 py-3 text-center">
                    {user.emailVerified ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                        {t('admin.yes')}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {t('admin.no')}
                      </span>
                    )}
                  </td>
                  {/* 2FA */}
                  <td className="px-4 py-3 text-center">
                    {user.twoFactorMethod ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        {user.twoFactorMethod}
                      </span>
                    ) : (
                      <span className="text-[var(--foreground)] opacity-30">--</span>
                    )}
                  </td>
                  {/* Created */}
                  <td className="px-4 py-3 text-[var(--foreground)] opacity-70 text-xs whitespace-nowrap">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  {/* Accounts count */}
                  <td className="px-4 py-3 text-center text-[var(--foreground)] opacity-70">
                    {user._count?.accounts ?? '--'}
                  </td>
                  {/* Transactions count */}
                  <td className="px-4 py-3 text-center text-[var(--foreground)] opacity-70">
                    {user._count?.transactions ?? '--'}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      {/* View */}
                      <button
                        title={t('admin.view')}
                        className="p-1.5 rounded-lg text-[var(--foreground)] opacity-50 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      {/* Edit */}
                      <button
                        title={t('admin.edit')}
                        className="p-1.5 rounded-lg text-[var(--foreground)] opacity-50 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => openEdit(user)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      {/* Reset Password */}
                      <button
                        title={t('admin.resetPassword')}
                        className="p-1.5 rounded-lg text-[var(--foreground)] opacity-50 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => openReset(user)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </button>
                      {/* Backup */}
                      <button
                        title={t('admin.backup')}
                        className="p-1.5 rounded-lg text-[var(--foreground)] opacity-50 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => handleBackup(user)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7,10 12,15 17,10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                      {/* Delete */}
                      <button
                        title={t('admin.deleteUser')}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        onClick={() => openDelete(user)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3,6 5,6 21,6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-sm disabled:opacity-40"
          >
            {t('common.previous')}
          </button>
          <span className="text-sm text-[var(--foreground)] opacity-60">
            {t('common.page')} {page} {t('common.of')} {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary text-sm disabled:opacity-40"
          >
            {t('common.next')}
          </button>
        </div>
      )}

      {/* ========== ADD USER MODAL ========== */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">{t('admin.addUser')}</h2>
            <form onSubmit={handleAddUser} className="space-y-3">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.name')}</label>
                <input className="input" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.email')}</label>
                <input type="email" className="input" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.password')}</label>
                <input type="password" className="input" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={8} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.phone')}</label>
                  <input className="input" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.country')}</label>
                  <input className="input" value={formCountry} onChange={(e) => setFormCountry(e.target.value)} placeholder="IL" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={formIsAdmin} onChange={(e) => setFormIsAdmin(e.target.checked)} className="rounded" />
                {t('admin.isAdmin')}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                  {t('admin.cancel')}
                </button>
                <button type="submit" disabled={formSaving} className="btn-primary disabled:opacity-50">
                  {formSaving ? t('admin.saving') : t('admin.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== EDIT USER MODAL ========== */}
      {showEditModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">{t('admin.editUser')}</h2>
            <form onSubmit={handleEditUser} className="space-y-3">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.name')}</label>
                <input className="input" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.email')}</label>
                <input type="email" className="input" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.phone')}</label>
                  <input className="input" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.country')}</label>
                  <input className="input" value={formCountry} onChange={(e) => setFormCountry(e.target.value)} placeholder="IL" />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input type="checkbox" checked={formIsAdmin} onChange={(e) => setFormIsAdmin(e.target.checked)} className="rounded" />
                  {t('admin.isAdmin')}
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input type="checkbox" checked={formEmailVerified} onChange={(e) => setFormEmailVerified(e.target.checked)} className="rounded" />
                  {t('admin.emailVerified')}
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">
                  {t('admin.cancel')}
                </button>
                <button type="submit" disabled={formSaving} className="btn-primary disabled:opacity-50">
                  {formSaving ? t('admin.saving') : t('admin.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== DELETE CONFIRMATION MODAL ========== */}
      {showDeleteModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-2">{t('admin.deleteUser')}</h2>
            <p className="text-sm text-[var(--foreground)] opacity-70 mb-4">{t('admin.confirmDelete')}</p>
            <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-[var(--foreground)] mb-4">
              <strong>{selectedUser.name || selectedUser.email}</strong>
              <br />
              {selectedUser.email}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="btn-secondary">
                {t('admin.cancel')}
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={formSaving}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-white font-medium hover:bg-red-700 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
              >
                {formSaving ? '...' : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== RESET PASSWORD MODAL ========== */}
      {showResetModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">{t('admin.resetPassword')}</h2>
            <p className="text-sm text-[var(--foreground)] opacity-60 mb-3">
              {selectedUser.name || selectedUser.email}
            </p>
            <form onSubmit={handleResetPassword} className="space-y-3">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">{t('admin.newPassword')}</label>
                <input
                  type="password"
                  className="input"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder={t('admin.passwordMinLength')}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowResetModal(false)} className="btn-secondary">
                  {t('admin.cancel')}
                </button>
                <button type="submit" disabled={formSaving} className="btn-primary disabled:opacity-50">
                  {formSaving ? t('admin.saving') : t('admin.resetPassword')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
