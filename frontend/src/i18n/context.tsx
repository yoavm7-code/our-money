'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Locale = 'he' | 'en';

const STORAGE_KEY = 'our-money-locale';

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}

type Translations = Record<string, unknown>;

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dir: 'rtl' | 'ltr';
  isRtl: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const translationsCache: Record<Locale, Translations | null> = { he: null, en: null };

async function loadTranslations(locale: Locale): Promise<Translations> {
  if (translationsCache[locale]) return translationsCache[locale]!;
  const mod = await import(`./${locale}.json`);
  const data = mod.default as Translations;
  translationsCache[locale] = data;
  return data;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('he');
  const [dict, setDict] = useState<Translations | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored === 'he' || stored === 'en') setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    loadTranslations(locale).then(setDict);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      if (!dict) return key;
      const value = getNested(dict as Record<string, unknown>, key);
      const str = value ?? key;
      return vars ? interpolate(str, vars) : str;
    },
    [dict]
  );

  const dir: 'rtl' | 'ltr' = locale === 'he' ? 'rtl' : 'ltr';
  const isRtl = locale === 'he';

  const value = useMemo(
    () => ({ locale, setLocale, t, dir, isRtl }),
    [locale, setLocale, t, dir, isRtl]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider');
  return ctx;
}
