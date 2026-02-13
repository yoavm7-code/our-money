'use client';

import { useState, useEffect } from 'react';
import { documents, accounts, type ExtractedItem } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';
import PageHeader from '@/components/PageHeader';
import PageWizard, { type WizardStep } from '@/components/PageWizard';

const MAX_FILES = 10;

const ACCOUNT_TYPES = [
  { value: 'BANK', key: 'settings.bank' },
  { value: 'CREDIT_CARD', key: 'settings.creditCard' },
  { value: 'INSURANCE', key: 'settings.insurance' },
  { value: 'PENSION', key: 'settings.pension' },
  { value: 'INVESTMENT', key: 'settings.investment' },
  { value: 'CASH', key: 'settings.cash' },
];

type UploadSlot = {
  id: string;
  files: File[];
  accountId: string;
};

type ProgressState = {
  phase: 'idle' | 'upload' | 'processing' | 'done';
  uploadPercent: number;
  status: string;
  transactionsCount?: number;
  fileName?: string;
  currentIndex?: number;
  totalFiles?: number;
  slotId?: string;
};

type PendingReviewDoc = { id: string; fileName: string; extractedJson?: ExtractedItem[] };

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', { style: 'currency', currency: 'ILS' }).format(n);
}

let _slotCounter = 0;
function makeSlotId() { return `slot-${Date.now()}-${++_slotCounter}`; }

