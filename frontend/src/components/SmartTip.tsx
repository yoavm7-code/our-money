'use client';

import { useCallback, useEffect, useState } from 'react';
import { insights, type InsightSection } from '@/lib/api';
import { useTranslation } from '@/i18n/context';

/** Extract a meaningful tip line from AI-generated insight content */
function extractTip(content: string): string | null {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip markdown headers
    if (line.startsWith('#')) continue;
    // Skip intro/title lines that end with ":"
    if (line.endsWith(':')) continue;
    // Skip very short lines
    if (line.replace(/[*•\-\d.)#]/g, '').trim().length < 15) continue;

    // Clean up: remove bullet/number prefixes and bold markers
    let cleaned = line
      .replace(/^[•\-*]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .replace(/\*\*/g, '')
      .trim();

    if (cleaned.length < 15) continue;

    // Truncate if too long
    if (cleaned.length > 150) {
      // Try to cut at a sentence boundary
      const sentenceEnd = cleaned.slice(0, 150).lastIndexOf('.');
      if (sentenceEnd > 60) {
        cleaned = cleaned.slice(0, sentenceEnd + 1);
      } else {
        cleaned = cleaned.slice(0, 147) + '...';
      }
    }

    return cleaned;
  }

  return null;
}

// Sections to try, in order - savingsRecommendation gives the best actionable tips
const TIP_SECTIONS: InsightSection[] = ['savingsRecommendation', 'spendingInsights', 'monthlySummary'];

export default function SmartTip() {
  const { t, locale } = useTranslation();
  const [tip, setTip] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    const key = `smartTip_shown_${locale}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(key)) return;

    const timer = setTimeout(async () => {
      // Try multiple sections until we find a good tip
      for (const section of TIP_SECTIONS) {
        try {
          const res = await insights.getSection(section, locale);
          if (res.content) {
            const extracted = extractTip(res.content);
            if (extracted) {
              setTip(extracted);
              setVisible(true);
              sessionStorage.setItem(key, '1');
              return;
            }
          }
        } catch {
          // Try next section
        }
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [locale, dismissed]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setDismissed(true), 500);
  }, []);

  if (dismissed || !tip) return null;

  return (
    <div
      className={`fixed bottom-6 start-6 z-20 max-w-sm ${
        visible ? 'tip-bounce' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="bg-gradient-to-r from-primary-500 to-emerald-500 rounded-2xl p-[1px] shadow-glow-lg">
        <div className="bg-[var(--card)] rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 mb-1">
                {t('smartTip.title')}
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {tip}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600"
              aria-label={t('common.close')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
