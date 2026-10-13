import React from 'react';

export function Card({ children, className = '', interactive = false, onClick, ...props }) {
  return (
    <div
      onClick={interactive ? onClick : undefined}
      className={`rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:p-5 ${
        interactive
          ? 'cursor-pointer transition duration-150 hover:-translate-y-0.5 hover:border-[var(--brand)] active:scale-[0.99]'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`mb-3 flex items-start justify-between gap-3 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`font-heading text-lg font-bold leading-snug text-[var(--ink)] ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }) {
  return <p className={`text-sm leading-5 text-[var(--ink-muted)] ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return (
    <div className={`mt-4 flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4 ${className}`}>
      {children}
    </div>
  );
}
