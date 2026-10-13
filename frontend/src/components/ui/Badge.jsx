import React from 'react';

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}) {
  const sizeClasses = {
    xs: 'text-[9px] px-1.5 py-0.2',
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }[size] || 'text-[10px] px-2 py-0.5';

  const variantClasses = {
    default: 'bg-[var(--surface-2)] text-[var(--ink-faint)]',
    demo: 'bg-[var(--accent-2)]/15 text-[var(--accent-2)] font-bold tracking-wide',
    sim: 'bg-[var(--accent)]/15 text-[var(--accent)] font-bold tracking-wide',
    priority: 'bg-[var(--brand)]/15 text-[var(--brand)] font-bold',
    // Wait statuses
    good: 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] font-bold',
    mid: 'bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)] font-bold',
    bad: 'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)] font-bold',
    // Queue statuses
    waiting: 'bg-[var(--surface-2)] text-[var(--ink)] font-semibold',
    called: 'bg-[var(--accent-2)] text-black font-extrabold animate-pulse',
    serving: 'bg-[var(--brand)] text-white font-bold',
    done: 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] font-bold',
    cancelled: 'bg-[var(--surface-2)] text-[var(--ink-faint)] font-medium line-through',
    expired: 'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)] font-medium',
  }[variant] || 'bg-[var(--surface-2)] text-[var(--ink-faint)]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold select-none tnum uppercase tracking-wider ${sizeClasses} ${variantClasses} ${className}`}
    >
      {children}
    </span>
  );
}
