import React from 'react';
import { Info, AlertTriangle, AlertCircle, X } from 'lucide-react';

export function Banner({
  children,
  variant = 'info', // 'info' | 'warn' | 'error'
  title,
  onDismiss,
  action,
  className = '',
}) {
  const variantStyles = {
    info: 'bg-[var(--chip-bg)] border-[var(--border)] text-[var(--ink)]',
    warn: 'bg-[var(--wait-mid-bg)] border-[var(--wait-mid)]/30 text-[var(--wait-mid-text)]',
    error: 'bg-[var(--wait-bad-bg)] border-[var(--wait-bad)]/30 text-[var(--wait-bad-text)]',
  }[variant] || 'bg-[var(--chip-bg)] border-[var(--border)] text-[var(--ink)]';

  const icons = {
    info: <Info size={16} className="text-[var(--brand)] shrink-0 mt-0.5" />,
    warn: <AlertTriangle size={16} className="text-[var(--wait-mid)] shrink-0 mt-0.5" />,
    error: <AlertCircle size={16} className="text-[var(--danger)] shrink-0 mt-0.5" />,
  };

  return (
    <div
      role="alert"
      className={`p-3 rounded-2xl border flex items-start justify-between gap-3 text-xs ${variantStyles} ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {icons[variant]}
        <div className="min-w-0 flex-1">
          {title && <p className="font-bold leading-snug mb-0.5">{title}</p>}
          <div className="text-[11px] leading-relaxed opacity-90">{children}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {action}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-black/10 transition-colors"
            aria-label="Dismiss banner"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
