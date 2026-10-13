import React from 'react';
import { Outlet } from 'react-router-dom';
import { OfflineBanner } from './OfflineBanner.jsx';
import { DemoClockBanner } from './DemoClockBanner.jsx';
import { InstallPrompt } from '../ui/InstallPrompt.jsx';

export function CustomerLayout() {
  return (
    <div className="flex flex-col h-screen h-[100dvh] w-full overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <OfflineBanner />
      <DemoClockBanner />
      <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        <Outlet />
      </main>
      <div className="px-4 pb-2 z-40 empty:hidden">
        <InstallPrompt />
      </div>
    </div>
  );
}
