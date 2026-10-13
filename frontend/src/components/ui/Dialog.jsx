import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-md',
  className = '',
}) {
  const dialogRef = useRef(null);

  // Esc key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            aria-hidden="true"
          />

          {/* Dialog Container */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'dialog-title' : undefined}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`
              relative w-full ${maxWidth} bg-[var(--surface)] border border-[var(--border)]
              rounded-3xl shadow-[var(--shadow-card)] p-5 sm:p-6 z-10 max-h-[90dvh] flex flex-col
              overflow-hidden ${className}
            `}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
              <div>
                {title && (
                  <h2 id="dialog-title" className="font-heading font-extrabold text-base text-[var(--ink)]">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-xs text-[var(--ink-faint)] mt-0.5 leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="touch-target p-1.5 rounded-xl hover:bg-[var(--surface-2)] text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors shrink-0 -mr-1 -mt-1"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar py-1">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
