import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Stethoscope, Play, CheckCircle2, FastForward, UserCheck,
  UserX, Phone, AlertTriangle, Clock, Plus, Zap, AlertCircle,
  HelpCircle, Printer, X, Check, Pause, ArrowUpDown, ChevronDown,
  RefreshCw, Sparkles, Filter, ShieldAlert
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useLiveData, useSocketRoom } from '../lib/socket.js';
import { waitStatus } from '../lib/mock.js';
import { notify } from '../lib/notify.js';
import { NOTIFICATION_MESSAGES } from '../lib/messages.js';
import { formatRange, formatDuration, useOnline } from '../lib/utils.js';
import {
  Button, IconButton, Badge, Segmented, ConfirmDialog,
  Skeleton, EmptyState, RelativeTime
} from '../components/ui/index.js';

export default function StaffDashboard() {
  const navigate = useNavigate();
  const isOnline = useOnline();

  const orgId = useMemo(() => localStorage.getItem('nq-staff-org') || 'harbour', []);

  // ───────────── State ─────────────
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'insights'
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'arrived' | 'not-arrived' | 'priority'
  const [focusedCounterId, setFocusedCounterId] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(Date.now());

  // Dialog & Drawer States
  const [showWalkinModal, setShowWalkinModal] = useState(false);
  const [walkinSuccessTicket, setWalkinSuccessTicket] = useState(null);
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [targetDelayCounter, setTargetDelayCounter] = useState(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [drawerTicket, setDrawerTicket] = useState(null);
  const [revealedPhoneTicketId, setRevealedPhoneTicketId] = useState(null);

  // Confirmation Modals
  const [confirmCloseCounter, setConfirmCloseCounter] = useState(null);
  const [confirmRemoveTicket, setConfirmRemoveTicket] = useState(null);
  const [blockPhoneOnRemove, setBlockPhoneOnRemove] = useState(false);

  // In-flight action flags
  const [actionLoading, setActionLoading] = useState(false);

  // ───────────── Queue Data Fetcher ─────────────
  const fetcher = useCallback(async () => {
    const data = await api.getStaffQueue(selectedDeptId);
    setLastFetchTime(Date.now());
    return data;
  }, [selectedDeptId]);

  const { data: queueData, loading, error, refresh } = useLiveData(fetcher, {
    room: orgId ? `org:${orgId}` : null,
    event: 'queue:update',
    interval: 8000,
  });

  // Stale detection: > 25s or offline
  const isStale = !isOnline || (Date.now() - lastFetchTime > 25000);

  // Departments from current hospital
  const departments = queueData?.org?.departments || [
    { id: 'gen', name: 'General OPD' },
    { id: 'eye', name: 'Eye Clinic' },
    { id: 'pharm', name: 'Pharmacy' },
  ];

  const currentDept = queueData?.department || departments[0];

  useEffect(() => {
    if (!selectedDeptId && departments.length > 0) {
      setSelectedDeptId(departments[0].id);
    }
  }, [departments, selectedDeptId]);

  // Set initial focused counter
  useEffect(() => {
    if (queueData?.counters?.length > 0 && !focusedCounterId) {
      setFocusedCounterId(queueData.counters[0].id);
    }
  }, [queueData, focusedCounterId]);

  // ───────────── Keyboard Shortcuts (Phase 6.7) ─────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Disable shortcuts when user is typing inside input/textarea/select
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutHelp((v) => !v);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (focusedCounterId) handleCallNext(focusedCounterId);
      } else if (e.key === 's' || e.key === 'S') {
        // Start current ticket on focused counter
        const counter = queueData?.counters?.find((c) => c.id === focusedCounterId);
        if (counter?.currentTicketId) {
          handleStartTicket(counter.currentTicketId);
        }
      } else if (e.key === 'd' || e.key === 'D') {
        // Done current ticket on focused counter
        const counter = queueData?.counters?.find((c) => c.id === focusedCounterId);
        if (counter?.currentTicketId) {
          handleDoneTicket(counter.currentTicketId);
        }
      } else if (e.key === 'k' || e.key === 'K') {
        // Skip current ticket on focused counter
        const counter = queueData?.counters?.find((c) => c.id === focusedCounterId);
        if (counter?.currentTicketId) {
          handleSkipTicket(counter.currentTicketId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedCounterId, queueData]);

  // ───────────── Counter Actions ─────────────
  const handleCallNext = async (counterId) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await api.callNext(counterId);
      notify.success(`Called token #${res.ticket?.label || ''} to ${res.counter?.name || 'Counter'}`);
      refresh();
    } catch (err) {
      if (err.status === 409) {
        notify.warning('Already called by another counter. Refreshing...');
      } else {
        notify.error(err.message || 'Could not call next ticket');
      }
      refresh();
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartTicket = async (ticketId) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await api.startTicket(ticketId);
      notify.success('Consultation started');
      refresh();
    } catch (err) {
      notify.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDoneTicket = async (ticketId) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await api.doneTicket(ticketId);
      notify.success('Consultation marked completed');
      refresh();
    } catch (err) {
      notify.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSkipTicket = async (ticketId) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await api.skipTicket(ticketId);
      notify.info('Ticket moved back in line');
      refresh();
    } catch (err) {
      notify.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmArrival = async (ticketId) => {
    try {
      await api.confirmArrival(ticketId);
      notify.success('Patient arrival confirmed at clinic desk');
      refresh();
    } catch (err) {
      notify.error(err);
    }
  };

  const handleRemoveClaim = async (ticketId) => {
    try {
      await api.removeClaim(ticketId);
      notify.info('Priority claim removed');
      refresh();
    } catch (err) {
      notify.error(err);
    }
  };

  const handleExecuteRemoveTicket = async () => {
    if (!confirmRemoveTicket) return;
    try {
      await api.removeTicket(confirmRemoveTicket.id, { blockPhone: blockPhoneOnRemove });
      notify.info(`Token #${confirmRemoveTicket.label} removed`);
      setConfirmRemoveTicket(null);
      setBlockPhoneOnRemove(false);
      refresh();
    } catch (err) {
      notify.error(err);
    }
  };

  const handleSetCounterState = async (counterId, newState) => {
    try {
      await api.setCounterState(counterId, { state: newState });
      notify.success(`Counter set to ${newState}`);
      setConfirmCloseCounter(null);
      refresh();
    } catch (err) {
      notify.error(err);
    }
  };

  const handleClearDelay = async (counterId) => {
    try {
      await api.setCounterDelay(counterId, { minutes: 0, reason: '' });
      notify.info('Delay cleared');
      refresh();
    } catch (err) {
      notify.error(err);
    }
  };

  // ───────────── Filtered Queue List ─────────────
  const rawTickets = queueData?.tickets || [];
  const waitingTickets = rawTickets.filter((t) => t.status === 'waiting');
  const calledOrServingTickets = rawTickets.filter((t) => t.status === 'called' || t.status === 'serving');

  const filteredWaiting = useMemo(() => {
    return waitingTickets.filter((t) => {
      if (filterMode === 'arrived') return t.arrived;
      if (filterMode === 'not-arrived') return !t.arrived;
      if (filterMode === 'priority') return t.priority && t.priority !== 'none';
      return true;
    });
  }, [waitingTickets, filterMode]);

  const arrivedCount = waitingTickets.filter((t) => t.arrived).length;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg)] text-[var(--ink)]">
      {/* ───────────── Header Sub-Bar: Dept Switcher, Tabs, Actions ───────────── */}
      <div className="shrink-0 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3">
          {/* Department Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-[var(--ink-faint)] uppercase tracking-wider hidden sm:inline">
              Dept:
            </span>
            <select
              value={selectedDeptId || ''}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="h-9 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-bold text-[var(--ink)] focus:outline-none focus:border-[var(--brand)] cursor-pointer"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Tabs */}
          <Segmented
            size="sm"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'queue', label: `Queue (${waitingTickets.length})` },
              { value: 'insights', label: 'Insights & AI' },
            ]}
          />
        </div>

        {/* Action Controls & Shortcut Trigger */}
        <div className="flex items-center gap-2">
          {isStale && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--wait-mid)]">
              <RefreshCw size={12} className="animate-spin" /> Stale
            </span>
          )}

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<HelpCircle size={14} />}
            onClick={() => setShowShortcutHelp(true)}
            title="Keyboard shortcuts (?)"
          >
            <span className="hidden sm:inline">Shortcuts</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Zap size={14} className="text-[var(--accent)]" />}
            onClick={() => setShowUrgentModal(true)}
          >
            Urgent Insert
          </Button>

          <Button
            size="sm"
            variant="primary"
            iconLeft={<Plus size={14} />}
            onClick={() => setShowWalkinModal(true)}
          >
            Add Walk-in
          </Button>
        </div>
      </div>

      {/* ───────────── Main Content Area ───────────── */}
      {activeTab === 'queue' ? (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Left / Top: Active Counters Panel (Phase 6.3) */}
          <div className="w-full lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--surface)]/70 flex flex-col min-h-0">
            <div className="p-3.5 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Stethoscope size={16} className="text-[var(--brand)]" />
                <h2 className="font-heading font-extrabold text-xs uppercase tracking-wider text-[var(--ink)]">
                  Counters ({queueData?.counters?.length || 0})
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-[var(--wait-good)]">
                {arrivedCount} patient{arrivedCount === 1 ? '' : 's'} ready
              </span>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-3 flex flex-col gap-3">
              {queueData?.counters?.map((counter) => {
                const isFocused = counter.id === focusedCounterId;
                const activeTicket = rawTickets.find((t) => t.id === counter.currentTicketId);
                const isDelayActive = counter.delayUntil && counter.delayUntil > Date.now();
                const delayMins = isDelayActive ? Math.ceil((counter.delayUntil - Date.now()) / 60000) : 0;

                const canCallNext =
                  counter.state === 'open' &&
                  !activeTicket &&
                  arrivedCount > 0 &&
                  !actionLoading;

                return (
                  <div
                    key={counter.id}
                    onClick={() => setFocusedCounterId(counter.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isFocused
                        ? 'border-[var(--brand)] bg-[var(--surface)] shadow-sm ring-1 ring-[var(--brand)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]/50'
                    }`}
                  >
                    {/* Counter Header & State */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-heading font-extrabold text-xs text-[var(--ink)] truncate">
                          {counter.name}
                        </span>
                        {isFocused && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--brand)]/15 text-[var(--brand)] font-bold">
                            FOCUSED
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            counter.state === 'open'
                              ? 'bg-[var(--wait-good-bg)] text-[var(--wait-good-text)]'
                              : counter.state === 'paused'
                              ? 'bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)]'
                              : 'bg-[var(--surface-2)] text-[var(--ink-faint)]'
                          }`}
                        >
                          {counter.state}
                        </span>

                        {/* State Menu / Delay Action */}
                        <CounterMenu
                          counter={counter}
                          onSetState={(st) => {
                            if (st === 'closed') {
                              setConfirmCloseCounter(counter);
                            } else {
                              handleSetCounterState(counter.id, st);
                            }
                          }}
                          onOpenDelay={() => {
                            setTargetDelayCounter(counter);
                            setShowDelayModal(true);
                          }}
                        />
                      </div>
                    </div>

                    {/* Delay Banner if active */}
                    {isDelayActive && (
                      <div className="mb-2.5 p-2 rounded-xl bg-[var(--wait-mid-bg)] text-[var(--wait-mid-text)] text-[11px] font-medium flex items-center justify-between">
                        <span className="flex items-center gap-1 truncate">
                          <Clock size={12} />
                          <span>Delay: ~{delayMins}m ({counter.delayReason || 'Doctor break'})</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearDelay(counter.id);
                          }}
                          className="font-bold underline hover:opacity-80"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {/* Active Patient or Empty Desk */}
                    {activeTicket ? (
                      <div className="p-3 rounded-xl bg-[var(--surface-2)] flex flex-col gap-2 mb-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-heading font-black text-sm text-[var(--ink)]">
                            #{activeTicket.label}
                          </span>
                          <Badge variant={activeTicket.status}>{activeTicket.status}</Badge>
                        </div>
                        <span className="text-xs font-semibold text-[var(--ink)] truncate">
                          {activeTicket.name || 'Patient'}
                        </span>
                        <div className="flex items-center justify-between text-[11px] text-[var(--ink-faint)]">
                          <span>In progress</span>
                          <RelativeTime timestamp={activeTicket.calledAt || activeTicket.startedAt} />
                        </div>

                        {/* Start / Done / Skip Actions */}
                        <div className="grid grid-cols-3 gap-1.5 mt-1">
                          {activeTicket.status === 'called' && (
                            <Button
                              size="xs"
                              variant="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartTicket(activeTicket.id);
                              }}
                            >
                              Start
                            </Button>
                          )}
                          {activeTicket.status === 'serving' && (
                            <Button
                              size="xs"
                              variant="primary"
                              className="col-span-2"
                              iconLeft={<Check size={12} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDoneTicket(activeTicket.id);
                              }}
                            >
                              Done
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSkipTicket(activeTicket.id);
                            }}
                          >
                            Skip
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="py-2 text-center text-xs text-[var(--ink-faint)] font-medium">
                        No active consultation
                      </div>
                    )}

                    {/* Big Call Next Button */}
                    <Button
                      size="sm"
                      variant="primary"
                      className="w-full font-bold text-xs"
                      disabled={!canCallNext}
                      loading={actionLoading && isFocused}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCallNext(counter.id);
                      }}
                    >
                      {counter.state !== 'open'
                        ? 'Counter Not Open'
                        : activeTicket
                        ? 'Counter Busy'
                        : arrivedCount === 0
                        ? 'No Arrived Patients'
                        : 'Call Next (Space)'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Waiting Queue Table / List (Phase 6.4) */}
          <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg)]">
            {/* Filter Bar */}
            <div className="shrink-0 p-3.5 border-b border-[var(--border)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: `All (${waitingTickets.length})` },
                  { id: 'arrived', label: `Arrived (${arrivedCount})` },
                  { id: 'not-arrived', label: `Not Arrived (${waitingTickets.length - arrivedCount})` },
                  { id: 'priority', label: 'Priority Claims' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterMode(f.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                      filterMode === f.id
                        ? 'bg-[var(--brand)] text-white shadow-xs'
                        : 'bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-[var(--ink-faint)] font-semibold shrink-0">
                Sorted by priority & wait
              </span>
            </div>

            {/* Ticket Rows */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-3 flex flex-col gap-2">
              {filteredWaiting.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center gap-2">
                  <Users size={32} className="text-[var(--ink-faint)]" />
                  <p className="font-heading font-bold text-sm text-[var(--ink)]">
                    No tickets in this filter
                  </p>
                  <p className="text-xs text-[var(--ink-faint)]">
                    Patients joining will automatically appear here in realtime.
                  </p>
                </div>
              ) : (
                filteredWaiting.map((ticket, idx) => {
                  const hasPriority = ticket.priority && ticket.priority !== 'none';
                  const isLate = ticket.lateCount > 0;

                  return (
                    <div
                      key={ticket.id}
                      className={`p-3.5 rounded-2xl border bg-[var(--surface)] flex items-center justify-between gap-3 hover:border-[var(--brand)]/60 transition-colors ${
                        ticket.urgent
                          ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                          : 'border-[var(--border)]'
                      }`}
                    >
                      {/* Token & Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-heading font-black text-lg text-[var(--ink)] tnum w-16 shrink-0">
                          #{ticket.label}
                        </span>

                        <div className="min-w-0 flex flex-col">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-[var(--ink)] truncate">
                              {ticket.name || 'Anonymous Patient'}
                            </span>

                            {ticket.urgent && (
                              <Badge variant="sim">URGENT</Badge>
                            )}
                            {ticket.simulated && (
                              <Badge variant="sim">SIM</Badge>
                            )}
                            {hasPriority && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand)]/15 text-[var(--brand)] font-bold flex items-center gap-1">
                                <span>Claimed: {ticket.priority}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveClaim(ticket.id)}
                                  className="hover:underline ml-1 text-red-500"
                                  title="Remove claim"
                                >
                                  ×
                                </button>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-[var(--ink-faint)] mt-0.5">
                            {ticket.arrived ? (
                              <span className="text-[var(--wait-good)] font-bold flex items-center gap-1">
                                <CheckCircle2 size={12} /> Arrived at clinic
                              </span>
                            ) : (
                              <span className="text-[var(--wait-mid)] font-medium">
                                Remote · Arrive by ~{ticket.arriveDeadline ? new Date(ticket.arriveDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '15m'}
                              </span>
                            )}

                            {isLate && (
                              <span className="text-[var(--danger)] font-bold">
                                (Late ×{ticket.lateCount})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Confirm Arrival (if remote) */}
                        {!ticket.arrived && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleConfirmArrival(ticket.id)}
                            title="Confirm patient arrived at counter"
                          >
                            Mark Arrived
                          </Button>
                        )}

                        {/* Call Ticket (calls to focused counter) */}
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => {
                            if (focusedCounterId) handleCallNext(focusedCounterId);
                          }}
                          disabled={!ticket.arrived || actionLoading}
                        >
                          Call
                        </Button>

                        {/* Details Drawer Trigger */}
                        <IconButton
                          icon={<Phone size={13} />}
                          label="Patient details"
                          variant="ghost"
                          onClick={() => {
                            setDrawerTicket(ticket);
                            setRevealedPhoneTicketId(null);
                          }}
                        />

                        {/* Remove / Skip Menu */}
                        <IconButton
                          icon={<X size={13} className="text-[var(--danger)]" />}
                          label="Remove ticket"
                          variant="ghost"
                          onClick={() => setConfirmRemoveTicket(ticket)}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════
           PHASE 7.5: INSIGHTS & AI LEARNING TAB
           ═════════════════════════════════════════════════════════════ */
        <InsightsTab orgId={orgId} department={currentDept} />
      )}

      {/* ───────────── Modals & Drawers ───────────── */}

      {/* 7.1 Add Walk-In Dialog */}
      {showWalkinModal && (
        <WalkinDialog
          deptId={selectedDeptId}
          onClose={() => setShowWalkinModal(false)}
          onSuccess={(ticket) => {
            setShowWalkinModal(false);
            setWalkinSuccessTicket(ticket);
            refresh();
          }}
        />
      )}

      {/* Walk-in Success & Print Slip Modal */}
      {walkinSuccessTicket && (
        <PrintSlipModal
          ticket={walkinSuccessTicket}
          hospitalName={queueData?.org?.name || 'Harbour Care Clinic'}
          onClose={() => setWalkinSuccessTicket(null)}
        />
      )}

      {/* 7.2 Urgent Insert Dialog */}
      {showUrgentModal && (
        <UrgentInsertDialog
          deptId={selectedDeptId}
          onClose={() => setShowUrgentModal(false)}
          onSuccess={() => {
            setShowUrgentModal(false);
            refresh();
          }}
        />
      )}

      {/* 7.3 Doctor Delay Dialog */}
      {showDelayModal && targetDelayCounter && (
        <DoctorDelayDialog
          counter={targetDelayCounter}
          onClose={() => setShowDelayModal(false)}
          onSuccess={() => {
            setShowDelayModal(false);
            refresh();
          }}
        />
      )}

      {/* Keyboard Shortcuts Help Dialog */}
      {showShortcutHelp && (
        <ShortcutHelpDialog onClose={() => setShowShortcutHelp(false)} />
      )}

      {/* Patient Detail Drawer (Phone masked until tap) */}
      {drawerTicket && (
        <PatientDetailDrawer
          ticket={drawerTicket}
          phoneRevealed={revealedPhoneTicketId === drawerTicket.id}
          onRevealPhone={() => setRevealedPhoneTicketId(drawerTicket.id)}
          onClose={() => setDrawerTicket(null)}
        />
      )}

      {/* Confirm Close Counter Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmCloseCounter)}
        title={`Close ${confirmCloseCounter?.name}?`}
        description="Closing this desk will prevent calling further patients to this room."
        confirmText="Close Desk"
        onConfirm={() => handleSetCounterState(confirmCloseCounter.id, 'closed')}
        onClose={() => setConfirmCloseCounter(null)}
      />

      {/* Confirm Remove Ticket Dialog */}
      {confirmRemoveTicket && (
        <ConfirmDialog
          isOpen={true}
          title={`Remove #${confirmRemoveTicket.label}?`}
          description={
            <div className="flex flex-col gap-2 text-xs">
              <span>This will immediately release the patient from queue.</span>
              <label className="flex items-center gap-2 font-medium text-[var(--danger)] cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={blockPhoneOnRemove}
                  onChange={(e) => setBlockPhoneOnRemove(e.target.checked)}
                  className="rounded"
                />
                <span>Block phone from re-joining today</span>
              </label>
            </div>
          }
          confirmText="Remove Ticket"
          onConfirm={handleExecuteRemoveTicket}
          onClose={() => {
            setConfirmRemoveTicket(null);
            setBlockPhoneOnRemove(false);
          }}
        />
      )}
    </div>
  );
}

