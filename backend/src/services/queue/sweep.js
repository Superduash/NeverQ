// backend/src/services/queue/sweep.js
// Authoritative NeverQ sweep service (§6.8, NeverQ2 §3.3)
// Idempotent conditional updates for arrive deadlines, requeuing, grace expiration, and outage credit.

import { Org, Department, Counter, Ticket, Settings } from '../../db/models/index.js';
import { now } from '../../lib/clock.js';
import { PENDING_SENTINEL } from './helpers.js';
import { recomputeAndLog } from '../eta/recompute.js';

let sweepIntervalTimer = null;

/**
 * Apply outage credit (§6.8):
 * If real gap since last sweep > 30s (e.g., cold start, restart, deployment),
 * shift active deadlines and called tickets forward by the gap to protect patients.
 */
export async function applyOutageCredit(realNow = Date.now()) {
  try {
    const settings = await Settings.findById('global');
    if (!settings) return;

    const lastSweepAt = settings.lastSweepAt || 0;
    if (lastSweepAt > 0) {
      const gap = realNow - lastSweepAt;
      if (gap > 30000) {
        console.log(`[Sweep] Outage credit applied: shifting active deadlines and grace clocks forward by ${gap}ms.`);
        await Promise.all([
          // Shift active arrive-by deadlines
          Ticket.updateMany(
            { status: 'waiting', arriveDeadline: { $ne: null } },
            { $inc: { arriveDeadline: gap } }
          ),
          // Shift called tickets' grace clocks
          Ticket.updateMany(
            { status: 'called' },
            { $inc: { calledAt: gap } }
          ),
        ]);
      }
    }

    settings.lastSweepAt = realNow;
    await settings.save();
  } catch (err) {
    console.error('[Sweep] Error applying outage credit:', err.message);
  }
}

/**
 * Sweep a single department (§6.8)
 */
