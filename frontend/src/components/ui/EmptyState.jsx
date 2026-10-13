import React from 'react';
import { Button } from './Button.jsx';
import { Inbox } from 'lucide-react';

export function EmptyState({
  title = 'Nothing here yet',
  description,
  icon,
  actionText,
  onAction,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center ${className}`}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
        {icon || <Inbox size={26} />}
      </div>
      <h4 className="mb-1 font-heading text-lg font-bold text-[var(--ink)]">{title}</h4>
      {description && <p className="mb-5 max-w-xs text-sm leading-5 text-[var(--ink-muted)]">{description}</p>}
      {actionText && onAction && (
        <Button variant="secondary" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
