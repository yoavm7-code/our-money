'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  documents,
  accounts,
  categories,
  type ExtractedItem,
  type DocumentWithCount,
  type AccountItem,
  type CategoryItem,
} from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';

/* ──────────────────────────────────────────────────────── */
/*  Constants                                                */
/* ──────────────────────────────────────────────────────── */

const MAX_FILES_PER_SLOT = 5;

const ACCOUNT_TYPES = [
  { value: 'BANK', key: 'settings.bank' },
  { value: 'CREDIT_CARD', key: 'settings.creditCard' },
  { value: 'INSURANCE', key: 'settings.insurance' },
  { value: 'PENSION', key: 'settings.pension' },
  { value: 'INVESTMENT', key: 'settings.investment' },
  { value: 'CASH', key: 'settings.cash' },
];

const SUPPORTED_FORMATS = [
  { ext: 'PDF', icon: 'pdf', color: 'text-red-500' },
  { ext: 'CSV', icon: 'csv', color: 'text-green-500' },
  { ext: 'Excel', icon: 'xls', color: 'text-emerald-600' },
  { ext: 'Images', icon: 'img', color: 'text-blue-500' },
  { ext: 'Word', icon: 'doc', color: 'text-indigo-500' },
];

const ACCEPT_TYPES =
  'image/jpeg,image/png,image/webp,application/pdf,text/csv,application/csv,.csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/* ──────────────────────────────────────────────────────── */
/*  Types                                                    */
/* ──────────────────────────────────────────────────────── */

type UploadSlot = {
  id: string;
  files: File[];
  accountId: string;
  progress: SlotProgress;
};

type SlotProgress = {
  phase: 'idle' | 'uploading' | 'processing' | 'extracting' | 'done' | 'error';
  uploadPercent: number;
  status: string;
  errorMessage?: string;
};

type ExtractedTxRow = ExtractedItem & {
  selected: boolean;
  editedCategoryId?: string;
  editedDescription?: string;
  editedAmount?: number;
};

type PendingReview = {
  documentId: string;
  fileName: string;
  accountId: string;
  items: ExtractedTxRow[];
};

/* ──────────────────────────────────────────────────────── */
/*  Helpers                                                  */
/* ──────────────────────────────────────────────────────── */

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(n);
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatRelativeTime(dateStr: string, locale: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return locale === 'he' ? '\u05E2\u05DB\u05E9\u05D9\u05D5' : 'Just now';
  if (diffMins < 60) return locale === 'he' ? `\u05DC\u05E4\u05E0\u05D9 ${diffMins} \u05D3\u05E7\u05D5\u05EA` : `${diffMins}m ago`;
  if (diffHours < 24) return locale === 'he' ? `\u05DC\u05E4\u05E0\u05D9 ${diffHours} \u05E9\u05E2\u05D5\u05EA` : `${diffHours}h ago`;
  if (diffDays < 7) return locale === 'he' ? `\u05DC\u05E4\u05E0\u05D9 ${diffDays} \u05D9\u05DE\u05D9\u05DD` : `${diffDays}d ago`;
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-IL');
}

