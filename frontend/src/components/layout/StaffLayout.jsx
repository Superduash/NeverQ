import React from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { OfflineBanner } from './OfflineBanner.jsx';
import { DemoClockBanner } from './DemoClockBanner.jsx';
import { Logo } from '../../components/brand/Logo.jsx';
import { ThemeToggle } from '../../lib/theme.jsx';
import { SocketStatusIndicator } from './SocketStatusIndicator.jsx';
import { LogOut } from 'lucide-react';
import { notify } from '../../lib/notify.js';

export function StaffLayout() {
  const navigate = useNavigate();
  const orgName = localStorage.getItem('nq-staff-org') || 'Hospital Console';

  const handleLogout = () => {
    localStorage.removeItem('nq-staff-token');
    localStorage.removeItem('nq-staff-org');
    notify.info('Logged out from staff console');
    navigate('/staff/login');
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-full overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <OfflineBanner />
      <DemoClockBanner />

      {/* Staff Top Bar */}
      <header className="shrink-0 bg-[var(--surface-glass)] backdrop-blur-md border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <Link to="/" title="Back to Customer Map">
            <Logo size={26} />
          </Link>
          <div className="hidden sm:flex items-center gap-2 border-l border-[var(--border)] pl-3">
            <span className="font-heading font-extrabold text-xs text-[var(--ink)]">
              {orgName}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand)]/15 text-[var(--brand)] font-bold">
              STAFF
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <SocketStatusIndicator />
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            className="touch-target p-2 rounded-xl text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

