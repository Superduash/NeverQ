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
  DEMO_MODE: z.preprocess((val) => val === 'true' || val === true || val === undefined, z.boolean()).default(true),
  SERVE_STATIC: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  ORS_API_KEY: z.string().optional().default(''),
  ORS_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
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
        code: z.ZodIssueCode.custom,
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
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be at least 32 characters long and not a placeholder in production',
      });
    }

    if (!data.DEMO_MODE && data.ADMIN_PASSWORD.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_PASSWORD'],
        message: 'ADMIN_PASSWORD must be at least 10 characters long in production (unless DEMO_MODE=true)',
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.errors.forEach((err) => {
    console.error(`  - ${err.path.join('.')}: ${err.message}`);
  });
  throw new Error(`Environment validation failed: ${parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
}

export const env = parsed.data;
export default env;
