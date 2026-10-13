import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { waitStatus } from '../../lib/constants.js';

/** Human wait text from an eta object { low, mid, high } or a number of minutes. */
export function waitLabel(eta) {
  if (eta == null) return null;
  const mid = typeof eta === 'number' ? eta : eta.mid;
  if (mid == null || Number.isNaN(mid)) return null;
  if (mid < 5) return 'No wait';
  if (typeof eta === 'object' && eta.low != null && eta.high != null && eta.low !== eta.high) {
    return `${eta.low}–${eta.high} min`;
  }
  return `${Math.round(mid)} min`;
}

const TONES = {
  good: 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]',
  mid: 'bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)]',
  bad: 'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)]',
};
const DOTS = { good: 'bg-[var(--wait-good)]', mid: 'bg-[var(--wait-mid)]', bad: 'bg-[var(--wait-bad)]' };

const SIZES = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-10 px-4 text-base gap-2',
};

export function WaitPill({ eta, size = 'md', className = '', suffix = '' }) {
  const reduce = useReducedMotion();
  const label = waitLabel(eta);
  if (!label) {
    return (
      <span className={`inline-flex ${SIZES[size]} items-center rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] ${className}`}>
        —
      </span>
    );
  }
  const mid = typeof eta === 'number' ? eta : eta.mid;
  const tone = waitStatus(mid);
  const text = suffix ? `${label} ${suffix}` : label;

  return (
    <span
      aria-label={`Wait: ${label}`}
      className={`inline-flex ${SIZES[size]} shrink-0 items-center whitespace-nowrap rounded-full font-bold tnum ${TONES[tone]} ${className}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[tone]}`} />
      <span className="relative inline-flex overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={text}
            initial={reduce ? false : { y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: -10, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