export async function sweepDepartment(orgId, deptKey, injectedTime = null) {
  const currentTime = injectedTime !== null ? injectedTime : now();

  const [org, dept, counters] = await Promise.all([
    Org.findById(orgId).lean(),
    Department.findOne({ orgId, key: deptKey }).lean(),
    Counter.find({ orgId, deptKey }),
  ]);

  if (!org || !dept) return { touched: false };

  const arriveByMin = org.rules?.arriveByMin || 15;
  const graceMin = org.rules?.graceMin || 5;
  let touched = false;

  // ──────── S0: Stale Sentinels & Past Delays ────────
  const tenSecondsAgo = new Date(Date.now() - 10000);
  await Counter.updateMany(
    { orgId, deptKey, currentTicketId: PENDING_SENTINEL, updatedAt: { $lt: tenSecondsAgo } },
    { $set: { currentTicketId: null } }
  );

  await Counter.updateMany(
    { orgId, deptKey, delayUntil: { $lte: currentTime, $ne: null } },
    { $set: { delayUntil: null, delayReason: null } }
  );

  // ──────── S1: Next-up Deadline ────────
  const openCounters = counters.filter((c) => c.state === 'open');
  if (openCounters.length > 0 && org.open !== false) {
    const Z = openCounters.length + 1;

    // Get ordered waiting tickets in department
    const waitingTickets = await Ticket.find({
      orgId,
      deptKey,
      status: 'waiting',
    })
      .sort({ sortKey: 1, joinedAt: 1, _id: 1 })
      .lean();

    for (let i = 0; i < waitingTickets.length; i++) {
      const rank = i + 1;
      const t = waitingTickets[i];

      // S1 rule: remote, not-arrived, rank <= Z, no deadline yet
      if (t.source === 'remote' && !t.arrived && rank <= Z && !t.arriveDeadline) {
        const deadline = currentTime + arriveByMin * 60000;
        const dDate = new Date(deadline);
        const timeStr = `${String(dDate.getHours()).padStart(2, '0')}:${String(dDate.getMinutes()).padStart(2, '0')}`;

        const updated = await Ticket.findOneAndUpdate(
          { _id: t._id, status: 'waiting', arriveDeadline: null },
          {
            $set: { arriveDeadline: deadline },
            $push: {
              changes: {
                $each: [{ minutes: 0, text: `You're nearly up: be at the hospital by ${timeStr}`, time: currentTime }],
                $slice: -8,
              },
            },
          }
        );

        if (updated) touched = true;
      }
    }
  }

  // ──────── S2: Missed Arrive-By Deadline ────────
  const missedDeadlineTickets = await Ticket.find({
    orgId,
    deptKey,
    status: 'waiting',
    arrived: false,
    arriveDeadline: { $ne: null, $lt: currentTime },
  }).lean();

  for (const t of missedDeadlineTickets) {
    if (t.lateCount === 0) {
      // First miss -> Requeue to back (§6.5, §6.8)
      const updated = await Ticket.findOneAndUpdate(
        { _id: t._id, status: 'waiting', lateCount: 0 },
        {
          $set: {
            lateCount: 1,
            requeuedAt: currentTime,
            sortKey: currentTime,
            arriveDeadline: null,
            arrived: false,
          },
          $push: {
            changes: {
              $each: [
                { minutes: 0, text: 'Missed the arrive-by time: moved to the back of the queue once', time: currentTime },
              ],
              $slice: -8,
            },
          },
        }
      );
      if (updated) touched = true;
    } else {
      // Second miss -> Expire
      const updated = await Ticket.findOneAndUpdate(
        { _id: t._id, status: 'waiting', lateCount: { $gte: 1 } },
        {
          $set: {
            status: 'expired',
            expiredReason: 'no_show',
            doneAt: currentTime,
          },
          $unset: { active: 1 },
        }
      );
      if (updated) touched = true;
    }
  }

  // ──────── S3: Absent at Counter (Grace period expired) ────────
  const graceExpiredCalled = await Ticket.find({
    orgId,
    deptKey,
    status: 'called',
    calledAt: { $lt: currentTime - graceMin * 60000 },
  }).lean();

  for (const t of graceExpiredCalled) {
    // Free counter conditionally
    await Counter.findOneAndUpdate(
      { _id: t.counterId, currentTicketId: t._id },
      { $set: { currentTicketId: null } }
    );

    if (t.lateCount === 0) {
      // Requeue
      const updated = await Ticket.findOneAndUpdate(
        { _id: t._id, status: 'called', lateCount: 0 },
        {
          $set: {
            status: 'waiting',
            lateCount: 1,
            requeuedAt: currentTime,
            sortKey: currentTime,
            counterId: null,
            calledCounterName: null,
            arriveDeadline: null,
            arrived: t.source === 'walkin', // Walk-ins stay arrived
          },
          $push: {
            changes: {
              $each: [{ minutes: 0, text: 'Missed consultation call: moved to back of queue', time: currentTime }],
              $slice: -8,
            },
          },
        }
      );
      if (updated) touched = true;
    } else {
      // Second miss -> Expire
      const updated = await Ticket.findOneAndUpdate(
        { _id: t._id, status: 'called', lateCount: { $gte: 1 } },
        {
          $set: {
            status: 'expired',
            expiredReason: 'grace',
            doneAt: currentTime,
          },
          $unset: { active: 1 },
        }
      );
      if (updated) touched = true;
    }
  }

  // ──────── S4: Recompute If Touched ────────
  if (touched) {
    try {
      await recomputeAndLog(orgId, deptKey, 'sweep');
    } catch {
      // Non-fatal
    }
  }

  return { touched };
}

/**
 * Sweep all organizations and departments (§6.8)
 */
export async function sweepAll(injectedTime = null) {
  await applyOutageCredit();

  const depts = await Department.find().select('orgId key').lean();
  for (const d of depts) {
    try {
      await sweepDepartment(d.orgId, d.key, injectedTime);
    } catch (err) {
      console.error(`[Sweep] Error sweeping dept ${d.orgId}:${d.key}:`, err.message);
    }
  }
}

/**
 * Start periodic sweep worker (runs every 10 seconds on boot)
 */
export function startSweepWorker() {
  if (sweepIntervalTimer) return;
  sweepIntervalTimer = setInterval(() => {
    sweepAll().catch((err) => console.error('[Sweep] Worker error:', err.message));
  }, 10000);
  if (sweepIntervalTimer.unref) sweepIntervalTimer.unref();
}

/**
 * Stop sweep worker (for test cleanups)
 */
export function stopSweepWorker() {
  if (sweepIntervalTimer) {
    clearInterval(sweepIntervalTimer);
    sweepIntervalTimer = null;
  }
}
