import React from 'react';
import { Spinner } from './Spinner.jsx';

const SIZES = {
  sm: 'h-10 px-3 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-[52px] px-6 text-base gap-2 rounded-2xl',
};

const VARIANTS = {
  primary:
    'bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white shadow-[var(--shadow-glow)] hover:-translate-y-px hover:brightness-105',
  secondary:
    'bg-[var(--surface)] border border-[var(--border-strong)] text-[var(--ink)] hover:bg-[var(--surface-2)] hover:border-[var(--brand)]',
  ghost:
    'bg-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]',
  danger:
    'bg-[var(--danger)] text-white hover:brightness-110 shadow-sm',
  soft:
    'bg-[var(--brand-soft)] text-[var(--brand)] hover:brightness-95',
};

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
  as: Tag = 'button',
  ...props
}) {
  const isDisabled = disabled || loading;
  const extra = Tag === 'button' ? { type, disabled: isDisabled } : { 'aria-disabled': isDisabled || undefined };

  return (
    <Tag
      {...extra}
      onClick={isDisabled ? undefined : onClick}
      className={`inline-flex select-none items-center justify-center font-semibold transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size] || SIZES.md} ${VARIANTS[variant] || ''} ${className}`}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 20 : 16} /> : iconLeft && <span className="shrink-0">{iconLeft}</span>}
      {children != null && <span className="truncate">{children}</span>}
      {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
    </Tag>
  );
}
