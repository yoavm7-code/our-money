'use client';

import { useCallback, useEffect, useState } from 'react';
import { goals, type GoalItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';
import VoiceInputButton from '@/components/VoiceInputButton';
import { useToast } from '@/components/Toast';

/* ──────────────────────────────────────────────────────── */
/*  Constants                                               */
/* ──────────────────────────────────────────────────────── */

const GOAL_ICONS = ['🎯', '✈️', '🏠', '🚗', '💰', '📚', '🏥', '💍', '🎓', '🛒', '🏖️', '💻', '👶', '🐕', '🎁'];
const GOAL_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'];

/* ──────────────────────────────────────────────────────── */
/*  Helpers                                                 */
/* ──────────────────────────────────────────────────────── */

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

/* ──────────────────────────────────────────────────────── */
/*  Progress Ring                                           */
/* ──────────────────────────────────────────────────────── */

function ProgressRing({ progress, size = 80, strokeWidth = 6, color = '#6366f1' }: { progress: number; size?: number; strokeWidth?: number; color?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-slate-200 dark:text-slate-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  Main Page Component                                     */
/* ──────────────────────────────────────────────────────── */

export default function GoalsPage() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();

  /* ── Data state ── */
  const [goalsList, setGoalsList] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipsLoading, setTipsLoading] = useState<string | null>(null);

  /* ── Form state ── */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', targetAmount: '', currentAmount: '', targetDate: '',
    icon: '🎯', color: '#3b82f6', priority: '0', monthlyTarget: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  /* ── Drag & drop for priority ── */
  const [draggedId, setDraggedId] = useState<string | null>(null);

  /* ── Fetch ── */
  const fetchGoals = useCallback(() => {
    setLoading(true);
    goals.list()
      .then((list) => setGoalsList(list.sort((a, b) => a.priority - b.priority)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  /* ── Open add ── */
  function openAdd() {
    setEditingId(null);
    setForm({ name: '', targetAmount: '', currentAmount: '', targetDate: '', icon: '🎯', color: '#3b82f6', priority: String(goalsList.length), monthlyTarget: '', notes: '' });
    setShowForm(true);
  }

  /* ── Open edit ── */
  function openEdit(g: GoalItem) {
    setEditingId(g.id);
    setForm({
      name: g.name,
      targetAmount: String(g.targetAmount),
      currentAmount: String(g.currentAmount),
      targetDate: g.targetDate ? new Date(g.targetDate).toISOString().slice(0, 10) : '',
      icon: g.icon || '🎯',
      color: g.color || '#3b82f6',
      priority: String(g.priority),
      monthlyTarget: g.monthlyTarget != null ? String(g.monthlyTarget) : '',
      notes: g.notes || '',
    });
    setShowForm(true);
  }

  /* ── Save ── */
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
        priority: parseInt(form.priority) || 0,
        monthlyTarget: form.monthlyTarget ? parseFloat(form.monthlyTarget) : undefined,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await goals.update(editingId, body);
      } else {
        await goals.create(body);
      }
      toast(t('goals.saved'), 'success');
      setShowForm(false);
      fetchGoals();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.somethingWentWrong'), 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ── Delete ── */
  async function handleDelete(id: string) {
    if (!confirm(t('goals.confirmDelete'))) return;
    try {
      await goals.delete(id);
      toast(t('goals.deleted'), 'success');
      fetchGoals();
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    }
  }

  /* ── AI Tips ── */
  async function handleGetTips(id: string) {
    setTipsLoading(id);
    try {
      const res = await goals.aiTips(id);
      setGoalsList((prev) => prev.map((g) => g.id === id ? { ...g, aiTips: res.tips } : g));
    } catch {
      toast(t('common.somethingWentWrong'), 'error');
    }
    setTipsLoading(null);
  }

  /* ── Priority reorder via drag ── */
  async function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const newList = [...goalsList];
    const dragIdx = newList.findIndex((g) => g.id === draggedId);
    const targetIdx = newList.findIndex((g) => g.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;
    const [moved] = newList.splice(dragIdx, 1);
    newList.splice(targetIdx, 0, moved);
    // Update priorities
    const updated = newList.map((g, i) => ({ ...g, priority: i }));
    setGoalsList(updated);
    setDraggedId(null);
    // Persist priorities
    for (const g of updated) {
      goals.update(g.id, { priority: g.priority }).catch(() => {});
    }
  }

  /* ── Summary ── */
  const totalTarget = goalsList.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goalsList.reduce((s, g) => s + g.currentAmount, 0);
  const overallProgress = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;
  const completedGoals = goalsList.filter((g) => g.progress >= 100).length;
  const activeGoals = goalsList.filter((g) => g.progress < 100).length;

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t('goals.title')} <HelpTooltip text={t('help.goals')} className="ms-1" />
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('goals.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={openAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline -mt-0.5 me-1">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('goals.addGoal')}
        </button>
      </div>

      {/* ── Summary Cards ── */}
      {goalsList.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, overallProgress)}%` }}
                />
              </div>
              <span className="text-lg font-bold">{overallProgress}%</span>
            </div>
          </div>
          <div className="card">
            <p className="text-sm text-slate-500">{t('goals.goalsSummary')}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-green-600 dark:text-green-400 font-bold">{completedGoals} {t('goals.reached')}</span>
              <span className="text-slate-400">|</span>
              <span className="text-blue-600 dark:text-blue-400 font-bold">{activeGoals} {t('goals.active')}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {goalsList.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-slate-500">{t('goals.noGoals')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('goals.noGoalsHint')}</p>
          <button type="button" className="btn-primary mt-4" onClick={openAdd}>
            {t('goals.addGoal')}
          </button>
        </div>
      ) : (
        /* ── Goal Cards ── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goalsList.map((g) => {
            const isReached = g.progress >= 100;
            const daysRemaining = g.targetDate
              ? Math.max(0, Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
              : null;

            return (
              <div
                key={g.id}
                className={`card relative overflow-hidden transition-all ${draggedId === g.id ? 'opacity-50 scale-95' : ''}`}
                draggable
                onDragStart={() => setDraggedId(g.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(g.id)}
                onDragEnd={() => setDraggedId(null)}
              >
                {/* Priority accent */}
                {g.color && <div className="absolute inset-x-0 top-0 h-1" style={{ background: g.color }} />}

                {/* Reached badge */}
                {isReached && (
                  <div className="absolute top-3 end-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {t('goals.reached')}
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-4 mb-4">
                  {/* Progress Ring */}
                  <div className="relative">
                    <ProgressRing
                      progress={g.progress}
                      size={72}
                      strokeWidth={5}
                      color={isReached ? '#22c55e' : (g.color || '#6366f1')}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl">{g.icon || '🎯'}</span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg truncate">{g.name}</h3>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mt-0.5">
                          {g.targetDate && (
                            <span className="flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              {new Date(g.targetDate).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL', { month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {daysRemaining != null && !isReached && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              daysRemaining < 30
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                : daysRemaining < 90
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            }`}>
                              {daysRemaining} {t('goals.daysLeft')}
                            </span>
                          )}
                          {g.monthsRemaining != null && g.monthsRemaining > 0 && !isReached && (
                            <span className="text-xs">({g.monthsRemaining} {t('goals.monthsLeft')})</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(g)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title={t('goals.editGoal')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(g.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                          title={t('common.delete')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-medium">
                      {formatCurrency(g.currentAmount, locale)} / {formatCurrency(g.targetAmount, locale)}
                    </span>
                    <span className={`font-bold text-lg ${isReached ? 'text-green-600 dark:text-green-400' : ''}`}>
                      {g.progress}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isReached ? 'bg-gradient-to-r from-green-500 to-emerald-400' : ''}`}
                      style={{
                        width: `${Math.min(100, g.progress)}%`,
                        background: isReached ? undefined : `linear-gradient(to right, ${g.color || '#6366f1'}, ${g.color || '#6366f1'}cc)`,
                      }}
                    />
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm mb-3">
                  {g.remainingAmount > 0 && (
                    <span className="text-slate-500">
                      {t('goals.remaining')}: <b>{formatCurrency(g.remainingAmount, locale)}</b>
                    </span>
                  )}
                  {g.monthlyTarget != null && g.monthlyTarget > 0 && !isReached && (
                    <span className="text-slate-500">
                      {t('goals.monthlyTarget')}: <b className="text-indigo-600 dark:text-indigo-400">{formatCurrency(g.monthlyTarget, locale)}</b>
                    </span>
                  )}
                  <span className="text-slate-400 text-xs">
                    {t('goals.priorityLabel')}: #{g.priority + 1}
                  </span>
                </div>

                {/* AI Tips Section */}
                {g.aiTips && (
                  <div className="p-3 rounded-xl bg-primary-50/50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 mb-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-500">
                        <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                        <line x1="9" y1="21" x2="15" y2="21" />
                      </svg>
                      <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">{t('goals.aiTips')}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{g.aiTips}</p>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                    onClick={() => handleGetTips(g.id)}
                    disabled={tipsLoading === g.id}
                  >
                    {tipsLoading === g.id ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                        {t('goals.generatingTips')}
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                        </svg>
                        {g.aiTips ? t('goals.refreshTips') : t('goals.generateTips')}
                      </>
                    )}
                  </button>
                </div>

                {g.notes && <p className="mt-2 text-xs text-slate-400 italic">{g.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold text-lg">{editingId ? t('goals.editGoal') : t('goals.addGoal')}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.goalName')}</label>
                <div className="relative flex items-center">
                  <input
                    className="input w-full pe-9"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t('goals.goalNamePlaceholder')}
                    required
                  />
                  <div className="absolute end-2 top-1/2 -translate-y-1/2">
                    <VoiceInputButton onResult={(text) => setForm((f) => ({ ...f, name: text }))} />
                  </div>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('goals.targetDate')}</label>
                  <input type="date" className="input w-full" value={form.targetDate} onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('goals.monthlyTarget')}</label>
                  <input type="number" step="1" className="input w-full" value={form.monthlyTarget} onChange={(e) => setForm((f) => ({ ...f, monthlyTarget: e.target.value }))} placeholder={t('common.optional')} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.priorityLabel')}</label>
                <select className="input w-full" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                  {Array.from({ length: Math.max(goalsList.length + 1, 10) }, (_, i) => (
                    <option key={i} value={i}>#{i + 1}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.icon')}</label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, icon }))}
                      className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${form.icon === icon ? 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-110' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.color')}</label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('goals.notes')}</label>
                <div className="relative">
                  <textarea
                    className="input w-full h-20 resize-none pe-9"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={t('goals.notesPlaceholder')}
                  />
                  <div className="absolute end-2 top-2">
                    <VoiceInputButton onResult={(text) => setForm((f) => ({ ...f, notes: f.notes ? f.notes + ' ' + text : text }))} />
                  </div>
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
