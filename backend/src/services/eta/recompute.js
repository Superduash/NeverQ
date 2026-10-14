// backend/src/services/eta/recompute.js
// Database-integrated ETA recompute and change logger (§4.8, §4.9)

import { Org, Department, Counter, Ticket } from '../../db/models/index.js';
import { clock, now } from '../../lib/clock.js';
import { RULES } from '../../config/rules.js';
import { computeSnapshot } from './engine.js';
import { formatReason } from './reasons.js';

// Short in-memory snapshot cache (TTL 2s) per `${orgId}:${deptKey}` (§4.8)
const snapshotCache = new Map();
const CACHE_TTL_MS = 2000;

export function invalidateSnapshotCache(orgId, deptKey) {
  if (orgId && deptKey) {
    snapshotCache.delete(`${orgId}:${deptKey}`);
  } else if (orgId) {
    for (const key of snapshotCache.keys()) {
      if (key.startsWith(`${orgId}:`)) snapshotCache.delete(key);
    }
  } else {
    snapshotCache.clear();
  }
}

/**
 * Compute fresh queue snapshot for an org department.
 * Uses 2s cache unless forceFresh is true.
 */
export async function getQueueSnapshot(orgId, deptKey, { forceFresh = false } = {}) {
  const cacheKey = `${orgId}:${deptKey}`;
  const cached = snapshotCache.get(cacheKey);
  const currentTime = now();

  if (!forceFresh && cached && currentTime - cached.cachedAt < CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const [org, department, counters, tickets] = await Promise.all([
    Org.findById(orgId).lean(),
    Department.findOne({ orgId, key: deptKey }).lean(),
    Counter.find({ orgId, deptKey }).lean(),
    Ticket.find({
      orgId,
      deptKey,
      status: { $in: ['waiting', 'called', 'serving'] },
    }).lean(),
  ]);

  if (!department) {
    throw new Error(`Department ${deptKey} not found for hospital ${orgId}`);
  }

  // Cap at 200 waiting tickets per snapshot (§4.8)
  if (tickets.length > 200) {
    console.warn(`[ETA] Department ${orgId}:${deptKey} has ${tickets.length} active tickets (cap 200).`);
  }

  const snapshot = computeSnapshot({
    org,
    department,
    counters,
    tickets,
    now: currentTime,
  });

  snapshotCache.set(cacheKey, { snapshot, cachedAt: currentTime });
  return snapshot;
}

/**
 * Recompute ETA after a mutation and log significant changes (§4.9).
 *
 * @param {string} orgId - Hospital ID
 * @param {string} deptKey - Department key
 * @param {string} trigger - Event trigger from reasons catalogue
 * @param {object} meta - Context for reason message (counter, priority, etc.)
 * @returns {Promise<{ snapshot: object, affectedTokens: string[] }>}
 */
export async function recomputeAndLog(orgId, deptKey, trigger, meta = {}) {
  invalidateSnapshotCache(orgId, deptKey);

  const currentTime = now();
  const snapshot = await getQueueSnapshot(orgId, deptKey, { forceFresh: true });

  const affectedTokens = [];
  const thresholdMs = RULES.CHANGE_THRESHOLD_MIN * 60000;

  for (const item of snapshot.tickets) {
    const ticketDoc = await Ticket.findOne({ token: item.token }).select('lastEtaStartMs firstEta').lean();
    if (!ticketDoc) continue;

    const newStartMs = item.startMs;
    const oldStartMs = ticketDoc.lastEtaStartMs;

    if (!oldStartMs) {
      // First calculation: set initial ETA atomically
      const initialEta = {
        low: item.low,
        mid: item.mid,
        high: item.high,
        startMs: newStartMs,
      };
      await Ticket.findOneAndUpdate(
        { token: item.token },
        {
          $set: {
            lastEtaStartMs: newStartMs,
            lastEta: initialEta,
            ...(!ticketDoc.firstEta ? { firstEta: initialEta } : {}),
          },
        }
      );
    } else {
      const deltaMs = newStartMs - oldStartMs;

      if (Math.abs(deltaMs) >= thresholdMs) {
        const changeMin = Math.round(deltaMs / 60000);
        const reasonText = formatReason(trigger, meta);

        await Ticket.findOneAndUpdate(
          { token: item.token },
          {
            $set: {
              lastEta: {
                low: item.low,
                mid: item.mid,
                high: item.high,
                startMs: newStartMs,
              },
              lastEtaStartMs: newStartMs,
            },
            $push: {
              changes: {
                $each: [{ minutes: changeMin, text: reasonText, time: currentTime }],
                $slice: -8,
              },
            },
          }
        );
        affectedTokens.push(item.token);
      }
    }
  }

  return { snapshot, affectedTokens };
}
