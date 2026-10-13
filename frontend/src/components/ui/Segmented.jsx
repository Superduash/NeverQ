import React, { useId } from 'react';
import { motion } from 'framer-motion';

/**
 * Segmented control with a sliding indicator. Labels are always visible
 * unless `compact` is set (then icon-only with aria-label + title).
 */
export function Segmented({
  options = [],
  value,
  onChange,
  className = '',
  size = 'md',
  compact = false,
  fullWidth = false,
}) {
  const groupId = useId();
  const height = size === 'sm' ? 'h-10' : 'h-11';

  return (
    <div
      role="group"
      className={`${fullWidth ? 'flex w-full' : 'inline-flex'} select-none rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        const iconOnly = compact && opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange?.(opt.value)}
            aria-pressed={active}
            aria-label={iconOnly ? opt.label : undefined}
            title={iconOnly ? opt.label : undefined}
            className={`relative flex ${height} ${fullWidth ? 'flex-1' : ''} min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors ${
              active ? 'text-[var(--brand)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-xl bg-[var(--surface)] shadow-sm"
              />
            )}
            {opt.icon && <span className="relative shrink-0">{opt.icon}</span>}
            {!iconOnly && <span className="relative whitespace-nowrap">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
