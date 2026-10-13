// backend/src/routes/orgs.js
// Public org/hospital read endpoints (Phase 7)
// GET /api/orgs           – list with wait ETAs
// GET /api/orgs/:id       – single org detail
// GET /api/orgs/:id/board – public wait board

import { Router } from 'express';

const router = Router();

// GET /api/orgs
router.get('/', async (req, res, next) => {
  try {
    // TODO Phase 7: query MongoDB, calculate ETAs, sort by distance
    res.json([]);
  } catch (err) {
    next(err);
  }
});

// GET /api/orgs/:id
router.get('/:id', async (req, res, next) => {
  try {
    // TODO Phase 7
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 7 pending' });
  } catch (err) {
    next(err);
  }
});

// GET /api/orgs/:id/board
router.get('/:id/board', async (req, res, next) => {
  try {
    // TODO Phase 7
    res.status(501).json({ status: 501, code: 'NOT_IMPLEMENTED', message: 'Phase 7 pending' });
  } catch (err) {
    next(err);
  }
});

export default router;
