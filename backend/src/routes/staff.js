// backend/src/routes/staff.js
// Staff-authenticated endpoints (Phase 3 + Phase 6)
// All routes require requireStaff middleware (JWT)

import { Router } from 'express';
import { z } from 'zod';
import { requireStaff } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { signStaffToken } from '../middleware/auth.js';

const router = Router();

// ───────────── Auth ─────────────

// POST /api/staff/login
router.post('/login', authLimiter, validate(z.object({
  orgId: z.string().min(1),
  pin: z.string().min(4).max(8),
})), async (req, res, next) => {
  try {
    const { orgId, pin } = req.body;
    // TODO Phase 3: lookup org in MongoDB, bcrypt.compare PIN hash
    // For now: accept PIN 1234 for any seeded org (demo only)
    if (pin !== (process.env.DEMO_STAFF_PIN || '1234')) {
      return res.status(401).json({ status: 401, code: 'INVALID_PIN', message: 'Invalid staff PIN.' });
    }
    const token = signStaffToken(orgId);
    res.json({ token, orgId, role: 'staff' });
  } catch (err) {
    next(err);
  }
});

// ───────────── Queue Read ─────────────

// GET /api/staff/queue?deptId
router.get('/queue', requireStaff, async (req, res, next) => {
  try {
    // TODO Phase 6+7: return org + dept + counters + waiting tickets (no phone in list)
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 6 pending' });
  } catch (err) {
    next(err);
  }
});

// ───────────── Counter Actions ─────────────

// POST /api/staff/counters/:id/call-next (C2 decision: per counter)
router.post('/counters/:id/call-next', requireStaff, async (req, res, next) => {
  try {
    // TODO Phase 6: atomic findOneAndUpdate, emit socket event
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 6 pending' });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/counters/:id/delay
router.post('/counters/:id/delay', requireStaff, validate(z.object({
  minutes: z.number().int().min(0).max(120),
  reason: z.string().max(100).optional(),
})), async (req, res, next) => {
  try {
    // TODO Phase 6: minutes:0 clears delay; emit queue:update
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 6 pending' });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/counters/:id/state
router.post('/counters/:id/state', requireStaff, validate(z.object({
  state: z.enum(['open', 'paused', 'closed']),
})), async (req, res, next) => {
  try {
    // TODO Phase 6
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 6 pending' });
  } catch (err) {
    next(err);
  }
});

// ───────────── Ticket Actions ─────────────

const staffTicketRoutes = [
  ['start', 'Phase 6'],
  ['done', 'Phase 6'],
  ['skip', 'Phase 6'],
  ['arrive', 'Phase 6'],  // staff confirm patient arrival (C4 decision)
  ['remove-claim', 'Phase 6'],
  ['remove', 'Phase 6'],
];

for (const [action, phase] of staffTicketRoutes) {
  router.post(`/tickets/:id/${action}`, requireStaff, async (req, res, next) => {
    try {
      // TODO Phase 6
      res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: `${phase} pending` });
    } catch (err) {
      next(err);
    }
  });
}

// POST /api/staff/walkin
router.post('/walkin', requireStaff, validate(z.object({
  deptId: z.string().min(1),
  name: z.string().min(1).max(40),
  priority: z.enum(['none', 'senior', 'pregnant', 'disabled']).default('none'),
})), async (req, res, next) => {
  try {
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 6 pending' });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/urgent
router.post('/urgent', requireStaff, validate(z.object({
  deptId: z.string().min(1),
  name: z.string().min(1).max(40),
  reason: z.string().max(100).optional(),
})), async (req, res, next) => {
  try {
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 6 pending' });
  } catch (err) {
    next(err);
  }
});

export default router;
