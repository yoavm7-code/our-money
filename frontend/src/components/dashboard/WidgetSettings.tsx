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
    onSave({
      id: widget?.id ?? generateWidgetId(),
      type,
      ...(type === 'stat' && { metric }),
      ...((['pie-chart', 'fixed-list'] as string[]).includes(type) && { variant }),
      color,
      size,
      ...(title.trim() && { title: title.trim() }),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">
          {isNew ? t('dashboard.addWidget') : t('dashboard.editWidget')}
        </h3>

        <div className="space-y-4">
          {/* Widget type */}
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">
              {t('dashboard.widgetType')}
            </label>
            <select
              className="input w-full"
              value={type}
              onChange={(e) => setType(e.target.value as WidgetConfig['type'])}
              disabled={!isNew}
            >
              {WIDGET_TYPES.map((wt) => (
                <option key={wt.type} value={wt.type}>{t(wt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Custom title */}
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">
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
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                {t('dashboard.metric')}
              </label>
              <select className="input w-full" value={metric} onChange={(e) => setMetric(e.target.value)}>
                {STAT_METRICS.map((m) => (
                  <option key={m} value={m}>{t(`dashboard.metric_${m}`)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Variant for pie-chart and fixed-list */}
          {(type === 'pie-chart' || type === 'fixed-list') && (
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                {t('dashboard.variant')}
              </label>
              <select className="input w-full" value={variant} onChange={(e) => setVariant(e.target.value)}>
                {type === 'pie-chart' ? (
                  <>
                    <option value="spending">{t('dashboard.expenses')}</option>
                    <option value="income">{t('dashboard.income')}</option>
                  </>
                ) : (
                  <>
                    <option value="expenses">{t('dashboard.fixedExpenses')}</option>
                    <option value="income">{t('dashboard.fixedIncome')}</option>
                  </>
                )}
              </select>
            </div>
          )}

          {/* Size */}
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">
              {t('dashboard.widgetSize')}
            </label>
            <div className="flex gap-2">
              {(['sm', 'md', 'lg'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
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
          </div>

          {/* Color picker */}
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">
              {t('dashboard.accentColor')}
            </label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${
                    color === c ? 'border-slate-800 dark:border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded-full cursor-pointer border-0 p-0"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border)]">
          <div>
            {onDelete && !isNew && (
              <button
                type="button"
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                onClick={onDelete}
              >
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
