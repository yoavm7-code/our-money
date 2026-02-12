'use client';

import { useCallback, useEffect, useState } from 'react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useTranslation } from '@/i18n/context';

interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function VoiceInputButton({ onResult, className, size = 'sm' }: VoiceInputButtonProps) {
  const { t, locale } = useTranslation();
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

  const iconSize = size === 'lg' ? 24 : size === 'md' ? 20 : 16;
  const padding = size === 'lg' ? 'p-3' : size === 'md' ? 'p-2' : 'p-1.5';

  return (
    <button
      type="button"
      onClick={isListening ? stop : start}
      className={`shrink-0 ${padding} rounded-lg transition-all duration-200 relative ${
        isListening
          ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
          : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
      } ${className || ''}`}
      title={isListening ? t('voice.stop') : t('voice.start')}
    >
      {/* Pulsing ring when listening */}
      {isListening && (
        <span className="absolute inset-0 rounded-lg animate-ping bg-red-400/20" />
      )}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`relative ${isListening ? 'animate-pulse' : ''}`}
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}
