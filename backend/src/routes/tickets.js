// backend/src/routes/tickets.js
// Patient-facing ticket endpoints (§6.2–§6.4)
// POST /api/tickets               – join queue
// GET  /api/tickets/:token        – get ticket DTO (public, no phone)
// POST /api/tickets/:token/arrive – GPS arrive check-in
// POST /api/tickets/:token/cancel – cancel own ticket

import { Router } from 'express';
import { z } from 'zod';
import { Org, Department, Counter, Ticket } from '../db/models/index.js';
import { validate } from '../middleware/validate.js';
import { joinLimiter } from '../middleware/rateLimit.js';
import { normalizePhone } from '../lib/validate.js';
import { now } from '../lib/clock.js';
import { haversine } from '../services/travel/estimate.js';
import {
  generateTicketToken,
  generateTicketLabel,
  calculateSortKey,
  isPhoneBlocked,
  checkCooldown,
  checkRemoteCap,
  formatPublicTicketDTO,
} from '../services/queue/helpers.js';
import { recomputeAndLog, getQueueSnapshot } from '../services/eta/recompute.js';
import { sweepDepartment } from '../services/queue/sweep.js';
import { emitQueue, emitTicket } from '../services/realtime/emitter.js';
import { AppError } from '../lib/errors.js';

const router = Router();

// Part 7: Cache-Control: no-store on /api/tickets/*
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ───────────── Validation Schemas ─────────────

const createTicketSchema = z.object({
  orgId: z.string().min(1, 'Hospital ID is required'),
  deptId: z.string().min(1, 'Department ID is required'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(40, 'Name must be at most 40 characters'),
  phone: z.string().min(10, 'Valid Indian phone number required'),
  priority: z.enum(['none', 'senior', 'pregnant', 'disabled']).default('none'),
  deviceId: z.string().max(64).optional(),
});

const arriveSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(1000).optional(),
});

// ───────────── Endpoints ─────────────

