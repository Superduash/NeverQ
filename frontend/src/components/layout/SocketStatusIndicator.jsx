import React from 'react';
import { useSocketStatus } from '../../lib/socket.js';
import { useOnline } from '../../lib/utils.js';

export function SocketStatusIndicator({ className = '' }) {
  const status = useSocketStatus();
  const isOnline = useOnline();

  const effectiveStatus = !isOnline ? 'offline' : status === 'reconnecting' ? 'reconnecting' : 'live';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--surface-2)] text-[var(--ink-faint)] select-none ${className}`}
      title={
        effectiveStatus === 'live'
          ? 'Live connection active'
          : effectiveStatus === 'reconnecting'
          ? 'Reconnecting to queue server...'
          : 'You are currently offline'
      }
    >
      <span
        className={`w-2 h-2 rounded-full ${
          effectiveStatus === 'live'
            ? 'bg-[var(--success)] animate-pulse'
            : effectiveStatus === 'reconnecting'
            ? 'bg-[var(--wait-mid)] animate-pulse'
            : 'bg-[var(--danger)]'
        }`}
      />
      <span className="capitalize">{effectiveStatus}</span>
    </div>
  );
}
