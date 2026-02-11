'use client';

import { useCallback, useEffect, useState } from 'react';
import { mortgages, type MortgageItem, type MortgageTrackItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

const TRACK_TYPES = ['PRIME', 'FIXED', 'VARIABLE', 'CPI_FIXED', 'CPI_VARIABLE'] as const;
const INDEX_TYPES = ['NONE', 'CPI', 'DOLLAR', 'EURO'] as const;

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function formatPercent(n: number) {
  return `${n.toFixed(2)}%`;
}

function formatDate(d: string | null, locale: string) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL');
}

type MortgageForm = {
  name: string; bank: string; propertyValue: string; totalAmount: string;
  remainingAmount: string; totalMonthly: string; startDate: string; endDate: string; notes: string;
};

type TrackForm = {
  name: string; trackType: string; indexType: string; amount: string;
  interestRate: string; monthlyPayment: string; totalPayments: string;
  remainingPayments: string; startDate: string; endDate: string; notes: string;
};

const emptyMortgageForm: MortgageForm = {
  name: '', bank: '', propertyValue: '', totalAmount: '',
  remainingAmount: '', totalMonthly: '', startDate: '', endDate: '', notes: '',
};

const emptyTrackForm: TrackForm = {
  name: '', trackType: 'FIXED', indexType: 'NONE', amount: '',
  interestRate: '', monthlyPayment: '', totalPayments: '',
  remainingPayments: '', startDate: '', endDate: '', notes: '',
};