export default function UploadPage() {
  const { t, locale } = useTranslation();
  const [slots, setSlots] = useState<UploadSlot[]>([{ id: makeSlotId(), files: [], accountId: '' }]);
  const [accountsList, setAccountsList] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recent, setRecent] = useState<Array<{ id: string; fileName: string; status: string; uploadedAt: string; _count?: { transactions: number }; extractedCount?: number }>>([]);
  const [progress, setProgress] = useState<ProgressState>({ phase: 'idle', uploadPercent: 0, status: '' });
  const [pendingReview, setPendingReview] = useState<{ document: PendingReviewDoc; accountId: string } | null>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);
  // Inline add-source state
  const [addingSourceForSlot, setAddingSourceForSlot] = useState<string | null>(null);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceType, setNewSourceType] = useState('BANK');
  const [savingSource, setSavingSource] = useState(false);

  useEffect(() => {
    accounts.list().then((a) => setAccountsList(a)).catch(() => {}).finally(() => setAccountsLoaded(true));
    documents.list().then((r) => setRecent(r)).catch(() => {});
  }, []);

  function updateSlot(slotId: string, patch: Partial<UploadSlot>) {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    setSlots((prev) => [...prev, { id: makeSlotId(), files: [], accountId: '' }]);
  }

  function removeSlot(slotId: string) {
    setSlots((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== slotId);
    });
  }

  function removeFileFromSlot(slotId: string, fileIndex: number) {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, files: s.files.filter((_, i) => i !== fileIndex) } : s)));
  }

  async function handleAddSource(slotId: string) {
    if (!newSourceName.trim()) return;
    setSavingSource(true);
    try {
      const created = await accounts.create({ name: newSourceName.trim(), type: newSourceType });
      const id = (created as { id: string }).id;
      const updated = await accounts.list();
      setAccountsList(updated);
      updateSlot(slotId, { accountId: id });
      setAddingSourceForSlot(null);
      setNewSourceName('');
      setNewSourceType('BANK');
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : t('common.failedToLoad') });
    } finally {
      setSavingSource(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validSlots = slots.filter((s) => s.files.length > 0 && s.accountId);
    if (validSlots.length === 0) {
      setMessage({ type: 'error', text: t('upload.selectFileAndAccount') });
      return;
    }
    setUploading(true);
    setMessage(null);
    let lastStatus: string | undefined;
    let totalExtracted = 0;
    const allFiles = validSlots.flatMap((s) => s.files.map((f) => ({ file: f, accountId: s.accountId, slotId: s.id })));
    const totalFiles = allFiles.length;
    try {
      for (let i = 0; i < allFiles.length; i++) {
        const { file, accountId, slotId } = allFiles[i];
        setProgress({
          phase: 'upload',
          uploadPercent: 0,
          status: t('upload.uploading'),
          fileName: file.name,
          currentIndex: i + 1,
          totalFiles,
          slotId,
        });
        const result = await documents.uploadWithProgress(file, accountId, (state) => {
          if (state.phase === 'upload') {
            setProgress((p) => ({
              ...p,
              phase: 'upload',
              uploadPercent: state.uploadPercent ?? 0,
              status: t('upload.uploadingPercent', { percent: state.uploadPercent ?? 0 }),
              fileName: file.name,
              currentIndex: i + 1,
              totalFiles,
              slotId,
            }));
          } else if (state.phase === 'processing') {
            setProgress((p) => ({
              ...p,
              phase: 'processing',
              status: state.status === 'PROCESSING' ? t('upload.processing') : (state.status ?? t('upload.processing')),
              fileName: file.name,
              currentIndex: i + 1,
              totalFiles,
              slotId,
            }));
          } else {
            lastStatus = state.document?.status;
            const count = state.transactionsCount ?? state.document?._count?.transactions ?? 0;
            totalExtracted += count;
            setProgress((p) => ({
              ...p,
              phase: i < allFiles.length - 1 ? 'upload' : 'done',
              status:
                state.document?.status === 'COMPLETED'
                  ? t('upload.doneCount', { count })
                  : state.document?.status === 'FAILED'
                    ? t('upload.doneFailed')
                    : state.document?.status === 'PENDING_REVIEW'
                      ? t('upload.duplicatesFound')
                      : (state.status ?? ''),
              transactionsCount: count,
              fileName: file.name,
              currentIndex: i + 1,
              totalFiles,
              slotId,
            }));
          }
        });
        if (result.status === 'PENDING_REVIEW' && (result as { extractedJson?: ExtractedItem[] }).extractedJson) {
          setPendingReview({
            document: { id: result.id, fileName: result.fileName, extractedJson: (result as { extractedJson?: ExtractedItem[] }).extractedJson },
            accountId,
          });
          setUploading(false);
          setTimeout(() => setProgress({ phase: 'idle', uploadPercent: 0, status: '' }), 500);
          documents.list().then((r) => setRecent(r)).catch(() => {});
          return;
        }
      }
      if (lastStatus === 'FAILED') {
        setMessage({ type: 'error', text: t('upload.processingFailed') });
      } else {
        setMessage({
          type: 'success',
          text: totalFiles > 1 ? t('upload.successMultiple', { count: totalFiles, transactions: totalExtracted }) : t('upload.successMessage'),
        });
        setSlots([{ id: makeSlotId(), files: [], accountId: '' }]);
      }
      documents.list().then((r) => setRecent(r)).catch(() => {});
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('upload.uploadFailed') });
    } finally {
      setUploading(false);
      setTimeout(() => setProgress({ phase: 'idle', uploadPercent: 0, status: '' }), 2500);
    }
  }

  async function handleConfirmImport(action: 'add_all' | 'skip_duplicates' | 'add_none') {
    if (!pendingReview) return;
    setConfirmingImport(true);
    setMessage(null);
    try {
      await documents.confirmImport(pendingReview.document.id, {
        accountId: pendingReview.accountId,
        action,
      });
      setPendingReview(null);
      setMessage({ type: 'success', text: t('upload.importConfirmed') });
      documents.list().then((r) => setRecent(r)).catch(() => {});
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : t('upload.uploadFailed') });
    } finally {
      setConfirmingImport(false);
    }
  }

  const extractedList = pendingReview?.document?.extractedJson ?? [];

  return (
    <div className="space-y-8 animate-fadeIn">
      <PageHeader
        title={t('upload.title')}
        description={t('upload.description')}
        helpText={t('help.upload')}
      />
      <PageWizard pageKey="upload" steps={[
        { title: t('wizard.upload.step1Title'), description: t('wizard.upload.step1Desc') },
        { title: t('wizard.upload.step2Title'), description: t('wizard.upload.step2Desc') },
        { title: t('wizard.upload.step3Title'), description: t('wizard.upload.step3Desc') },
      ]} />

      <form onSubmit={handleSubmit} className="space-y-4">
        {slots.map((slot, idx) => (
          <div key={slot.id} className="card max-w-lg relative">
            {slots.length > 1 && (
              <button
                type="button"
                onClick={() => removeSlot(slot.id)}
                className="absolute top-3 end-3 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title={t('common.delete')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
            {slots.length > 1 && (
              <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-3">
                {t('upload.slotNumber', { n: idx + 1 })}
              </p>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('upload.account')}</label>
                {accountsLoaded && accountsList.length === 0 && !addingSourceForSlot ? (
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                      {t('upload.noAccountsYet')}
                    </p>
                    <a href="/settings" className="text-sm text-primary-600 hover:underline font-medium">
                      {t('upload.goToSettings')} →
                    </a>
                  </div>
                ) : (
                  <>
                    <select
                      className="input"
                      value={slot.accountId}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') {
                          setAddingSourceForSlot(slot.id);
                          return;
                        }
                        updateSlot(slot.id, { accountId: e.target.value });
                      }}
                      required
                    >
                      <option value="">{t('upload.chooseSource')}</option>
                      {accountsList.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                      <option value="__add_new__">+ {t('upload.addNewSource')}</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1.5">
                      {t('upload.accountHint')}
                    </p>
                  </>
                )}
                {addingSourceForSlot === slot.id && (
                  <div className="mt-3 p-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10 space-y-3 animate-fadeIn">
                    <p className="text-sm font-medium">{t('upload.addNewSource')}</p>
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-xs text-slate-500 mb-1">{t('settings.name')}</label>
                        <input
                          type="text"
                          className="input"
                          value={newSourceName}
                          onChange={(e) => setNewSourceName(e.target.value)}
                          placeholder={t('settings.namePlaceholder')}
                        />
                      </div>
                      <div className="w-36">
                        <label className="block text-xs text-slate-500 mb-1">{t('settings.type')}</label>
                        <select className="input" value={newSourceType} onChange={(e) => setNewSourceType(e.target.value)}>
                          {ACCOUNT_TYPES.map((at) => (
                            <option key={at.value} value={at.value}>{t(at.key)}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        className="btn-primary text-sm"
                        disabled={savingSource || !newSourceName.trim()}
                        onClick={() => handleAddSource(slot.id)}
                      >
                        {savingSource ? t('settings.adding') : t('common.add')}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={() => { setAddingSourceForSlot(null); setNewSourceName(''); setNewSourceType('BANK'); }}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('upload.fileLabel')}</label>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf,text/csv,application/csv,.csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="input"
                  onChange={(e) => {
                    const chosen = Array.from(e.target.files ?? []);
                    updateSlot(slot.id, { files: [...slot.files, ...chosen].slice(0, MAX_FILES) });
                    e.target.value = '';
                  }}
                />
                <p className="text-xs text-slate-500 mt-1.5">{t('upload.fileTypesHint')}</p>
                {slot.files.length > 0 && (
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {slot.files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-slate-100 dark:bg-slate-800">
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          className="text-red-600 hover:underline shrink-0 ms-2"
                          onClick={() => removeFileFromSlot(slot.id, i)}
                          aria-label={t('common.delete')}
                        >
                          {t('common.delete')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Add another upload slot */}
        <button
          type="button"
          onClick={addSlot}
          className="flex items-center gap-2 mx-auto px-5 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-primary-400 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:text-primary-400 transition-all duration-200 hover:shadow-sm"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span className="text-sm font-medium">{t('upload.addUploadSlot')}</span>
        </button>

        {message && (
          <p className={`text-sm text-center ${message.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {message.text}
          </p>
        )}
        <div className="flex justify-center">
          <button type="submit" className="btn-primary" disabled={uploading}>
            {uploading ? t('upload.uploadingProcessing') : t('upload.upload')}
          </button>
        </div>
        {(progress.phase === 'upload' || progress.phase === 'processing' || progress.phase === 'done') && (
          <div className="max-w-lg mx-auto p-4 rounded-lg bg-slate-100 dark:bg-slate-800 border border-[var(--border)]">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {progress.fileName ?? t('common.file')}
              {progress.totalFiles != null && progress.totalFiles > 1 && (
                <span className="text-slate-500 font-normal"> ({t('upload.fileOf', { current: progress.currentIndex ?? 1, total: progress.totalFiles })})</span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all duration-500 ease-out"
                  style={{
                    width:
                      progress.phase === 'upload'
                        ? `${Math.round(progress.uploadPercent * 0.5)}%`
                        : progress.phase === 'processing'
                          ? '75%'
                          : '100%',
                  }}
                />
              </div>
              <span className="text-sm text-slate-600 dark:text-slate-400 min-w-[140px]">{progress.status}</span>
            </div>
            {progress.phase === 'processing' && (
              <p className="text-xs text-slate-500 mt-2">{t('upload.ocrMayTakeMinute')}</p>
            )}
          </div>
        )}
      </form>
      {recent.length > 0 && (
        <div className="card">
          <h2 className="font-medium mb-4">{t('upload.recentUploads')}</h2>
          <ul className="space-y-2">
            {recent.slice(0, 10).map((d) => (
              <li key={d.id} className="flex flex-col gap-1 py-2 border-b border-[var(--border)] last:border-0">
                <div className="flex justify-between items-center">
                  <span>{d.fileName}</span>
                  <span
                    className={`text-sm ${
                      d.status === 'COMPLETED'
                        ? 'text-green-600'
                        : d.status === 'FAILED'
                          ? 'text-red-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {d.status === 'COMPLETED'
                      ? t('upload.doneCount', { count: d.extractedCount ?? d._count?.transactions ?? 0 })
                      : d.status === 'FAILED'
                        ? t('upload.doneFailed')
                        : d.status === 'PROCESSING'
                          ? t('upload.processing')
                          : d.status === 'PENDING_REVIEW'
                            ? t('upload.duplicatesFound')
                            : d.status}
                  </span>
                </div>
                {d.status === 'COMPLETED' && (d.extractedCount ?? d._count?.transactions ?? 0) === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t('upload.noTransactionsExtracted')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingReview && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="duplicate-review-title">
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <h2 id="duplicate-review-title" className="font-semibold text-lg p-4 border-b border-[var(--border)]">
              {t('upload.duplicateReviewTitle')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 px-4 pb-2">
              {t('upload.duplicateReviewIntro', { file: pendingReview.document.fileName })}
            </p>
            <ul className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {extractedList.map((item, idx) => (
                <li key={idx} className="border border-[var(--border)] rounded-lg p-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{item.description}</span>
                    <span className={Number(item.amount) >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(item.amount, locale)}
                    </span>
                  </div>
                  <div className="text-slate-500 mt-1">{item.date}</div>
                  {item.isDuplicate && item.existingTransaction && (
                    <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                      <span className="font-medium">{t('upload.duplicateExisting')}</span>
                      <span className="block mt-1">
                        {item.existingTransaction.date} · {item.existingTransaction.description} · {formatCurrency(item.existingTransaction.amount, locale)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="p-4 border-t border-[var(--border)] flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={confirmingImport}
                onClick={() => handleConfirmImport('add_all')}
              >
                {confirmingImport ? t('common.loading') : t('upload.addAll')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={confirmingImport}
                onClick={() => handleConfirmImport('skip_duplicates')}
              >
                {t('upload.addOnlyNew')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={confirmingImport}
                onClick={() => handleConfirmImport('add_none')}
              >
                {t('upload.addNone')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
