// backend/src/services/travel/ors.js
// OpenRouteService (ORS) Routing Adapter (§5.4)
// Fallback-first design with token bucket quota, daily limits, LRU cache, and circuit breaker.

import mongoose from 'mongoose';
import env from '../../config/env.js';
import { RULES } from '../../config/rules.js';
import { ApiUsage } from '../../db/models/ApiUsage.js';
import { estimateTravel, TRAVEL_MODEL } from './estimate.js';

// ───────────── Constants & Configuration ─────────────

const PROFILES = {
  walk: 'foot-walking',
  bike: 'cycling-regular',
  car: 'driving-car',
};

const ORS_BASE_URL = 'https://api.openrouteservice.org/v2/directions';
const TIMEOUT_MS = 2000; // 2.0s server timeout (client timeout is 3.0s)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 500;

const RATE_LIMIT_MINUTE_MAX = 30; // Under ORS 40/min
const DAILY_BUDGET_MAX = 1800;    // Under ORS 2000/day

// ───────────── In-Memory State ─────────────

// Raw cache: key -> { distance_m, duration_s, geometry, cachedAt }
const routeCache = new Map();

// Minute token bucket
let minuteWindowStart = Date.now();
let minuteRequestCount = 0;

// Daily budget cached
let cachedDailyDate = '';
let cachedDailyUsage = 0;

// Circuit Breaker State
let consecutiveFailures = 0;
let breakerOpenUntil = 0;
let breakerDisabledPermanently = false; // Set on 401/403 bad API key

export function resetCircuitBreaker() {
  consecutiveFailures = 0;
  breakerOpenUntil = 0;
  breakerDisabledPermanently = false;
  routeCache.clear();
  minuteRequestCount = 0;
  cachedDailyUsage = 0;
}

/**
 * Determine time-of-day traffic factor in Indian Standard Time (UTC+5:30) (§5.4)
 *
 * @param {number} epochMs - Timestamp in ms
 * @returns {number} 1.0 (night), 1.25 (shoulder/midday), or 1.5 (peak)
 */
export function getIstTrafficFactor(epochMs) {
  // IST is UTC + 5 hours 30 minutes
  const istDate = new Date(epochMs + (5 * 60 + 30) * 60000);
  const hour = istDate.getUTCHours();

  // 08:00–11:00, 17:00–21:00: 1.5 (Peak rush)
  if ((hour >= 8 && hour < 11) || (hour >= 17 && hour < 21)) {
    return 1.5;
  }
  // 07:00–08:00, 11:00–17:00, 21:00–22:00: 1.25 (Shoulder / midday)
  if (hour === 7 || (hour >= 11 && hour < 17) || hour === 21) {
    return 1.25;
  }
  // 22:00–07:00: 1.0 (Night / light)
  return 1.0;
}

/**
 * Format daily usage ID (e.g., 'ors:2026-10-14')
 */
