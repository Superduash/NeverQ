// backend/src/services/queue/helpers.js
// Common helper functions for NeverQ queue core (§6.1, §6.5, §6.9)

import crypto from 'node:crypto';
import { Department, Ticket, BlockedPhone, Org } from '../../db/models/index.js';
import { now } from '../../lib/clock.js';
import { RULES } from '../../config/rules.js';

/**
 * Sentinel ObjectId for atomic counter locking during call-next race resolution (§6.6)
 */
export const PENDING_SENTINEL = '000000000000000000000001';

/**
 * Calculate derived sortKey for a ticket (§6.5)
 * baseTime = requeuedAt ?? joinedAt
 * credit = priorityCreditMin[priority] * 60000 (only if lateCount === 0)
 * sortKey = baseTime - credit
 */
export function calculateSortKey(joinedAt, priority = 'none', lateCount = 0, requeuedAt = null, orgRules = {}) {
  const baseTime = requeuedAt ?? joinedAt;
  const credits = orgRules.priorityCreditMin || RULES.DEFAULT_DEPT_RULES.priorityCreditMin;
  const creditMin = credits[priority] || 0;
  // Requeued tickets get 0 credit and go to the back (§6.5)
  const creditMs = lateCount > 0 ? 0 : creditMin * 60000;
  return baseTime - creditMs;
}

/**
 * Generate cryptographically secure base64url token (16 random bytes)
 */
export function generateTicketToken() {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Atomically increment department sequence and format ticket label (e.g., G-014) (§6.2)
 */
export async function generateTicketLabel(orgId, deptKey) {
  const dept = await Department.findOneAndUpdate(
    { orgId, key: deptKey },
    { $inc: { seq: 1 } },
    { new: true }
  );

  if (!dept) {
    throw new Error(`Department ${deptKey} not found for org ${orgId}`);
  }

  const code = dept.code || deptKey.slice(0, 1).toUpperCase();
  const seqNum = dept.seq || 1;
  const label = `${code}-${String(seqNum).padStart(3, '0')}`;
  return { label, dept };
}

/**
 * Atomically increment department sequence for urgent cases (URG-001) (§6.7)
 */
export async function generateUrgentLabel(orgId, deptKey) {
  const dept = await Department.findOneAndUpdate(
    { orgId, key: deptKey },
    { $inc: { seq: 1 } },
    { new: true }
  );

  const seqNum = dept?.seq || 1;
  const label = `URG-${String(seqNum).padStart(3, '0')}`;
  return { label, dept };
}

/**
 * Check if phone is blocked at this hospital (§6.2, §6.9)
 */
export async function isPhoneBlocked(orgId, phone) {
  if (!phone) return false;
  const blocked = await BlockedPhone.findOne({ orgId, phone }).lean();
  return Boolean(blocked);
}

/**
 * Check cooldown rule: 2+ expired remote tickets for the same phone OR device in last 24h (§6.9)
 * Returns { inCooldown: boolean, retryAfterMs: number }
 */
export async function checkCooldown(phone, deviceId) {
  const currentTime = now();
  const dayAgo = currentTime - 24 * 60 * 60 * 1000;

  const queryConditions = [];
  if (phone) queryConditions.push({ phone });
  if (deviceId) queryConditions.push({ deviceId });

  if (queryConditions.length === 0) {
    return { inCooldown: false, retryAfterMs: 0 };
  }

  const expiredTickets = await Ticket.find({
    source: 'remote',
    status: 'expired',
    $or: queryConditions,
    createdAt: { $gte: new Date(dayAgo) },
  })
    .sort({ createdAt: 1 })
    .lean();

  if (expiredTickets.length >= 2) {
    const oldest = expiredTickets[0];
    const oldestMs = new Date(oldest.createdAt).getTime();
    const expiresEndMs = oldestMs + 24 * 60 * 60 * 1000;
    const retryAfterMs = Math.max(1000, expiresEndMs - currentTime);
    return { inCooldown: true, retryAfterMs };
  }

  return { inCooldown: false, retryAfterMs: 0 };
}

/**
 * Check remote cap: count waiting, not-arrived remote tickets in dept (§6.2, §6.9)
 */
export async function checkRemoteCap(orgId, deptKey, capLimit = 10) {
  const waitingNotArrived = await Ticket.countDocuments({
    orgId,
    deptKey,
    source: 'remote',
    status: 'waiting',
    arrived: false,
  });

  return waitingNotArrived < capLimit;
}

/**
 * Format public ticket DTO (Appendix A.2)
 * Omits phone, deviceId, staffPinHash, internal data
 */
export function formatPublicTicketDTO(ticket, org, dept, queuePosition = null, serverNow = now()) {
  return {
    token: ticket.token,
    id: ticket._id || ticket.id,
    label: ticket.label,
    name: ticket.name,
    status: ticket.status,
    priority: ticket.priority,
    urgent: Boolean(ticket.urgent),
    arrived: Boolean(ticket.arrived),
    arrivedAt: ticket.arrivedAt || null,
    position: queuePosition !== null ? queuePosition : ticket.position || 1,
    firstEta: ticket.firstEta || null,
    lastEta: ticket.lastEta || null,
    changes: ticket.changes || [],
    arriveDeadline: ticket.arriveDeadline || null,
    calledCounterName: ticket.calledCounterName || null,
    org: {
      id: org._id || org.id,
      name: org.name,
      lat: org.lat,
      lng: org.lng,
      area: org.area,
      address: org.address,
      hours: org.hours,
      open: Boolean(org.open),
    },
    dept: {
      id: dept.key,
      name: dept.name,
      code: dept.code,
      defaultMin: dept.defaultMin,
    },
    serverNow,
  };
}

/**
 * Format staff ticket DTO (Appendix A.3)
 * Omits phone by default (revealed only via /staff/tickets/:id/phone)
 */
export function formatStaffTicketDTO(ticket) {
  return {
    id: ticket._id || ticket.id,
    token: ticket.token,
    label: ticket.label,
    name: ticket.name,
    priority: ticket.priority,
    urgent: Boolean(ticket.urgent),
    urgentReason: ticket.urgentReason || null,
    status: ticket.status,
    source: ticket.source,
    arrived: Boolean(ticket.arrived),
    arrivedAt: ticket.arrivedAt || null,
    arrivedVia: ticket.arrivedVia || null,
    joinedAt: ticket.joinedAt,
    calledAt: ticket.calledAt || null,
    startedAt: ticket.startedAt || null,
    doneAt: ticket.doneAt || null,
    lateCount: ticket.lateCount || 0,
    counterId: ticket.counterId || null,
    calledCounterName: ticket.calledCounterName || null,
    lastEta: ticket.lastEta || null,
    arriveDeadline: ticket.arriveDeadline || null,
  };
}
