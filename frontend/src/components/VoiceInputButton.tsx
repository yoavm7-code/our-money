'use client';

import { useCallback, useEffect, useState } from 'react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useTranslation } from '@/i18n/context';

interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  className?: string;
}

export default function VoiceInputButton({ onResult, className }: VoiceInputButtonProps) {
  const { locale } = useTranslation();
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const handleResult = useCallback((text: string) => {
    if (text.trim()) onResult(text.trim());
  }, [onResult]);

  const { isListening, start, stop } = useVoiceRecorder({
    lang: locale === 'he' ? 'he-IL' : 'en-US',
    onResult: handleResult,
    continuous: false,
  });

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={isListening ? stop : start}
      className={`shrink-0 p-1.5 rounded-lg transition-all duration-200 ${
        isListening
          ? 'text-red-500 bg-red-50 dark:bg-red-900/20 animate-pulse'
          : 'text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20'
      } ${className || ''}`}
      title={isListening ? 'Stop' : 'Voice input'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}
