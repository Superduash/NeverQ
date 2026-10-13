import React from 'react';
import { Button } from './Button.jsx';
import { Inbox } from 'lucide-react';

export function EmptyState({
  title = 'No items found',
  description = 'There are currently no items matching your criteria.',
  icon,
  actionText,
  onAction,
  className = '',
}) {
  return (
    <div className={`p-8 text-center rounded-3xl bg-[var(--surface)] border border-[var(--border)] flex flex-col items-center justify-center ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] text-[var(--ink-faint)] flex items-center justify-center mb-3">
        {icon || <Inbox size={22} />}
      </div>
      <h4 className="font-heading font-bold text-sm text-[var(--ink)] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[var(--ink-faint)] max-w-xs mb-4 leading-relaxed">
        {description}
      </p>
      {actionText && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
