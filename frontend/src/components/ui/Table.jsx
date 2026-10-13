import React from 'react';

export function Table({ children, className = '' }) {
  return (
    <div className="w-full overflow-x-auto no-scrollbar rounded-2xl border border-[var(--border)]">
      <table className={`w-full text-left text-xs border-collapse ${className}`}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children }) {
  return <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">{children}</thead>;
}

export function TableBody({ children }) {
  return <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">{children}</tbody>;
}

export function TableRow({ children, className = '', onClick }) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors hover:bg-[var(--surface-2)]/60 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableHead({ children, className = '' }) {
  return (
    <th className={`py-3 px-3.5 font-bold text-[11px] uppercase tracking-wider text-[var(--ink-faint)] select-none ${className}`}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = '' }) {
  return <td className={`py-3 px-3.5 text-xs text-[var(--ink)] ${className}`}>{children}</td>;
}
