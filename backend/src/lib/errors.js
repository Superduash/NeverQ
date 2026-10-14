// backend/src/lib/errors.js
// Standardized application error handling contract

export class AppError extends Error {
  constructor(code, status = 400, message = 'An error occurred', extra = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.extra = extra;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(code = 'VALIDATION_ERROR', message = 'Invalid request', extra = {}) {
    return new AppError(code, 400, message, extra);
  }

  static unauthorized(code = 'AUTH_REQUIRED', message = 'Authentication required', extra = {}) {
    return new AppError(code, 401, message, extra);
  }

  static forbidden(code = 'FORBIDDEN', message = 'Access denied', extra = {}) {
    return new AppError(code, 403, message, extra);
  }

  static notFound(code = 'NOT_FOUND', message = 'Resource not found', extra = {}) {
    return new AppError(code, 404, message, extra);
  }

  static conflict(code = 'CONFLICT', message = 'Resource conflict', extra = {}) {
    return new AppError(code, 409, message, extra);
  }

  static rateLimit(code = 'RATE_LIMIT', message = 'Too many requests', extra = {}) {
    return new AppError(code, 429, message, extra);
  }

  static internal(code = 'INTERNAL', message = 'Internal server error', extra = {}) {
    return new AppError(code, 500, message, extra);
  }
}

export default AppError;
