import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function BottomSheet({
  isOpen,
  onClose,
  snap = 'half', // 'peek' | 'half' | 'full'
  onSnapChange,
  children,
  className = '',
}) {
  const snapHeights = {
    peek: 'h-[80px]',
    half: 'h-[50dvh]',
    full: 'h-[88dvh]',
  }[snap] || 'h-[50dvh]';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
          {/* Backdrop on full snap */}
          {snap === 'full' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 pointer-events-auto"
            />
          )}

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={`
              pointer-events-auto w-full bg-[var(--surface)] border-t border-[var(--border)]
              rounded-t-3xl shadow-[var(--shadow-sheet)] flex flex-col overflow-hidden
              ${snapHeights} ${className}
            `}
          >
            {/* Grab handle */}
            <div
              className="w-full pt-3 pb-2 cursor-pointer shrink-0 flex justify-center"
              onClick={() => {
                if (onSnapChange) {
                  const next = snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek';
                  onSnapChange(next);
                }
              }}
            >
              <div className="sheet-handle" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-8">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
