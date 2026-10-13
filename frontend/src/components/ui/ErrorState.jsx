import React from 'react';
import { Button } from './Button.jsx';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function ErrorState({
  title = 'Failed to load data',
  message = 'An unexpected error occurred while fetching live information.',
  onRetry,
  className = '',
}) {
  return (
    <div className={`p-6 text-center rounded-3xl bg-[var(--surface)] border border-[var(--danger)]/30 flex flex-col items-center justify-center ${className}`}>
      <div className="w-10 h-10 rounded-2xl bg-[var(--danger)]/15 text-[var(--danger)] flex items-center justify-center mb-2.5">
        <AlertCircle size={20} />
      </div>
      <h4 className="font-heading font-bold text-sm text-[var(--ink)] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[var(--ink-faint)] max-w-xs mb-3.5 leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} />} onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}
