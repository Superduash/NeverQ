import React from 'react';

export function Card({
  children,
  className = '',
  interactive = false,
  onClick,
  ...props
}) {
  return (
    <div
      onClick={interactive ? onClick : undefined}
      className={`
        p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)]
        ${interactive ? 'cursor-pointer hover:border-[var(--brand)]/50 hover:shadow-md transition-all active:scale-[0.99]' : 'shadow-xs'}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`flex items-start justify-between gap-3 mb-2.5 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`font-heading font-bold text-sm text-[var(--ink)] leading-snug ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }) {
  return <p className={`text-xs text-[var(--ink-faint)] leading-normal ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return (
    <div className={`mt-3 pt-2.5 border-t border-[var(--border)]/60 flex items-center justify-end gap-2 ${className}`}>
      {children}
    </div>
  );
}
