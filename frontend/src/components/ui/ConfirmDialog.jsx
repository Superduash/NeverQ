import React from 'react';
import { Dialog } from './Dialog.jsx';
import { Button } from './Button.jsx';
import { AlertTriangle } from 'lucide-react';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = true,
  loading = false,
}) {
  return (
    <Dialog isOpen={isOpen} onClose={loading ? undefined : onClose} maxWidth="max-w-sm">
      <div className="flex flex-col gap-4 text-center items-center pt-2">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${danger ? 'bg-[var(--danger)]/15 text-[var(--danger)]' : 'bg-[var(--brand)]/15 text-[var(--brand)]'}`}>
          <AlertTriangle size={24} />
        </div>

        <div>
          <h3 className="font-heading font-extrabold text-base text-[var(--ink)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--ink-faint)] mt-1 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 w-full mt-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
