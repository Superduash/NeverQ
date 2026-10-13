// backend/src/routes/travel.js
// Travel-time estimation endpoint (Phase 5)
// POST /api/travel – { from: {lat,lng}, to: {lat,lng}, mode: 'walk'|'bike'|'car' }
// Returns: { minutes, km, source: 'estimate'|'route', label }

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const router = Router();

// ─── Travel Speeds (NeverQ2 §6, C16 decision) ───
// car: 22 km/h × 1.35 road factor, bike: 14 km/h, walk: 4.5 km/h
const ROAD_FACTOR = 1.35;
const SPEEDS = { walk: 4.5, bike: 14.0, car: 22.0 };

const coordSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const travelSchema = z.object({
  from: coordSchema,
  to: coordSchema,
  mode: z.enum(['walk', 'bike', 'car']).default('car'),
});

function haversineKm(from, to) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST /api/travel
// Rule 10: never log request body (coords are private)
router.post('/', validate(travelSchema), async (req, res, next) => {
  try {
    const { from, to, mode } = req.body;
    const speed = SPEEDS[mode] || SPEEDS.car;
    const straightKm = haversineKm(from, to);
    const roadKm = straightKm * ROAD_FACTOR;
    const minutes = Math.max(1, Math.round((roadKm / speed) * 60));

    // TODO Phase 5: try ORS routing if VITE_ORS_ENABLED=true, fall back to estimate

    res.json({
      minutes,
      km: Number(roadKm.toFixed(1)),
      source: 'estimate',
      label: 'approx.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
