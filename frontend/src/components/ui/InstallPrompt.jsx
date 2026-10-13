import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { notify } from '../../lib/notify.js';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
      notify.success('NeverQ installed successfully!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        notify.success('Installing NeverQ...');
      }
      setDeferredPrompt(null);
      setCanInstall(false);
      return outcome === 'accepted';
    } catch (err) {
      console.warn('PWA install prompt error:', err);
      return false;
    }
  }, [deferredPrompt]);

  return { canInstall, isInstalled, promptInstall };
}

export function InstallPrompt({ className = '' }) {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('nq-install-dismissed') === 'true';
    } catch (e) {
      return false;
    }
  });

  if (!canInstall || isInstalled || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('nq-install-dismissed', 'true');
    } catch (e) {}
  };

  return (
    <div
      role="region"
      aria-label="Install App"
      className={`
        bg-[var(--surface)] border border-[var(--brand)]/30 rounded-2xl p-3 sm:p-3.5
        shadow-[var(--shadow-card)] flex items-center justify-between gap-3 text-left
        transition-all ${className}
      `}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand-2)] flex items-center justify-center text-white shrink-0 shadow-xs">
          <Smartphone size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-heading font-bold text-xs text-[var(--ink)] truncate">
            Install NeverQ
          </p>
          <p className="text-[11px] text-[var(--ink-faint)] truncate">
            Fast live wait times & sound alerts on your phone
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={promptInstall}
          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs hover:opacity-95 active:scale-95 transition-transform"
        >
          <Download size={13} />
          Install
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="p-1.5 rounded-lg text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