// POST /api/tickets (Join queue §6.2)
router.post('/', joinLimiter, validate(createTicketSchema), async (req, res, next) => {
  try {
    const { orgId, deptId, name, phone, priority, deviceId = '' } = req.body;

    // Normalise phone to E.164 (+91XXXXXXXXXX)
    const normPhone = normalizePhone(phone);
    if (!normPhone) {
      return next(new AppError('VALIDATION_ERROR', 400, 'Invalid Indian mobile number. Must be 10 digits.'));
    }

    // 1. Check Org exists (§6.2 check 2)
    const org = await Org.findById(orgId);
    if (!org) {
      return next(new AppError('NOT_FOUND', 404, 'Hospital not found.'));
    }

    // 2. Check Org open (§6.2 check 3)
    if (!org.open) {
      return next(new AppError('HOSPITAL_CLOSED', 400, 'Hospital is currently closed.'));
    }

    // 3. Check Remote Ticketing Enabled (§6.2 check 4)
    if (org.rules?.remoteEnabled === false) {
      return next(new AppError('REMOTE_DISABLED', 400, 'Remote ticketing is currently disabled for this hospital.'));
    }

    // 4. Check Department exists in Org (§6.2 check 5)
    const dept = await Department.findOne({ orgId, key: deptId });
    if (!dept) {
      return next(new AppError('NOT_FOUND', 404, 'Department not found in this hospital.'));
    }

    // 5. Check Phone Blocked (§6.2 check 6)
    const blocked = await isPhoneBlocked(orgId, normPhone);
    if (blocked) {
      return next(new AppError('PHONE_BLOCKED', 403, 'Phone number has been blocked from booking at this hospital.'));
    }

    // 6. Check Cooldown (§6.2 check 7, §6.9)
    const cooldown = await checkCooldown(normPhone, deviceId);
    if (cooldown.inCooldown) {
      res.setHeader('Retry-After', Math.ceil(cooldown.retryAfterMs / 1000));
      return res.status(403).json({
        status: 403,
        code: 'COOLDOWN',
        message: 'Account cooldown active due to repeated missed appointments. Please visit as a walk-in.',
        retryAfterMs: cooldown.retryAfterMs,
        requestId: req.id || null,
      });
    }

    // 7. Check Remote Cap (§6.2 check 8)
    const capLimit = org.rules?.remoteCap ?? 10;
    const underCap = await checkRemoteCap(orgId, deptId, capLimit);
    if (!underCap) {
      return next(new AppError('REMOTE_CAP', 429, 'Remote ticketing limit reached for this department. Please visit in person.'));
    }

    // 8. Generate Label & Token atomically (§6.2 check 9)
    const { label } = await generateTicketLabel(orgId, deptId);
    const token = generateTicketToken();
    const currentTime = now();
    const sortKey = calculateSortKey(currentTime, priority, 0, null, org.rules);
    const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour TTL

    let ticketDoc;
    try {
      ticketDoc = await Ticket.create({
        orgId,
        deptKey: deptId,
        token,
        label,
        name,
        phone: normPhone,
        ...(deviceId ? { deviceId: deviceId.trim() } : {}),
        source: 'remote',
        priority,
        status: 'waiting',
        active: true,
        arrived: false,
        lateCount: 0,
        joinedAt: currentTime,
        sortKey,
        expireAt,
      });
    } catch (err) {
      // Catch Mongo duplicate key on partial unique index (active remote ticket exists)
      if (err.code === 11000) {
        const queryOr = [{ phone: normPhone }];
        if (deviceId) queryOr.push({ deviceId });

        const existing = await Ticket.findOne({
          orgId,
          active: true,
          source: 'remote',
          $or: queryOr,
        }).select('token label status').lean();

        return res.status(409).json({
          status: 409,
          code: 'DUPLICATE_TICKET',
          message: 'You already have an active ticket at this hospital.',
          token: existing?.token || null,
          requestId: req.id || null,
        });
      }
      throw err;
    }

    // 9. Initial ETA calculation & change log
    const { snapshot } = await recomputeAndLog(orgId, deptId, 'join', { priority });
    const ticketEta = snapshot.tickets.find((t) => t.token === token);

    if (ticketEta) {
      ticketDoc.firstEta = {
        low: ticketEta.low,
        mid: ticketEta.mid,
        high: ticketEta.high,
        startMs: ticketEta.startMs,
      };
      ticketDoc.lastEta = { ...ticketDoc.firstEta };
      ticketDoc.lastEtaStartMs = ticketEta.startMs;
      await ticketDoc.save();
    }

    // 10. Sweep department
    sweepDepartment(orgId, deptId).catch(() => {});

    // Realtime emits (Part 2.4)
    emitTicket(token);
    emitQueue(orgId);

    // 11. Return 201 with public DTO (no phone!)
    const publicDTO = formatPublicTicketDTO(ticketDoc, org, dept, ticketEta?.position || 1, currentTime);
    res.status(201).json(publicDTO);
  } catch (err) {
    next(err);
  }
});

// GET /api/tickets/:token (Public ticket read §3.4, §6.2)
router.get('/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const ticket = await Ticket.findOne({ token });
    if (!ticket) {
      return next(new AppError('NOT_FOUND', 404, 'Ticket not found.'));
    }

    const [org, dept] = await Promise.all([
      Org.findById(ticket.orgId).lean(),
      Department.findOne({ orgId: ticket.orgId, key: ticket.deptKey }).lean(),
    ]);

    if (!org || !dept) {
      return next(new AppError('NOT_FOUND', 404, 'Hospital department not found.'));
    }

    let queuePosition = 0;
    if (ticket.status === 'waiting') {
      const aheadCount = await Ticket.countDocuments({
        orgId: ticket.orgId,
        deptKey: ticket.deptKey,
        status: 'waiting',
        $or: [
          { urgent: true, urgentAt: { $lt: ticket.urgentAt || Infinity } },
          { sortKey: { $lt: ticket.sortKey } },
          { sortKey: ticket.sortKey, joinedAt: { $lt: ticket.joinedAt } },
          { sortKey: ticket.sortKey, joinedAt: ticket.joinedAt, _id: { $lt: ticket._id } },
        ],
      });
      queuePosition = aheadCount + 1;
    }

    const publicDTO = formatPublicTicketDTO(ticket, org, dept, queuePosition, now());
    res.json(publicDTO);
  } catch (err) {
    next(err);
  }
});

