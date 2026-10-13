import React from 'react';

const SIZES = {
  xs: 'h-6 px-2 text-[12px]',
  sm: 'h-6 px-2.5 text-[12px]',
  md: 'h-7 px-3 text-[13px]',
};

const VARIANTS = {
  default: 'bg-[var(--surface-2)] text-[var(--ink-muted)]',
  demo: 'bg-[var(--accent-2)]/15 text-[var(--demo-text)] font-bold',
  sim: 'bg-[var(--accent)]/15 text-[var(--accent)] font-bold',
  priority: 'bg-[var(--brand-soft)] text-[var(--brand)] font-bold',
  good: 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] font-bold',
  mid: 'bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)] font-bold',
  bad: 'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)] font-bold',
  waiting: 'bg-[var(--surface-2)] text-[var(--ink)] font-semibold',
  called: 'bg-[var(--accent-2)] text-black font-extrabold animate-pulse',
  serving: 'bg-[var(--brand)] text-white font-bold',
  done: 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] font-bold',
  cancelled: 'bg-[var(--surface-2)] text-[var(--ink-faint)] font-medium',
  expired: 'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)] font-medium',
  removed: 'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)] font-medium',
};

export function Badge({ children, variant = 'default', size = 'sm', className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-full font-semibold tnum ${SIZES[size] || SIZES.sm} ${VARIANTS[variant] || VARIANTS.default} ${className}`}
    >
      {children}
    </span>
  );
}
