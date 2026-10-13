import React from 'react';
import { Spinner } from './Spinner.jsx';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  iconLeft,
  iconRight,
  className = '',
  type = 'button',
  onClick,
  ...props
}) {
  const baseClasses =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed touch-target focus-visible:outline-2 focus-visible:outline-offset-2';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 h-8',
    md: 'text-xs px-3.5 py-2 gap-2 h-9',
    lg: 'text-sm px-4 py-2.5 gap-2.5 h-11',
  }[size] || 'text-xs px-3.5 py-2 gap-2 h-9';

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white shadow-xs hover:opacity-95 active:scale-[0.98]',
    secondary:
      'bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)] hover:border-[var(--brand)]/40 active:scale-[0.98]',
    ghost:
      'bg-transparent text-[var(--ink)] hover:bg-[var(--surface-2)] text-[var(--ink-faint)] hover:text-[var(--ink)]',
    danger:
      'bg-[var(--danger)] text-white hover:opacity-90 active:scale-[0.98] shadow-xs',
  }[variant] || '';

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <Spinner size={size === 'lg' ? 18 : 14} />
      ) : (
        iconLeft && <span className="shrink-0">{iconLeft}</span>
      )}
      <span>{children}</span>
      {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
    </button>
  );
}
