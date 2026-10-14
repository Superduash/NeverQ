// backend/src/services/eta/engine.js
// Authoritative NeverQ ETA simulation engine (§4, NeverQ2 §4)
//
// PURE MODULE RULES (§4 Gate):
// - Imports nothing from mongoose, express, or Date.
// - Deterministic: all times are relative to the injected 'now' timestamp (demo clock ms).
// - Range produces a nominal ~80% prediction interval (Z80 = 1.28).

import { RULES } from '../../config/rules.js';
import { calculateExpected, calculateSpread, getConfidence } from './stats.js';

/**
 * Sort comparator for waiting tickets (§6.5, E10, E18)
 * 1. Urgent tickets first (ordered by urgentAt ascending)
 * 2. sortKey ascending
 * 3. joinedAt ascending
 * 4. Deterministic string tie-breaker on _id / token
 */
export function compareWaitingTickets(a, b) {
  // Urgent cases jump ahead of all non-urgent cases
  const aUrgent = Boolean(a.urgent);
  const bUrgent = Boolean(b.urgent);

  if (aUrgent && !bUrgent) return -1;
  if (!aUrgent && bUrgent) return 1;

  if (aUrgent && bUrgent) {
    const aUrgentAt = a.urgentAt || a.joinedAt || 0;
    const bUrgentAt = b.urgentAt || b.joinedAt || 0;
    if (aUrgentAt !== bUrgentAt) return aUrgentAt - bUrgentAt;
  }

  // Sort by derived sortKey
  const aSortKey = a.sortKey !== undefined ? a.sortKey : (a.joinedAt || 0);
  const bSortKey = b.sortKey !== undefined ? b.sortKey : (b.joinedAt || 0);
  if (aSortKey !== bSortKey) return aSortKey - bSortKey;

  // Tie-breaker: joinedAt
  const aJoined = a.joinedAt || 0;
  const bJoined = b.joinedAt || 0;
  if (aJoined !== bJoined) return aJoined - bJoined;

  // Deterministic final tie-breaker
  const aId = String(a._id || a.token || a.id || '');
  const bId = String(b._id || b.token || b.id || '');
  return aId.localeCompare(bId);
}

/**
 * Compute snapshot for a department's queue at timestamp `now`.
 *
 * @param {object} params
 * @param {object} params.org - Organization document or rules
 * @param {object} params.department - Department with defaultMin and stats {n, mean, m2}
 * @param {Array<object>} params.counters - Counters belonging to this department
 * @param {Array<object>} params.tickets - Tickets in this department
 * @param {number} params.now - Current demo-clock timestamp in ms
 * @returns {object} Queue snapshot with per-ticket ETAs, new joiner estimate, and confidence
 */
