import React from 'react';

export function RadioCard({
  name,
  value,
  selected = false,
  onChange,
  title,
  description,
  badge,
  icon,
  disabled = false,
  className = '',
}) {
  return (
    <label
      className={`
        p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none relative
        ${selected
          ? 'bg-[var(--surface-2)] border-[var(--brand)] ring-2 ring-[var(--brand)]/20 shadow-xs'
          : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--brand)]/40'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        disabled={disabled}
        onChange={() => onChange?.(value)}
        className="mt-0.5 text-[var(--brand)] focus:ring-[var(--brand)] h-4 w-4"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {icon && <span className="text-[var(--brand)] shrink-0">{icon}</span>}
            <span className="font-heading font-bold text-xs text-[var(--ink)] truncate">
              {title}
            </span>
          </div>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
        {description && (
          <p className="text-[11px] text-[var(--ink-faint)] mt-0.5 leading-snug">
            {description}
          </p>
        )}
      </div>
    </label>
  );
}
