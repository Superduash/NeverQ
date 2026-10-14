// backend/src/config/env.js
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  CLIENT_ORIGIN: z.string().default(''),
  MONGODB_URI: z.string().optional(),
  JWT_SECRET: z.string().default('dev_jwt_secret_must_be_at_least_32_characters_long_for_security_neverq'),
  STAFF_JWT_EXPIRES_IN: z.string().default('12h'),
  ADMIN_JWT_EXPIRES_IN: z.string().default('8h'),
  ADMIN_PASSWORD: z.string().default('admin1234'),
  // SIM_TOOLS / DEMO_MODE: default true in dev, false in prod unless set
  SIM_TOOLS: z.preprocess((val) => {
    if (val !== undefined) return val === 'true' || val === true;
    if (process.env.DEMO_MODE !== undefined) return process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === true;
    return process.env.NODE_ENV !== 'production';
  }, z.boolean()).default(true),
  DEMO_MODE: z.preprocess((val) => {
    if (val !== undefined) return val === 'true' || val === true;
    if (process.env.SIM_TOOLS !== undefined) return process.env.SIM_TOOLS === 'true' || process.env.SIM_TOOLS === true;
    return process.env.NODE_ENV !== 'production';
  }, z.boolean()).default(true),
  SERVE_STATIC: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  ORS_API_KEY: z.string().optional().default(''),
  ORS_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  SEED_STAFF_PIN: z.string().default('1234'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(60),
  JOIN_RATE_LIMIT_MAX: z.coerce.number().default(8),
  ARRIVAL_RADIUS_M: z.coerce.number().default(300),
  ARRIVAL_ACCURACY_CAP_M: z.coerce.number().default(100),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (!data.MONGODB_URI || (!data.MONGODB_URI.startsWith('mongodb://') && !data.MONGODB_URI.startsWith('mongodb+srv://'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI must be a valid MongoDB connection string in production',
      });
    }

    const placeholderSecrets = [
      'changeme_generate_64_random_hex_chars',
      'dev_jwt_secret_must_be_at_least_32_characters_long_for_security_neverq',
      'secret',
      'jwt_secret',
    ];
    if (data.JWT_SECRET.length < 32 || placeholderSecrets.includes(data.JWT_SECRET.toLowerCase())) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be at least 32 characters long and not a placeholder in production',
      });
    }

    if (!data.SIM_TOOLS && data.ADMIN_PASSWORD.length < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADMIN_PASSWORD'],
        message: 'ADMIN_PASSWORD must be at least 10 characters long in production (unless SIM_TOOLS=true)',
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  const issues = parsed.error.issues || parsed.error.errors || [];
  issues.forEach((err) => {
    const p = Array.isArray(err.path) ? err.path.join('.') : err.path;
    console.error(`  - ${p}: ${err.message}`);
  });
  throw new Error(`Environment validation failed: ${issues.map(e => `${Array.isArray(e.path) ? e.path.join('.') : e.path}: ${e.message}`).join(', ')}`);
}

export const env = parsed.data;
export default env;
