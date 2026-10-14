// backend/src/middleware/errorHandler.js
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import env from '../config/env.js';

export function errorHandler(err, req, res, _next) {
  const requestId = req.id || req.header('x-request-id') || null;

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const fields = {};
    const issues = err.issues || err.errors || [];
    issues.forEach((e) => {
      const key = Array.isArray(e.path) ? e.path.join('.') : String(e.path || 'body');
      fields[key || 'body'] = e.message;
    });

    return res.status(400).json({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'One or more fields are invalid.',
      fields,
      requestId,
    });
  }

  // 2. Custom Application Errors
  if (err instanceof AppError) {
    return res.status(err.status).json({
      status: err.status,
      code: err.code,
      message: err.message,
      ...(err.extra || {}),
      requestId,
    });
  }

  // 3. MongoDB Duplicate Key (E11000)
  if (err.name === 'MongoServerError' && err.code === 11000) {
    return res.status(409).json({
      status: 409,
      code: 'DUPLICATE_RESOURCE',
      message: 'A resource with this key already exists.',
      requestId,
    });
  }

  // 4. JSON Body Parse Errors (Express SyntaxError)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid JSON payload format.',
      requestId,
    });
  }

  // 5. Unhandled / Unexpected Errors
  const isDev = env.NODE_ENV !== 'production';
  if (isDev) {
    console.error(`[Unhandled Error] [${requestId}]:`, err);
  } else {
    console.error(`[Unhandled Error] [${requestId}]: ${err.message || err}`);
  }

  return res.status(err.status || 500).json({
    status: err.status || 500,
    code: err.code || 'INTERNAL',
    message: isDev ? (err.message || 'Internal server error') : 'Internal server error',
    ...(isDev && err.stack ? { stack: err.stack } : {}),
    requestId,
  });
}

export default errorHandler;
