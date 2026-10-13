import { useEffect, useState, useCallback } from 'react';
import { notify } from './notify.js';

export const WAIT_THRESHOLDS = {
  good: 15,
  bad: 40,
};

export function waitColor(midMinutes) {
  if (midMinutes < WAIT_THRESHOLDS.good) return 'good';
  if (midMinutes <= WAIT_THRESHOLDS.bad) return 'mid';
  return 'bad';
}

export function formatEta(eta) {
  if (!eta) return '—';
  if (typeof eta === 'number') return `~${Math.round(eta)}m`;
  if (eta.low && eta.high) return `${eta.low}–${eta.high}m`;
  if (eta.mid) return `~${eta.mid}m`;
  return '—';
}

export function formatRange(low, high) {
  if (low == null || high == null) return '—';
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

export function leaveBy(etaMid, travelMinutes, bufferMinutes = 5) {
  if (etaMid == null || travelMinutes == null) return null;
  const leaveMinutes = Math.max(0, etaMid - travelMinutes - bufferMinutes);
  const targetDate = new Date(Date.now() + leaveMinutes * 60 * 1000);
  return {
    leaveMinutes,
    leaveTime: targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isNow: leaveMinutes <= 0,
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

export async function shareLink(data) {
  const shareData = {
    title: data.title || 'NeverQ Live Queue Ticket',
    text: data.text || 'Track your live hospital queue position with NeverQ',
    url: data.url || window.location.href,
  };

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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
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
