import React from 'react';

export function Segmented({
  options = [],
  value,
  onChange,
  className = '',
  size = 'md',
}) {
  const sizeClasses = {
    sm: 'p-0.5 text-xs',
    md: 'p-1 text-xs',
  }[size] || 'p-0.5 text-xs';

  return (
    <div
      role="group"
      className={`inline-flex rounded-xl bg-[var(--surface-2)] border border-[var(--border)] select-none ${sizeClasses} ${className}`}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange?.(opt.value)}
            className={`
              touch-target px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 font-medium
              ${active
                ? 'bg-[var(--surface)] text-[var(--brand)] font-bold shadow-xs'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}
            `}
            aria-pressed={active}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
