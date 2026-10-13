import React from 'react';

export function Chip({
  children,
  active = false,
  onClick,
  icon,
  badge,
  className = '',
  disabled = false,
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`inline-flex h-10 shrink-0 snap-start select-none items-center gap-2 rounded-full px-4 text-sm font-semibold transition duration-150 active:scale-[0.97] disabled:opacity-50 ${
        active
          ? 'bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white shadow-[var(--shadow-glow)]'
          : 'border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--brand)]'
      } ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
      {badge != null && <span className="shrink-0 text-[12px] font-bold opacity-90">{badge}</span>}
    </button>
  );
}