function getFileIcon(fileName: string): { icon: string; color: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return { icon: 'PDF', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' };
  if (['csv'].includes(ext)) return { icon: 'CSV', color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' };
  if (['xlsx', 'xls'].includes(ext)) return { icon: 'XLS', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' };
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return { icon: 'IMG', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' };
  if (['doc', 'docx'].includes(ext)) return { icon: 'DOC', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' };
  return { icon: 'FILE', color: 'bg-slate-100 dark:bg-slate-800 text-slate-500' };
}

let _slotCounter = 0;
function makeSlotId() {
  return `slot-${Date.now()}-${++_slotCounter}`;
}

/* ──────────────────────────────────────────────────────── */
/*  FileTypeIcon                                             */
/* ──────────────────────────────────────────────────────── */

function FileTypeIcon({ fileName }: { fileName: string }) {
  const { icon, color } = getFileIcon(fileName);
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-xs font-bold ${color}`}>
      {icon}
    </span>
  );
}

/* ──────────────────────────────────────────────────────── */
/*  StatusIcon                                               */
/* ──────────────────────────────────────────────────────── */

function StatusIcon({ phase }: { phase: SlotProgress['phase'] }) {
  switch (phase) {
    case 'idle':
      return null;
    case 'uploading':
    case 'processing':
    case 'extracting':
      return (
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      );
    case 'done':
      return (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      );
    case 'error':
      return (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      );
  }
}

/* ──────────────────────────────────────────────────────── */
/*  Main Upload Page                                         */
/* ──────────────────────────────────────────────────────── */

export default function UploadPage() {
  const { t, locale } = useTranslation();

  /* ── state ── */
  const [slots, setSlots] = useState<UploadSlot[]>([
    { id: makeSlotId(), files: [], accountId: '', progress: { phase: 'idle', uploadPercent: 0, status: '' } },
  ]);
  const [accountsList, setAccountsList] = useState<AccountItem[]>([]);
  const [categoriesList, setCategoriesList] = useState<CategoryItem[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recent, setRecent] = useState<DocumentWithCount[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  /* ── pending review ── */
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);

  /* ── inline account creation ── */
  const [addingSourceForSlot, setAddingSourceForSlot] = useState<string | null>(null);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceType, setNewSourceType] = useState('BANK');
  const [savingSource, setSavingSource] = useState(false);

  /* ── drag state ── */
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);

  /* ── refs ── */
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* ──────────────────────────────────────────────────────── */
  /*  Load data                                               */
  /* ──────────────────────────────────────────────────────── */

  useEffect(() => {
    accounts.list().then(setAccountsList).catch(() => {}).finally(() => setAccountsLoaded(true));
    categories.list().then(setCategoriesList).catch(() => {});
    documents
      .list()
      .then(setRecent)
      .catch(() => {})
      .finally(() => setRecentLoading(false));
  }, []);

  /* ──────────────────────────────────────────────────────── */
  /*  Slot management                                         */
  /* ──────────────────────────────────────────────────────── */

  function updateSlot(slotId: string, patch: Partial<UploadSlot>) {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)));
  }

  function updateSlotProgress(slotId: string, patch: Partial<SlotProgress>) {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId ? { ...s, progress: { ...s.progress, ...patch } } : s,
      ),
    );
  }

  function addSlot() {
    if (slots.length >= 5) return;
    setSlots((prev) => [
      ...prev,
      { id: makeSlotId(), files: [], accountId: '', progress: { phase: 'idle', uploadPercent: 0, status: '' } },
    ]);
  }

  function removeSlot(slotId: string) {
    setSlots((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== slotId);
    });
  }

  function removeFileFromSlot(slotId: string, fileIndex: number) {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId ? { ...s, files: s.files.filter((_, i) => i !== fileIndex) } : s,
      ),
    );
  }

  function addFilesToSlot(slotId: string, files: File[]) {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, files: [...s.files, ...files].slice(0, MAX_FILES_PER_SLOT) }
          : s,
      ),
    );
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Drag & Drop handlers                                    */
  /* ──────────────────────────────────────────────────────── */

  const handleDragOver = useCallback((e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlotId(slotId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlotId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, slotId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverSlotId(null);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) addFilesToSlot(slotId, files);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ──────────────────────────────────────────────────────── */
  /*  Add new account inline                                  */
  /* ──────────────────────────────────────────────────────── */

  async function handleAddSource(slotId: string) {
    if (!newSourceName.trim()) return;
    setSavingSource(true);
    try {
      const created = await accounts.create({ name: newSourceName.trim(), type: newSourceType });
      const updated = await accounts.list();
      setAccountsList(updated);
      updateSlot(slotId, { accountId: created.id });
      setAddingSourceForSlot(null);
      setNewSourceName('');
      setNewSourceType('BANK');
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : t('common.failedToLoad') });
    } finally {
      setSavingSource(false);
    }
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Upload & process                                        */
  /* ──────────────────────────────────────────────────────── */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validSlots = slots.filter((s) => s.files.length > 0 && s.accountId);
    if (validSlots.length === 0) {
      setMessage({ type: 'error', text: t('upload.selectFileAndAccount') });
      return;
    }
    setUploading(true);
    setMessage(null);

    let totalExtracted = 0;
    let totalFilesUploaded = 0;
    let hadError = false;

    for (const slot of validSlots) {
      for (let i = 0; i < slot.files.length; i++) {
        const file = slot.files[i];
        totalFilesUploaded++;

        updateSlotProgress(slot.id, {
          phase: 'uploading',
          uploadPercent: 0,
          status: t('upload.uploading'),
        });

        try {
          const result = await documents.uploadWithProgress(file, slot.accountId, (state) => {
            if (state.phase === 'upload') {
              updateSlotProgress(slot.id, {
                phase: 'uploading',
                uploadPercent: state.uploadPercent ?? 0,
                status: t('upload.uploadingPercent', { percent: state.uploadPercent ?? 0 }),
              });
            } else if (state.phase === 'processing') {
              const statusLabel =
                state.status === 'PROCESSING'
                  ? t('upload.processing')
                  : state.status === 'EXTRACTING'
                    ? t('upload.extracting')
                    : t('upload.processing');
              updateSlotProgress(slot.id, {
                phase: state.status === 'EXTRACTING' ? 'extracting' : 'processing',
                status: statusLabel,
              });
            } else {
              const count = state.transactionsCount ?? state.document?._count?.transactions ?? 0;
              totalExtracted += count;
              updateSlotProgress(slot.id, {
                phase: 'done',
                uploadPercent: 100,
                status:
                  state.document?.status === 'COMPLETED'
                    ? t('upload.doneCount', { count })
                    : state.document?.status === 'FAILED'
                      ? t('upload.doneFailed')
                      : state.document?.status === 'PENDING_REVIEW'
                        ? t('upload.duplicatesFound')
                        : '',
              });
            }
          });

          // If pending review, show the review modal
          if (
            result.status === 'PENDING_REVIEW' &&
            (result as { extractedJson?: ExtractedItem[] }).extractedJson
          ) {
            const extracted = (result as { extractedJson?: ExtractedItem[] }).extractedJson || [];
            setPendingReview({
              documentId: result.id,
              fileName: result.fileName,
              accountId: slot.accountId,
              items: extracted.map((item) => ({
                ...item,
                selected: !item.isDuplicate,
              })),
            });
            setUploading(false);
            documents.list().then(setRecent).catch(() => {});
            return;
          }

          if (result.status === 'FAILED') {
            hadError = true;
            updateSlotProgress(slot.id, {
              phase: 'error',
              status: t('upload.doneFailed'),
              errorMessage: t('upload.processingFailed'),
            });
          }
        } catch (err) {
          hadError = true;
          updateSlotProgress(slot.id, {
            phase: 'error',
            status: t('upload.uploadFailed'),
            errorMessage: err instanceof Error ? err.message : t('upload.uploadFailed'),
          });
        }
      }
    }

    if (hadError) {
      setMessage({ type: 'error', text: t('upload.someFilesFailed') });
    } else {
      setMessage({
        type: 'success',
        text:
          totalFilesUploaded > 1
            ? t('upload.successMultiple', { count: totalFilesUploaded, transactions: totalExtracted })
            : t('upload.successMessage'),
      });
      // Reset slots
      setSlots([
        { id: makeSlotId(), files: [], accountId: '', progress: { phase: 'idle', uploadPercent: 0, status: '' } },
      ]);
    }

    setUploading(false);
    documents.list().then(setRecent).catch(() => {});
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Retry a failed slot                                     */
  /* ──────────────────────────────────────────────────────── */

  async function handleRetrySlot(slotId: string) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot || slot.files.length === 0 || !slot.accountId) return;

    updateSlotProgress(slotId, { phase: 'uploading', uploadPercent: 0, status: t('upload.uploading'), errorMessage: undefined });
    setMessage(null);

    try {
      for (const file of slot.files) {
        const result = await documents.uploadWithProgress(file, slot.accountId, (state) => {
          if (state.phase === 'upload') {
            updateSlotProgress(slotId, {
              phase: 'uploading',
              uploadPercent: state.uploadPercent ?? 0,
              status: t('upload.uploadingPercent', { percent: state.uploadPercent ?? 0 }),
            });
          } else if (state.phase === 'processing') {
            updateSlotProgress(slotId, { phase: 'processing', status: t('upload.processing') });
          } else {
            const count = state.transactionsCount ?? 0;
            updateSlotProgress(slotId, {
              phase: 'done',
              uploadPercent: 100,
              status: state.document?.status === 'COMPLETED'
                ? t('upload.doneCount', { count })
                : t('upload.doneFailed'),
            });
          }
        });

        if (result.status === 'PENDING_REVIEW' && (result as { extractedJson?: ExtractedItem[] }).extractedJson) {
          const extracted = (result as { extractedJson?: ExtractedItem[] }).extractedJson || [];
          setPendingReview({
            documentId: result.id,
            fileName: result.fileName,
            accountId: slot.accountId,
            items: extracted.map((item) => ({ ...item, selected: !item.isDuplicate })),
          });
          documents.list().then(setRecent).catch(() => {});
          return;
        }
      }
      documents.list().then(setRecent).catch(() => {});
    } catch (err) {
      updateSlotProgress(slotId, {
        phase: 'error',
        status: t('upload.uploadFailed'),
        errorMessage: err instanceof Error ? err.message : t('upload.uploadFailed'),
      });
    }
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Pending review actions                                  */
  /* ──────────────────────────────────────────────────────── */

  function toggleReviewItem(idx: number) {
    setPendingReview((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], selected: !items[idx].selected };
      return { ...prev, items };
    });
  }

  function toggleAllReviewItems(select: boolean) {
    setPendingReview((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.map((item) => ({ ...item, selected: select })) };
    });
  }

  function updateReviewItemCategory(idx: number, categoryId: string) {
    setPendingReview((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], editedCategoryId: categoryId };
      return { ...prev, items };
    });
  }

  async function handleConfirmImport(action: 'add_all' | 'skip_duplicates' | 'add_none', selectedIndices?: number[]) {
    if (!pendingReview) return;
    setConfirmingImport(true);
    setMessage(null);
    try {
      await documents.confirmImport(pendingReview.documentId, {
        accountId: pendingReview.accountId,
        action,
        selectedIndices,
      });
      setPendingReview(null);
      setMessage({ type: 'success', text: t('upload.importConfirmed') });
      documents.list().then(setRecent).catch(() => {});
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : t('upload.uploadFailed') });
    } finally {
      setConfirmingImport(false);
    }
  }

  function handleImportSelected() {
    if (!pendingReview) return;
    const selectedIndices = pendingReview.items
      .map((item, idx) => (item.selected ? idx : -1))
      .filter((i) => i >= 0);
    handleConfirmImport('add_all', selectedIndices);
  }

  /* ──────────────────────────────────────────────────────── */
  /*  Computed                                                */
  /* ──────────────────────────────────────────────────────── */

  const selectedCount = pendingReview?.items.filter((i) => i.selected).length ?? 0;
  const duplicateCount = pendingReview?.items.filter((i) => i.isDuplicate).length ?? 0;

  const getCategoryName = useCallback(
    (slug?: string) => {
      if (!slug) return '';
      const cat = categoriesList.find((c) => c.slug === slug);
      if (cat) {
        const translated = t('categories.' + cat.slug);
        return translated !== 'categories.' + cat.slug ? translated : cat.name;
      }
      return slug.replace(/_/g, ' ');
    },
    [categoriesList, t],
  );

  /* ──────────────────────────────────────────────────────── */
  /*  Render                                                  */
  /* ──────────────────────────────────────────────────────── */

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t('upload.title')}
          <HelpTooltip text={t('help.upload')} className="ms-2" />
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{t('upload.description')}</p>
      </div>

      {/* ── Supported formats indicator ── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-slate-500">{t('upload.supportedFormats')}:</span>
        {SUPPORTED_FORMATS.map((fmt) => (
          <span
            key={fmt.ext}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400"
          >
            <span className={fmt.color}>
              {fmt.ext === 'PDF' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              )}
              {fmt.ext === 'CSV' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></svg>
              )}
              {fmt.ext === 'Excel' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
              )}
              {fmt.ext === 'Images' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              )}
              {fmt.ext === 'Word' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              )}
            </span>
            {fmt.ext}
          </span>
        ))}
      </div>

      {/* ── Upload Form ── */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {slots.map((slot, idx) => (
          <div
            key={slot.id}
            className={`card max-w-2xl relative transition-all duration-200 ${
              dragOverSlotId === slot.id
                ? 'ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-slate-900 bg-indigo-50/50 dark:bg-indigo-900/10'
                : ''
            }`}
            onDragOver={(e) => handleDragOver(e, slot.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, slot.id)}
          >
            {/* Remove slot button */}
            {slots.length > 1 && (
              <button
                type="button"
                onClick={() => removeSlot(slot.id)}
                className="absolute top-3 end-3 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title={t('common.delete')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}

            {/* Slot number */}
            {slots.length > 1 && (
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-3">
                {t('upload.slotNumber', { n: idx + 1 })}
              </p>
            )}

            <div className="space-y-4">
              {/* Account selector */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('upload.account')}</label>
                {accountsLoaded && accountsList.length === 0 && !addingSourceForSlot ? (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                      {t('upload.noAccountsYet')}
                    </p>
                    <button
                      type="button"
                      className="text-sm text-indigo-600 hover:underline font-medium"
                      onClick={() => setAddingSourceForSlot(slot.id)}
                    >
                      {t('upload.addNewSource')}
                    </button>
                  </div>
                ) : (
                  <>
                    <select
                      className="input w-full"
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
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                      <option value="__add_new__">+ {t('upload.addNewSource')}</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">{t('upload.accountHint')}</p>
                  </>
                )}

                {/* Inline account creation */}
                {addingSourceForSlot === slot.id && (
                  <div className="mt-3 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 space-y-3 animate-fadeIn">
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
                          autoFocus
                        />
                      </div>
                      <div className="w-36">
                        <label className="block text-xs text-slate-500 mb-1">{t('settings.type')}</label>
                        <select className="input" value={newSourceType} onChange={(e) => setNewSourceType(e.target.value)}>
                          {ACCOUNT_TYPES.map((at) => (
                            <option key={at.value} value={at.value}>
                              {t(at.key)}
                            </option>
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
                        onClick={() => {
                          setAddingSourceForSlot(null);
                          setNewSourceName('');
                          setNewSourceType('BANK');
                        }}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* File upload / drag & drop zone */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('upload.fileLabel')}</label>
                <div
                  className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                    dragOverSlotId === slot.id
                      ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10'
                      : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/5'
                  }`}
                  onClick={() => fileInputRefs.current[slot.id]?.click()}
                >
                  <input
                    ref={(el) => { fileInputRefs.current[slot.id] = el; }}
                    type="file"
                    multiple
                    accept={ACCEPT_TYPES}
                    className="hidden"
                    onChange={(e) => {
                      const chosen = Array.from(e.target.files ?? []);
                      addFilesToSlot(slot.id, chosen);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('upload.dragDropHint')}
                    </p>
                    <p className="text-xs text-slate-500">{t('upload.fileTypesHint')}</p>
                    <p className="text-xs text-slate-400">
                      ({t('upload.maxFiles', { count: MAX_FILES_PER_SLOT })})
                    </p>
                  </div>
                </div>

                {/* File list */}
                {slot.files.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {slot.files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[var(--border)]"
                      >
                        <FileTypeIcon fileName={f.name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.name}</p>
                          <p className="text-xs text-slate-500">
                            {(f.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                          onClick={() => removeFileFromSlot(slot.id, i)}
                          aria-label={t('common.delete')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Progress */}
              {slot.progress.phase !== 'idle' && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[var(--border)] space-y-2">
                  <div className="flex items-center gap-3">
                    <StatusIcon phase={slot.progress.phase} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
                      {slot.progress.status}
                    </span>
                    {slot.progress.phase === 'uploading' && (
                      <span className="text-xs text-slate-500">{slot.progress.uploadPercent}%</span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ease-out rounded-full ${
                        slot.progress.phase === 'error'
                          ? 'bg-red-500'
                          : slot.progress.phase === 'done'
                            ? 'bg-green-500'
                            : 'bg-indigo-500'
                      }`}
                      style={{
                        width:
                          slot.progress.phase === 'uploading'
                            ? `${Math.round(slot.progress.uploadPercent * 0.5)}%`
                            : slot.progress.phase === 'processing'
                              ? '65%'
                              : slot.progress.phase === 'extracting'
                                ? '85%'
                                : slot.progress.phase === 'done' || slot.progress.phase === 'error'
                                  ? '100%'
                                  : '0%',
                      }}
                    />
                  </div>
                  {slot.progress.phase === 'processing' && (
                    <p className="text-xs text-slate-500">{t('upload.ocrMayTakeMinute')}</p>
                  )}
                  {slot.progress.phase === 'error' && slot.progress.errorMessage && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-red-500">{slot.progress.errorMessage}</p>
                      <button
                        type="button"
                        className="text-xs text-indigo-600 hover:underline font-medium"
                        onClick={() => handleRetrySlot(slot.id)}
                      >
                        {t('upload.retry')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Add another upload slot */}
        {slots.length < 5 && (
          <button
            type="button"
            onClick={addSlot}
            className="flex items-center gap-2 mx-auto px-6 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-all duration-200 hover:shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="text-sm font-medium">{t('upload.addUploadSlot')}</span>
          </button>
        )}

        {/* Message */}
        {message && (
          <div
            className={`max-w-2xl mx-auto p-4 rounded-xl border text-sm ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              )}
              {message.text}
            </div>
          </div>
        )}

        {/* Submit button */}
        <div className="flex justify-center">
          <button type="submit" className="btn-primary px-8 py-2.5 text-base" disabled={uploading}>
            {uploading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('upload.uploadingProcessing')}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {t('upload.upload')}
              </span>
            )}
          </button>
        </div>
      </form>

      {/* ── Recent Uploads ── */}
      {recentLoading ? (
        <div className="card max-w-2xl">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl" />
                <div className="flex-1 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : recent.length > 0 ? (
        <div className="card max-w-2xl">
          <h2 className="font-semibold text-lg mb-4">{t('upload.recentUploads')}</h2>
          <ul className="space-y-2">
            {recent.slice(0, 10).map((d) => {
              const txCount = d.extractedCount ?? d._count?.transactions ?? 0;
              const statusColor =
                d.status === 'COMPLETED'
                  ? 'text-green-600 dark:text-green-400'
                  : d.status === 'FAILED'
                    ? 'text-red-600 dark:text-red-400'
                    : d.status === 'PROCESSING'
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-amber-600 dark:text-amber-400';

              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <FileTypeIcon fileName={d.fileName} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.fileName}</p>
                    <p className="text-xs text-slate-500">
                      {formatRelativeTime(d.uploadedAt, locale)}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className={`text-sm font-medium ${statusColor}`}>
                      {d.status === 'COMPLETED'
                        ? t('upload.doneCount', { count: txCount })
                        : d.status === 'FAILED'
                          ? t('upload.doneFailed')
                          : d.status === 'PROCESSING'
                            ? t('upload.processing')
                            : d.status === 'PENDING_REVIEW'
                              ? t('upload.duplicatesFound')
                              : d.status}
                    </p>
                    {d.status === 'COMPLETED' && txCount === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t('upload.noTransactionsExtracted')}
                      </p>
                    )}
                  </div>
                  {/* Status icon */}
                  <div className="shrink-0">
                    {d.status === 'COMPLETED' && (
                      <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-600">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                    {d.status === 'FAILED' && (
                      <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-red-600">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </div>
                    )}
                    {d.status === 'PROCESSING' && (
                      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        /* ── Empty State ── */
        <div className="card max-w-2xl py-12 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t('upload.emptyStateTitle')}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            {t('upload.emptyStateDescription')}
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/*  Extracted Transactions Review Modal                */}
      {/* ══════════════════════════════════════════════════ */}
      {pendingReview && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div
            className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-scaleIn mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-[var(--border)]">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">{t('upload.duplicateReviewTitle')}</h2>
                <button
                  type="button"
                  onClick={() => setPendingReview(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {t('upload.duplicateReviewIntro', { file: pendingReview.fileName })}
              </p>
              {/* Summary badges */}
              <div className="flex items-center gap-3 mt-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
                  {pendingReview.items.length} {t('upload.transactionsFound')}
                </span>
                {duplicateCount > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                    {duplicateCount} {t('upload.duplicates')}
                  </span>
                )}
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  {selectedCount} {t('upload.selected')}
                </span>
              </div>
              {/* Select/Deselect all */}
              <div className="flex items-center gap-3 mt-3">
                <button
                  type="button"
                  className="text-xs text-indigo-600 hover:underline"
                  onClick={() => toggleAllReviewItems(true)}
                >
                  {t('upload.selectAll')}
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  className="text-xs text-indigo-600 hover:underline"
                  onClick={() => toggleAllReviewItems(false)}
                >
                  {t('upload.deselectAll')}
                </button>
              </div>
            </div>

            {/* Transaction list */}
            <ul className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {pendingReview.items.map((item, idx) => (
                <li
                  key={idx}
                  className={`border rounded-xl p-3 transition-all ${
                    item.selected
                      ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/5'
                      : 'border-[var(--border)] opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div className="pt-1">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleReviewItem(idx)}
                        className="rounded border-slate-300"
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-sm">{item.description}</span>
                        <span
                          dir="ltr"
                          className={`font-bold text-sm tabular-nums ${
                            item.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {item.amount >= 0 ? '+' : ''}
                          {formatCurrency(item.amount, locale)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <span className="text-xs text-slate-500">{formatDate(item.date)}</span>
                        {item.categorySlug && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {getCategoryName(item.categorySlug)}
                          </span>
                        )}
                        {item.installmentCurrent != null && item.installmentTotal != null && (
                          <span
                            dir="ltr"
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                          >
                            {item.installmentCurrent}/{item.installmentTotal}
                          </span>
                        )}
                      </div>

                      {/* Category selector */}
                      {item.selected && (
                        <div className="mt-2">
                          <select
                            className="input py-1 px-2 text-xs w-auto min-w-[140px]"
                            value={item.editedCategoryId || ''}
                            onChange={(e) => updateReviewItemCategory(idx, e.target.value)}
                          >
                            <option value="">{item.categorySlug ? getCategoryName(item.categorySlug) : t('common.noCategory')}</option>
                            {categoriesList.map((c) => {
                              const name = t('categories.' + c.slug) !== 'categories.' + c.slug ? t('categories.' + c.slug) : c.name;
                              return (
                                <option key={c.id} value={c.id}>{name}</option>
                              );
                            })}
                          </select>
                        </div>
                      )}

                      {/* Duplicate indicator */}
                      {item.isDuplicate && item.existingTransaction && (
                        <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            <span className="font-medium">{t('upload.duplicateExisting')}</span>
                          </div>
                          <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                            {formatDate(item.existingTransaction.date)} &middot; {item.existingTransaction.description} &middot;{' '}
                            {formatCurrency(item.existingTransaction.amount, locale)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Action buttons */}
            <div className="p-4 border-t border-[var(--border)] bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary flex items-center gap-2"
                  disabled={confirmingImport}
                  onClick={() => handleConfirmImport('add_all')}
                >
                  {confirmingImport ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {t('upload.addAll')}
                </button>
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-2"
                  disabled={confirmingImport || selectedCount === 0}
                  onClick={handleImportSelected}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  {t('upload.importSelected')} ({selectedCount})
                </button>
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-2"
                  disabled={confirmingImport}
                  onClick={() => handleConfirmImport('skip_duplicates')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  {t('upload.addOnlyNew')}
                </button>
                <button
                  type="button"
                  className="btn-secondary text-slate-500"
                  disabled={confirmingImport}
                  onClick={() => handleConfirmImport('add_none')}
                >
                  {t('upload.addNone')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