// POST /api/tickets/:token/arrive (Patient GPS arrival §6.3)
router.post('/:token/arrive', validate(arriveSchema), async (req, res, next) => {
  try {
    const { token } = req.params;
    const { lat, lng, accuracy = 0 } = req.body;

    const existing = await Ticket.findOne({ token }).lean();
    if (!existing) {
      return next(new AppError('NOT_FOUND', 404, 'Ticket not found.'));
    }

    // Idempotent: if already arrived, return success immediately
    if (existing.arrived) {
      return res.json({ success: true, arrivedAt: existing.arrivedAt });
    }

    if (existing.status !== 'waiting' && existing.status !== 'called') {
      return next(new AppError('INVALID_STATE', 409, `Cannot arrive on a ${existing.status} ticket.`));
    }

    const org = await Org.findById(existing.orgId).select('lat lng').lean();
    if (!org) {
      return next(new AppError('NOT_FOUND', 404, 'Hospital not found.'));
    }

    // Geofence check: 300m + min(accuracy, 100m) (§6.3)
    const distanceM = haversine({ lat, lng }, { lat: org.lat, lng: org.lng }) * 1000;
    const allowedM = 300 + Math.min(accuracy || 0, 100);

    if (distanceM > allowedM) {
      return next(
        new AppError(
          'OUT_OF_RANGE',
          400,
          `You are more than 300m away from the hospital (${Math.round(distanceM)}m away). Arrival can only be confirmed upon reaching the premises.`
        )
      );
    }

    const currentTime = now();
    const updated = await Ticket.findOneAndUpdate(
      { token, status: { $in: ['waiting', 'called'] }, arrived: false },
      {
        $set: {
          arrived: true,
          arrivedAt: currentTime,
          arrivedVia: 'gps',
          arriveDeadline: null,
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      // Concurrently arrived
      const current = await Ticket.findOne({ token }).lean();
      return res.json({ success: true, arrivedAt: current?.arrivedAt || currentTime });
    }

    // Recompute ETA
    await recomputeAndLog(updated.orgId, updated.deptKey, 'arrive');
    sweepDepartment(updated.orgId, updated.deptKey).catch(() => {});

    // Realtime emits (Part 2.4)
    emitTicket(token);
    emitQueue(updated.orgId);

    res.json({ success: true, arrivedAt: currentTime });
  } catch (err) {
    next(err);
  }
});

// POST /api/tickets/:token/cancel (Patient cancellation §6.4)
router.post('/:token/cancel', async (req, res, next) => {
  try {
    const { token } = req.params;
    const currentTime = now();

    // 1. Attempt atomic transition from waiting or called to cancelled (§6.4, §6.10)
    const ticket = await Ticket.findOneAndUpdate(
      { token, status: { $in: ['waiting', 'called'] } },
      {
        $set: { status: 'cancelled', doneAt: currentTime },
        $unset: { active: 1 },
      },
      { returnDocument: 'after' }
    );

    if (ticket) {
      // If ticket was currently called on a counter, free the counter immediately
      if (ticket.counterId) {
        await Counter.findOneAndUpdate(
          { _id: ticket.counterId, currentTicketId: ticket._id },
          { $set: { currentTicketId: null } }
        );
      }

      await recomputeAndLog(ticket.orgId, ticket.deptKey, 'cancel');
      sweepDepartment(ticket.orgId, ticket.deptKey).catch(() => {});

      // Realtime emits (Part 2.4)
      emitTicket(token);
      emitQueue(ticket.orgId);

      return res.json({ success: true, cancelledAt: currentTime });
    }

    // 2. If atomic update matched nothing, inspect current state to return exact error / idempotency
    const existing = await Ticket.findOne({ token }).lean();
    if (!existing) {
      return next(new AppError('NOT_FOUND', 404, 'Ticket not found.'));
    }

    // Idempotent cancellation
    if (existing.status === 'cancelled') {
      return res.json({ success: true, cancelledAt: existing.doneAt || existing.updatedAt || currentTime });
    }

    if (existing.status === 'serving') {
      return next(new AppError('INVALID_STATE', 409, 'Cannot cancel a consultation that is already in progress.'));
    }

    if (['done', 'expired', 'removed'].includes(existing.status)) {
      return next(new AppError('TICKET_ENDED', 409, `Ticket has already ended (${existing.status}).`));
    }

    return next(new AppError('INVALID_STATE', 409, `Cannot cancel ticket with status ${existing.status}.`));
  } catch (err) {
    next(err);
  }
});

export default router;
