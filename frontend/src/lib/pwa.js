// NeverQ PWA Service Worker Registration & Update Notification
import { registerSW } from 'virtual:pwa-register';
import { notify } from './notify.js';

export function initPWA() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const updateSW = registerSW({
    onNeedRefresh() {
      notify.info('A new version of NeverQ is available.', {
        duration: 15000,
        action: {
          label: 'Update now',
          onClick: () => {
            updateSW(true);
          },
        },
      });
    },
    onOfflineReady() {
      // Service worker pre-cache is primed
      console.log('[NeverQ PWA] App cached and ready for offline use.');
    },
  });
}
