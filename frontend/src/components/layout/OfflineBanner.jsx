import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../../lib/utils.js';

export function OfflineBanner() {
  const isOnline = useOnline();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="shrink-0 bg-[var(--danger)] text-white px-4 py-1.5 flex items-center justify-between text-xs font-semibold z-50 select-none shadow-xs"
    >
      <div className="flex items-center gap-2">
        <WifiOff size={14} className="shrink-0" />
        <span>You are offline. Showing cached queue estimates.</span>
      </div>
      <span className="text-[10px] opacity-80 tnum">
        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}
