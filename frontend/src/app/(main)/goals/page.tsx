'use client';

import { useCallback, useEffect, useState } from 'react';
import { goals, type GoalItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';
import VoiceInputButton from '@/components/VoiceInputButton';

const GOAL_ICONS = ['🎯', '✈️', '🏠', '🚗', '💰', '📚', '🏥', '💍', '🎓', '🛒', '🏖️', '💻', '👶', '🐕', '🎁'];
const GOAL_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'];

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

export default function GoalsPage() {
  const { t, locale } = useTranslation();
  const [goalsList, setGoalsList] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', targetAmount: '', currentAmount: '', targetDate: '', icon: '🎯', color: '#3b82f6', notes: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [tipsLoading, setTipsLoading] = useState<string | null>(null);

  const fetchGoals = useCallback(() => {
    setLoading(true);
    goals.list()
      .then(setGoalsList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  function openAdd() {
    setEditingId(null);
    setForm({ name: '', targetAmount: '', currentAmount: '', targetDate: '', icon: '🎯', color: '#3b82f6', notes: '' });
    setShowForm(true);
    setMsg('');
  }

  function openEdit(g: GoalItem) {
    setEditingId(g.id);
    setForm({
      name: g.name,
      targetAmount: String(g.targetAmount),
      currentAmount: String(g.currentAmount),
      targetDate: g.targetDate ? new Date(g.targetDate).toISOString().slice(0, 10) : '',
      icon: g.icon || '🎯',
      color: g.color || '#3b82f6',
      notes: g.notes || '',
    });
    setShowForm(true);
    setMsg('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.targetAmount) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        targetAmount: parseFloat(form.targetAmount) || 0,
        currentAmount: parseFloat(form.currentAmount) || 0,
        targetDate: form.targetDate || undefined,
        icon: form.icon,
        color: form.color,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await goals.update(editingId, body);
      } else {
        await goals.create(body);
      }
      setMsg(t('goals.saved'));
      setShowForm(false);
      fetchGoals();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('common.somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('goals.confirmDelete'))) return;
    try {
      await goals.delete(id);
      setMsg(t('goals.deleted'));
      fetchGoals();
    } catch {
      setMsg(t('common.somethingWentWrong'));
    }
  }

  async function handleGetTips(id: string) {
    setTipsLoading(id);
    try {
      const res = await goals.aiTips(id);
      setGoalsList((prev) => prev.map((g) => g.id === id ? { ...g, aiTips: res.tips } : g));
    } catch { /* ignore */ }
    setTipsLoading(null);
  }

  // Summary stats
  const totalTarget = goalsList.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goalsList.reduce((s, g) => s + g.currentAmount, 0);
  const overallProgress = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('goals.title')} <HelpTooltip text={t('help.goals')} className="ms-1" /></h1>
          <p className="text-sm text-slate-500 mt-1">{t('goals.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={openAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('goals.addGoal')}
        </button>
      </div>

      {msg && <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">{msg}</div>}

      {/* Summary cards */}
      {goalsList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card">
            <p className="text-sm text-slate-500">{t('goals.totalTarget')}</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(totalTarget, locale)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('goals.totalSaved')}</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(totalSaved, locale)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('goals.overallProgress')}</p>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-all duration-500" style={{ width: `${Math.min(100, overallProgress)}%` }} />
              </div>
              <span className="text-lg font-bold">{overallProgress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Goals list */}
      {goalsList.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-slate-500">{t('goals.noGoals')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goalsList.map((g) => {
            const isReached = g.progress >= 100;
            return (
              <div key={g.id} className="card relative overflow-hidden">
                {g.color && <div className="absolute inset-x-0 top-0 h-1" style={{ background: g.color }} />}
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">{g.icon || '🎯'}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{g.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      {g.targetDate && (
                        <span>
                          {new Date(g.targetDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'short', year: 'numeric' })}
                          {g.monthsRemaining != null && g.monthsRemaining > 0 && (
                            <span className="ms-1">({g.monthsRemaining} {t('goals.monthsLeft')})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t('goals.editGoal')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <button type="button" onClick={() => handleDelete(g.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors" title={t('common.delete')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{formatCurrency(g.currentAmount, locale)} / {formatCurrency(g.targetAmount, locale)}</span>
                    <span className={`font-bold ${isReached ? 'text-green-600 dark:text-green-400' : ''}`}>{g.progress}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isReached ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-primary-500 to-blue-400'}`}
                      style={{ width: `${Math.min(100, g.progress)}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {g.remainingAmount > 0 && (
                    <span className="text-slate-500">{t('goals.remaining')}: <b>{formatCurrency(g.remainingAmount, locale)}</b></span>
                  )}
                  {g.monthlyTarget != null && g.monthlyTarget > 0 && !isReached && (
                    <span className="text-slate-500">{t('goals.monthlyTarget')}: <b>{formatCurrency(g.monthlyTarget, locale)}</b></span>
                  )}
                  {isReached && <span className="text-green-600 dark:text-green-400 font-medium">✓ {t('goals.reached')}</span>}
                </div>

                {/* AI Tips */}
                {g.aiTips && (
                  <div className="mt-3 p-3 rounded-xl bg-primary-50/50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30">
                    <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1">{t('goals.aiTips')}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{g.aiTips}</p>
                  </div>
                )}
                <div className="mt-2">
                  <button
                    type="button"
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                    onClick={() => handleGetTips(g.id)}
                    disabled={tipsLoading === g.id}
                  >
                    {tipsLoading === g.id ? t('goals.generatingTips') : t('goals.generateTips')}
                  </button>
                </div>

                {g.notes && <p className="mt-2 text-xs text-slate-500 italic">{g.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">{editingId ? t('goals.editGoal') : t('goals.addGoal')}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.goalName')}</label>
                <div className="relative flex items-center">
                  <input className="input w-full pe-9" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('goals.goalNamePlaceholder')} required />
                  <div className="absolute end-2 top-1/2 -translate-y-1/2"><VoiceInputButton onResult={(text) => setForm((f) => ({ ...f, name: text }))} /></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('goals.targetAmount')}</label>
                  <input type="number" step="1" className="input w-full" value={form.targetAmount} onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))} placeholder="0" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('goals.currentAmount')}</label>
                  <input type="number" step="1" className="input w-full" value={form.currentAmount} onChange={(e) => setForm((f) => ({ ...f, currentAmount: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.targetDate')}</label>
                <input type="date" className="input w-full" value={form.targetDate} onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.icon')}</label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_ICONS.map((icon) => (
                    <button key={icon} type="button" onClick={() => setForm((f) => ({ ...f, icon }))} className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${form.icon === icon ? 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-110' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.color')}</label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))} className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''}`} style={{ background: c }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.notes')}</label>
                <div className="relative">
                  <textarea className="input w-full h-20 resize-none pe-9" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder={t('goals.notesPlaceholder')} />
                  <div className="absolute end-2 top-2"><VoiceInputButton onResult={(text) => setForm((f) => ({ ...f, notes: f.notes ? f.notes + ' ' + text : text }))} /></div>
                </div>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={saving}>
                {saving ? t('common.loading') : t('common.save')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
