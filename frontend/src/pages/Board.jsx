import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Maximize, Minimize, SunMedium, Moon, Wifi, WifiOff,
  Clock, ArrowLeft, Layers, Stethoscope, RefreshCw, CheckCircle2,
  Sparkles, AlertCircle, Eye
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useLiveData, useSocketRoom } from '../lib/socket.js';
import { useTheme } from '../lib/theme.jsx';
import { useOnline } from '../lib/utils.js';
import { Logo } from '../main.jsx';

export default function Board() {
  const { orgId } = useParams();
  const isOnline = useOnline();
  const { theme, setTheme } = useTheme();

  const [selectedDeptId, setSelectedDeptId] = useState('all');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [callAlertText, setCallAlertText] = useState('');
  const [pulsingTokenId, setPulsingTokenId] = useState(null);

  const wakeLockSentinelRef = useRef(null);

  // ───────────── Clock (1s tick) ─────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ───────────── Screen Wake Lock (Phase 10.1) ─────────────
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinelRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      } catch (err) {
        // Wake lock could be denied by policy or battery saver
        setWakeLockActive(false);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release();
      } catch (e) {}
      wakeLockSentinelRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  useEffect(() => {
    requestWakeLock();

    // Re-request when page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  // ───────────── Fullscreen Handling ─────────────
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // ───────────── Board Data Fetcher ─────────────
  const fetcher = useCallback(async () => {
    if (!orgId) throw { status: 404, message: 'Hospital ID required' };
    return api.getBoard(orgId, selectedDeptId === 'all' ? null : selectedDeptId);
  }, [orgId, selectedDeptId]);

  const { data: boardData, loading, error, refresh } = useLiveData(fetcher, {
    room: orgId ? `org:${orgId}` : null,
    event: 'queue:update',
    interval: 10000,
  });

  // Listen to ticket:called events in the hospital room
  useSocketRoom(orgId ? `org:${orgId}` : null, 'ticket:called', (payload) => {
    refresh();
    if (payload?.ticket?.label && payload?.counter?.name) {
      setCallAlertText(`Now serving Token ${payload.ticket.label} at ${payload.counter.name}`);
      setPulsingTokenId(payload.ticket.id);
      setTimeout(() => setPulsingTokenId(null), 8000);
    }
  });

  // Aggregate Serving & Waiting lists
  const departments = boardData?.departments || [];
  const org = boardData?.org || {};

  const allServing = useMemo(() => {
    const list = [];
    departments.forEach((dept) => {
      (dept.serving || []).forEach((item) => {
        list.push({ ...item, deptName: dept.name, deptId: dept.id });
      });
    });
    return list;
  }, [departments]);

  const allWaiting = useMemo(() => {
    if (selectedDeptId !== 'all') {
      const activeDept = departments.find((d) => d.id === selectedDeptId);
      return activeDept?.waiting?.slice(0, 5) || [];
    }

    // Merge next 5 waiting across departments sorted by arrival / urgent / key
    const list = [];
    departments.forEach((dept) => {
      (dept.waiting || []).forEach((item) => {
        list.push({ ...item, deptName: dept.name, deptId: dept.id });
      });
    });
    return list
      .sort((a, b) => {
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        if (a.arrived && !b.arrived) return -1;
        if (!a.arrived && b.arrived) return 1;
        return 0;
      })
      .slice(0, 5);
  }, [departments, selectedDeptId]);

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[var(--bg)] text-[var(--ink)] flex flex-col overflow-x-hidden font-sans select-none">
      {/* ───────────── Accessibility Live Regions (Phase 10.5) ───────────── */}
      <div role="status" aria-live="polite" className="sr-only">
        Waiting board for {org.name || 'Hospital'}. Currently serving {allServing.length} tokens.
      </div>
      {callAlertText && (
        <div role="alert" aria-live="assertive" className="sr-only">
          {callAlertText}
        </div>
      )}

      {/* ───────────── Header Bar ───────────── */}
      <header
        role="banner"
        className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-30"
      >
        <div className="flex items-center gap-3">
          <Link
            to={`/hospital/${orgId}`}
            className="p-2 rounded-xl border border-[var(--border)] text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors"
            title="Back to Hospital View"
            aria-label="Back to Hospital View"
          >
            <ArrowLeft size={18} />
          </Link>
          <Logo size={28} showText={false} />
          <div>
            <h1 className="font-heading font-extrabold text-base sm:text-lg md:text-xl text-[var(--ink)] tracking-tight leading-tight">
              {org.name || 'Hospital Waiting Board'}
            </h1>
            <p className="text-xs text-[var(--ink-faint)] flex items-center gap-2">
              <span>Public Live Display</span>
              <span>•</span>
              <span className="capitalize">{org.area || 'Outpatient Clinic'}</span>
            </p>
          </div>
        </div>

        {/* Live Status, Clock & Controls */}
        <div className="flex items-center gap-2 sm:gap-4 ml-auto">
          {/* Realtime Status Indicator */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isOnline
                ? 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]'
                : 'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-[var(--wait-good)] animate-pulse' : 'bg-[var(--wait-bad)]'
              }`}
            />
            <span className="hidden sm:inline">{isOnline ? 'Live Updates' : 'Offline'}</span>
          </div>

          {/* Wake Lock Status */}
          <button
            type="button"
            onClick={wakeLockActive ? releaseWakeLock : requestWakeLock}
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              wakeLockActive
                ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--surface-2)]'
                : 'border-[var(--border)] text-[var(--ink-faint)]'
            }`}
            title="Keeps screen awake on waiting room monitors"
          >
            <Eye size={12} />
            <span>Screen Awake</span>
          </button>

          {/* Large Clock */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] font-heading font-bold text-sm sm:text-base text-[var(--ink)] tnum">
            <Clock size={15} className="text-[var(--brand)]" />
            <span>
              {currentTime.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (TV Display)'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      {/* ───────────── Department Filter Navigation ───────────── */}
      {org.departments && org.departments.length > 1 && (
        <nav
          aria-label="Filter department"
          className="shrink-0 px-4 sm:px-6 py-2.5 bg-[var(--surface)]/50 border-b border-[var(--border)] flex items-center gap-2 overflow-x-auto no-scrollbar"
        >
          <button
            type="button"
            onClick={() => setSelectedDeptId('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              selectedDeptId === 'all'
                ? 'bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white shadow-xs'
                : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            All Departments
          </button>
          {org.departments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedDeptId(d.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                selectedDeptId === 'd.id' || selectedDeptId === d.id
                  ? 'bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] text-white shadow-xs'
                  : 'bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              {d.name}
            </button>
          ))}
        </nav>
      )}

      {/* ───────────── Main Board Body ───────────── */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col min-h-0 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 flex-1 items-start">
          {/* ───────────── LEFT / TOP: NOW SERVING (Col 1 to 7) ───────────── */}
          <section
            aria-labelledby="now-serving-heading"
            className="lg:col-span-7 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-[var(--wait-good)] animate-ping" />
                <h2
                  id="now-serving-heading"
                  className="font-heading font-black text-xl sm:text-2xl lg:text-3xl uppercase tracking-wider text-[var(--ink)]"
                >
                  Now Serving
                </h2>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[var(--surface-2)] text-[var(--brand)] uppercase tracking-wider">
                {allServing.length} Counter{allServing.length === 1 ? '' : 's'} Active
              </span>
            </div>

            {/* Serving Cards Grid */}
            {allServing.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {allServing.map((item) => {
                  const isPulsing = pulsingTokenId === item.counterId || pulsingTokenId === item.label;
                  const isCalled = item.status === 'called';

                  return (
                    <div
                      key={item.counterId}
                      className={`
                        p-6 rounded-3xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between
                        ${
                          isCalled
                            ? 'bg-[var(--surface)] border-[var(--accent)] shadow-[0_0_24px_rgba(255,107,87,0.25)] ring-2 ring-[var(--accent)]/50'
                            : 'bg-[var(--surface)] border-[var(--border)] shadow-[var(--shadow-card)]'
                        }
                      `}
                    >
                      {/* Counter Room / Desk Banner */}
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-heading font-extrabold text-sm sm:text-base text-[var(--ink-faint)] uppercase tracking-wider truncate">
                          {item.counterName}
                        </span>
                        <span
                          className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider ${
                            isCalled
                              ? 'bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)] animate-bounce'
                              : 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]'
                          }`}
                        >
                          {isCalled ? 'PROCEED TO COUNTER' : 'IN CONSULTATION'}
                        </span>
                      </div>

                      {/* HUGE Token Number */}
                      <div className="my-2 py-4 text-center rounded-2xl bg-[var(--surface-2)]/60 border border-[var(--border)]">
                        <span className="font-heading font-black text-6xl sm:text-7xl lg:text-8xl tracking-tight text-[var(--ink)] tnum select-all">
                          {item.label}
                        </span>
                      </div>

                      {/* Department Footer */}
                      <div className="mt-3 flex items-center justify-between text-xs text-[var(--ink-faint)]">
                        <span className="font-semibold truncate">{item.deptName}</span>
                        <span className="font-mono text-[11px] opacity-75">
                          {item.calledAt
                            ? new Date(item.calledAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Active'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 text-center flex flex-col items-center justify-center min-h-[320px]">
                <Stethoscope size={48} className="text-[var(--ink-faint)]/40 mb-3" />
                <h3 className="font-heading font-bold text-lg text-[var(--ink)]">
                  Consultation in Prep
                </h3>
                <p className="text-sm text-[var(--ink-faint)] max-w-sm mt-1">
                  Doctors are preparing rooms. Your token number will appear here when called.
                </p>
              </div>
            )}
          </section>

          {/* ───────────── RIGHT / BOTTOM: NEXT IN LINE (Col 8 to 12) ───────────── */}
          <section
            aria-labelledby="upcoming-heading"
            className="lg:col-span-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={20} className="text-[var(--brand)]" />
                <h2
                  id="upcoming-heading"
                  className="font-heading font-black text-xl sm:text-2xl lg:text-3xl uppercase tracking-wider text-[var(--ink)]"
                >
                  Next In Line
                </h2>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)]">
                Next 5 Tokens
              </span>
            </div>

            {/* Waiting Tokens List */}
            {allWaiting.length > 0 ? (
              <div className="flex flex-col gap-3">
                {allWaiting.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-card)] flex items-center justify-between gap-4 transition-transform hover:scale-[1.01]"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface)] border border-[var(--border)] flex items-center justify-center font-heading font-extrabold text-base text-[var(--brand)] shrink-0">
                        {idx + 1}
                      </div>
                      <div>
                        <span className="font-heading font-black text-3xl sm:text-4xl text-[var(--ink)] tnum tracking-tight block">
                          {item.label}
                        </span>
                        {item.deptName && (
                          <span className="text-xs text-[var(--ink-faint)] font-medium">
                            {item.deptName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      {idx === 0 && (
                        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] uppercase tracking-wider">
                          NEXT UP
                        </span>
                      )}
                      {item.urgent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--wait-bad-bg)] text-[var(--wait-bad-text)] uppercase">
                          Priority
                        </span>
                      )}
                      {item.arrived ? (
                        <span className="text-[10px] font-semibold text-[var(--wait-good)] flex items-center gap-1">
                          <CheckCircle2 size={12} /> At clinic
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--ink-faint)]">
                          En route
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 text-center flex flex-col items-center justify-center min-h-[220px]">
                <CheckCircle2 size={36} className="text-[var(--wait-good)]/60 mb-2" />
                <h3 className="font-heading font-bold text-base text-[var(--ink)]">
                  Queue is Clear
                </h3>
                <p className="text-xs text-[var(--ink-faint)] mt-1">
                  No patients currently waiting in line.
                </p>
              </div>
            )}

            {/* Waiting Room Patient Reminder Card */}
            <div className="mt-2 p-4 rounded-2xl bg-[var(--surface-2)]/60 border border-[var(--border)] flex items-start gap-3">
              <AlertCircle size={18} className="text-[var(--brand)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                When your token flashes under <strong className="text-[var(--ink)]">Now Serving</strong>, proceed directly to the indicated room desk. Please have your ticket ready.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
