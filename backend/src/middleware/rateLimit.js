// backend/src/middleware/rateLimit.js
import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

// Standard error response format matching NeverQ JSON contract
const rateLimitHandler = (req, res, _next, options) => {
  const retryAfterSec = Math.ceil(options.windowMs / 1000);
  res.setHeader('Retry-After', retryAfterSec);
  res.status(429).json({
    status: 429,
    code: 'RATE_LIMIT',
    message: 'Too many attempts. Please wait before trying again.',
    retryAfterMs: options.windowMs,
    requestId: req.id || null,
  });
};

// General API rate limiter (60/min default)
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS || 60_000,
  max: env.RATE_LIMIT_MAX || 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => env.NODE_ENV === 'test',
});

// Tighter limit for ticket creation (NeverQ2 anti-spam)
export const joinLimiter = rateLimit({
  windowMs: 60_000,
  max: env.JOIN_RATE_LIMIT_MAX || 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    const deviceId = req.headers['x-device-id'] || req.body?.deviceId || '';
    return `${req.ip}_${deviceId}`;
  },
  validate: { keyGeneratorIpFallback: false },
  skip: () => env.NODE_ENV === 'test',
});

// Staff login limiter: 10 attempts / 10 min per (IP + orgId)
export const staffLoginLimiter = rateLimit({
  windowMs: 10 * 60_000, // 10 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => `${req.ip}_${req.body?.orgId || ''}`,
  validate: { keyGeneratorIpFallback: false },
  skip: (req) => env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
});

// Admin login limiter: 5 attempts / 10 min per IP
export const adminLoginLimiter = rateLimit({
  windowMs: 10 * 60_000, // 10 min
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
});

// Travel estimation limiter: 30 attempts / 1 min per IP (§5.5)
export const travelLimiter = rateLimit({
  windowMs: 60_000, // 1 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    const deviceId = req.headers['x-device-id'] || '';
    return `${req.ip}_${deviceId}`;
  },
  validate: { keyGeneratorIpFallback: false },
  skip: (req) => env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
});

export const authLimiter = staffLoginLimiter;
export default apiLimiter;
