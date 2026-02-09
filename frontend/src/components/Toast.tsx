'use client';

import { createContext, useCallback, useContext, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; type: ToastType; exiting?: boolean };

const ToastContext = createContext<{ show: (message: string, type?: ToastType) => void }>({
  show: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 end-4 z-[70] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto rounded-xl shadow-lg border px-4 py-3
              max-w-sm flex items-center gap-3
              ${toast.exiting ? 'toast-exit' : 'toast-enter'}
              ${toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                : toast.type === 'error'
                  ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800'
                  : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)]'}
            `}
            role="alert"
          >
            {toast.type === 'success' && (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            )}
            <span className="text-sm flex-1">{toast.message}</span>
            <button
              type="button"
              className="shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
