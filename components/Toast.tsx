import React, { useEffect, useRef } from 'react';
import { CheckCircleIcon, XCircleIcon, XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  variant: ToastVariant;
  title: string;
  body?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

const AUTOHIDE_MS = 10000;

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, AUTOHIDE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDismiss]);

  const isSuccess = toast.variant === 'success';
  const isInfo = toast.variant === 'info';

  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 rounded-xl border shadow-2xl w-full max-w-sm pointer-events-auto
        ${isSuccess
          ? 'bg-corporate-secondary border-corporate-accent/40'
          : isInfo 
            ? 'bg-corporate-secondary border-corporate-border-strong'
            : 'bg-corporate-secondary border-red-500/50'
        }`}
      role="alert"
      aria-live="assertive"
    >
      {isSuccess
        ? <CheckCircleIcon className="w-5 h-5 text-corporate-accent shrink-0 mt-0.5" />
        : isInfo
          ? <InformationCircleIcon className="w-5 h-5 text-corporate-text shrink-0 mt-0.5" />
          : <XCircleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
      }

      <div className="flex-1 min-w-0">
        <p className={`text-[0.65rem] font-technical font-black tracking-monolith uppercase
          ${isSuccess ? 'text-corporate-accent' : isInfo ? 'text-corporate-text' : 'text-red-400'}`}>
          {toast.title}
        </p>
        {toast.body && (
          <p className="text-[11px] text-corporate-text-secondary mt-1 leading-relaxed break-words">
            {toast.body}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-corporate-muted hover:text-corporate-accent transition-colors mt-0.5"
        aria-label="Dismiss"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 items-end pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
};

export default Toast;
