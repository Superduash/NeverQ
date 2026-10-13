import React from 'react';

export function Chip({
  children,
  active = false,
  onClick,
  icon,
  badge,
  className = '',
  disabled = false,
  role = 'button',
}) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={active}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`
        touch-target px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 inline-flex items-center gap-1.5 transition-all select-none
        ${active
          ? 'bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white shadow-xs'
          : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] hover:border-[var(--brand)]/50 hover:bg-[var(--surface-2)]'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
      {badge && <span className="shrink-0 text-[10px] font-bold opacity-90">{badge}</span>}
    </button>
  );
}
