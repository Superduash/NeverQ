import React from 'react';
import { Spinner } from './Spinner.jsx';

export function IconButton({
  icon,
  label,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  ...props
}) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-xl transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed touch-target focus-visible:outline-2 focus-visible:outline-offset-2';

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs p-1',
    md: 'w-9 h-9 text-sm p-2',
    lg: 'w-11 h-11 text-base p-2.5',
  }[size] || 'w-9 h-9 p-2';

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white shadow-xs hover:opacity-95 active:scale-[0.98]',
    secondary:
      'bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)] hover:border-[var(--brand)]/40 active:scale-[0.98]',
    ghost:
      'bg-transparent text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]',
    danger:
      'bg-[var(--danger)] text-white hover:opacity-90 active:scale-[0.98]',
  }[variant] || '';

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? <Spinner size={14} /> : icon}
    </button>
  );
}
