// The only module that reads process.env. Values come from the real
// environment first, then from the env file (.env, or ENV_FILE).
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const required = z.string().trim().min(1, 'is required');

const envSchema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.string().url(),
  APP_NAME: required.default('SaafGadi'),
  APP_TIMEZONE: z
    .string()
    .default('Asia/Kolkata')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'is not a valid IANA timezone'),

  DB_HOST: required,
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: required,
  DB_USER: required,
  DB_PASSWORD: z.string().default(''),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(50).default(5),

  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]?$/, 'must look like 7d, 12h, 30m or seconds')
    .default('7d'),
  COOKIE_SECURE: bool.default('true'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  SEED_ADMIN_NAME: optional,
  SEED_ADMIN_MOBILE: optional,
  SEED_ADMIN_EMAIL: optional,
  SEED_ADMIN_PASSWORD: optional,

  RUN_MIGRATIONS_ON_START: bool.default('true'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = ReturnType<typeof buildConfig>;

function buildConfig(env: z.infer<typeof envSchema>) {
  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    appUrl: env.APP_URL,
    appName: env.APP_NAME,
    timezone: env.APP_TIMEZONE,
    db: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      name: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      connectionLimit: env.DB_CONNECTION_LIMIT,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtExpiresIn: env.JWT_EXPIRES_IN,
      cookieSecure: env.COOKIE_SECURE,
      bcryptRounds: env.BCRYPT_ROUNDS,
    },
    seedAdmin: {
      name: env.SEED_ADMIN_NAME,
      mobile: env.SEED_ADMIN_MOBILE,
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
    },
    runMigrationsOnStart: env.RUN_MIGRATIONS_ON_START,
    logLevel: env.LOG_LEVEL,
  };
}

export class ConfigError extends Error {}

/** Loads the env file into process.env (real env vars win) and validates. */
export function loadConfig(): Config {
  const envFile = process.env.ENV_FILE
    ? path.resolve(process.env.ENV_FILE)
    : path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false, quiet: true });
  } else if (process.env.ENV_FILE) {
    throw new ConfigError(`ENV_FILE points to ${envFile}, which does not exist.`);
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(
      `Invalid configuration (${envFile}):\n${lines.join('\n')}\n` +
        'See .env.example for every key and what it means.',
    );
  }
  return buildConfig(parsed.data);
}

let current: Config | undefined;

export function getConfig(): Config {
  if (!current) current = loadConfig();
  return current;
}
