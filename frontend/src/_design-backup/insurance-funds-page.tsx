'use client';

import { useEffect, useState } from 'react';
import { accounts } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', { style: 'currency', currency: 'ILS' }).format(n);
}

const INSURANCE_FUND_TYPES = ['INSURANCE', 'PENSION', 'INVESTMENT'];
const TYPE_KEYS: Record<string, string> = {
  INSURANCE: 'settings.insurance',
  PENSION: 'settings.pension',
  INVESTMENT: 'settings.investment',
};

export default function InsuranceFundsPage() {
  const { t, locale } = useTranslation();
  const [list, setList] = useState<Array<{ id: string; name: string; type: string; balance: string; currency: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', type: 'INSURANCE', balance: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', type: 'INSURANCE', balance: '' });

  useEffect(() => {
    accounts
      .list()
      .then((a) => setList(a.filter((x) => INSURANCE_FUND_TYPES.includes(x.type))))
      .catch((e) => setError(e instanceof Error ? e.message : t('common.failedToLoad')))
      .finally(() => setLoading(false));
  }, [t]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      await accounts.create({ name: addForm.name.trim(), type: addForm.type, balance: parseFloat(addForm.balance) || 0 });
      const updated = await accounts.list();
      setList(updated.filter((x) => INSURANCE_FUND_TYPES.includes(x.type)));
      setShowAdd(false);
      setAddForm({ name: '', type: 'INSURANCE', balance: '' });
      setMsg(t('insuranceFunds.added'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally { setSaving(false); }
  }

  function openEdit(a: { id: string; name: string; type: string; balance: string }) {
    setEditingId(a.id);
    setEditForm({ name: a.name, type: a.type, balance: String(Number(a.balance ?? 0)) });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editForm.name.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      await accounts.update(editingId, { name: editForm.name.trim(), type: editForm.type, balance: parseFloat(editForm.balance) || 0 });
      const updated = await accounts.list();
      setList(updated.filter((x) => INSURANCE_FUND_TYPES.includes(x.type)));
      setEditingId(null);
      setMsg(t('insuranceFunds.updated'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.failedToLoad'));
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('settings.confirmDeleteAccount'))) return;
    try {
      await accounts.delete(id);
      setList((prev) => prev.filter((a) => a.id !== id));
    } catch {}
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('insuranceFunds.title')}</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">{t('insuranceFunds.description')}</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          onClick={() => setShowAdd(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('insuranceFunds.addManual')}
        </button>
      </div>

      {msg && <p className="text-sm text-green-600 dark:text-green-400">{msg}</p>}
      {error && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      ) : list.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-40">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <p>{t('insuranceFunds.noAccounts')}</p>
          <button type="button" className="mt-4 text-sm text-primary-600 hover:underline" onClick={() => setShowAdd(true)}>
            {t('insuranceFunds.addManual')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((a) => (
            <div key={a.id} className="card relative group">
              <div className="absolute top-3 end-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary-500 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button type="button" onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t(TYPE_KEYS[a.type] ?? a.type)}</p>
              <p className="text-xl font-semibold mt-1">{a.name}</p>
              <p className="text-lg font-medium mt-2 text-primary-600 dark:text-primary-400">
                {formatCurrency(Number(a.balance), locale)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-[var(--card)] rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{t('insuranceFunds.addManual')}</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.name')}</label>
                <input type="text" className="input w-full" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('insuranceFunds.namePlaceholder')} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.type')}</label>
                <select className="input w-full" value={addForm.type} onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value }))}>
                  <option value="INSURANCE">{t('settings.insurance')}</option>
                  <option value="PENSION">{t('settings.pension')}</option>
                  <option value="INVESTMENT">{t('settings.investment')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('insuranceFunds.currentValue')}</label>
                <input type="number" step="0.01" className="input w-full" value={addForm.balance} onChange={(e) => setAddForm((f) => ({ ...f, balance: e.target.value }))} placeholder="0" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? t('common.loading') : t('common.add')}</button>
                <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingId(null)}>
          <div className="bg-[var(--card)] rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">{t('insuranceFunds.editEntry')}</h3>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.name')}</label>
                <input type="text" className="input w-full" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.type')}</label>
                <select className="input w-full" value={editForm.type} onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}>
                  <option value="INSURANCE">{t('settings.insurance')}</option>
                  <option value="PENSION">{t('settings.pension')}</option>
                  <option value="INVESTMENT">{t('settings.investment')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('insuranceFunds.currentValue')}</label>
                <input type="number" step="0.01" className="input w-full" value={editForm.balance} onChange={(e) => setEditForm((f) => ({ ...f, balance: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</button>
                <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
