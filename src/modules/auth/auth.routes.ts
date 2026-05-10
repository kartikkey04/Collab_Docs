/**
 * src/modules/auth/auth.routes.ts
 *
 * Exports two Fastify plugin functions:
 *   authRoutes          — POST /auth/register, POST /auth/login
 *   passwordResetRoutes — POST /auth/forgot-password, POST /auth/reset-password
 */

import type { FastifyInstance } from "fastify";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "../../services/db/prisma.js";
import { signToken } from "../../middleware/auth.js";
import { loginSchema, registerSchema } from "../../schemas/auth.schema.js";
import { forgotPasswordSchema, resetPasswordSchema } from "../../schemas/password-reset.schema.js";
import { passwordResetService } from "./password-reset.service.js";

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
