// backend/src/middleware/auth.js
// JWT verification for staff and admin routes (Phase 1.3, Phase 3)

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

/**
 * Verify staff JWT.
 * Attaches decoded payload to req.staff = { orgId, role:'staff' }
 */
export function requireStaff(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Staff authentication required.',
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'staff') {
      return res.status(403).json({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Staff access only.',
      });
    }
    req.staff = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Invalid or expired staff session.',
    });
  }
}

/**
 * Verify admin JWT.
 * Attaches decoded payload to req.admin = { role:'admin' }
 */
export function requireAdmin(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Admin authentication required.',
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Admin access only.',
      });
    }
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Invalid or expired admin session.',
    });
  }
}

/**
 * Sign a staff JWT for an org.
 */
export function signStaffToken(orgId) {
  return jwt.sign(
    { role: 'staff', orgId },
    JWT_SECRET,
    { expiresIn: process.env.STAFF_JWT_EXPIRES_IN || '8h' }
  );
}

/**
 * Sign an admin JWT.
 */
export function signAdminToken() {
  return jwt.sign(
    { role: 'admin' },
    JWT_SECRET,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '12h' }
  );
}

function extractBearerToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}
