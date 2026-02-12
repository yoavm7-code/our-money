'use client';

import { useState } from 'react';
import type { WidgetConfig } from '@/lib/api';
import { useTranslation } from '@/i18n/context';
import { STAT_METRICS, ACCENT_COLORS, WIDGET_TYPES, generateWidgetId } from './defaults';

interface Props {
  widget: WidgetConfig | null; // null = adding new widget
  onSave: (widget: WidgetConfig) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function WidgetSettings({ widget, onSave, onDelete, onClose }: Props) {
  const { t } = useTranslation();
  const isNew = !widget;
  const [type, setType] = useState<WidgetConfig['type']>(widget?.type ?? 'stat');
  const [metric, setMetric] = useState(widget?.metric ?? 'totalBalance');
  const [variant, setVariant] = useState(widget?.variant ?? 'spending');
  const [color, setColor] = useState(widget?.color ?? '#3b82f6');
  const [size, setSize] = useState<WidgetConfig['size']>(widget?.size ?? 'sm');
  const [title, setTitle] = useState(widget?.title ?? '');

  const handleSave = () => {
    const hasVariant = (['pie-chart', 'fixed-list', 'clients'] as string[]).includes(type);
    onSave({
      id: widget?.id ?? generateWidgetId(),
      type,
      ...(type === 'stat' && { metric }),
      ...(hasVariant && { variant }),
      color,
      size,
      ...(title.trim() && { title: title.trim() }),
    });
  };

  /* Determine which variant options to show based on widget type */
  const showVariantSelector = type === 'pie-chart' || type === 'fixed-list' || type === 'clients';

  const getVariantOptions = () => {
    if (type === 'pie-chart') {
      return [
        { value: 'spending', label: t('dashboard.expenses') },
        { value: 'income', label: t('dashboard.income') },
      ];
    }
    if (type === 'fixed-list') {
      return [
        { value: 'expenses', label: t('dashboard.fixedExpenses') },
        { value: 'income', label: t('dashboard.fixedIncome') },
      ];
    }
    if (type === 'clients') {
      return [
        { value: '', label: t('dashboard.incomeByClient') },
        { value: 'cashflow', label: t('dashboard.cashFlowForecast') },
      ];
    }
    return [];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-scaleIn max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold">
            {isNew ? t('dashboard.addWidget') : t('dashboard.editWidget')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="space-y-5">
          {/* Widget type */}
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              {t('dashboard.widgetType')}
            </label>
            <select
              className="input w-full"
              value={type}
              onChange={(e) => {
                const newType = e.target.value as WidgetConfig['type'];
                setType(newType);
                // Reset variant when changing type
                if (newType === 'pie-chart') setVariant('spending');
                else if (newType === 'fixed-list') setVariant('expenses');
                else if (newType === 'clients') setVariant('');
                // Adjust default size
                if (['bar-chart', 'recent-tx'].includes(newType)) setSize('lg');
                else if (newType === 'stat') setSize('sm');
                else setSize('md');
              }}
              disabled={!isNew}
            >
              {WIDGET_TYPES.map((wt) => (
                <option key={wt.type} value={wt.type}>{t(wt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Custom title */}
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              {t('dashboard.customTitle')}
            </label>
            <input
              type="text"
              className="input w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('common.optional')}
            />
          </div>

          {/* Metric selector for stat type */}
          {type === 'stat' && (
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                {t('dashboard.metric')}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {STAT_METRICS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`text-start px-3 py-2 rounded-xl text-sm border transition-colors ${
                      metric === m
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => setMetric(m)}
                  >
                    {t(`dashboard.metric_${m}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Variant for pie-chart, fixed-list, and clients */}
          {showVariantSelector && (
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                {t('dashboard.variant')}
              </label>
              <div className="flex gap-2">
                {getVariantOptions().map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      variant === opt.value
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => setVariant(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Size */}
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              {t('dashboard.widgetSize')}
            </label>
            <div className="flex gap-2">
              {(['sm', 'md', 'lg'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    size === s
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setSize(s)}
                >
                  {t(`dashboard.size_${s}`)}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {size === 'sm' && '1 column'}
              {size === 'md' && '1-2 columns'}
              {size === 'lg' && 'Full width (3 columns)'}
            </p>
          </div>

          {/* Color picker */}
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              {t('dashboard.accentColor')}
            </label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all duration-150 ${
                    color === c
                      ? 'border-slate-800 dark:border-white scale-110 ring-2 ring-offset-2 ring-offset-[var(--card)]'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: c,
                    ...(color === c ? { ringColor: c } : {}),
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
              <div className="relative">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded-full cursor-pointer border-0 p-0 appearance-none"
                  style={{ WebkitAppearance: 'none' }}
                  title="Custom color"
                />
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border)]">
          <div>
            {onDelete && !isNew && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                onClick={onDelete}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                {t('common.delete')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={handleSave}>
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
