// backend/src/middleware/rateLimit.js
// Configurable rate limiters (Phase 1.3)

import rateLimit from 'express-rate-limit';

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000; // 1 min
const max = Number(process.env.RATE_LIMIT_MAX) || 60;
const joinMax = Number(process.env.JOIN_RATE_LIMIT_MAX) || 5;

// Standard error response format
const handler = (req, res) => {
  res.status(429).json({
    status: 429,
    code: 'RATE_LIMIT',
    message: 'Too many requests. Please wait a moment before trying again.',
    retryAfterMs: windowMs,
  });
};

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0] || req.ip,
});

// Tighter limit for ticket creation (anti-spam)
export const joinLimiter = rateLimit({
  windowMs,
  max: joinMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => {
    // Key on device-id + IP together
    const deviceId = req.headers['x-device-id'] || req.body?.deviceId || req.ip;
    return deviceId;
  },
});

// Auth endpoints (prevent brute force)
export const authLimiter = rateLimit({
  windowMs: 5 * 60_000, // 5 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
