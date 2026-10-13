// backend/src/routes/admin.js
// Admin-authenticated endpoints (Phase 8 + Phase 9)
// All non-login routes require requireAdmin middleware (JWT)

import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { signAdminToken } from '../middleware/auth.js';

const router = Router();

// ───────────── Auth ─────────────

// POST /api/admin/login
router.post('/login', authLimiter, validate(z.object({
  password: z.string().min(1),
})), async (req, res, next) => {
  try {
    const { password } = req.body;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ status: 401, code: 'INVALID_PASSWORD', message: 'Incorrect admin password.' });
    }
    const token = signAdminToken();
    res.json({ token, role: 'admin' });
  } catch (err) {
    next(err);
  }
});

// ───────────── Platform Summary ─────────────

// GET /api/admin/summary
router.get('/summary', requireAdmin, async (req, res, next) => {
  try {
    // TODO Phase 8: aggregate across all orgs
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 8 pending' });
  } catch (err) {
    next(err);
  }
});

// ───────────── Org CRUD ─────────────

const orgBodySchema = z.object({
  name: z.string().min(2).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  area: z.string().max(50).optional(),
  address: z.string().max(150).optional(),
  staffPin: z.string().min(4).max(8).optional(),
  defaultMin: z.number().int().min(1).max(120).default(12),
});

// GET /api/admin/orgs
router.get('/orgs', requireAdmin, async (req, res, next) => {
  try {
    // TODO Phase 8
    res.json([]);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/orgs
router.post('/orgs', requireAdmin, validate(orgBodySchema), async (req, res, next) => {
  try {
    // TODO Phase 8: create Org doc, emit socket 'org:created'
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 8 pending' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/orgs/:id
router.patch('/orgs/:id', requireAdmin, validate(orgBodySchema.partial()), async (req, res, next) => {
  try {
    // TODO Phase 8
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 8 pending' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/orgs/:id/toggle
router.post('/orgs/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    // TODO Phase 8
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 8 pending' });
  } catch (err) {
    next(err);
  }
});

// ───────────── Demo Director (Phase 9) ─────────────

// Only available when DEMO_MODE=true
function demoOnly(req, res, next) {
  if (process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Demo Director is disabled in this environment.',
    });
  }
  next();
}

// POST /api/admin/demo/reset
router.post('/demo/reset', requireAdmin, demoOnly, async (req, res, next) => {
  try {
    // TODO Phase 9: delete all tickets, reset dept.seq, reset clock
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 9 pending' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/demo/fast-forward
router.post('/demo/fast-forward', requireAdmin, demoOnly, validate(z.object({
  minutes: z.number().int().min(1).max(180),
})), async (req, res, next) => {
  try {
    // TODO Phase 9
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 9 pending' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/demo/rush-hour
router.post('/demo/rush-hour', requireAdmin, demoOnly, validate(z.object({
  factor: z.number().min(0.5).max(3.0),
})), async (req, res, next) => {
  try {
    // TODO Phase 9
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 9 pending' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/demo/simulate-patients
router.post('/demo/simulate-patients', requireAdmin, demoOnly, validate(z.object({
  orgId: z.string().min(1),
  deptId: z.string().min(1),
  count: z.number().int().min(1).max(50),
})), async (req, res, next) => {
  try {
    // TODO Phase 9
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 9 pending' });
  } catch (err) {
    next(err);
  }
});

export default router;
