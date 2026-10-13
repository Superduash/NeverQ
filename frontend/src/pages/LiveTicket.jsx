import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Share2, MapPin, Navigation, Bell, Volume2,
  Clock, CheckCircle2, AlertTriangle, X, RefreshCw,
  Footprints, Bike, Car, Compass, Users, Sparkles,
  Megaphone, ShieldAlert, DoorOpen, RotateCcw, AlertCircle, WifiOff
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useLiveData, useSocketRoom } from '../lib/socket.js';
import { storage, DEMO_HOME, LOCATION_PRESETS, estimateTravel, waitStatus } from '../lib/mock.js';
import { notify } from '../lib/notify.js';
import { NOTIFICATION_MESSAGES } from '../lib/messages.js';
import {
  leaveBy, shareLink, formatDuration, formatRange, useOnline
} from '../lib/utils.js';
import {
  Button, IconButton, Badge, Segmented, ConfirmDialog,
  Banner, Skeleton, ErrorState, RelativeTime, CountdownText
} from '../components/ui/index.js';
import {
  triggerCallAlert, triggerThrottledAlert, unlockAlerts,
  isAlertsUnlocked, acquireWakeLock, releaseWakeLock, stopTabTitleFlash
} from '../lib/alerts.js';
import { MapView } from '../components/map/index.js';

