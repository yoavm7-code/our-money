'use client';

import { useTranslation } from '@/i18n/context';
import HelpTooltip from '@/components/HelpTooltip';

interface PageHeaderProps {
  title: string;
  description?: string;
  helpText?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}

export default function PageHeader({ title, description, helpText, actions, filters }: PageHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{title}</h1>
            {helpText && <HelpTooltip text={helpText} className="ms-1" />}
          </div>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Filters row - always start-aligned */}
      {filters && (
        <div className="flex flex-wrap items-center gap-3">
          {filters}
        </div>
      )}
    </div>
  );
}
