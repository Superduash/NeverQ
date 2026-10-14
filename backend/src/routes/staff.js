// backend/src/routes/staff.js
// Staff-authenticated endpoints (§6.6–§6.7, Phase 3 + Phase 6)
// All routes require requireStaff middleware (JWT) with strict org scoping.

import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireStaff, signStaffToken } from '../middleware/auth.js';
import { staffLoginLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { Org, Counter, Ticket, Department, AuditEvent, BlockedPhone } from '../db/models/index.js';
import { now } from '../lib/clock.js';
import {
  PENDING_SENTINEL,
  generateTicketToken,
  generateTicketLabel,
  generateUrgentLabel,
  calculateSortKey,
  formatStaffTicketDTO,
} from '../services/queue/helpers.js';
import { recomputeAndLog } from '../services/eta/recompute.js';
import { sweepDepartment } from '../services/queue/sweep.js';
import { updateStats } from '../services/eta/stats.js';
import { AppError } from '../lib/errors.js';

const router = Router();

/**
 * Org scoping rule (§3.3):
 * Every staff handler verifies resource.orgId === req.orgId.
 * Otherwise respond 404 NOT_FOUND (never 403, to prevent cross-hospital existence probing).
 */
export function checkStaffOrgScope(resource, reqOrgId) {
  if (!resource || resource.orgId !== reqOrgId) {
    throw new AppError('NOT_FOUND', 404, 'Resource not found.');
  }
}

// ───────────── Auth ─────────────

// POST /api/staff/login
router.post(
  '/login',
  staffLoginLimiter,
  validate(
    z.object({
      orgId: z.string().min(1),
      pin: z.string().min(4).max(8),
    })
  ),
  async (req, res, next) => {
    try {
      const { orgId, pin } = req.body;
      const org = await Org.findById(orgId).select('+staffPinHash pinVersion name');

      if (!org || !org.staffPinHash) {
        return res.status(401).json({
          status: 401,
          code: 'INVALID_PIN',
          message: 'Invalid hospital or staff PIN.',
        });
      }

      const isMatch = await bcrypt.compare(pin, org.staffPinHash);
      if (!isMatch) {
        return res.status(401).json({
          status: 401,
          code: 'INVALID_PIN',
          message: 'Invalid hospital or staff PIN.',
        });
      }

      const token = await signStaffToken(org._id, org.pinVersion || 1);

      res.json({
        token,
        orgId: org._id,
        orgName: org.name,
        staff: { orgId: org._id, name: 'Staff', role: 'staff' },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ───────────── Queue Read (Appendix A.3) ─────────────

// GET /api/staff/queue?deptId
router.get('/queue', requireStaff, async (req, res, next) => {
  try {
    const org = await Org.findById(req.orgId).lean();
    if (!org) {
      return next(new AppError('NOT_FOUND', 404, 'Hospital facility not found.'));
    }

    let deptKey = req.query.deptId;
    if (!deptKey) {
      const firstDept = await Department.findOne({ orgId: req.orgId }).sort({ order: 1, _id: 1 }).lean();
      deptKey = firstDept?.key || 'gen';
    }

    const [counters, tickets] = await Promise.all([
      Counter.find({ orgId: req.orgId, deptKey }).lean(),
      Ticket.find({
        orgId: req.orgId,
        deptKey,
        status: { $in: ['waiting', 'called', 'serving'] },
      })
        .sort({ urgent: -1, urgentAt: 1, sortKey: 1, joinedAt: 1, _id: 1 })
        .lean(),
    ]);

    res.json({
      orgId: req.orgId,
      orgName: org.name,
      deptId: deptKey,
      counters: counters.map((c) => ({
        id: c._id,
        name: c.name,
        state: c.state,
        currentTicketId: c.currentTicketId ? String(c.currentTicketId) : null,
        delayUntil: c.delayUntil || null,
        delayReason: c.delayReason || null,
      })),
      tickets: tickets.map(formatStaffTicketDTO),
    });
  } catch (err) {
    next(err);
  }
});

// ───────────── Counter Actions (§6.6, §6.7) ─────────────

// POST /api/staff/counters/:id/call-next (Atomic Call Next §6.6)
router.post('/counters/:id/call-next', requireStaff, async (req, res, next) => {
  try {
    const { id } = req.params;
    const counter = await Counter.findById(id);
    checkStaffOrgScope(counter, req.orgId);

    const currentTime = now();

    // 1. Guard counter state & delays
    if (counter.state !== 'open' || (counter.delayUntil && counter.delayUntil > currentTime)) {
      return next(new AppError('COUNTER_NOT_OPEN', 400, 'Counter is not currently open or is on delay.'));
    }

    // 2. Claim counter atomically with PENDING_SENTINEL (§6.6 step 3)
    const claimedCounter = await Counter.findOneAndUpdate(
      { _id: id, orgId: req.orgId, state: 'open', currentTicketId: null },
      { $set: { currentTicketId: PENDING_SENTINEL } },
      { new: true }
    );

    if (!claimedCounter) {
      return next(new AppError('COUNTER_BUSY', 409, 'Counter already has an active patient.'));
    }

    // 3. Loop up to 5 times to claim next arrived ticket (§6.6 step 4)
    let claimedTicket = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      // Find candidate arrived waiting tickets
      const candidate = await Ticket.findOne({
        orgId: req.orgId,
        deptKey: counter.deptKey,
        status: 'waiting',
        arrived: true,
      }).sort({ urgent: -1, urgentAt: 1, sortKey: 1, joinedAt: 1, _id: 1 });

      if (!candidate) {
        // No arrived tickets -> release counter claim
        await Counter.findByIdAndUpdate(id, { $set: { currentTicketId: null } });
        return next(new AppError('NO_ARRIVED_TICKETS', 404, 'No arrived patients waiting in this department.'));
      }

      // Claim candidate ticket atomically
      const lockedTicket = await Ticket.findOneAndUpdate(
        { _id: candidate._id, status: 'waiting', arrived: true },
        {
          $set: {
            status: 'called',
            calledAt: currentTime,
            counterId: counter._id,
            calledCounterName: counter.name,
          },
        },
        { new: true }
      );

      if (lockedTicket) {
        claimedTicket = lockedTicket;
        break; // Successfully claimed ticket
      }
      // Lost race to another counter: retry loop
    }

    if (!claimedTicket) {
      // Release counter claim
      await Counter.findByIdAndUpdate(id, { $set: { currentTicketId: null } });
      return next(new AppError('ALREADY_CALLED', 409, 'Next waiting ticket was claimed concurrently. Please try again.'));
    }

    // 4. Set counter's currentTicketId to claimed ticket (§6.6 step 5)
    counter.currentTicketId = claimedTicket._id;
    await counter.save();

    // 5. Recompute & Sweep (§6.6 step 6)
    await recomputeAndLog(req.orgId, counter.deptKey, 'call', { counter: counter.name });
    sweepDepartment(req.orgId, counter.deptKey).catch(() => {});

    // 6. Return staff DTO (§6.6 step 7)
    res.json({
      ticket: formatStaffTicketDTO(claimedTicket),
      counter: { id: counter._id, name: counter.name },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/counters/:id/delay (§6.7)
router.post(
  '/counters/:id/delay',
  requireStaff,
  validate(
    z.object({
      minutes: z.number().int().min(0).max(240),
      reason: z.string().max(120).optional(),
    }).refine((data) => data.minutes === 0 || (Boolean(data.reason) && data.reason.length >= 3), {
      message: 'Reason (3-120 characters) is required when minutes > 0.',
      path: ['reason'],
    })
  ),
  async (req, res, next) => {
    try {
      const counter = await Counter.findById(req.params.id);
      checkStaffOrgScope(counter, req.orgId);

      const { minutes, reason } = req.body;
      const currentTime = now();

      if (minutes === 0) {
        counter.delayUntil = null;
        counter.delayReason = null;
      } else {
        counter.delayUntil = currentTime + minutes * 60000;
        counter.delayReason = reason || null;
      }

      await counter.save();

      // Audit event
      await AuditEvent.create({
        orgId: req.orgId,
        actor: 'staff',
        action: 'delay',
        ticketId: counter.currentTicketId || null,
        at: currentTime,
        expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Recompute ETA
      const trigger = minutes === 0 ? 'delay_cleared' : 'delay_set';
      await recomputeAndLog(req.orgId, counter.deptKey, trigger, {
        counter: counter.name,
        minutes,
        reason,
      });

      res.json({
        id: counter._id,
        name: counter.name,
        delayUntil: counter.delayUntil,
        delayReason: counter.delayReason,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/staff/counters/:id/state (§6.7)
router.post(
  '/counters/:id/state',
  requireStaff,
  validate(
    z.object({
      state: z.enum(['open', 'paused', 'closed']),
    })
  ),
  async (req, res, next) => {
    try {
      const counter = await Counter.findById(req.params.id);
      checkStaffOrgScope(counter, req.orgId);

      const { state } = req.body;

      // If counter is holding a called or serving ticket, it cannot be paused or closed (§6.7)
      if (['paused', 'closed'].includes(state) && counter.currentTicketId) {
        return next(new AppError('COUNTER_BUSY', 409, 'Cannot pause or close a counter while a consultation is in progress.'));
      }

      counter.state = state;
      await counter.save();

      await recomputeAndLog(req.orgId, counter.deptKey, `counter_${state}`, {
        counter: counter.name,
      });

      res.json({
        id: counter._id,
        name: counter.name,
        state: counter.state,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ───────────── Ticket Actions (§6.7) ─────────────

// POST /api/staff/tickets/:id/start
router.post('/tickets/:id/start', requireStaff, async (req, res, next) => {
  try {
    const currentTime = now();

    // Atomic conditional update (§6.10): must be in 'called' status and belong to org
    const ticket = await Ticket.findOneAndUpdate(
      { _id: req.params.id, orgId: req.orgId, status: 'called' },
      { $set: { status: 'serving', startedAt: currentTime } },
      { returnDocument: 'after' }
    );

    if (!ticket) {
      const existing = await Ticket.findOne({ _id: req.params.id, orgId: req.orgId });
      if (!existing) {
        return next(new AppError('NOT_FOUND', 404, 'Ticket not found.'));
      }
      return next(new AppError('INVALID_STATE', 409, `Cannot start consultation on a ${existing.status} ticket. Must be called.`));
    }

    await recomputeAndLog(req.orgId, ticket.deptKey, 'start', { counter: ticket.calledCounterName });

    res.json(formatStaffTicketDTO(ticket));
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/tickets/:id/done
router.post('/tickets/:id/done', requireStaff, async (req, res, next) => {
  try {
    const currentTime = now();

    // Atomic conditional update (§6.10): must be in 'serving' status and belong to org
    const ticket = await Ticket.findOneAndUpdate(
      { _id: req.params.id, orgId: req.orgId, status: 'serving' },
      {
        $set: { status: 'done', doneAt: currentTime },
        $unset: { active: 1 },
      },
      { returnDocument: 'after' }
    );

    if (!ticket) {
      const existing = await Ticket.findOne({ _id: req.params.id, orgId: req.orgId });
      if (!existing) {
        return next(new AppError('NOT_FOUND', 404, 'Ticket not found.'));
      }
      return next(new AppError('INVALID_STATE', 409, `Cannot complete a ${existing.status} ticket. Must be serving.`));
    }

    // Free counter
    await Counter.findOneAndUpdate(
      { currentTicketId: ticket._id },
      { $set: { currentTicketId: null } }
    );

    // Learning (§4.7): update department stats if ticket had startedAt
    if (ticket.startedAt) {
      const sampleMinutes = (currentTime - ticket.startedAt) / 60000;
      const dept = await Department.findOne({ orgId: req.orgId, key: ticket.deptKey });

      if (dept) {
        const updated = updateStats(dept.stats, sampleMinutes, dept.defaultMin);
        if (updated.updated) {
          dept.stats = { n: updated.n, mean: updated.mean, m2: updated.m2 };
          dept.statsHistory = updated.statsHistory;
          await dept.save();
        }
      }
    }

    await recomputeAndLog(req.orgId, ticket.deptKey, 'done', { counter: ticket.calledCounterName });
    sweepDepartment(req.orgId, ticket.deptKey).catch(() => {});

    res.json(formatStaffTicketDTO(ticket));
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/tickets/:id/skip
router.post('/tickets/:id/skip', requireStaff, async (req, res, next) => {
  try {
    const currentTime = now();

    // First attempt first miss requeue atomically (§6.5, §6.10)
    let ticket = await Ticket.findOneAndUpdate(
      { _id: req.params.id, orgId: req.orgId, status: 'called', lateCount: 0 },
      {
        $set: {
          status: 'waiting',
          lateCount: 1,
          requeuedAt: currentTime,
          sortKey: currentTime,
          counterId: null,
          calledCounterName: null,
          arriveDeadline: null,
          arrived: false,
        },
        $push: {
          changes: {
            $each: [{ minutes: 0, text: 'Missed consultation call: moved to back of queue once', time: currentTime }],
            $slice: -8,
          },
        },
      },
      { returnDocument: 'after' }
    );

    // If walk-in ticket was requeued, keep arrived: true
    if (ticket && ticket.source === 'walkin') {
      ticket.arrived = true;
      await ticket.save();
    }

    // If not first miss, attempt second miss expiration atomically (§6.5, §6.10)
    if (!ticket) {
      ticket = await Ticket.findOneAndUpdate(
        { _id: req.params.id, orgId: req.orgId, status: 'called', lateCount: { $gte: 1 } },
        {
          $set: {
            status: 'expired',
            expiredReason: 'grace',
            doneAt: currentTime,
          },
          $unset: { active: 1 },
        },
        { returnDocument: 'after' }
      );
    }

    if (!ticket) {
      const existing = await Ticket.findOne({ _id: req.params.id, orgId: req.orgId });
      if (!existing) {
        return next(new AppError('NOT_FOUND', 404, 'Ticket not found.'));
      }
      if (existing.status === 'serving') {
        return next(new AppError('INVALID_STATE', 409, 'Cannot skip a consultation in progress. Complete or remove instead.'));
      }
      return next(new AppError('INVALID_STATE', 409, `Cannot skip a ${existing.status} ticket. Must be called.`));
    }

    // Free counter
    await Counter.findOneAndUpdate(
      { currentTicketId: ticket._id },
      { $set: { currentTicketId: null } }
    );

    await recomputeAndLog(req.orgId, ticket.deptKey, 'skip');
    sweepDepartment(req.orgId, ticket.deptKey).catch(() => {});

    res.json(formatStaffTicketDTO(ticket));
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/tickets/:id/arrive (Staff confirm patient arrival §6.3, §6.7)
router.post('/tickets/:id/arrive', requireStaff, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    checkStaffOrgScope(ticket, req.orgId);

    if (ticket.arrived) {
      return res.json(formatStaffTicketDTO(ticket));
    }

    if (ticket.status !== 'waiting' && ticket.status !== 'called') {
      return next(new AppError('INVALID_STATE', 409, `Cannot confirm arrival for a ${ticket.status} ticket.`));
    }

    const currentTime = now();
    ticket.arrived = true;
    ticket.arrivedAt = currentTime;
    ticket.arrivedVia = 'staff';
    ticket.arriveDeadline = null;
    await ticket.save();

    await recomputeAndLog(req.orgId, ticket.deptKey, 'arrive');
    sweepDepartment(req.orgId, ticket.deptKey).catch(() => {});

    res.json(formatStaffTicketDTO(ticket));
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/tickets/:id/remove-claim (§6.5, §6.7)
router.post('/tickets/:id/remove-claim', requireStaff, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    checkStaffOrgScope(ticket, req.orgId);

    if (ticket.priority === 'none') {
      return res.json(formatStaffTicketDTO(ticket));
    }

    ticket.priority = 'none';
    ticket.sortKey = ticket.joinedAt; // Recompute sortKey without priority credit
    await ticket.save();

    await AuditEvent.create({
      orgId: req.orgId,
      actor: 'staff',
      action: 'remove_claim',
      ticketId: ticket._id,
      at: now(),
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await recomputeAndLog(req.orgId, ticket.deptKey, 'claim_removed');

    res.json(formatStaffTicketDTO(ticket));
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/tickets/:id/remove (§6.7)
router.post(
  '/tickets/:id/remove',
  requireStaff,
  validate(
    z.object({
      blockPhone: z.boolean().default(false),
    })
  ),
  async (req, res, next) => {
    try {
      const ticket = await Ticket.findById(req.params.id);
      checkStaffOrgScope(ticket, req.orgId);

      if (['done', 'cancelled', 'expired', 'removed'].includes(ticket.status)) {
        return next(new AppError('TICKET_ENDED', 409, `Ticket has already ended (${ticket.status}).`));
      }

      const currentTime = now();
      const { blockPhone } = req.body;

      ticket.status = 'removed';
      ticket.doneAt = currentTime;
      ticket.active = undefined;
      await ticket.save();

      // Free counter if ticket was occupying one
      await Counter.findOneAndUpdate(
        { currentTicketId: ticket._id },
        { $set: { currentTicketId: null } }
      );

      // Block phone if requested and ticket has a phone number
      if (blockPhone && ticket.phone) {
        await BlockedPhone.findOneAndUpdate(
          { orgId: req.orgId, phone: ticket.phone },
          {
            $set: {
              reason: 'Removed by hospital staff',
              createdAt: new Date(),
              expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          },
          { upsert: true }
        );
      }

      // Audit event
      await AuditEvent.create({
        orgId: req.orgId,
        actor: 'staff',
        action: blockPhone ? 'remove_and_block' : 'remove',
        ticketId: ticket._id,
        at: currentTime,
        expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await recomputeAndLog(req.orgId, ticket.deptKey, 'remove');
      sweepDepartment(req.orgId, ticket.deptKey).catch(() => {});

      res.json({ success: true, removedAt: currentTime });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/staff/tickets/:id/phone (§6.7)
router.get('/tickets/:id/phone', requireStaff, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    checkStaffOrgScope(ticket, req.orgId);

    // Write audit event (no personal data stored)
    await AuditEvent.create({
      orgId: req.orgId,
      actor: 'staff',
      action: 'reveal_phone',
      ticketId: ticket._id,
      at: now(),
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ phone: ticket.phone || '' });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/walkin (§6.7)
router.post(
  '/walkin',
  requireStaff,
  validate(
    z.object({
      deptId: z.string().min(1),
      name: z.string().trim().min(1).max(40).default('Walk-in Patient'),
      priority: z.enum(['none', 'senior', 'pregnant', 'disabled']).default('none'),
    })
  ),
  async (req, res, next) => {
    try {
      const { deptId, name, priority } = req.body;
      const dept = await Department.findOne({ orgId: req.orgId, key: deptId });
      if (!dept) {
        return next(new AppError('NOT_FOUND', 404, 'Department not found.'));
      }

      const org = await Org.findById(req.orgId);
      const currentTime = now();
      const { label } = await generateTicketLabel(req.orgId, deptId);
      const token = generateTicketToken();
      const sortKey = calculateSortKey(currentTime, priority, 0, null, org?.rules);

      const ticket = await Ticket.create({
        orgId: req.orgId,
        deptKey: deptId,
        token,
        label,
        name: name || 'Walk-in Patient',
        phone: '',
        deviceId: '',
        source: 'walkin',
        priority,
        status: 'waiting',
        active: true,
        arrived: true,
        arrivedAt: currentTime,
        arrivedVia: 'walkin',
        lateCount: 0,
        joinedAt: currentTime,
        sortKey,
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await recomputeAndLog(req.orgId, deptId, 'join', { priority });
      sweepDepartment(req.orgId, deptId).catch(() => {});

      res.status(201).json(formatStaffTicketDTO(ticket));
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/staff/urgent (§6.7)
router.post(
  '/urgent',
  requireStaff,
  validate(
    z.object({
      deptId: z.string().min(1),
      name: z.string().trim().min(1).max(40),
      reason: z.string().min(3, 'Reason must be at least 3 characters').max(120),
    })
  ),
  async (req, res, next) => {
    try {
      const { deptId, name, reason } = req.body;
      const dept = await Department.findOne({ orgId: req.orgId, key: deptId });
      if (!dept) {
        return next(new AppError('NOT_FOUND', 404, 'Department not found.'));
      }

      const currentTime = now();
      const { label } = await generateUrgentLabel(req.orgId, deptId);
      const token = generateTicketToken();

      const ticket = await Ticket.create({
        orgId: req.orgId,
        deptKey: deptId,
        token,
        label,
        name,
        phone: '',
        deviceId: '',
        source: 'urgent',
        urgent: true,
        urgentAt: currentTime,
        urgentReason: reason,
        priority: 'none',
        status: 'waiting',
        active: true,
        arrived: true,
        arrivedAt: currentTime,
        arrivedVia: 'walkin',
        lateCount: 0,
        joinedAt: currentTime,
        sortKey: currentTime,
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await AuditEvent.create({
        orgId: req.orgId,
        actor: 'staff',
        action: 'urgent',
        ticketId: ticket._id,
        at: currentTime,
        expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await recomputeAndLog(req.orgId, deptId, 'urgent', { count: 1 });
      sweepDepartment(req.orgId, deptId).catch(() => {});

      res.status(201).json(formatStaffTicketDTO(ticket));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
