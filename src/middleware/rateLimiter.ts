/**
 * src/middleware/rateLimiter.ts
 *
 * Two rate limiters:
 *   1. HTTP  — per IP, via @fastify/rate-limit plugin
 *   2. Socket — per socket, manual sliding window
 *
 * WHY RATE LIMIT?
 *   Without it, a single malicious client can:
 *   - Flood the DB with document:update events (thousands/sec)
 *   - DDoS your HTTP endpoints with POST /documents
 *   - Exhaust Redis pub/sub bandwidth
 *
 * ALGORITHM — Sliding Window Counter (for sockets):
 *   We keep a count of events in the last N milliseconds.
 *   Each event increments the counter.
 *   If counter > MAX, reject the event and warn the client.
 *   Counter resets after the window expires.
 *
 *   Simpler than Token Bucket but good enough for this use case.
 *   Token Bucket is better for bursty traffic — mention it as an upgrade.
 *
 * INTERVIEW TALKING POINT:
 *   "What's the difference between rate limiting and throttling?"
 *   Rate limiting: reject requests over the limit (return 429).
 *   Throttling: delay/queue requests over the limit instead of rejecting.
 *   Rate limiting protects the server. Throttling preserves the client's work.
 */

import type { FastifyInstance } from "fastify";
import type { Socket } from "socket.io";

// ── HTTP rate limiter ──────────────────────────────────────────────────────
// Uses @fastify/rate-limit — wraps Fastify's plugin system cleanly.

export async function registerHttpRateLimit(app: FastifyInstance): Promise<void> {
  // Dynamic import so the file compiles even if the plugin isn't installed yet
  const rateLimit = await import("@fastify/rate-limit");
  await app.register(rateLimit.default, {
    max: 100,           // 100 requests per window per IP
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) => ({
      error: "Too many requests",
      retryAfter: context.after,
    }),
  });
}

// ── Socket rate limiter (sliding window) ──────────────────────────────────

interface WindowState {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 1000;   // 1 second window
const MAX_EVENTS = 20;    // max 20 document:update events per second per socket

const windows = new Map<string, WindowState>();

export function socketRateLimiter(socket: Socket): (event: string) => boolean {
  /**
   * Returns true  → event is allowed
   * Returns false → event is rejected (caller should emit error and return)
   *
   * Usage in socket handler:
   *   if (!rateLimiter("document:update")) {
   *     socket.emit("error", { message: "Too many updates" });
   *     return;
   *   }
   */
  const key = socket.id;

  return function isAllowed(_event: string): boolean {
    const now = Date.now();
    const state = windows.get(key);

    if (!state || now - state.windowStart > WINDOW_MS) {
      // New window
      windows.set(key, { count: 1, windowStart: now });
      return true;
    }

    state.count++;

    if (state.count > MAX_EVENTS) {
      return false;
    }

    return true;
  };
}

// Clean up state when socket disconnects — prevent memory leak
export function cleanupRateLimiter(socketId: string): void {
  windows.delete(socketId);
}
