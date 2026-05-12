/**
 * src/modules/auth/auth.routes.ts
 *
 * Exports two Fastify plugin functions:
 *   authRoutes          — POST /auth/register, POST /auth/login
 *   passwordResetRoutes — POST /auth/forgot-password, POST /auth/reset-password
 */

import type { FastifyInstance } from "fastify";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../../services/db/prisma.js";
import { signToken } from "../../middleware/auth.js";
import { loginSchema, registerSchema, googleAuthSchema, otpSendSchema, otpVerifySchema } from "../../schemas/auth.schema.js";
import { forgotPasswordSchema, resetPasswordSchema } from "../../schemas/password-reset.schema.js";
import { passwordResetService } from "./password-reset.service.js";
import { config } from "../../config/env.js";
import { redisClient } from "../../services/redis/redis.js";

const googleClient = new OAuth2Client(config.googleClientId);

// ── Password helpers ──────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const attempt = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(hash, "hex"), attempt);
}

// ── Auth routes ───────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const result = registerSchema.safeParse(request.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const { email, password, name } = result.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.status(409).send({ error: "Email already registered" });

    const user = await prisma.user.create({
      data: { email, name, passwordHash: hashPassword(password) },
    });

    const token = signToken({ userId: user.id, email: user.email });
    return reply.status(201).send({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post("/auth/login", async (request, reply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const { email, password } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });
    const passwordOk = user ? verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordOk) return reply.status(401).send({ error: "Invalid email or password" });

    const token = signToken({ userId: user.id, email: user.email });
    return reply.send({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post("/auth/otp/send", async (request, reply) => {
    const result = otpSendSchema.safeParse(request.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const { phoneNumber } = result.data;
    
    const cooldownKey = `otp:cooldown:${phoneNumber}`;
    const inCooldown = await redisClient.get(cooldownKey);
    if (inCooldown) {
      const ttl = await redisClient.ttl(cooldownKey);
      return reply.status(429).send({ error: `Please wait ${ttl}s before resending.` });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    await redisClient.setEx(`otp:code:${phoneNumber}`, 300, code);
    await redisClient.setEx(cooldownKey, 60, "true");
    await redisClient.del(`otp:attempts:${phoneNumber}`);

    console.log(`[OTP] Send ${code} to ${phoneNumber}`);
    return reply.send({ message: "OTP sent successfully" });
  });

  app.post("/auth/otp/verify", async (request, reply) => {
    const result = otpVerifySchema.safeParse(request.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const { phoneNumber, code } = result.data;
    
    const attemptsKey = `otp:attempts:${phoneNumber}`;
    const attempts = await redisClient.get(attemptsKey);
    if (attempts && parseInt(attempts, 10) >= 5) {
      return reply.status(403).send({ error: "Too many failed attempts. Try again later." });
    }

    const storedCode = await redisClient.get(`otp:code:${phoneNumber}`);

    if (!storedCode || storedCode !== code) {
      await redisClient.incr(attemptsKey);
      await redisClient.expire(attemptsKey, 300);
      return reply.status(400).send({ error: "Invalid or expired OTP" });
    }

    await redisClient.del(`otp:code:${phoneNumber}`);
    await redisClient.del(attemptsKey);

    let user = await prisma.user.findUnique({ where: { phoneNumber } });

    if (!user) {
      user = await prisma.user.create({
        data: { phoneNumber },
      });
    }

    const token = signToken({ userId: user.id, email: user.email || "" });
    return reply.send({ token, user: { id: user.id, email: user.email, name: user.name, phoneNumber: user.phoneNumber } });
  });

  app.post("/auth/google", async (request, reply) => {
    const result = googleAuthSchema.safeParse(request.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const { idToken } = result.data;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: config.googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new Error("Invalid token payload");

      const { sub: googleId, email, name, picture: avatarUrl } = payload;

      let user = await prisma.user.findUnique({ where: { googleId } });

      if (!user && email) {
        user = await prisma.user.findUnique({ where: { email } });
        if (user) {
          // Link googleId to existing email user
          user = await prisma.user.update({
            where: { id: user.id },
            data: { googleId, avatarUrl: user.avatarUrl || avatarUrl },
          });
        }
      }

      if (!user) {
        user = await prisma.user.create({
          data: { googleId, email, name, avatarUrl },
        });
      }

      const token = signToken({ userId: user.id, email: user.email || "" });
      return reply.send({ token, user: { id: user.id, email: user.email, name: user.name, googleId: user.googleId } });
    } catch (err) {
      return reply.status(401).send({ error: "Google authentication failed" });
    }
  });
}

// ── Password reset routes ─────────────────────────────────────────────────────

export async function passwordResetRoutes(app: FastifyInstance) {
  app.post("/auth/forgot-password", async (request, reply) => {
    const result = forgotPasswordSchema.safeParse(request.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    await passwordResetService.requestReset(result.data.email);
    return reply.send({ message: "If that email is registered, a reset link has been sent." });
  });

  app.post("/auth/reset-password", async (request, reply) => {
    const result = resetPasswordSchema.safeParse(request.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const ok = await passwordResetService.applyReset(result.data.token, result.data.password);
    if (!ok) return reply.status(400).send({ error: "Reset link is invalid, expired, or already used." });

    return reply.send({ message: "Password updated successfully." });
  });
}