// ───────────── Counter Menu Component (State & Delay) ─────────────
function CounterMenu({ counter, onSetState, onOpenDelay }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="p-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--ink-faint)]"
      >
        <ChevronDown size={14} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-36 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-lg z-40 py-1 text-xs">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetState('open');
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-2)] font-semibold"
            >
              Open Desk
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetState('paused');
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-2)] font-semibold"
            >
              Pause Desk
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetState('closed');
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-2)] font-semibold text-[var(--danger)]"
            >
              Close Desk
            </button>
            <div className="border-t border-[var(--border)] my-1" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDelay();
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-2)] font-semibold text-[var(--brand)]"
            >
              Doctor Delay...
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────── Phase 7.1: Add Walk-In Dialog ─────────────
function WalkinDialog({ deptId, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [priority, setPriority] = useState('none');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.addWalkin({
        deptId,
        name: name.trim() || 'Walk-in Patient',
        priority,
      });
      notify.success(`Created walk-in ticket #${res.label}`);
      onSuccess(res);
    } catch (err) {
      notify.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-extrabold text-base text-[var(--ink)]">
            Add Walk-in Patient
          </h3>
          <IconButton icon={<X size={16} />} label="Close" variant="ghost" onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink)]">Patient Name (Optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink)]">Priority Category</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold text-[var(--ink)] cursor-pointer"
            >
              <option value="none">Standard (None)</option>
              <option value="senior">Senior Citizen (+20m credit)</option>
              <option value="pregnant">Expectant Mother (+20m credit)</option>
              <option value="disabled">Special Needs (+20m credit)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" loading={loading}>
              Create Ticket
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ───────────── Walk-in Print Slip Modal ─────────────
function PrintSlipModal({ ticket, hospitalName, onClose }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl p-6 flex flex-col items-center text-center gap-4">
        {/* Printable Section */}
        <div id="print-ticket-slip" className="w-full p-6 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex flex-col items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
            {hospitalName}
          </span>
          <span className="font-heading font-black text-4xl text-[var(--ink)] tracking-tight tnum mt-1">
            #{ticket.label}
          </span>
          <span className="text-xs font-bold text-[var(--ink)]">
            {ticket.name || 'Walk-in Patient'}
          </span>
          <span className="text-[10px] text-[var(--ink-faint)] mt-1">
            Issued at {new Date(ticket.joinedAt || Date.now()).toLocaleTimeString()}
          </span>
        </div>

        <div className="flex items-center gap-2 w-full">
          <Button
            size="sm"
            variant="primary"
            className="flex-1"
            iconLeft={<Printer size={15} />}
            onClick={handlePrint}
          >
            Print Slip
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

// ───────────── Phase 7.2: Urgent Insert Dialog ─────────────
function UrgentInsertDialog({ deptId, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      notify.error('Clinical justification required (min 5 characters)');
      return;
    }

    setLoading(true);
    try {
      await api.insertUrgent({
        deptId,
        name: name.trim() || 'Urgent Patient',
        reason: reason.trim(),
      });
      notify.success('Urgent case inserted at front of queue');
      onSuccess();
    } catch (err) {
      notify.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--accent)] font-bold text-sm">
            <Zap size={16} />
            <span>Urgent Queue Insert</span>
          </div>
          <IconButton icon={<X size={16} />} label="Close" variant="ghost" onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="p-3 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold leading-relaxed">
            ⚠️ This immediately jumps the patient to the very front of the line. Requires clinical reason.
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink)]">Patient Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency Triage"
              className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink)]">Clinical Reason (Required, min 5 chars)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Acute chest discomfort / severe burn"
              required
              className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" loading={loading} disabled={reason.length < 5}>
              Confirm Jump Queue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ───────────── Phase 7.3: Doctor Delay Dialog ─────────────
