import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import {
  ArrowLeft, Share2, MapPin, Navigation, Bell, Volume2,
  Clock, CheckCircle2, AlertTriangle, X, RefreshCw,
  Footprints, Bike, Car, Compass, Users, Sparkles
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

const DEFAULT_MAP_STYLE = import.meta.env.VITE_MAP_STYLE || 'https://tiles.openfreemap.org/styles/liberty';

export default function LiveTicket() {
  const { token: routeToken } = useParams();
  const navigate = useNavigate();
  const isOnline = useOnline();

  // If token is missing from route, check localStorage
  const token = routeToken || storage.getActiveTicket()?.token;

  const [travelMode, setTravelMode] = useState('car');
  const [userLocation, setUserLocation] = useState(DEMO_HOME);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [arriveError, setArriveError] = useState(null);

  // Alerts unlock state
  const [alertsUnlocked, setAlertsUnlocked] = useState(() => {
    try {
      return localStorage.getItem('nq-alerts-unlocked') === 'true';
    } catch {
      return false;
    }
  });

  const [lastFetchTime, setLastFetchTime] = useState(Date.now());

  // Ticket Data Fetcher
  const fetcher = useCallback(async () => {
    if (!token) throw { status: 404, message: 'No active ticket specified' };
    const res = await api.getTicket(token);
    setLastFetchTime(Date.now());
    return res;
  }, [token]);

  const { data: ticket, loading, error, refresh } = useLiveData(fetcher, {
    room: token ? `ticket:${token}` : null,
    event: 'ticket:update',
    interval: 10000,
  });

  // Listen for ticket:called event
  useSocketRoom(token ? `ticket:${token}` : null, 'ticket:called', (payload) => {
    refresh();
    if (alertsUnlocked) {
      playChime();
      speakAnnouncement(`Token ${ticket?.label || 'your ticket'}, please proceed to counter`);
      if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    }
  });

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

  // Audio & Voice helper
  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn('Audio unlock warning:', e);
    }
  };

  const speakAnnouncement = (text) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleEnableAlerts = async () => {
    playChime();
    speakAnnouncement(`Alerts unlocked for token ${ticket?.label || 'ticket'}`);

    if (navigator.vibrate) {
      navigator.vibrate([150, 100, 150]);
    }

    if (typeof Notification !== 'undefined' && Notification.requestPermission) {
      try {
        await Notification.requestPermission();
      } catch {}
    }

    setAlertsUnlocked(true);
    try {
      localStorage.setItem('nq-alerts-unlocked', 'true');
    } catch {}
    notify.success(NOTIFICATION_MESSAGES.ALERTS_ENABLED);
  };

  // Arrive action
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

  // Cancel action
  const handleCancelTicket = async () => {
    setCancelling(true);
    try {
      await api.cancelTicket(token);
      storage.setActiveTicket(null);
      notify.info(NOTIFICATION_MESSAGES.TICKET_CANCELLED);
      setShowCancelDialog(false);
      navigate('/');
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

  if (error || !ticket) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <ErrorState
          title="Ticket Not Found"
          message={error?.message || 'This ticket may have expired or was completed.'}
          onRetry={refresh}
        />
      </div>
    );
  }

  const isCalled = ticket.status === 'called';
  const isServing = ticket.status === 'serving';
  const isEnded = ['done', 'cancelled', 'expired'].includes(ticket.status);

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 max-w-xl mx-auto w-full flex flex-col gap-4 pb-24">
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
      {isStale && (
        <div className="p-2.5 rounded-xl bg-[var(--wait-mid-bg)] border border-[var(--wait-mid)]/30 text-[var(--wait-mid-text)] text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold">
            <RefreshCw size={13} className="animate-spin" />
            <span>Connection paused. Retrying live updates...</span>
          </span>
          <span className="text-[10px] tnum">
            Last updated {new Date(lastFetchTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* CALLED TAKEOVER BANNER (When called to counter) */}
      {isCalled && (
        <div className="p-6 rounded-3xl bg-[var(--accent-2)] text-black border-2 border-black/20 shadow-xl flex flex-col items-center text-center gap-3 animate-pulse">
          <Badge variant="called" size="md">PLEASE PROCEED</Badge>
          <h2 className="font-heading font-extrabold text-2xl tracking-tight">
            Go to Consultation Desk
          </h2>
          <p className="text-sm font-semibold max-w-sm">
            Ticket <span className="font-extrabold underline">{ticket.label}</span> has been called. Please proceed immediately.
          </p>
        </div>
      )}

      {/* ENDED STATE BANNER */}
      {isEnded && (
        <div className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] text-center flex flex-col items-center gap-2">
          <Badge variant={ticket.status === 'done' ? 'done' : ticket.status === 'cancelled' ? 'cancelled' : 'expired'}>
            Ticket {ticket.status.toUpperCase()}
          </Badge>
          <p className="text-xs text-[var(--ink-faint)]">
            {ticket.status === 'done'
              ? 'Your consultation has concluded.'
              : ticket.status === 'cancelled'
              ? 'This ticket was cancelled.'
              : 'This ticket expired due to a missed arrival deadline.'}
          </p>
          <Link to="/" className="mt-2">
            <Button size="sm" variant="primary">
              Return to Map
            </Button>
          </Link>
        </div>
      )}

      {/* 4.2 Status Header Card */}
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

      {/* 4.3 Position & Estimated Wait Card */}
      {!isEnded && (
        <div className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-center">
            {/* Position */}
            <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-wider">
                Position in Line
              </span>
              <span className="font-heading font-extrabold text-2xl text-[var(--brand)] mt-1 tnum">
                {ticket.position === 1 ? "You're next" : `#${ticket.position || 1}`}
              </span>
            </div>

            {/* Wait Range */}
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

      {/* 4.5 Travel-Aware Leave-By Plan Card */}
      {!isEnded && !ticket.arrived && (
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
                {leavePlan?.leaveTime || 'Now'}
              </span>
            </div>

            <div className="text-right">
              {leavePlan?.isNow ? (
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

            {/* Check-in / I'm Here Button (Phase 4.6) */}
            <Button
              size="sm"
              variant="primary"
              loading={arriving}
              onClick={handleArrive}
            >
              I'm Here
            </Button>
          </div>

          {arriveError && (
            <p className="text-[11px] text-[var(--danger)] mt-1 font-medium">
              {arriveError.message || 'Check-in failed. You must be within ~300m of the hospital.'}
            </p>
          )}
        </div>
      )}

      {/* 4.4 Reasons for ETA Change (changes[]) */}
      {ticket.changes && ticket.changes.length > 0 && (
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

      {/* 4.8 Enable Audio & Voice Alerts Card */}
      {!alertsUnlocked && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-[var(--brand)]/10 to-[var(--brand-2)]/10 border border-[var(--brand)]/25 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Volume2 size={20} className="text-[var(--brand)] shrink-0" />
            <div className="min-w-0">
              <p className="font-heading font-bold text-xs text-[var(--ink)]">
                Enable Audio & Speech Alerts
              </p>
              <p className="text-[11px] text-[var(--ink-faint)] truncate">
                Spoken announcements when your token is called
              </p>
            </div>
          </div>
          <Button size="sm" variant="primary" onClick={handleEnableAlerts}>
            Enable
          </Button>
        </div>
      )}

      {/* Mini Map (Phase 4.9) */}
      {ticket.org && (
        <div className="rounded-3xl border border-[var(--border)] overflow-hidden h-40 relative shadow-xs">
          <MiniMap org={ticket.org} userLocation={userLocation} />
        </div>
      )}

      {/* Cancel Ticket Action */}
      {!isEnded && (
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

// ───────────── Mini Map Sub-component ─────────────
function MiniMap({ org, userLocation }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !org) return;

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
      if (userLocation) {
        new maplibregl.Marker({ color: '#ff6b57' })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map);
      }
    } catch (e) {
      console.warn('MiniMap rendering skipped:', e);
    }

    return () => {
      map?.remove();
    };
  }, [org, userLocation]);

  return <div ref={containerRef} className="w-full h-full bg-[var(--surface-2)]" />;
}
