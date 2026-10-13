// backend/src/routes/tickets.js
// Patient-facing ticket endpoints (Phase 6)
// POST /api/tickets               – join queue
// GET  /api/tickets/:token        – get ticket (public, no phone)
// POST /api/tickets/:token/arrive – GPS arrive check-in
// POST /api/tickets/:token/cancel – cancel own ticket

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { joinLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Validation schema for POST /api/tickets
const createTicketSchema = z.object({
  orgId: z.string().min(1),
  deptId: z.string().min(1),
  name: z.string().min(2).max(40),
  phone: z.string().regex(/^\+?[0-9]{10,13}$/, 'Invalid phone number'),
  priority: z.enum(['none', 'senior', 'pregnant', 'disabled']).default('none'),
  deviceId: z.string().optional(),
  beneficiary: z.string().max(40).optional(),
});

// Arrive schema — only coords, rule 10: never log these
const arriveSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(1000).optional(),
});

// POST /api/tickets
router.post('/', joinLimiter, validate(createTicketSchema), async (req, res, next) => {
  try {
    // TODO Phase 6: validate org open, check cooldown, blockPhone, remoteCap, create ticket
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 6 pending' });
  } catch (err) {
    next(err);
  }
});

// GET /api/tickets/:token
router.get('/:token', async (req, res, next) => {
  try {
    // TODO Phase 7: fetch ticket, omit phone, compute position + ETA
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 7 pending' });
  } catch (err) {
    next(err);
  }
});

// POST /api/tickets/:token/arrive
router.post('/:token/arrive', validate(arriveSchema), async (req, res, next) => {
  try {
    // TODO Phase 6: verify proximity (ARRIVAL_RADIUS_M + accuracy), mark arrived
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 6 pending' });
  } catch (err) {
    next(err);
  }
});

// POST /api/tickets/:token/cancel
router.post('/:token/cancel', async (req, res, next) => {
  try {
    // TODO Phase 6: cancel, recalculate queue
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 6 pending' });
  } catch (err) {
    next(err);
  }
});

export default router;