export default function MortgagesPage() {
  const { t, locale } = useTranslation();
  const [list, setList] = useState<MortgageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Expanded mortgage cards
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Mortgage modal
  const [showMortgageModal, setShowMortgageModal] = useState(false);
  const [editingMortgage, setEditingMortgage] = useState<MortgageItem | null>(null);
  const [mortgageForm, setMortgageForm] = useState<MortgageForm>(emptyMortgageForm);

  // Track modal
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackParentId, setTrackParentId] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<MortgageTrackItem | null>(null);
  const [trackForm, setTrackForm] = useState<TrackForm>(emptyTrackForm);

  const fetchList = useCallback(() => {
    setLoading(true);
    setError('');
    mortgages.list()
      .then((data) => {
        setList(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('common.failedToLoad'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Toggle expand
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // --- Mortgage CRUD ---
  function openAddMortgage() {
    setEditingMortgage(null);
    setMortgageForm(emptyMortgageForm);
    setShowMortgageModal(true);
    setMsg('');
  }

  function openEditMortgage(m: MortgageItem) {
    setEditingMortgage(m);
    setMortgageForm({
      name: m.name,
      bank: m.bank ?? '',
      propertyValue: m.propertyValue != null ? String(m.propertyValue) : '',
      totalAmount: String(m.totalAmount),
      remainingAmount: m.remainingAmount != null ? String(m.remainingAmount) : '',
      totalMonthly: m.totalMonthly != null ? String(m.totalMonthly) : '',
      startDate: m.startDate ? m.startDate.slice(0, 10) : '',
      endDate: m.endDate ? m.endDate.slice(0, 10) : '',
      notes: m.notes ?? '',
    });
    setShowMortgageModal(true);
    setMsg('');
  }

  async function handleSaveMortgage(e: React.FormEvent) {
    e.preventDefault();
    if (!mortgageForm.name.trim() || !mortgageForm.totalAmount) return;
    setSaving(true);
    setMsg('');
    const body = {
      name: mortgageForm.name.trim(),
      bank: mortgageForm.bank.trim() || undefined,
      propertyValue: mortgageForm.propertyValue ? parseFloat(mortgageForm.propertyValue) : undefined,
      totalAmount: parseFloat(mortgageForm.totalAmount) || 0,
      remainingAmount: mortgageForm.remainingAmount ? parseFloat(mortgageForm.remainingAmount) : undefined,
      totalMonthly: mortgageForm.totalMonthly ? parseFloat(mortgageForm.totalMonthly) : undefined,
      startDate: mortgageForm.startDate || undefined,
      endDate: mortgageForm.endDate || undefined,
      notes: mortgageForm.notes.trim() || undefined,
    };
    try {
      if (editingMortgage) {
        await mortgages.update(editingMortgage.id, body);
      } else {
        await mortgages.create(body);
      }
      setShowMortgageModal(false);
      setEditingMortgage(null);
      fetchList();
      setMsg(t('common.saved'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMortgage(id: string) {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await mortgages.delete(id);
      fetchList();
      setMsg(t('common.deleted'));
    } catch {
      setMsg(t('common.somethingWentWrong'));
    }
  }

  // --- Track CRUD ---
  function openAddTrack(mortgageId: string) {
    setTrackParentId(mortgageId);
    setEditingTrack(null);
    setTrackForm(emptyTrackForm);
    setShowTrackModal(true);
    setMsg('');
  }

  function openEditTrack(mortgageId: string, track: MortgageTrackItem) {
    setTrackParentId(mortgageId);
    setEditingTrack(track);
    setTrackForm({
      name: track.name ?? '',
      trackType: track.trackType,
      indexType: track.indexType ?? 'NONE',
      amount: String(track.amount),
      interestRate: String(track.interestRate),
      monthlyPayment: track.monthlyPayment != null ? String(track.monthlyPayment) : '',
      totalPayments: track.totalPayments != null ? String(track.totalPayments) : '',
      remainingPayments: track.remainingPayments != null ? String(track.remainingPayments) : '',
      startDate: track.startDate ? track.startDate.slice(0, 10) : '',
      endDate: track.endDate ? track.endDate.slice(0, 10) : '',
      notes: track.notes ?? '',
    });
    setShowTrackModal(true);
    setMsg('');
  }

  async function handleSaveTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!trackParentId || !trackForm.amount || !trackForm.interestRate) return;
    setSaving(true);
    setMsg('');
    const body = {
      name: trackForm.name.trim() || undefined,
      trackType: trackForm.trackType,
      indexType: trackForm.indexType || undefined,
      amount: parseFloat(trackForm.amount) || 0,
      interestRate: parseFloat(trackForm.interestRate) || 0,
      monthlyPayment: trackForm.monthlyPayment ? parseFloat(trackForm.monthlyPayment) : undefined,
      totalPayments: trackForm.totalPayments ? parseInt(trackForm.totalPayments, 10) : undefined,
      remainingPayments: trackForm.remainingPayments ? parseInt(trackForm.remainingPayments, 10) : undefined,
      startDate: trackForm.startDate || undefined,
      endDate: trackForm.endDate || undefined,
      notes: trackForm.notes.trim() || undefined,
    };
    try {
      if (editingTrack) {
        await mortgages.updateTrack(trackParentId, editingTrack.id, body);
      } else {
        await mortgages.addTrack(trackParentId, body);
      }
      setShowTrackModal(false);
      setEditingTrack(null);
      setTrackParentId(null);
      fetchList();
      setMsg(t('common.saved'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTrack(mortgageId: string, trackId: string) {
    if (!confirm(t('common.confirmDelete'))) return;
    try {
      await mortgages.deleteTrack(mortgageId, trackId);
      fetchList();
      setMsg(t('common.deleted'));
    } catch {
      setMsg(t('common.somethingWentWrong'));
    }
  }

  // --- Summary ---
  const totalMortgageAmount = list.reduce((s, m) => s + m.totalAmount, 0);
  const totalMonthlyPayment = list.reduce((s, m) => s + (m.totalMonthly ?? 0), 0);
  const mortgageCount = list.length;

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  // --- Error ---
  if (error && list.length === 0) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <h1 className="text-2xl font-bold">{t('mortgage.title')}</h1>
        <div className="card text-center py-12">
          <p className="text-red-500">{error}</p>
          <button type="button" className="btn-primary mt-4" onClick={fetchList}>{t('common.retry')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('mortgage.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('mortgage.description')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={openAddMortgage}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {t('mortgage.addMortgage')}
        </button>
      </div>

      {msg && <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">{msg}</div>}

      {/* Summary cards */}
      {list.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card">
            <p className="text-sm text-slate-500">{t('mortgage.totalAmount')}</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{formatCurrency(totalMortgageAmount, locale)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('mortgage.totalMonthly')}</p>
            <p className="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1">{formatCurrency(totalMonthlyPayment, locale)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('mortgage.mortgageCount')}</p>
            <p className="text-xl font-bold mt-1">{mortgageCount}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {list.length === 0 ? (
        <div className="card text-center py-12">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-40">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <p className="text-sm text-slate-500">{t('mortgage.noMortgages')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((m) => {
            const isExpanded = expanded.has(m.id);
            const progress = m.totalAmount > 0 && m.remainingAmount != null
              ? Math.round(((m.totalAmount - m.remainingAmount) / m.totalAmount) * 100)
              : 0;

            return (
              <div key={m.id} className="card relative overflow-hidden">
                {/* Top accent bar */}
                <div className="absolute inset-x-0 top-0 h-1 bg-primary-500 rounded-t-2xl" />

                {/* Main row - clickable header */}
                <button
                  type="button"
                  className="w-full text-start pt-2"
                  onClick={() => toggleExpand(m.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg truncate">{m.name}</h3>
                        {m.bank && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                            {m.bank}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm">
                        <span className="text-slate-500">
                          {t('mortgage.totalAmount')}: <b className="text-slate-700 dark:text-slate-300">{formatCurrency(m.totalAmount, locale)}</b>
                        </span>
                        {m.remainingAmount != null && (
                          <span className="text-slate-500">
                            {t('mortgage.remainingAmount')}: <b className="text-red-600 dark:text-red-400">{formatCurrency(m.remainingAmount, locale)}</b>
                          </span>
                        )}
                        {m.totalMonthly != null && (
                          <span className="text-slate-500">
                            {t('mortgage.totalMonthly')}: <b className="text-orange-600 dark:text-orange-400">{formatCurrency(m.totalMonthly, locale)}</b>
                          </span>
                        )}
                      </div>

                      {m.propertyValue != null && m.propertyValue > 0 && (
                        <p className="text-xs text-slate-400 mt-1">
                          {t('mortgage.propertyValue')}: {formatCurrency(m.propertyValue, locale)}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
                        {m.startDate && <span>{t('common.startDate')}: {formatDate(m.startDate, locale)}</span>}
                        {m.endDate && <span>{t('common.endDate')}: {formatDate(m.endDate, locale)}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Edit / Delete (stop propagation so card doesn't toggle) */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEditMortgage(m); }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-primary-500"
                        title={t('mortgage.editMortgage')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteMortgage(m.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                        title={t('common.delete')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </button>

                      {/* Chevron */}
                      <svg
                        width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {m.remainingAmount != null && m.totalAmount > 0 && (
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${Math.min(progress, 100)}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{progress}% {t('common.paidOff')}</p>
                    </div>
                  )}
                </button>

                {/* Expanded: Tracks section */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-sm">{t('mortgage.tracks')} ({m.tracks.length})</h4>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                        onClick={() => openAddTrack(m.id)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        {t('mortgage.addTrack')}
                      </button>
                    </div>

                    {m.tracks.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">{t('mortgage.noTracks')}</p>
                    ) : (
                      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-slate-500 border-b border-[var(--border)]">
                              <th className="text-start pb-2 pe-3 font-medium whitespace-nowrap">{t('mortgage.trackName')}</th>
                              <th className="text-start pb-2 pe-3 font-medium whitespace-nowrap">{t('mortgage.trackType')}</th>
                              <th className="text-start pb-2 pe-3 font-medium whitespace-nowrap">{t('mortgage.indexType')}</th>
                              <th className="text-start pb-2 pe-3 font-medium whitespace-nowrap">{t('mortgage.amount')}</th>
                              <th className="text-start pb-2 pe-3 font-medium whitespace-nowrap">{t('mortgage.interestRate')}</th>
                              <th className="text-start pb-2 pe-3 font-medium whitespace-nowrap">{t('mortgage.monthlyPayment')}</th>
                              <th className="text-start pb-2 pe-3 font-medium whitespace-nowrap">{t('mortgage.totalPayments')}</th>
                              <th className="text-start pb-2 pe-3 font-medium whitespace-nowrap">{t('mortgage.remainingPayments')}</th>
                              <th className="pb-2 font-medium"><span className="sr-only">{t('common.actions')}</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.tracks.map((track) => (
                              <tr key={track.id} className="border-b border-[var(--border)] last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="py-2 pe-3 whitespace-nowrap">{track.name || '–'}</td>
                                <td className="py-2 pe-3 whitespace-nowrap">
                                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300">
                                    {t(`mortgage.type.${track.trackType}`)}
                                  </span>
                                </td>
                                <td className="py-2 pe-3 whitespace-nowrap text-slate-500">{track.indexType ? t(`mortgage.index.${track.indexType}`) : '–'}</td>
                                <td className="py-2 pe-3 whitespace-nowrap font-medium">{formatCurrency(track.amount, locale)}</td>
                                <td className="py-2 pe-3 whitespace-nowrap">{formatPercent(track.interestRate)}</td>
                                <td className="py-2 pe-3 whitespace-nowrap">{track.monthlyPayment != null ? formatCurrency(track.monthlyPayment, locale) : '–'}</td>
                                <td className="py-2 pe-3 whitespace-nowrap text-slate-500">{track.totalPayments ?? '–'}</td>
                                <td className="py-2 pe-3 whitespace-nowrap text-slate-500">{track.remainingPayments ?? '–'}</td>
                                <td className="py-2 whitespace-nowrap">
                                  <div className="flex gap-1 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => openEditTrack(m.id, track)}
                                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary-500"
                                      title={t('mortgage.editTrack')}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTrack(m.id, track.id)}
                                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500"
                                      title={t('common.delete')}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {m.notes && <p className="text-xs text-slate-400 italic mt-3">{m.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Mortgage Modal */}
      {showMortgageModal && (
        <div className="modal-overlay" onClick={() => { setShowMortgageModal(false); setEditingMortgage(null); }}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">
                {editingMortgage ? t('mortgage.editMortgage') : t('mortgage.addMortgage')}
              </h3>
              <button type="button" onClick={() => { setShowMortgageModal(false); setEditingMortgage(null); }} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveMortgage} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('mortgage.name')}</label>
                <input
                  type="text" className="input w-full" required
                  value={mortgageForm.name}
                  onChange={(e) => setMortgageForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('mortgage.bank')}</label>
                <input
                  type="text" className="input w-full"
                  value={mortgageForm.bank}
                  onChange={(e) => setMortgageForm((f) => ({ ...f, bank: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.totalAmount')}</label>
                  <input
                    type="number" step="1" className="input w-full" required
                    value={mortgageForm.totalAmount}
                    onChange={(e) => setMortgageForm((f) => ({ ...f, totalAmount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.remainingAmount')}</label>
                  <input
                    type="number" step="1" className="input w-full"
                    value={mortgageForm.remainingAmount}
                    onChange={(e) => setMortgageForm((f) => ({ ...f, remainingAmount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.totalMonthly')}</label>
                  <input
                    type="number" step="1" className="input w-full"
                    value={mortgageForm.totalMonthly}
                    onChange={(e) => setMortgageForm((f) => ({ ...f, totalMonthly: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.propertyValue')}</label>
                  <input
                    type="number" step="1" className="input w-full"
                    value={mortgageForm.propertyValue}
                    onChange={(e) => setMortgageForm((f) => ({ ...f, propertyValue: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.startDate')}</label>
                  <input
                    type="date" className="input w-full"
                    value={mortgageForm.startDate}
                    onChange={(e) => setMortgageForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.endDate')}</label>
                  <input
                    type="date" className="input w-full"
                    value={mortgageForm.endDate}
                    onChange={(e) => setMortgageForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
                <textarea
                  className="input w-full h-20 resize-none"
                  value={mortgageForm.notes}
                  onChange={(e) => setMortgageForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" className="btn-secondary" onClick={() => { setShowMortgageModal(false); setEditingMortgage(null); }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Track Modal */}
      {showTrackModal && (
        <div className="modal-overlay" onClick={() => { setShowTrackModal(false); setEditingTrack(null); setTrackParentId(null); }}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">
                {editingTrack ? t('mortgage.editTrack') : t('mortgage.addTrack')}
              </h3>
              <button type="button" onClick={() => { setShowTrackModal(false); setEditingTrack(null); setTrackParentId(null); }} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveTrack} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('mortgage.trackName')}</label>
                <input
                  type="text" className="input w-full"
                  value={trackForm.name}
                  onChange={(e) => setTrackForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.trackType')}</label>
                  <select
                    className="input w-full"
                    value={trackForm.trackType}
                    onChange={(e) => setTrackForm((f) => ({ ...f, trackType: e.target.value }))}
                  >
                    {TRACK_TYPES.map((tt) => (
                      <option key={tt} value={tt}>{t(`mortgage.type.${tt}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.indexType')}</label>
                  <select
                    className="input w-full"
                    value={trackForm.indexType}
                    onChange={(e) => setTrackForm((f) => ({ ...f, indexType: e.target.value }))}
                  >
                    {INDEX_TYPES.map((it) => (
                      <option key={it} value={it}>{t(`mortgage.index.${it}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.amount')}</label>
                  <input
                    type="number" step="1" className="input w-full" required
                    value={trackForm.amount}
                    onChange={(e) => setTrackForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.interestRate')}</label>
                  <input
                    type="number" step="0.01" className="input w-full" required
                    value={trackForm.interestRate}
                    onChange={(e) => setTrackForm((f) => ({ ...f, interestRate: e.target.value }))}
                    placeholder="%"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('mortgage.monthlyPayment')}</label>
                <input
                  type="number" step="1" className="input w-full"
                  value={trackForm.monthlyPayment}
                  onChange={(e) => setTrackForm((f) => ({ ...f, monthlyPayment: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.totalPayments')}</label>
                  <input
                    type="number" step="1" className="input w-full"
                    value={trackForm.totalPayments}
                    onChange={(e) => setTrackForm((f) => ({ ...f, totalPayments: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('mortgage.remainingPayments')}</label>
                  <input
                    type="number" step="1" className="input w-full"
                    value={trackForm.remainingPayments}
                    onChange={(e) => setTrackForm((f) => ({ ...f, remainingPayments: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.startDate')}</label>
                  <input
                    type="date" className="input w-full"
                    value={trackForm.startDate}
                    onChange={(e) => setTrackForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('common.endDate')}</label>
                  <input
                    type="date" className="input w-full"
                    value={trackForm.endDate}
                    onChange={(e) => setTrackForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('common.notes')}</label>
                <textarea
                  className="input w-full h-20 resize-none"
                  value={trackForm.notes}
                  onChange={(e) => setTrackForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" className="btn-secondary" onClick={() => { setShowTrackModal(false); setEditingTrack(null); setTrackParentId(null); }}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
