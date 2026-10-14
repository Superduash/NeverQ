import { useEffect, useState, useCallback } from 'react';
import { notify } from './notify.js';
import { clock } from './clock.js';
import { WAIT_THRESHOLDS } from './constants.js';
export { WAIT_THRESHOLDS };

export function waitColor(midMinutes) {
  if (midMinutes === 0) return 'good';
  if (midMinutes < WAIT_THRESHOLDS.good) return 'good';
  if (midMinutes <= WAIT_THRESHOLDS.bad) return 'mid';
  return 'bad';
}

export function formatEta(eta) {
  if (eta == null) return '—';
  if (typeof eta === 'number') {
    if (eta === 0) return 'No wait';
    return `~${Math.round(eta)}m`;
  }
  if (eta.noCounter) return 'No counter open';
  if (eta.low != null && eta.high != null) {
    if (eta.low === 0 && eta.high === 0) return 'No wait';
    return `${eta.low}–${eta.high}m`;
  }
  if (eta.mid != null) {
    if (eta.mid === 0) return 'No wait';
    return `~${eta.mid}m`;
  }
  return '—';
}

export function formatRange(low, high) {
  if (low == null || high == null) return '—';
  if (low === 0 && high === 0) return 'No wait';
  if (low === high) return `${low}m`;
  return `${low}–${high}m`;
}

export function formatDuration(minutes) {
  if (minutes == null || isNaN(minutes)) return '0m';
  const mins = Math.round(minutes);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/**
 * Demo-clock aware Leave-by calculation (§0.7)
 * Accepts either:
 *   leaveBy({ startMs, travelMin, bufferMin = 5, nowMs })
 * or legacy:
 *   leaveBy(etaMid, travelMinutes, bufferMinutes = 5)
 */
export function leaveBy(arg1, arg2, arg3 = 5) {
  let startMs;
  let travelMin;
  let bufferMin = 5;
  let nowMs = clock.now();

  if (typeof arg1 === 'object' && arg1 !== null) {
    travelMin = arg1.travelMin ?? arg1.travelMinutes;
    bufferMin = arg1.bufferMin ?? 5;
    nowMs = arg1.nowMs ?? clock.now();
    startMs = arg1.startMs;
    if (startMs == null && arg1.etaMid != null) {
      startMs = nowMs + arg1.etaMid * 60000;
    }
  } else {
    const etaMid = arg1;
    travelMin = arg2;
    bufferMin = arg3 ?? 5;
    if (etaMid == null || travelMin == null) return null;
    startMs = nowMs + etaMid * 60000;
  }

  if (startMs == null || travelMin == null) return null;

  const leaveByMs = startMs - (travelMin * 60000) - (bufferMin * 60000);
  const leaveMinutes = Math.max(0, Math.round((leaveByMs - nowMs) / 60000));
  const isNow = leaveByMs <= nowMs;
  const targetDate = new Date(leaveByMs);

  return {
    leaveByMs,
    leaveMinutes,
    leaveTime: targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isNow,
  };
}

export function tokenLabelFormat(token, label) {
  if (label) return label;
  if (!token) return 'T-000';
  return token.length > 5 ? token.slice(0, 5).toUpperCase() : token.toUpperCase();
}

export async function copyToClipboard(text, successMsg = 'Copied to clipboard') {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    notify.success(successMsg);
    return true;
  } catch (err) {
    notify.error('Failed to copy to clipboard');
    return false;
  }
}

export async function shareLink(shareData) {
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        return copyToClipboard(shareData.url, 'Link copied to clipboard');
      }
      return false;
    }
  } else {
    return copyToClipboard(shareData.url, 'Link copied to clipboard');
  }
}

// ───────────── Hooks ─────────────

// Live tick hook aware of demo-clock offset
export function useNow(intervalMs = 1000) {
  const [currentNow, setCurrentNow] = useState(() => clock.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentNow(clock.now());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return currentNow;
}

// Online / offline detector
export function useOnline() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// Safe LocalStorage hook
export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (err) {
      console.warn(`Error reading localStorage key "${key}":`, err);
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (valueToStore === undefined) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (err) {
        console.warn(`Error writing localStorage key "${key}":`, err);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

// Device ID Hook (NeverQ anonymous identifier)
export function useDeviceId() {
  const [deviceId] = useState(() => {
    try {
      let id = localStorage.getItem('nq-device-id');
      if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem('nq-device-id', id);
      }
      return id;
    } catch {
      return `dev-${Date.now()}`;
    }
  });

  return deviceId;
}
