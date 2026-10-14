// backend/src/middleware/serverTime.js
import { clock } from '../lib/clock.js';

export function serverTime(req, res, next) {
  res.setHeader('X-NQ-Server-Now', String(clock.now()));
  res.setHeader('X-NQ-Clock-Offset-Ms', String(clock.getOffsetMs()));
  next();
}

export default serverTime;
