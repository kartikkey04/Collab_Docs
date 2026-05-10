/**
 * src/middleware/auth.ts
 *
 * Authentication layer for both HTTP and WebSocket.
 *
 * WHY JWT?
 *   JWT (JSON Web Token) is stateless — the server doesn't need to look
 *   anything up to verify a token. The signature proves authenticity.
 *   Format: base64(header).base64(payload).signature
 *   We sign with a secret using HMAC-SHA256 (HS256).
 *
 * TWO SURFACES:
 *   1. HTTP  — a Fastify preHandler hook that runs before every protected route
 *   2. WebSocket — a Socket.IO middleware that runs before "connection" fires
 *
 * INTERVIEW TALKING POINT:
 *   "Why not sessions?"
 *   Sessions require server-side state (a session store). With multiple
 *   server instances, every server needs to share that store (Redis again).
 *   JWTs carry their own proof — any server can verify them independently.
 *
 *   "What's the tradeoff?"
 *   JWTs can't be revoked before they expire. If a token is stolen, it's
 *   valid until expiry. Mitigation: short expiry (15min) + refresh tokens.
 *   For this project, 7-day tokens are fine for a demo/portfolio piece.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { Socket } from "socket.io";
import { config } from "../config/env.js";

// ── Token shape ────────────────────────────────────────────────────────────

export interface TokenPayload {
  userId: string;
  email: string;
  iat: number; // issued at (unix seconds)
  exp: number; // expiry  (unix seconds)
}

// ── Core JWT logic (no library — shows you understand the format) ──────────

function base64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlDecode(str: string): string {
  // Pad back to standard base64 before decoding
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
}

export function signToken(payload: Omit<TokenPayload, "iat" | "exp">): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(
    JSON.stringify({ ...payload, iat: now, exp: now + config.jwtExpirySeconds })
  );
  const signature = createHmac("sha256", config.jwtSecret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): TokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const [header, body, signature] = parts;

  // Re-compute expected signature
  const expected = createHmac("sha256", config.jwtSecret)
    .update(`${header}.${body}`)
    .digest("base64url");

  // Timing-safe comparison prevents timing attacks
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(base64urlDecode(body)) as TokenPayload;

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return payload;
}

// ── HTTP middleware (Fastify preHandler) ───────────────────────────────────

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    // Attach user to request so route handlers can access it
    (request as FastifyRequest & { user: TokenPayload }).user = payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid token";
    return reply.status(401).send({ error: message });
  }
}

// ── WebSocket middleware (Socket.IO use()) ─────────────────────────────────
//
// Called before the "connection" event fires.
// If next() is called with an Error, the connection is refused.

export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): void {
  // Token comes from the client handshake: io({ auth: { token: "..." } })
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    const payload = verifyToken(token);
    // Attach user to socket data — accessible in all event handlers
    socket.data.user = payload;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid token";
    next(new Error(message));
  }
}
