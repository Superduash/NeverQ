// frontend/src/lib/clock.js
// Client demo-clock synchronizer (BackendQ.md §0.7)
import { useState, useEffect } from 'react';

let clockOffsetMs = 0;
const listeners = new Set();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn(clockOffsetMs);
    } catch (e) {
      console.error('[Clock] Listener error:', e);
    }
  });
}

export const clock = {
  now() {
    return Date.now() + clockOffsetMs;
  },

  getOffset() {
    return clockOffsetMs;
  },

  setOffset(ms) {
    const val = Math.round(Number(ms) || 0);
    if (clockOffsetMs !== val) {
      clockOffsetMs = val;
      notifyListeners();
    }
    return clockOffsetMs;
  },

  /**
   * Sync against server demo-clock now (epoch ms).
   * Ignores drift < 1000ms to avoid network jitter.
   */
  sync(serverNowMs) {
    if (!serverNowMs) return;
    const computedOffset = Math.round(Number(serverNowMs) - Date.now());
    if (Math.abs(computedOffset - clockOffsetMs) >= 1000) {
      clockOffsetMs = computedOffset;
      notifyListeners();
    }
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useClockOffset() {
  const [offset, setOffset] = useState(() => clock.getOffset());

  useEffect(() => {
    return clock.subscribe((newOffset) => {
      setOffset(newOffset);
    });
  }, []);

  return offset;
}

export const now = () => clock.now();
export default clock;
