import React from 'react';
import { Clock } from 'lucide-react';
import { useClockOffset, clock } from '../../lib/clock.js';
import { api } from '../../lib/api.js';

export function DemoClockBanner() {
  const offsetMs = useClockOffset();
  const offsetMinutes = Math.round(offsetMs / 60000);
  const hasAdminToken = Boolean(localStorage.getItem('nq-admin-token'));

  if (offsetMinutes === 0) return null;

  const handleReset = async () => {
    try {
      await api.demoSetClock({ offsetMinutes: 0 });
      clock.setOffset(0);
    } catch {
      clock.setOffset(0);
    }
  };

  return (
    <div
      role="status"
      className="shrink-0 bg-[var(--accent-2)] text-black px-4 py-1.5 flex items-center justify-between text-xs font-bold z-50 select-none shadow-xs"
    >
      <div className="flex items-center gap-2">
        <Clock size={14} className="shrink-0 animate-spin" />
        <span>Demo clock fast-forwarded +{offsetMinutes} min</span>
      </div>
      {hasAdminToken && (
        <button
          type="button"
          onClick={handleReset}
          className="px-2 py-0.5 rounded bg-black/15 hover:bg-black/25 text-black font-semibold text-[10px]"
        >
          Reset Clock
        </button>
      )}
    </div>
  );
}
