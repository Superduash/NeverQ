// backend/src/middleware/requestId.js
import crypto from 'node:crypto';

export function requestId(req, res, next) {
  const incoming = req.header('x-request-id');
  const id = incoming || `r-${crypto.randomBytes(4).toString('hex')}`;
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export default requestId;
