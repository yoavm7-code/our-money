'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/i18n/context';
import { adminApi } from '@/lib/adminApi';

/* ---------- Types ---------- */
type UserProfile = {
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
  updatedAt: string;
  _count?: { accounts: number; transactions: number };
};

type DataTab = 'accounts' | 'transactions' | 'goals' | 'budgets' | 'loans' | 'savings' | 'mortgages' | 'stockPortfolios';

/* ---------- Component ---------- */
export default function AdminUserDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  // Profile
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Active data tab
  const [activeTab, setActiveTab] = useState<DataTab>('accounts');
  const [tabData, setTabData] = useState<Record<string, unknown>[] | null>(null);
  const [loadingTab, setLoadingTab] = useState(false);

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteRecordModal, setShowDeleteRecordModal] = useState<{ table: string; id: string } | null>(null);

  // Form
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCountry, setFormCountry] = useState('');
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formEmailVerified, setFormEmailVerified] = useState(false);
  const [formPassword, setFormPassword] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Fetch user profile
  useEffect(() => {
    setLoadingUser(true);
    adminApi<UserProfile>(`/api/admin/users/${userId}`)
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoadingUser(false));
  }, [userId]);

  // Fetch tab data
  const fetchTabData = useCallback(async (tab: DataTab) => {
    setLoadingTab(true);
    setTabData(null);
    try {
      const data = await adminApi<{ items: Record<string, unknown>[] } | Record<string, unknown>[]>(
        `/api/admin/users/${userId}/data/${tab}`,
      );
      if (Array.isArray(data)) {
        setTabData(data);
      } else if (data && Array.isArray((data as { items: unknown }).items)) {
        setTabData((data as { items: Record<string, unknown>[] }).items);
      } else {
        setTabData([]);
      }
    } catch {
      setTabData([]);
    } finally {
      setLoadingTab(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTabData(activeTab);
  }, [activeTab, fetchTabData]);

  /* ---------- Actions ---------- */
  const openEdit = () => {
    if (!user) return;
    setFormName(user.name || '');
    setFormEmail(user.email);
    setFormPhone(user.phone || '');
    setFormCountry(user.countryCode || '');
    setFormIsAdmin(user.isAdmin);
    setFormEmailVerified(user.emailVerified);
    setFormError('');
    setShowEditModal(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    setFormError('');
    try {
      const updated = await adminApi<UserProfile>(`/api/admin/users/${userId}`, {
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
      setUser(updated);
      setShowEditModal(false);
      showSuccess(t('admin.userUpdated'));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setFormSaving(false);
    }
  };

  const openReset = () => {
    setFormPassword('');
    setFormError('');
    setShowResetModal(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formPassword.length < 8) {
      setFormError(t('admin.passwordMinLength'));
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      await adminApi(`/api/admin/users/${userId}/reset-password`, {
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

  const handleDeleteUser = async () => {
    setFormSaving(true);
    try {
      await adminApi(`/api/admin/users/${userId}`, { method: 'DELETE' });
      router.replace('/admin/users');
    } catch {
      setFormSaving(false);
    }
  };

  const handleBackup = async () => {
    if (!user) return;
    try {
      const data = await adminApi<Record<string, unknown>>(`/api/admin/users/${userId}/backup`);
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

  const handleDeleteRecord = async () => {
    if (!showDeleteRecordModal) return;
    setFormSaving(true);
    try {
      await adminApi(`/api/admin/records/${showDeleteRecordModal.table}/${showDeleteRecordModal.id}`, {
        method: 'DELETE',
      });
      setShowDeleteRecordModal(null);
      showSuccess(t('admin.recordDeleted'));
      fetchTabData(activeTab);
    } catch {
      // error
    } finally {
      setFormSaving(false);
    }
  };

  /* ---------- Tab definitions ---------- */
  const tabs: { key: DataTab; label: string; table: string }[] = [
    { key: 'accounts', label: t('admin.accounts'), table: 'accounts' },
    { key: 'transactions', label: t('admin.transactions'), table: 'transactions' },
    { key: 'goals', label: t('admin.goals'), table: 'goals' },
    { key: 'budgets', label: t('admin.budgets'), table: 'budgets' },
    { key: 'loans', label: t('admin.loans'), table: 'loans' },
    { key: 'savings', label: t('admin.savings'), table: 'savings' },
    { key: 'mortgages', label: t('admin.mortgages'), table: 'mortgages' },
    { key: 'stockPortfolios', label: t('admin.stockPortfolios'), table: 'stockPortfolios' },
  ];

  /* ---------- Render helpers ---------- */
  const renderTabTable = () => {
    if (loadingTab) {
      return (
        <div className="py-8 text-center text-[var(--foreground)] opacity-50">{t('common.loading')}</div>
      );
    }
    if (!tabData || tabData.length === 0) {
      return (
        <div className="py-8 text-center text-[var(--foreground)] opacity-50">{t('admin.noData')}</div>
      );
    }

    const currentTab = tabs.find((tab) => tab.key === activeTab);

    switch (activeTab) {
      case 'accounts':
        return (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.name')}</th>
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.type')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.balance')}</th>
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.currency')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tabData.map((row: Record<string, unknown>) => (
                <tr key={row.id as string} className="border-b border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2 text-[var(--foreground)]">{row.name as string}</td>
                  <td className="px-4 py-2 text-[var(--foreground)] opacity-70">{row.type as string}</td>
                  <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">
                    {Number(row.balance).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-[var(--foreground)] opacity-70">{row.currency as string}</td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setShowDeleteRecordModal({ table: currentTab!.table, id: row.id as string })}
                      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3,6 5,6 21,6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'transactions':
        return (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.date')}</th>
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.description')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.amount')}</th>
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.category')}</th>
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.account')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tabData.map((row: Record<string, unknown>) => (
                <tr key={row.id as string} className="border-b border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2 text-[var(--foreground)] opacity-70 text-xs whitespace-nowrap">
                    {row.date ? new Date(row.date as string).toLocaleDateString() : '--'}
                  </td>
                  <td className="px-4 py-2 text-[var(--foreground)] max-w-[200px] truncate">
                    {row.description as string}
                  </td>
                  <td className={`px-4 py-2 text-end font-mono ${Number(row.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Number(row.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-[var(--foreground)] opacity-70">
                    {(row.category as { name?: string })?.name || '--'}
                  </td>
                  <td className="px-4 py-2 text-[var(--foreground)] opacity-70">
                    {(row.account as { name?: string })?.name || '--'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setShowDeleteRecordModal({ table: currentTab!.table, id: row.id as string })}
                      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3,6 5,6 21,6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'goals':
        return (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.name')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.target')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.current')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.progress')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tabData.map((row: Record<string, unknown>) => {
                const target = Number(row.targetAmount) || 0;
                const current = Number(row.currentAmount) || 0;
                const pct = target > 0 ? Math.round((current / target) * 100) : 0;
                return (
                  <tr key={row.id as string} className="border-b border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2 text-[var(--foreground)]">{row.name as string}</td>
                    <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">{target.toLocaleString()}</td>
                    <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">{current.toLocaleString()}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-xs text-[var(--foreground)] opacity-70">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => setShowDeleteRecordModal({ table: currentTab!.table, id: row.id as string })}
                        className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3,6 5,6 21,6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );

      case 'budgets':
        return (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.category')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.amount')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.spent')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tabData.map((row: Record<string, unknown>) => (
                <tr key={row.id as string} className="border-b border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2 text-[var(--foreground)]">
                    {(row.category as { name?: string })?.name || '--'}
                  </td>
                  <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">
                    {Number(row.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-end font-mono text-[var(--foreground)] opacity-70">
                    {Number(row.spent || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setShowDeleteRecordModal({ table: currentTab!.table, id: row.id as string })}
                      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3,6 5,6 21,6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'loans':
        return (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.name')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.original')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.remaining')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.interest')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tabData.map((row: Record<string, unknown>) => (
                <tr key={row.id as string} className="border-b border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2 text-[var(--foreground)]">{row.name as string}</td>
                  <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">
                    {Number(row.originalAmount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">
                    {Number(row.remainingAmount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-end text-[var(--foreground)] opacity-70">
                    {row.interestRate != null ? `${row.interestRate}%` : '--'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setShowDeleteRecordModal({ table: currentTab!.table, id: row.id as string })}
                      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3,6 5,6 21,6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'savings':
        return (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.name')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.current')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.target')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tabData.map((row: Record<string, unknown>) => (
                <tr key={row.id as string} className="border-b border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2 text-[var(--foreground)]">{row.name as string}</td>
                  <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">
                    {Number(row.currentAmount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">
                    {Number(row.targetAmount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setShowDeleteRecordModal({ table: currentTab!.table, id: row.id as string })}
                      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3,6 5,6 21,6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'mortgages':
        return (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.name')}</th>
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.bank')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.total')}</th>
                <th className="text-end px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.remaining')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tabData.map((row: Record<string, unknown>) => (
                <tr key={row.id as string} className="border-b border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2 text-[var(--foreground)]">{row.name as string}</td>
                  <td className="px-4 py-2 text-[var(--foreground)] opacity-70">{(row.bank as string) || '--'}</td>
                  <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">
                    {Number(row.totalAmount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-end font-mono text-[var(--foreground)]">
                    {row.remainingAmount != null ? Number(row.remainingAmount).toLocaleString() : '--'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setShowDeleteRecordModal({ table: currentTab!.table, id: row.id as string })}
                      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3,6 5,6 21,6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'stockPortfolios':
        return (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.name')}</th>
                <th className="text-start px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.broker')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.holdings')}</th>
                <th className="text-center px-4 py-2 font-semibold text-[var(--foreground)] opacity-70">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tabData.map((row: Record<string, unknown>) => (
                <tr key={row.id as string} className="border-b border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2 text-[var(--foreground)]">{row.name as string}</td>
                  <td className="px-4 py-2 text-[var(--foreground)] opacity-70">{(row.broker as string) || '--'}</td>
                  <td className="px-4 py-2 text-center text-[var(--foreground)] opacity-70">
                    {Array.isArray(row.holdings) ? (row.holdings as unknown[]).length : (row._count as { holdings?: number })?.holdings ?? '--'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setShowDeleteRecordModal({ table: currentTab!.table, id: row.id as string })}
                      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3,6 5,6 21,6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      default:
        return null;
    }
  };

  /* ---------- Main Render ---------- */
  if (loadingUser) {
    return (
      <div className="space-y-6">
        <div className="card animate-pulse">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card text-center text-[var(--foreground)] opacity-50 py-12">
        {t('admin.noData')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success message */}
      {successMsg && (
        <div className="px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm">
          {successMsg}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[var(--foreground)] opacity-60">
        <Link href="/admin/users" className="hover:underline">
          {t('admin.users')}
        </Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">{user.name || user.email}</span>
      </div>

      {/* User Profile Card */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Avatar */}
          <div className="shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-2xl font-bold text-[var(--foreground)] opacity-50">
                {(user.name || user.email)[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-[var(--foreground)]">{user.name || '--'}</h1>
              {user.isAdmin && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  {t('admin.isAdmin')}
                </span>
              )}
              {user.emailVerified && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  {t('admin.emailVerified')}
                </span>
              )}
              {user.twoFactorMethod && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  {t('admin.twoFactor')}: {user.twoFactorMethod}
                </span>
              )}
            </div>

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div>
                <span className="text-[var(--foreground)] opacity-50">{t('admin.email')}:</span>{' '}
                <span className="text-[var(--foreground)]">{user.email}</span>
              </div>
              <div>
                <span className="text-[var(--foreground)] opacity-50">{t('admin.phone')}:</span>{' '}
                <span className="text-[var(--foreground)]">{user.phone || '--'}</span>
              </div>
              <div>
                <span className="text-[var(--foreground)] opacity-50">{t('admin.country')}:</span>{' '}
                <span className="text-[var(--foreground)]">{user.countryCode || '--'}</span>
              </div>
              <div>
                <span className="text-[var(--foreground)] opacity-50">{t('admin.createdAt')}:</span>{' '}
                <span className="text-[var(--foreground)]">{new Date(user.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <button onClick={openEdit} className="btn-secondary text-sm">
              {t('admin.edit')}
            </button>
            <button onClick={openReset} className="btn-secondary text-sm">
              {t('admin.resetPassword')}
            </button>
            <button onClick={handleBackup} className="btn-secondary text-sm">
              {t('admin.backup')}
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="rounded-xl border border-red-300 dark:border-red-700 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              {t('admin.deleteUser')}
            </button>
          </div>
        </div>
      </div>

      {/* Data Tabs */}
      <div className="card p-0">
        {/* Tab header */}
        <div className="flex overflow-x-auto border-b border-[var(--border)]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[#6366f1] text-[#6366f1]'
                  : 'border-transparent text-[var(--foreground)] opacity-60 hover:opacity-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="overflow-x-auto">{renderTabTable()}</div>
      </div>

      {/* ========== EDIT MODAL ========== */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">{t('admin.editUser')}</h2>
            <form onSubmit={handleEditUser} className="space-y-3">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{formError}</div>
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
                  <input className="input" value={formCountry} onChange={(e) => setFormCountry(e.target.value)} />
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
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">{t('admin.cancel')}</button>
                <button type="submit" disabled={formSaving} className="btn-primary disabled:opacity-50">
                  {formSaving ? t('admin.saving') : t('admin.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== RESET PASSWORD MODAL ========== */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-4">{t('admin.resetPassword')}</h2>
            <form onSubmit={handleResetPassword} className="space-y-3">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{formError}</div>
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
                <button type="button" onClick={() => setShowResetModal(false)} className="btn-secondary">{t('admin.cancel')}</button>
                <button type="submit" disabled={formSaving} className="btn-primary disabled:opacity-50">
                  {formSaving ? t('admin.saving') : t('admin.resetPassword')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== DELETE USER MODAL ========== */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-2">{t('admin.deleteUser')}</h2>
            <p className="text-sm text-[var(--foreground)] opacity-70 mb-4">{t('admin.confirmDelete')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="btn-secondary">{t('admin.cancel')}</button>
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

      {/* ========== DELETE RECORD MODAL ========== */}
      {showDeleteRecordModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteRecordModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-2">{t('admin.deleteRecord')}</h2>
            <p className="text-sm text-[var(--foreground)] opacity-70 mb-4">{t('admin.confirmDeleteRecord')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteRecordModal(null)} className="btn-secondary">{t('admin.cancel')}</button>
              <button
                onClick={handleDeleteRecord}
                disabled={formSaving}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-white font-medium hover:bg-red-700 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
              >
                {formSaving ? '...' : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