function getTodayId(epochMs) {
  const d = new Date(epochMs);
  return `ors:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Check and increment daily API usage
 */
async function checkDailyBudget(epochMs) {
  const todayId = getTodayId(epochMs);

  if (cachedDailyDate !== todayId) {
    cachedDailyDate = todayId;
    if (mongoose.connection?.readyState === 1) {
      try {
        const doc = await ApiUsage.findById(todayId).lean();
        cachedDailyUsage = doc?.count || 0;
      } catch {
        cachedDailyUsage = 0;
      }
    } else {
      cachedDailyUsage = 0;
    }
  }

  if (cachedDailyUsage >= DAILY_BUDGET_MAX) {
    return false; // Budget exhausted
  }

  // Increment usage in MongoDB asynchronously (best effort)
  cachedDailyUsage++;
  if (mongoose.connection?.readyState === 1) {
    try {
      const expireAt = new Date(epochMs + 7 * 24 * 60 * 60 * 1000); // 7-day TTL
      await ApiUsage.findByIdAndUpdate(
        todayId,
        { $inc: { count: 1 }, $setOnInsert: { expireAt } },
        { upsert: true }
      );
    } catch {
      // Non-fatal if Mongo is unavailable
    }
  }

  return true;
}

/**
 * Check minute rate limit bucket
 */
function checkMinuteBucket() {
  const now = Date.now();
  if (now - minuteWindowStart >= 60000) {
    minuteWindowStart = now;
    minuteRequestCount = 0;
  }

  if (minuteRequestCount >= RATE_LIMIT_MINUTE_MAX) {
    return false;
  }

  minuteRequestCount++;
  return true;
}

/**
 * Generate cache key based on coordinates rounded to 4 decimals (~11m precision)
 */
function getCacheKey(mode, from, to) {
  return `${mode}|${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
}

/**
 * Main travel calculation function. Attempts ORS routing if enabled,
 * falling back gracefully to estimateTravel on any error or budget exhaustion.
 *
 * @param {object} params
 * @param {{ lat: number, lng: number }} params.from
 * @param {{ lat: number, lng: number }} params.to
 * @param {'walk'|'bike'|'car'} params.mode
 * @param {boolean} [params.includeGeometry=false]
 * @param {number} params.rushFactor
 * @param {number} params.now - Current demo-clock timestamp ms
 * @param {Function} [params.fetchFn=fetch] - Injected fetch for unit testing
 * @returns {Promise<object>} Travel response matching Appendix A.6 contract
 */
export async function getTravel({
  from,
  to,
  mode = 'car',
  includeGeometry = false,
  rushFactor = 1.0,
  now,
  fetchFn = fetch,
}) {
  const currentTime = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
  const rush = Number(rushFactor) || 1.0;
  const m = TRAVEL_MODEL[mode] || TRAVEL_MODEL.car;

  // 1. Check if ORS is enabled & configured (mock fetchFn always allowed for testing)
  const isOrsEnabled =
    (fetchFn !== fetch || (env.ORS_ENABLED && Boolean(env.ORS_API_KEY))) &&
    !breakerDisabledPermanently;
  if (!isOrsEnabled) {
    const est = estimateTravel(from, to, mode, rush);
    return {
      ...est,
      rushFactor: rush,
      trafficFactor: null,
      cached: false,
      fallbackReason: breakerDisabledPermanently ? 'BREAKER' : 'DISABLED',
      computedAt: currentTime,
      geometry: null,
    };
  }

  // 2. Check Circuit Breaker
  if (breakerOpenUntil > Date.now()) {
    const est = estimateTravel(from, to, mode, rush);
    return {
      ...est,
      rushFactor: rush,
      trafficFactor: null,
      cached: false,
      fallbackReason: 'BREAKER',
      computedAt: currentTime,
      geometry: null,
    };
  }

  // 3. Check In-Memory LRU Cache
  const cacheKey = getCacheKey(mode, from, to);
  const cached = routeCache.get(cacheKey);

  let rawDistanceM;
  let rawDurationS;
  let rawGeometry;
  let wasCached = false;

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    rawDistanceM = cached.distance_m;
    rawDurationS = cached.duration_s;
    rawGeometry = cached.geometry;
    wasCached = true;
  } else {
    // 4. Check Minute and Daily Quotas
    const hasMinuteQuota = checkMinuteBucket();
    if (!hasMinuteQuota) {
      const est = estimateTravel(from, to, mode, rush);
      return {
        ...est,
        rushFactor: rush,
        trafficFactor: null,
        cached: false,
        fallbackReason: 'BUDGET',
        computedAt: currentTime,
        geometry: null,
      };
    }

    const hasDailyBudget = await checkDailyBudget(currentTime);
    if (!hasDailyBudget) {
      const est = estimateTravel(from, to, mode, rush);
      return {
        ...est,
        rushFactor: rush,
        trafficFactor: null,
        cached: false,
        fallbackReason: 'BUDGET',
        computedAt: currentTime,
        geometry: null,
      };
    }

    // 5. Call OpenRouteService Directions API
    const profile = PROFILES[mode] || PROFILES.car;
    const url = `${ORS_BASE_URL}/${profile}/geojson`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: env.ORS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Longitude first in GeoJSON format (§5.4)
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          breakerDisabledPermanently = true;
          console.error('[ORS] Invalid API key (HTTP 401/403). Disabling ORS until restart.');
        } else if (res.status === 429) {
          breakerOpenUntil = Date.now() + 5 * 60 * 1000; // Open for 5 min
          console.warn('[ORS] Rate limited by upstream (HTTP 429). Opening breaker for 5 min.');
        } else if (res.status === 404) {
          const est = estimateTravel(from, to, mode, rush);
          return {
            ...est,
            rushFactor: rush,
            trafficFactor: null,
            cached: false,
            fallbackReason: 'NO_ROUTE',
            computedAt: currentTime,
            geometry: null,
          };
        }

        consecutiveFailures++;
        if (consecutiveFailures >= 3) {
          breakerOpenUntil = Date.now() + 60 * 1000; // Open for 60s
        }

        const est = estimateTravel(from, to, mode, rush);
        return {
          ...est,
          rushFactor: rush,
          trafficFactor: null,
          cached: false,
          fallbackReason: res.status === 429 ? 'BUDGET' : 'ERROR',
          computedAt: currentTime,
          geometry: null,
        };
      }

      const data = await res.json();
      const summary = data?.features?.[0]?.properties?.summary;

      if (!summary || typeof summary.distance !== 'number' || typeof summary.duration !== 'number') {
        throw new Error('Malformed ORS response missing distance or duration');
      }

      rawDistanceM = summary.distance;
      rawDurationS = summary.duration;
      rawGeometry = data?.features?.[0]?.geometry?.coordinates || null;

      // Reset failure counter on success
      consecutiveFailures = 0;

      // Store in LRU cache
      if (routeCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = routeCache.keys().next().value;
        routeCache.delete(firstKey);
      }

      routeCache.set(cacheKey, {
        distance_m: rawDistanceM,
        duration_s: rawDurationS,
        geometry: rawGeometry,
        cachedAt: Date.now(),
      });
    } catch (err) {
      clearTimeout(timeoutId);
      consecutiveFailures++;

      if (consecutiveFailures >= 3) {
        breakerOpenUntil = Date.now() + 60 * 1000; // Open for 60s
      }

      const fallbackReason = err.name === 'AbortError' ? 'TIMEOUT' : 'ERROR';
      const est = estimateTravel(from, to, mode, rush);

      return {
        ...est,
        rushFactor: rush,
        trafficFactor: null,
        cached: false,
        fallbackReason,
        computedAt: currentTime,
        geometry: null,
      };
    }
  }

  // 6. Apply Multipliers and Overhead (§5.4)
  const orsMovingMin = rawDurationS / 60;
  let modeAdjustedMin = orsMovingMin;
  let trafficFactor = null;

  if (mode === 'walk') {
    modeAdjustedMin = orsMovingMin * (5.0 / 4.5); // ORS foot ~5 km/h -> elders 4.5 km/h
  } else if (mode === 'bike') {
    modeAdjustedMin = orsMovingMin * 1.0;
  } else if (mode === 'car') {
    trafficFactor = getIstTrafficFactor(currentTime);
    modeAdjustedMin = orsMovingMin * trafficFactor;
  }

  // Rush hour share
  const rushEff = 1 + (rush - 1) * m.rushShare;
  const finalMovingMin = modeAdjustedMin * rushEff;
  const minutes = Math.max(1, Math.ceil(finalMovingMin + m.overheadMin));
  const km = Number((rawDistanceM / 1000).toFixed(1));

  return {
    minutes,
    km,
    source: 'route',
    label: 'route · typical traffic',
    mode,
    rushFactor: rush,
    trafficFactor,
    cached: wasCached,
    fallbackReason: null,
    computedAt: currentTime,
    geometry: includeGeometry ? rawGeometry : null,
  };
}
