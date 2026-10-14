// backend/src/routes/travel.js
// Travel-time estimation and routing endpoint (Phase 5)
// POST /api/travel – { from: {lat,lng}, to: {lat,lng}, mode: 'walk'|'bike'|'car', includeGeometry?: boolean }
// Returns: { minutes, km, source, label, mode, rushFactor, trafficFactor, cached, fallbackReason, computedAt, geometry }

import { Router } from 'express';
import { travelLimiter } from '../middleware/rateLimit.js';
import { haversine } from '../services/travel/estimate.js';
import { getTravel } from '../services/travel/ors.js';
import { clock, now } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';

const router = Router();

// Validate coordinate helper (§5.2)
function isValidCoord(coord) {
  if (!coord || typeof coord !== 'object') return false;
  const lat = Number(coord.lat);
  const lng = Number(coord.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false; // (0,0) is rejected per §5.2

  return true;
}

// POST /api/travel
// Privacy rule (§5.10): never log coordinates or request body
router.post('/', travelLimiter, async (req, res, next) => {
  try {
    const { from, to, mode, includeGeometry = false } = req.body || {};

    // 1. Validate mode (§5.2)
    if (!mode || !['walk', 'bike', 'car'].includes(mode)) {
      return next(new AppError('INVALID_MODE', 400, "Mode must be 'walk', 'bike', or 'car'."));
    }

    // 2. Validate coordinates (§5.2)
    if (!isValidCoord(from) || !isValidCoord(to)) {
      return next(new AppError('INVALID_COORDS', 400, 'Invalid or out-of-range coordinates.'));
    }

    // 3. Distance check: maximum 300 km for hospital visit (§5.2)
    const straightKm = haversine(from, to);
    if (straightKm > 300) {
      return next(new AppError('INVALID_COORDS', 400, 'Distance exceeds 300 km maximum for hospital travel.'));
    }

    // 4. Compute travel time via adapter (ORS routing with fallback to estimate)
    const result = await getTravel({
      from: { lat: Number(from.lat), lng: Number(from.lng) },
      to: { lat: Number(to.lat), lng: Number(to.lng) },
      mode,
      includeGeometry: Boolean(includeGeometry),
      rushFactor: clock.getRushFactor(),
      now: now(),
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
