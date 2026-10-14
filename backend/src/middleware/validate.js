// backend/src/middleware/validate.js
// Zod-based request body validation (Phase 1.3)
// Usage: router.post('/tickets', validate(ticketSchema), handler)

import { ZodError } from 'zod';

/**
 * Returns an Express middleware that validates req.body against a Zod schema.
 * On failure, responds 400 with structured field errors.
 */
export function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError || err?.name === 'ZodError') {
        const issues = err.issues || err.errors || [];
        const fields = issues.map((e) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
          message: e.message,
        }));
        return res.status(400).json({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'One or more fields are invalid.',
          fields,
        });
      }
      next(err);
    }
  };
}
