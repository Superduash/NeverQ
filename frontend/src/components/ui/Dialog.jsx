import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useOverlayBack } from '../../lib/useBack.js';

/**
 * Dialog: centered card on >=640px, full-screen on phones with a sticky footer.
 * Closing via Android/browser back works (history entry is pushed while open).
 */
export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'sm:max-w-md',
  className = '',
}) {
  const panelRef = useRef(null);
  useOverlayBack(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => panelRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex: 'var(--z-dialog)' }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60"
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'dialog-title' : undefined}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 32 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className={`relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--surface)] outline-none sm:h-auto sm:max-h-[88dvh] sm:rounded-[24px] sm:border sm:border-[var(--border)] sm:shadow-[var(--shadow-sheet)] ${maxWidth} ${className}`}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
              <div className="min-w-0">
                {title && (
                  <h2 id="dialog-title" className="font-heading text-xl font-bold text-[var(--ink)]">
                    {title}
                  </h2>
                )}
                {description && <p className="mt-1 text-sm leading-5 text-[var(--ink-muted)]">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--ink-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">{children}</div>
            {footer && (
              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
