// NeverQ Alert Engine (NeverQ2 §4, FrontendQ Phase 5.2 & 5.3)
// WebAudio melodic chime, SpeechSynthesis, Vibration, Tab Title Flash, WakeLock, and Throttled Banners/Toasts.

import { notify } from './notify.js';

const STORAGE_KEY_ALERTS = 'nq-alerts-unlocked';
const PROCESSED_EVENTS_KEY = 'nq-alert-events';

// In-memory set of handled event IDs to guarantee idempotency
const processedEvents = new Set();
try {
  const stored = sessionStorage.getItem(PROCESSED_EVENTS_KEY);
  if (stored) {
    JSON.parse(stored).forEach((id) => processedEvents.add(id));
  }
} catch {}

function recordEventId(id) {
  if (!id) return;
  processedEvents.add(id);
  try {
    sessionStorage.setItem(
      PROCESSED_EVENTS_KEY,
      JSON.stringify(Array.from(processedEvents).slice(-50))
    );
  } catch {}
}

export function isAlertsUnlocked() {
  try {
    return localStorage.getItem(STORAGE_KEY_ALERTS) === 'true';
  } catch {
    return false;
  }
}

export function setAlertsUnlocked(val) {
  try {
    localStorage.setItem(STORAGE_KEY_ALERTS, val ? 'true' : 'false');
  } catch {}
}

// ───────────── WebAudio Synthesizer (No Asset Dependencies) ─────────────
let sharedAudioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playCallChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Harmonic 3-tone announcement chime: C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz)
    const tones = [
      { freq: 523.25, time: 0.00, duration: 0.22 },
      { freq: 659.25, time: 0.18, duration: 0.22 },
      { freq: 783.99, time: 0.36, duration: 0.45 },
    ];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3, ctx.currentTime);
    masterGain.connect(ctx.destination);

    tones.forEach(({ freq, time, duration }) => {
      const start = ctx.currentTime + time;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(start);
      osc.stop(start + duration + 0.05);
    });
  } catch (err) {
    console.warn('WebAudio chime playback fallback:', err);
  }
}

// ───────────── Speech Synthesis Announcement ─────────────
export function speakAnnouncement(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('SpeechSynthesis announcement skipped:', err);
  }
}

// ───────────── Tab Title Flash Manager ─────────────
let titleFlashTimer = null;
let originalDocTitle = '';

export function startTabTitleFlash(message) {
  if (typeof document === 'undefined') return;
  if (!originalDocTitle) {
    originalDocTitle = document.title || 'NeverQ';
  }

  stopTabTitleFlash();

  let isAlertState = false;
  titleFlashTimer = setInterval(() => {
    document.title = isAlertState ? `🔔 ${message}` : originalDocTitle;
    isAlertState = !isAlertState;
  }, 1000);

  const cleanupOnFocus = () => {
    stopTabTitleFlash();
    window.removeEventListener('focus', cleanupOnFocus);
    window.removeEventListener('click', cleanupOnFocus);
  };
  window.addEventListener('focus', cleanupOnFocus, { once: true });
  window.addEventListener('click', cleanupOnFocus, { once: true });
}

export function stopTabTitleFlash() {
  if (titleFlashTimer) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  if (originalDocTitle && typeof document !== 'undefined') {
    document.title = originalDocTitle;
  }
}

// ───────────── Screen Wake Lock API ─────────────
let wakeLockSentinel = null;

export async function acquireWakeLock() {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    if (!wakeLockSentinel) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch (err) {
    console.warn('Wake Lock request skipped:', err);
  }
}

export async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}

// ───────────── User Gesture Alert Unlocker (Phase 4.8) ─────────────
export async function unlockAlerts(tokenLabel = 'your ticket') {
  // 1. WebAudio unlock
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }
  playCallChime();

  // 2. Speech synthesis test
  speakAnnouncement(`Alerts enabled for token ${tokenLabel}`);

  // 3. Vibration test
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([150, 80, 150]);
  }

  // 4. Notification permission request
  let notificationGranted = false;
  if (typeof Notification !== 'undefined' && Notification.requestPermission) {
    try {
      const res = await Notification.requestPermission();
      notificationGranted = res === 'granted';
    } catch {}
  }

  setAlertsUnlocked(true);

  return {
    sound: Boolean(ctx),
    voice: typeof window !== 'undefined' && 'speechSynthesis' in window,
    vibration: typeof navigator !== 'undefined' && Boolean(navigator.vibrate),
    notifications: notificationGranted,
  };
}

// ───────────── Idempotent Call Alert (Phase 5.1 & 5.2) ─────────────
export function triggerCallAlert({
  tokenLabel,
  counterName = 'Consultation Desk',
  hospitalName = 'the hospital',
  eventId,
}) {
  const uid = eventId || `call-${tokenLabel}-${Date.now()}`;
  if (processedEvents.has(uid)) return false;
  recordEventId(uid);

  const announcement = `Token ${tokenLabel}, please proceed to ${counterName}`;

  // Always acquire wake lock during called takeover
  acquireWakeLock();

  // Tab Title Flash
  startTabTitleFlash(`[CALLED] Proceed to ${counterName}`);

  // If alerts are unlocked by user gesture:
  if (isAlertsUnlocked()) {
    playCallChime();
    speakAnnouncement(announcement);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 150, 300]);
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(`Token ${tokenLabel} Called!`, {
          body: `Please proceed to ${counterName} at ${hospitalName}.`,
          icon: '/logo.svg',
          tag: `called-${tokenLabel}`,
          requireInteraction: true,
        });
      } catch {}
    }
  }

  return true;
}

// ───────────── Throttled Alerts (Phase 5.3: Max 1 per 30s per Type) ─────────────
const lastAlertTimes = new Map();

export function triggerThrottledAlert(type, message, options = {}) {
  const now = Date.now();
  const lastTime = lastAlertTimes.get(type) || 0;
  if (now - lastTime < 30000) {
    return false; // Throttled
  }
  lastAlertTimes.set(type, now);

  if (options.variant === 'warning') {
    notify.warning(message);
  } else if (options.variant === 'error') {
    notify.error(message);
  } else {
    notify.info(message);
  }

  if (isAlertsUnlocked() && options.speak) {
    speakAnnouncement(options.speak);
  }

  return true;
}