export function computeSnapshot({ org, department, counters = [], tickets = [], now }) {
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    throw new Error(`computeSnapshot requires finite numeric now timestamp, got: ${now}`);
  }

  const defaultMin = department?.defaultMin;
  if (typeof defaultMin !== 'number' || defaultMin <= 0 || !Number.isFinite(defaultMin)) {
    throw new Error(`computeSnapshot requires positive numeric department.defaultMin, got: ${defaultMin}`);
  }

  const globalCaveats = new Set();

  // Closed hospital check (Rule E17, §4.5)
  const isOrgClosed = org && org.open === false;
  if (isOrgClosed) {
    return {
      orgClosed: true,
      noCounter: false,
      expectedMin: defaultMin,
      sdPP: RULES.DEFAULT_SPREAD_FRAC * defaultMin,
      tickets: [],
      newJoiner: { low: null, mid: null, high: null, startMs: null, orgClosed: true, noCounter: false },
      confidence: "Hospital is closed",
      confidenceLevel: 'low',
      sampleCount: department?.stats?.n || 0,
      caveats: ['org_closed'],
      computedAt: now,
    };
  }

  const stats = department?.stats || { n: 0, mean: 0, m2: 0 };
  const n = stats.n || 0;
  const mean = stats.mean || 0;
  const m2 = stats.m2 || 0;

  // Step 1: Expected duration (§4.2)
  const expected = calculateExpected(defaultMin, n, mean);

  // Step 2: Spread (§4.3)
  const sdPP = calculateSpread(defaultMin, expected, n, m2);

  // Guard: Non-finite intermediate value (Rule E16, §4.10)
  if (!Number.isFinite(mean) || !Number.isFinite(m2) || !Number.isFinite(expected) || !Number.isFinite(sdPP)) {
    console.error(`[ETA] Non-finite calculation for dept ${department?.key}: mean=${mean}, m2=${m2}, expected=${expected}, sdPP=${sdPP}`);
    return {
      orgClosed: false,
      noCounter: true,
      expectedMin: defaultMin,
      sdPP: RULES.DEFAULT_SPREAD_FRAC * defaultMin,
      tickets: [],
      newJoiner: { low: null, mid: null, high: null, startMs: null, noCounter: true, orgClosed: false },
      confidence: getConfidence(n).confidence,
      confidenceLevel: getConfidence(n).confidenceLevel,
      sampleCount: n,
      caveats: ['calculation_unavailable'],
      computedAt: now,
    };
  }

  // Step 3: Counter capacity (§4.4)
  const openCounters = counters.filter((c) => c.state === 'open');

  if (counters.some((c) => c.state === 'paused')) {
    globalCaveats.add('paused_counter');
  }

  // No open counters check (Rule E4, §4.5)
  if (openCounters.length === 0) {
    globalCaveats.add('no_counter');
    return {
      orgClosed: false,
      noCounter: true,
      expectedMin: Number(expected.toFixed(2)),
      sdPP: Number(sdPP.toFixed(2)),
      tickets: [],
      newJoiner: { low: null, mid: null, high: null, startMs: null, noCounter: true, orgClosed: false },
      confidence: getConfidence(n).confidence,
      confidenceLevel: getConfidence(n).confidenceLevel,
      sampleCount: n,
      caveats: Array.from(globalCaveats),
      computedAt: now,
    };
  }

  // Track state of each counter during simulation
  const counterSim = openCounters.map((c) => {
    let freeAt = now;
    let variance = 0;

    // Check serving state: counter.startedAt or ticket serving
    const isServing = Boolean(c.startedAt) || c.status === 'serving';
    const isCalled = Boolean(c.calledAt) || c.status === 'called';

    if (isServing && c.startedAt) {
      const elapsedMin = Math.max(0, (now - c.startedAt) / 60000);
      const remainingMin = expected - elapsedMin;

      if (remainingMin > 1) {
        freeAt = now + remainingMin * 60000;
        const varFrac = Math.max(0.25, Math.min(1.0, remainingMin / expected));
        variance = sdPP * sdPP * varFrac;
      } else if (remainingMin > 0) {
        // Last minute
        freeAt = now + 1 * 60000;
        variance = sdPP * sdPP * 0.25;
      } else {
        // Consultation has overran (§4.4)
        const extraMin = Math.max(RULES.OVERRUN_REMAINDER_FRAC * expected, RULES.OVERRUN_REMAINDER_MIN);
        freeAt = now + extraMin * 60000;
        variance = Math.pow(RULES.OVERRUN_SD_FRAC * expected, 2);
        globalCaveats.add('counter_overrun');
      }
    } else if (isCalled && c.calledAt) {
      // Called but not yet started (§4.4)
      const walkMs = Math.max(now, c.calledAt + RULES.CALLED_WALK_MIN * 60000);
      freeAt = walkMs + expected * 60000;
      variance = sdPP * sdPP;
    } else {
      // Idle
      freeAt = now;
      variance = 0;
    }

    // Delay check (§4.4)
    if (c.delayUntil && c.delayUntil > now) {
      if (c.delayUntil > freeAt) {
        freeAt = c.delayUntil;
      }
      const delayRemMin = (c.delayUntil - now) / 60000;
      variance += Math.pow(RULES.DELAY_SD_FRAC * delayRemMin, 2);
      globalCaveats.add('delay_active');
    }

    return {
      id: String(c._id || c.id || ''),
      name: c.name || 'Counter',
      freeAt,
      variance,
    };
  });

  // Step 4: Simulation over waiting tickets (§4.5)
  const waitingTickets = tickets
    .filter((t) => t.status === 'waiting')
    .sort(compareWaitingTickets);

  const ticketResults = [];

  for (let i = 0; i < waitingTickets.length; i++) {
    const ticket = waitingTickets[i];

    // Pick counter with smallest freeAt (ties broken by lowest counter id)
    counterSim.sort((a, b) => {
      if (a.freeAt !== b.freeAt) return a.freeAt - b.freeAt;
      return a.id.localeCompare(b.id);
    });

    const chosen = counterSim[0];
    const startMs = chosen.freeAt;
    const sdStart = Math.sqrt(chosen.variance);

    // Advance chosen counter
    chosen.freeAt += expected * 60000;
    chosen.variance += sdPP * sdPP;

    // Convert to whole minutes from now (§4.5)
    const midMs = Math.max(0, startMs - now);
    const halfMin = midMs > 0 ? Math.max(RULES.Z80 * sdStart, RULES.MIN_HALF_WIDTH) : 0;

    const mid = Math.round(midMs / 60000);
    const low = Math.max(0, Math.round((midMs - halfMin * 60000) / 60000));
    const high = Math.max(mid, Math.round((midMs + halfMin * 60000) / 60000));

    if (!ticket.arrived) {
      globalCaveats.add('assumes_arrival');
    }

    if (mid > 8 * 60) {
      globalCaveats.add('very_long');
    }

    ticketResults.push({
      ticketId: ticket._id || ticket.id,
      token: ticket.token,
      label: ticket.label,
      position: i + 1,
      low,
      mid,
      high,
      startMs,
      counterName: chosen.name,
    });
  }

  // New-joiner estimate (virtual ticket appended at the end) (§4.5)
  counterSim.sort((a, b) => {
    if (a.freeAt !== b.freeAt) return a.freeAt - b.freeAt;
    return a.id.localeCompare(b.id);
  });

  const nextCounter = counterSim[0];
  const njStartMs = nextCounter.freeAt;
  const njSdStart = Math.sqrt(nextCounter.variance);

  const njMidMs = Math.max(0, njStartMs - now);
  const njHalfMin = njMidMs > 0 ? Math.max(RULES.Z80 * njSdStart, RULES.MIN_HALF_WIDTH) : 0;

  const njMid = Math.round(njMidMs / 60000);
  const njLow = Math.max(0, Math.round((njMidMs - njHalfMin * 60000) / 60000));
  const njHigh = Math.max(njMid, Math.round((njMidMs + njHalfMin * 60000) / 60000));

  const confidenceInfo = getConfidence(n);

  return {
    orgClosed: false,
    noCounter: false,
    expectedMin: Number(expected.toFixed(2)),
    sdPP: Number(sdPP.toFixed(2)),
    tickets: ticketResults,
    newJoiner: {
      low: njLow,
      mid: njMid,
      high: njHigh,
      startMs: njStartMs,
      noCounter: false,
      orgClosed: false,
    },
    confidence: confidenceInfo.confidence,
    confidenceLevel: confidenceInfo.confidenceLevel,
    sampleCount: n,
    caveats: Array.from(globalCaveats),
    computedAt: now,
  };
}
