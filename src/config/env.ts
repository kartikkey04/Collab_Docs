/**
 * src/config/env.ts — extended with new env vars.
 *
 * NEW:
 *   ANTHROPIC_API_KEY — required for AI writing assistant
 *   APP_BASE_URL      — used in password reset emails
 *   SMTP_*            — optional email config (nodemailer)
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optionalEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port:    parseInt(process.env.PORT ?? "5000", 10),
  host:    process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",

  databaseUrl: requireEnv("DATABASE_URL"),
  redisUrl:    process.env.REDIS_URL ?? "redis://localhost:6380",

  cors: {
    origin: process.env.CORS_ORIGIN ?? "*",
  },

  jwtSecret:        requireEnv("JWT_SECRET"),
  jwtExpirySeconds: parseInt(process.env.JWT_EXPIRY_SECONDS ?? "604800", 10),

  debounceMs: parseInt(process.env.DEBOUNCE_MS ?? "2000", 10),

  // AI writing assistant (Anthropic)
  anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY"),
  geminiApiKey: optionalEnv("GEMINI_API_KEY"),
  xaiApiKey: optionalEnv("XAI_API_KEY"),


  // Password reset emails
  appBaseUrl: optionalEnv("APP_BASE_URL", "http://localhost:5173"),
  smtpHost:   optionalEnv("SMTP_HOST"),
  smtpPort:   parseInt(optionalEnv("SMTP_PORT", "587"), 10),
  smtpUser:   optionalEnv("SMTP_USER"),
  smtpPass:   optionalEnv("SMTP_PASS"),
  smtpFrom:   optionalEnv("SMTP_FROM", "noreply@collabdocs.app"),
  googleClientId: optionalEnv("GOOGLE_CLIENT_ID"),
} as const;