export default function LiveTicket() {
  const { token: routeToken } = useParams();
  const navigate = useNavigate();
  const isOnline = useOnline();
  const shouldReduceMotion = useReducedMotion();

  // If token is missing from route, fallback to localStorage
  const activeStored = useMemo(() => storage.getActiveTicket(), []);
  const token = routeToken || activeStored?.token;

  const [travelMode, setTravelMode] = useState('car');
  const [userLocation, setUserLocation] = useState(DEMO_HOME);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [arriveError, setArriveError] = useState(null);

  // Alerts unlock state
  const [alertsUnlocked, setAlertsUnlockedState] = useState(() => isAlertsUnlocked());
  const [lastFetchTime, setLastFetchTime] = useState(Date.now());
  const previousChangesCountRef = useRef(0);
  const hasTriggeredCallRef = useRef(false);

  // ───────────── Ticket Data Fetcher ─────────────
  const fetcher = useCallback(async () => {
    if (!token) throw { status: 404, message: 'No active ticket specified' };
    const res = await api.getTicket(token);
    setLastFetchTime(Date.now());
    return res;
  }, [token]);

  const { data: liveTicket, loading, error, refresh } = useLiveData(fetcher, {
    room: token ? `ticket:${token}` : null,
    event: 'ticket:update',
    interval: 10000,
  });

  // Phase 10.2: Cache last known ticket state for offline resilience
  useEffect(() => {
    if (liveTicket && liveTicket.id) {
      try {
        localStorage.setItem(`nq-cached-ticket-${token}`, JSON.stringify({
          ticket: liveTicket,
          cachedAt: Date.now(),
        }));
      } catch (e) {}
    }
  }, [liveTicket, token]);

  const cachedTicketEntry = useMemo(() => {
    if (liveTicket) return null;
    try {
      const raw = localStorage.getItem(`nq-cached-ticket-${token}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }, [liveTicket, token, error]);

  const ticket = liveTicket || cachedTicketEntry?.ticket;
  const isFromCache = !liveTicket && !!cachedTicketEntry?.ticket;
  const cachedAtFormatted = cachedTicketEntry?.cachedAt
    ? new Date(cachedTicketEntry.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // Stale detection: > 30s since last payload or offline
  const isStale = !isOnline || (Date.now() - lastFetchTime > 30000);

  // Distance and travel estimate
  const travel = useMemo(() => {
    if (!ticket?.org) return { km: 3.5, minutes: 12 };
    return estimateTravel(userLocation || DEMO_HOME, { lat: ticket.org.lat, lng: ticket.org.lng }, travelMode);
  }, [ticket, userLocation, travelMode]);

  // Leave-by calculations
  const etaMid = ticket?.lastEta?.mid || 15;
  const leavePlan = useMemo(() => {
    return leaveBy(etaMid, travel.minutes, 5);
  }, [etaMid, travel.minutes]);

  // Is within ~300 meters of hospital
  const isNearbyHospital = travel.km <= 0.35;

  // ───────────── Phase 5.1 & 5.2: Called Event & Wake Lock ─────────────
  const isCalled = ticket?.status === 'called';
  const isServing = ticket?.status === 'serving';
  const isEnded = ticket && ['done', 'cancelled', 'expired', 'removed'].includes(ticket.status);

  // Screen Wake Lock & Tab Title lifecycle
  useEffect(() => {
    if (isCalled) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
      stopTabTitleFlash();
    }

    return () => {
      releaseWakeLock();
      stopTabTitleFlash();
    };
  }, [isCalled]);

  // Handle ticket:called event from socket
  useSocketRoom(token ? `ticket:${token}` : null, 'ticket:called', (payload) => {
    refresh();
    const counterName = payload?.counter?.name || ticket?.counterName || 'Consultation Counter 1';
    triggerCallAlert({
      tokenLabel: ticket?.label || payload?.ticket?.label || 'Your Ticket',
      counterName,
      hospitalName: ticket?.org?.name || 'the hospital',
      eventId: `called-${ticket?.id || token}-${payload?.ticket?.calledAt || Date.now()}`,
    });
  });

  // Trigger call alert on status transition to 'called' if not already fired
  useEffect(() => {
    if (isCalled && ticket && !hasTriggeredCallRef.current) {
      hasTriggeredCallRef.current = true;
      const counterName = ticket.calledCounterName || ticket.counter?.name || 'Consultation Counter 1';
      triggerCallAlert({
        tokenLabel: ticket.label,
        counterName,
        hospitalName: ticket.org?.name,
        eventId: `called-${ticket.id}-${ticket.calledAt || Date.now()}`,
      });
    } else if (!isCalled) {
      hasTriggeredCallRef.current = false;
    }
  }, [isCalled, ticket]);

  // ───────────── Phase 5.3: Proactive Throttled Alerts ─────────────
  useEffect(() => {
    if (!ticket || ticket.status !== 'waiting') return;

    // 1. "You're nearly up" alert when position is 1
    if (ticket.position === 1) {
      triggerThrottledAlert(
        'nearly-up',
        `Token ${ticket.label}: You're next in line! Please stay near the consultation area.`,
        { variant: 'info', speak: `Token ${ticket.label}, you are next in line.` }
      );
    }

    // 2. "Leave now" alert when leavePlan.isNow is true and patient has not arrived
    if (leavePlan?.isNow && !ticket.arrived) {
      triggerThrottledAlert(
        'leave-now',
        `Target departure time reached! Leave now to arrive before your turn.`,
        { variant: 'warning', speak: `Token ${ticket.label}, time to leave now.` }
      );
    }

    // 3. Re-queue notice when lateCount changes to 1
    if (ticket.lateCount === 1) {
      triggerThrottledAlert(
        'requeue',
        `Arrival window passed. Your ticket was moved back in line once.`,
        { variant: 'warning' }
      );
    }

    // 4. Delay / wait change notices
    if (ticket.changes && ticket.changes.length > previousChangesCountRef.current) {
      const latestChange = ticket.changes[0];
      if (latestChange && previousChangesCountRef.current > 0) {
        triggerThrottledAlert(
          'delay-reason',
          `Wait update: ${latestChange.text} (${latestChange.minutes > 0 ? '+' : ''}${latestChange.minutes}m)`,
          { variant: 'info' }
        );
      }
      previousChangesCountRef.current = ticket.changes.length;
    }
  }, [ticket, leavePlan]);

  // ───────────── Phase 5.5: Clear Active Ticket on Ended States ─────────────
  useEffect(() => {
    if (isEnded || (error?.status === 404 && activeStored?.token === token)) {
      storage.setActiveTicket(null);
    }
  }, [isEnded, error, activeStored, token]);

  // ───────────── User Actions ─────────────
  const handleEnableAlerts = async () => {
    try {
      await unlockAlerts(ticket?.label || 'ticket');
      setAlertsUnlockedState(true);
      notify.success(NOTIFICATION_MESSAGES.ALERTS_ENABLED);
    } catch (e) {
      notify.error('Could not enable all audio/speech alerts in this browser.');
    }
  };

  const handleArrive = async () => {
    setArriving(true);
    setArriveError(null);
    try {
      await api.arriveTicket(token, { lat: userLocation.lat, lng: userLocation.lng });
      notify.success(NOTIFICATION_MESSAGES.ARRIVED_SUCCESS);
      refresh();
    } catch (err) {
      setArriveError(err);
      notify.error(err);
    } finally {
      setArriving(false);
    }
  };

  const handleCancelTicket = async () => {
    setCancelling(true);
    try {
      await api.cancelTicket(token);
      storage.setActiveTicket(null);
      notify.info(NOTIFICATION_MESSAGES.TICKET_CANCELLED);
      setShowCancelDialog(false);
      refresh();
    } catch (err) {
      notify.error(err);
    } finally {
      setCancelling(false);
    }
  };

  const handleShare = () => {
    shareLink({
      title: `NeverQ Ticket #${ticket?.label || token}`,
      text: `Track live queue status for ticket #${ticket?.label || token}`,
      url: window.location.href,
    });
  };

  // ───────────── Loading State ─────────────
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        <Skeleton height="36px" width="120px" />
        <Skeleton height="160px" />
        <Skeleton height="120px" />
        <Skeleton height="200px" />
      </div>
    );
  }

  // ───────────── Phase 5.5: Ended States & Vanished Ticket ─────────────
  if (!ticket) {
    // Ticket vanished after demo reset or expired session and no cache available
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 max-w-xl mx-auto w-full flex flex-col gap-4 items-center justify-center my-auto">
        <div className="w-full p-6 sm:p-8 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs text-center flex flex-col items-center gap-3">
          <div className="p-3.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-faint)]">
            <Clock size={28} />
          </div>
          <Badge variant="expired" size="md">Queue Session Concluded</Badge>
          <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-[var(--ink)] tracking-tight">
            Ticket No Longer Active
          </h2>
          <p className="text-xs sm:text-sm text-[var(--ink-faint)] max-w-sm">
            This queue session has ended or was reset. You can browse active hospitals and take a new queue ticket at any time.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-xs mt-3">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => navigate('/')}
            >
              Browse Hospital Map
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={refresh}
            >
              Refresh Status
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Active or Ended Ticket Main View
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 max-w-xl mx-auto w-full flex flex-col gap-4 pb-24">
      {/* ───────────── Accessibility Live Regions (Phase 10.5) ───────────── */}
      <div role="status" aria-live="polite" className="sr-only">
        {ticket
          ? `Token ${ticket.label}. Status: ${ticket.status}. ${
              ticket.position === 1
                ? "You're next in line."
                : ticket.position
                ? `Queue position ${ticket.position}.`
                : ''
            } Estimated wait: ${etaMid} minutes.`
          : ''}
      </div>

      <div role="alert" aria-live="assertive" className="sr-only">
        {isCalled
          ? `Now calling Token ${ticket?.label}! Please proceed to ${
              ticket?.calledCounterName || ticket?.counter?.name || 'the counter'
            } immediately.`
          : ''}
      </div>

      {/* Phase 10.2: Cached State Offline Banner */}
      {isFromCache && (
        <div
          role="status"
          className="p-3.5 rounded-2xl bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)] border border-[var(--wait-mid)]/40 flex items-center justify-between text-xs font-semibold shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff size={15} className="shrink-0" />
            <span className="truncate">
              Offline — Showing cached ticket. Last updated {cachedAtFormatted || 'recently'}
            </span>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="px-2.5 py-1 rounded-lg bg-[var(--surface)] text-[var(--wait-mid-text)] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors inline-flex items-center gap-1 font-bold shrink-0 ml-2"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<ArrowLeft size={16} />}
          onClick={() => navigate('/')}
        >
          Hospital Map
        </Button>

        <div className="flex items-center gap-1.5">
          <IconButton
            icon={<Share2 size={16} />}
            label="Share ticket link"
            onClick={handleShare}
            variant="ghost"
          />
        </div>
      </div>

      {/* Stale Connection Indicator Banner */}
      {isStale && !isEnded && (
        <div className="p-2.5 rounded-xl bg-[var(--wait-mid-bg)] border border-[var(--wait-mid)]/30 text-[var(--wait-mid-text)] text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold">
            <RefreshCw size={13} className="animate-spin" />
            <span>Live socket syncing. Refreshing status...</span>
          </span>
          <span className="text-[10px] tnum">
            Last updated {new Date(lastFetchTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          PHASE 5.1: CALLED TAKEOVER PANEL
          ═════════════════════════════════════════════════════════════ */}
      {isCalled && (
        <CalledTakeoverPanel
          ticket={ticket}
          shouldReduceMotion={shouldReduceMotion}
        />
      )}

      {/* ═════════════════════════════════════════════════════════════
          PHASE 5.4: SERVING STATE (IN CONSULTATION)
          ═════════════════════════════════════════════════════════════ */}
      {isServing && (
        <ServingStatePanel ticket={ticket} />
      )}

      {/* ═════════════════════════════════════════════════════════════
          PHASE 5.5: ENDED STATE VIEW
          ═════════════════════════════════════════════════════════════ */}
      {isEnded && (
        <EndedStatePanel
          ticket={ticket}
          onRejoin={() => navigate(`/join/${ticket.orgId}/${ticket.deptId}`)}
          onReturnHome={() => navigate('/')}
        />
      )}

      {/* ═════════════════════════════════════════════════════════════
          PHASE 5.6: RE-QUEUE / LATE WARNING BANNER
          ═════════════════════════════════════════════════════════════ */}
      {!isEnded && !isCalled && !isServing && ticket.lateCount > 0 && (
        <RequeueBanner ticket={ticket} />
      )}

      {/* ═════════════════════════════════════════════════════════════
          4.2 STATUS HEADER CARD
          ═════════════════════════════════════════════════════════════ */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                Token
              </span>
              {ticket.simulated && <Badge variant="sim">SIM</Badge>}
              {ticket.priority && ticket.priority !== 'none' && (
                <Badge variant="priority">{ticket.priority}</Badge>
              )}
            </div>
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[var(--ink)] tracking-tight tnum mt-0.5">
              {ticket.label}
            </h1>
          </div>

          <Badge variant={ticket.status}>
            {ticket.status}
          </Badge>
        </div>

        <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs">
          <div>
            <p className="font-heading font-bold text-[var(--ink)]">
              {ticket.org?.name || 'Hospital'}
            </p>
            <p className="text-[11px] text-[var(--ink-faint)]">
              {ticket.dept?.name || 'Department'}
            </p>
          </div>

          {ticket.arrived ? (
            <span className="flex items-center gap-1.5 text-[var(--wait-good)] font-bold text-xs">
              <CheckCircle2 size={16} /> Arrived at clinic
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-[var(--wait-mid)]">
              Remote (Not arrived yet)
            </span>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════
          4.3 POSITION & ESTIMATED WAIT CARD (Waiting State Only)
          ═════════════════════════════════════════════════════════════ */}
      {!isEnded && !isCalled && !isServing && (
        <div className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-center">
            {/* Position in line */}
            <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                Position in Line
              </span>
              <span className="font-heading font-extrabold text-2xl text-[var(--brand)] mt-1 tnum">
                {ticket.position === 1 ? "You're next" : `#${ticket.position || 1}`}
              </span>
            </div>

            {/* Estimated Wait */}
            <div className={`p-3.5 rounded-2xl bg-[var(--surface-2)] flex flex-col items-center justify-center ${isStale ? 'opacity-60' : ''}`}>
              <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                Estimated Wait
              </span>
              <span className="font-heading font-extrabold text-2xl text-[var(--ink)] mt-1 tnum">
                {ticket.lastEta?.noCounter
                  ? 'No counter open'
                  : formatRange(ticket.lastEta?.low, ticket.lastEta?.high)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-[11px] text-[var(--ink-faint)]">
              {ticket.dept?.confidence || 'Calculated live'}
            </span>
            <RelativeTime timestamp={lastFetchTime} />
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          4.5 TRAVEL-AWARE LEAVE-BY PLAN CARD (Waiting State Only)
          ═════════════════════════════════════════════════════════════ */}
      {!isEnded && !isCalled && !isServing && !ticket.arrived && (
        <div className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--ink-faint)]">
              Travel-Aware Leave-By Plan
            </h3>
            <span className="text-[11px] font-semibold text-[var(--brand)] tnum">
              ~{travel.minutes} min travel ({travel.km} km)
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--surface-2)]">
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)] block">
                Target Departure
              </span>
              <span className="font-heading font-extrabold text-lg text-[var(--ink)] tnum">
                {isNearbyHospital ? 'Already there' : leavePlan?.leaveTime || 'Now'}
              </span>
            </div>

            <div className="text-right">
              {isNearbyHospital ? (
                <span className="px-2.5 py-1 rounded-xl bg-[var(--wait-good-bg)] text-[var(--wait-good-text)] text-xs font-bold">
                  At Clinic (&lt;350m)
                </span>
              ) : leavePlan?.isNow ? (
                <span className="px-2.5 py-1 rounded-xl bg-[var(--danger)] text-white text-xs font-bold animate-pulse">
                  Leave Now
                </span>
              ) : (
                <span className="text-xs font-bold text-[var(--brand)] tnum">
                  Leave in ~{leavePlan?.leaveMinutes} min
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Segmented
              size="sm"
              value={travelMode}
              onChange={setTravelMode}
              options={[
                { value: 'walk', label: 'Walk', icon: <Footprints size={13} /> },
                { value: 'bike', label: 'Bike', icon: <Bike size={13} /> },
                { value: 'car', label: 'Car', icon: <Car size={13} /> },
              ]}
            />

            {/* Check-in / I'm Here Button */}
            <Button
              size="sm"
              variant="primary"
              loading={arriving}
              onClick={handleArrive}
            >
              I'm Here
            </Button>
          </div>

          {/* Mini Route Map Preview (Phase A.1 Ticket Mode) */}
          {ticket?.org && typeof ticket.org.lat === 'number' && typeof ticket.org.lng === 'number' && (
            <div className="rounded-2xl overflow-hidden border border-[var(--border)] h-36 sm:h-40 relative mt-1">
              <MapView
                markers={[ticket.org]}
                selected={ticket.org.id}
                user={userLocation || DEMO_HOME}
                mode="ticket"
                interactive={true}
                route={[
                  [(userLocation || DEMO_HOME).lng, (userLocation || DEMO_HOME).lat],
                  [ticket.org.lng, ticket.org.lat],
                ]}
                center={[ticket.org.lng, ticket.org.lat]}
                zoom={12.5}
              />
            </div>
          )}

          {arriveError && (
            <p className="text-[11px] text-[var(--danger)] mt-1 font-medium">
              {arriveError.message || 'Check-in failed. You must be within ~350m of the hospital.'}
            </p>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          4.4 REASONS FOR WAIT ADJUSTMENT (changes[])
          ═════════════════════════════════════════════════════════════ */}
      {!isEnded && ticket.changes && ticket.changes.length > 0 && (
        <div className="p-4 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-2.5">
          <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--ink-faint)]">
            Recent Wait Adjustments
          </h4>
          <div className="flex flex-col gap-2">
            {ticket.changes.slice(0, 5).map((change, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs p-2 rounded-xl bg-[var(--surface-2)]"
              >
                <span className="text-[var(--ink)] font-medium truncate max-w-[280px]">
                  {change.text}
                </span>
                <span className="font-bold text-[var(--brand)] tnum shrink-0">
                  {change.minutes > 0 ? `+${change.minutes}m` : `${change.minutes}m`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          4.8 ENABLE AUDIO & VOICE ALERTS CARD
          ═════════════════════════════════════════════════════════════ */}
      {!alertsUnlocked && !isEnded && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-[var(--brand)]/10 to-[var(--brand-2)]/10 border border-[var(--brand)]/25 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Volume2 size={20} className="text-[var(--brand)] shrink-0" />
            <div className="min-w-0">
              <p className="font-heading font-bold text-xs text-[var(--ink)]">
                Enable Audio & Speech Alerts
              </p>
              <p className="text-[11px] text-[var(--ink-faint)] truncate">
                Spoken chimes and announcements when called
              </p>
            </div>
          </div>
          <Button size="sm" variant="primary" onClick={handleEnableAlerts}>
            Enable
          </Button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          4.9 MINI MAP SUB-COMPONENT
          ═════════════════════════════════════════════════════════════ */}
      {!isEnded && ticket.org && (
        <div className="rounded-3xl border border-[var(--border)] overflow-hidden h-40 relative shadow-xs">
          <MiniMap org={ticket.org} userLocation={userLocation} />
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          CANCEL TICKET ACTION (Waiting state only)
          ═════════════════════════════════════════════════════════════ */}
      {!isEnded && !isServing && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setShowCancelDialog(true)}
            className="text-xs font-semibold text-[var(--danger)] hover:underline"
          >
            Cancel this ticket
          </button>
        </div>
      )}

      {/* Cancel Confirm Dialog */}
      <ConfirmDialog
        isOpen={showCancelDialog}
        loading={cancelling}
        title="Cancel Queue Ticket?"
        description="Cancelling will immediately release your place in line. You can rejoin later if needed."
        confirmText="Cancel Ticket"
        onConfirm={handleCancelTicket}
        onClose={() => setShowCancelDialog(false)}
      />
    </div>
  );
}

// ───────────── Phase 5.1: Called Takeover Component ─────────────
function CalledTakeoverPanel({ ticket, shouldReduceMotion }) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    const graceMs = 5 * 60 * 1000;
    const calledAt = ticket.calledAt || Date.now();
    return Math.max(0, Math.floor((calledAt + graceMs - Date.now()) / 1000));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const graceMs = 5 * 60 * 1000;
      const calledAt = ticket.calledAt || Date.now();
      const remaining = Math.max(0, Math.floor((calledAt + graceMs - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [ticket.calledAt]);

  const mins = Math.floor(secondsRemaining / 60);
  const secs = String(secondsRemaining % 60).padStart(2, '0');
  const counterName = ticket.calledCounterName || ticket.counter?.name || 'Counter 1';

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={`p-6 sm:p-7 rounded-3xl bg-[var(--accent-2)] text-black border-2 border-black/30 shadow-2xl flex flex-col items-center text-center gap-3.5 ${
        shouldReduceMotion ? '' : 'animate-pulse'
      }`}
    >
      <div className="flex items-center gap-2">
        <Badge variant="called" size="md">
          PROCEED TO COUNTER
        </Badge>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-xs uppercase font-extrabold tracking-wider text-black/70">
          Your Token Has Been Called
        </span>
        <h2 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-black mt-1">
          Go to {counterName}
        </h2>
        <span className="text-sm font-bold text-black/80 mt-1">
          {ticket.org?.name || 'Clinic Desk'} · {ticket.dept?.name || 'Department'}
        </span>
      </div>

      {/* Grace countdown ticker */}
      <div className="p-3 px-5 rounded-2xl bg-black/10 border border-black/15 flex items-center gap-2.5">
        <Clock size={16} className="text-black shrink-0" />
        <span className="text-xs font-bold tnum">
          {secondsRemaining > 0 ? (
            <>Please report to the counter within <span className="font-extrabold underline">{mins}:{secs}</span></>
          ) : (
            <span className="text-red-950 font-extrabold">Grace period elapsed — report to counter now</span>
          )}
        </span>
      </div>

      <p className="text-xs text-black/75 max-w-sm font-medium">
        Show token <span className="font-extrabold underline">{ticket.label}</span> on your screen to the doctor or counter staff.
      </p>
    </motion.div>
  );
}

// ───────────── Phase 5.4: Serving State Component ─────────────
function ServingStatePanel({ ticket }) {
  const [elapsedMin, setElapsedMin] = useState(() => {
    const started = ticket.startedAt || Date.now();
    return Math.max(0, Math.floor((Date.now() - started) / 60000));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const started = ticket.startedAt || Date.now();
      setElapsedMin(Math.max(0, Math.floor((Date.now() - started) / 60000)));
    }, 30000);
    return () => clearInterval(timer);
  }, [ticket.startedAt]);

  const startedStr = ticket.startedAt
    ? new Date(ticket.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  return (
    <div className="p-6 rounded-3xl bg-[var(--surface)] border-2 border-[var(--brand)] shadow-sm flex flex-col items-center text-center gap-3">
      <div className="p-3 rounded-full bg-[var(--brand)]/15 text-[var(--brand)]">
        <DoorOpen size={26} />
      </div>
      <Badge variant="serving" size="md">IN CONSULTATION</Badge>
      <h2 className="font-heading font-extrabold text-2xl text-[var(--ink)] tracking-tight">
        Currently with Doctor / Desk
      </h2>
      <p className="text-xs sm:text-sm text-[var(--ink-faint)] max-w-sm">
        Started at {startedStr} · Ongoing for ~{elapsedMin} min. Please conclude all inquiries with your specialist.
      </p>
    </div>
  );
}

// ───────────── Phase 5.5: Ended States Component ─────────────
function EndedStatePanel({ ticket, onRejoin, onReturnHome }) {
  const statusInfo = {
    done: {
      title: 'Consultation Complete',
      desc: 'Your consultation has concluded. Thank you for using NeverQ.',
      badge: 'done',
      icon: CheckCircle2,
      canRejoin: true,
    },
    cancelled: {
      title: 'Ticket Cancelled',
      desc: 'You released your place in line. Your token is no longer active.',
      badge: 'cancelled',
      icon: X,
      canRejoin: true,
    },
    expired: {
      title: 'Ticket Expired',
      desc: 'The arrival deadline or counter grace period elapsed before check-in.',
      badge: 'expired',
      icon: AlertCircle,
      canRejoin: true,
    },
    removed: {
      title: 'Ticket Removed',
      desc: 'This ticket was removed from the active queue by clinic administration.',
      badge: 'removed',
      icon: AlertTriangle,
      canRejoin: false,
    },
  }[ticket.status] || {
    title: 'Ticket Ended',
    desc: 'This ticket is no longer active.',
    badge: 'default',
    icon: Clock,
    canRejoin: true,
  };

  const Icon = statusInfo.icon;

  return (
    <div className="p-6 sm:p-7 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col items-center text-center gap-3.5">
      <div className="p-3 rounded-full bg-[var(--surface-2)] text-[var(--ink-faint)]">
        <Icon size={26} />
      </div>
      <Badge variant={statusInfo.badge} size="md">
        {ticket.status.toUpperCase()}
      </Badge>
      <h2 className="font-heading font-extrabold text-2xl text-[var(--ink)] tracking-tight">
        {statusInfo.title}
      </h2>
      <p className="text-xs sm:text-sm text-[var(--ink-faint)] max-w-sm">
        {statusInfo.desc}
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-xs mt-2">
        {statusInfo.canRejoin && ticket.orgId && ticket.deptId && (
          <Button
            variant="primary"
            className="w-full"
            iconLeft={<RotateCcw size={15} />}
            onClick={onRejoin}
          >
            Join Queue Again
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full"
          onClick={onReturnHome}
        >
          Back to Map
        </Button>
      </div>
    </div>
  );
}

// ───────────── Phase 5.6: Re-Queue Banner Component ─────────────
function RequeueBanner({ ticket }) {
  const isSecondWarning = ticket.lateCount >= 2;
  const deadlineStr = ticket.arriveDeadline
    ? new Date(ticket.arriveDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
      isSecondWarning
        ? 'bg-[var(--wait-bad-bg)] border-[var(--danger)]/30 text-[var(--wait-bad-text)]'
        : 'bg-[var(--wait-mid-bg)] border-[var(--wait-mid)]/30 text-[var(--wait-mid-text)]'
    }`}>
      <ShieldAlert size={18} className="shrink-0 mt-0.5" />
      <div className="text-xs">
        <span className="font-bold block">
          {isSecondWarning
            ? 'Final Warning: Missed Arrival Window'
            : 'Arrival Window Passed: Moved Back in Line'}
        </span>
        <span className="block mt-0.5 opacity-90">
          {isSecondWarning
            ? 'Your ticket will be cancelled permanently if you do not check in before your deadline.'
            : 'You were not checked in before your estimated turn. Your ticket was moved back once to allow you time to arrive.'}
        </span>
        {deadlineStr && (
          <span className="font-bold block mt-1 tnum">
            Be at the hospital by {deadlineStr}
          </span>
        )}
      </div>
    </div>
  );
}

// ───────────── 4.9 Mini Map Sub-component ─────────────
function MiniMap({ org, userLocation }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !org) return;

    // Check WebGL availability before instantiating MapLibre
    let isGlSupported = false;
    try {
      if (maplibregl.supported && maplibregl.supported()) {
        const testCanvas = document.createElement('canvas');
        isGlSupported = Boolean(
          testCanvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ||
          testCanvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: false })
        );
      }
    } catch (e) {
      isGlSupported = false;
    }

    if (!isGlSupported) return;

    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: DEFAULT_MAP_STYLE,
        center: [org.lng, org.lat],
        zoom: 12.5,
        attributionControl: false,
        interactive: false,
      });

      // Hospital Marker
      new maplibregl.Marker({ color: '#0077b6' })
        .setLngLat([org.lng, org.lat])
        .addTo(map);

      // User Marker if present
      if (userLocation && typeof userLocation.lng === 'number' && typeof userLocation.lat === 'number') {
        new maplibregl.Marker({ color: '#ff6b57' })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map);
      }
    } catch (e) {
      console.warn('MiniMap WebGL unavailable:', e);
    }

    return () => {
      map?.remove();
    };
  }, [org, userLocation]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[var(--surface-2)] flex items-center justify-center text-xs text-[var(--ink-faint)]">
      <span className="flex items-center gap-1.5 opacity-75">
        <MapPin size={14} className="text-[var(--brand)]" />
        <span>{org?.area || 'Clinic location'}</span>
      </span>
    </div>
  );
}