function DoctorDelayDialog({ counter, onClose, onSuccess }) {
  const [minutes, setMinutes] = useState(15);
  const [reason, setReason] = useState('Emergency consultation');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.setCounterDelay(counter.id, { minutes, reason: reason.trim() });
      notify.success(`Set ${minutes}m delay for ${counter.name}`);
      onSuccess();
    } catch (err) {
      notify.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-extrabold text-base text-[var(--ink)]">
            Doctor Delay — {counter.name}
          </h3>
          <IconButton icon={<X size={16} />} label="Close" variant="ghost" onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink)]">Delay Duration</label>
            <div className="grid grid-cols-3 gap-2">
              {[10, 15, 30].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                    minutes === m
                      ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                      : 'bg-[var(--surface-2)] text-[var(--ink)] border-[var(--border)]'
                  }`}
                >
                  +{m} min
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1"
              max="240"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="h-10 mt-1 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)] font-bold tnum"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--ink)]">Reason for Delay</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Unscheduled minor procedure"
              required
              className="h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--ink)]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" loading={loading}>
              Set Delay
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ───────────── Phase 6.7: Keyboard Shortcut Help Dialog ─────────────
function ShortcutHelpDialog({ onClose }) {
  const shortcuts = [
    { key: 'Space', desc: 'Call next patient on focused counter' },
    { key: 'S', desc: 'Start consultation for current ticket' },
    { key: 'D', desc: 'Mark consultation complete (Done)' },
    { key: 'K', desc: 'Skip patient and move back in line' },
    { key: '?', desc: 'Toggle keyboard shortcuts help' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-extrabold text-base text-[var(--ink)]">
            Keyboard Shortcuts
          </h3>
          <IconButton icon={<X size={16} />} label="Close" variant="ghost" onClick={onClose} />
        </div>

        <div className="flex flex-col gap-2">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between p-2 rounded-xl bg-[var(--surface-2)] text-xs">
              <span className="font-medium text-[var(--ink)]">{s.desc}</span>
              <kbd className="px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)] font-black text-[10px] text-[var(--brand)]">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-[var(--ink-faint)] text-center">
          Shortcuts are automatically disabled when typing in inputs.
        </p>
      </div>
    </div>
  );
}

// ───────────── Patient Detail Drawer (Phone Masked) ─────────────
function PatientDetailDrawer({ ticket, phoneRevealed, onRevealPhone, onClose }) {
  const maskedPhone = ticket.phone
    ? ticket.phone.slice(0, 3) + '••••' + ticket.phone.slice(-3)
    : 'No phone on record';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-sm h-full bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl p-5 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-extrabold text-base text-[var(--ink)]">
            Patient #{ticket.label}
          </h3>
          <IconButton icon={<X size={16} />} label="Close" variant="ghost" onClick={onClose} />
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface-2)] flex flex-col gap-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)] block">Name</span>
            <span className="text-sm font-bold text-[var(--ink)]">{ticket.name || 'Anonymous'}</span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)] block">Status</span>
            <Badge variant={ticket.status}>{ticket.status}</Badge>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)] block">Priority Claim</span>
            <span className="text-xs font-semibold text-[var(--ink)]">{ticket.priority || 'None'}</span>
          </div>

          {/* Masked phone until tap */}
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)] block">Contact Phone</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-bold tnum text-[var(--ink)]">
                {phoneRevealed ? ticket.phone || 'None' : maskedPhone}
              </span>
              {!phoneRevealed && ticket.phone && (
                <button
                  type="button"
                  onClick={onRevealPhone}
                  className="text-[11px] font-bold text-[var(--brand)] underline hover:opacity-80"
                >
                  Reveal
                </button>
              )}
            </div>
            <span className="text-[10px] text-[var(--ink-faint)] block mt-0.5">
              Privacy protected. Never exportable.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────── Phase 7.5: Insights & AI Learning Tab ─────────────
function InsightsTab({ orgId, department }) {
  const stats = department?.stats || { n: 12, mean: 12.5, m2: 6.4 };
  const variance = stats.n > 1 ? stats.m2 / (stats.n - 1) : 4;
  const stdDev = Math.sqrt(variance);

  // Predicted vs actual mock rows for completed tickets
  const completedRows = [
    { token: 'G-008', est: 12, actual: 11.5, sim: true },
    { token: 'G-009', est: 14, actual: 16.0, sim: true },
    { token: 'G-010', est: 10, actual: 9.8, sim: true },
    { token: 'G-011', est: 15, actual: 14.2, sim: false },
    { token: 'G-012', est: 11, actual: 13.0, sim: false },
  ];

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
      {/* Simulation Banner */}
      <div className="p-4 rounded-2xl bg-[var(--brand)]/10 border border-[var(--brand)]/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[var(--brand)]" />
          <span className="text-xs font-bold text-[var(--ink)]">
            AI Wait Engine · Learning Status (K=3 Weighting)
          </span>
        </div>
        <Badge variant="sim">SIMULATED SESSION</Badge>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex flex-col">
          <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)]">Baseline Duration</span>
          <span className="font-heading font-black text-2xl text-[var(--ink)] mt-1 tnum">
            {department?.defaultMin || 12} min
          </span>
          <span className="text-[11px] text-[var(--ink-faint)] mt-1">Configured baseline</span>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex flex-col">
          <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)]">Learned Mean (Online)</span>
          <span className="font-heading font-black text-2xl text-[var(--brand)] mt-1 tnum">
            {stats.mean?.toFixed(1)} min
          </span>
          <span className="text-[11px] text-[var(--ink-faint)] mt-1">
            σ ±{stdDev.toFixed(1)} min variance
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex flex-col">
          <span className="text-[10px] uppercase font-bold text-[var(--ink-faint)]">Sample Size</span>
          <span className="font-heading font-black text-2xl text-[var(--ink)] mt-1 tnum">
            {stats.n || 0} visits
          </span>
          <span className="text-[11px] text-[var(--wait-good)] font-bold mt-1">
            High Confidence
          </span>
        </div>
      </div>

      {/* SVG Mini Chart: Learning Distribution */}
      <div className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-3">
        <h3 className="font-heading font-extrabold text-xs uppercase tracking-wider text-[var(--ink)]">
          Online Duration Convergence (Plain SVG)
        </h3>
        <div className="w-full h-32 flex items-end justify-between gap-3 pt-4 px-2">
          {[14, 13.8, 13.2, 12.9, 12.6, 12.5].map((val, i) => {
            const h = Math.round((val / 16) * 100);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <div
                  style={{ height: `${h}%` }}
                  className="w-full rounded-t-lg bg-[var(--brand)]/80 hover:bg-[var(--brand)] transition-all"
                />
                <span className="text-[10px] font-bold text-[var(--ink-faint)] tnum">{val}m</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Predicted vs Actual Table */}
      <div className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col gap-3">
        <h3 className="font-heading font-extrabold text-xs uppercase tracking-wider text-[var(--ink)]">
          Predicted vs. Actual Wait Log (Completed)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[10px] font-bold text-[var(--ink-faint)] uppercase">
                <th className="py-2">Token</th>
                <th className="py-2">Predicted Wait</th>
                <th className="py-2">Actual Wait</th>
                <th className="py-2">Delta</th>
                <th className="py-2">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {completedRows.map((r) => {
                const delta = (r.actual - r.est).toFixed(1);
                return (
                  <tr key={r.token} className="py-2">
                    <td className="py-2.5 font-bold font-heading">#{r.token}</td>
                    <td className="py-2.5 tnum">{r.est} min</td>
                    <td className="py-2.5 tnum">{r.actual} min</td>
                    <td className={`py-2.5 font-bold tnum ${Number(delta) <= 0 ? 'text-[var(--wait-good)]' : 'text-[var(--wait-mid)]'}`}>
                      {Number(delta) > 0 ? `+${delta}` : delta}m
                    </td>
                    <td className="py-2.5">
                      {r.sim ? <Badge variant="sim">SIM</Badge> : <Badge variant="default">LIVE</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
