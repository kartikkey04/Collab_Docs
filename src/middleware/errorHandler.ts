/**
 * src/middleware/errorHandler.ts
 *
 * Global error handler registered on the Fastify instance.
 *
 * WHY A GLOBAL HANDLER?
 *   Without it, unhandled async errors in route handlers crash the request
 *   or worse — Fastify returns a raw 500 with the full stack trace exposed
 *   to the client. Stack traces reveal internal paths, library versions,
 *   and code structure — a security risk.
 *
 * WHAT IT DOES:
 *   1. Catches all errors that bubble up from route handlers
 *   2. Maps known error types (Zod, Prisma) to clean HTTP responses
 *   3. Logs the full error internally (stack trace goes to your logs)
 *   4. Returns a safe, structured JSON error to the client
 *
 * INTERVIEW TALKING POINT:
 *   "What is the difference between a 4xx and 5xx error?"
 *   4xx = client's fault (bad input, not authenticated, not found).
 *         The client can fix it by changing their request.
 *   5xx = server's fault (DB down, bug in code, OOM).
 *         The client cannot fix it — they should retry later.
 *   Never return a 5xx for bad user input, and never return a 4xx
 *   for a server-side failure.
 *
 *   "What is error leakage?"
 *   Returning internal details (stack traces, SQL queries, file paths)
 *   in error responses. Attackers use this information to craft
 *   targeted exploits. Always log internally, respond minimally.
 */

import type { FastifyInstance, FastifyError } from "fastify";
import type { ZodError } from "zod";

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError | Error, request, reply) => {
      // Log the real error internally (full stack trace)
      app.log.error({ err: error, url: request.url, method: request.method }, "Request error");

      // ── Zod validation errors ────────────────────────────────────────────
      if (error.name === "ZodError") {
        const zodError = error as unknown as ZodError;
        const response: ErrorResponse = {
          statusCode: 400,
          error: "Validation Error",
          message: "Request validation failed",
          details: zodError.flatten(),
        };
        return reply.status(400).send(response);
      }

      // ── Fastify validation errors (JSON schema) ──────────────────────────
      if ("validation" in error && error.validation) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: error.message,
        });
      }

      // ── Prisma known errors ──────────────────────────────────────────────
      // P2002 = unique constraint violation
      if ("code" in error && error.code === "P2002") {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "A record with that value already exists",
        });
      }
      // P2025 = record not found (on update/delete)
      if ("code" in error && error.code === "P2025") {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Record not found",
        });
      }

      // ── HTTP errors with known status codes ──────────────────────────────
      const statusCode = ("statusCode" in error && typeof error.statusCode === "number")
        ? error.statusCode
        : 500;

      if (statusCode < 500) {
        return reply.status(statusCode).send({
          statusCode,
          error: error.name ?? "Error",
          message: error.message,
        });
      }

      // ── Generic 500 — never leak internal details ────────────────────────
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "An unexpected error occurred",
        // No stack trace, no internal message — those are in the logs
      });
    }
  );

  // Handle unhandled promise rejections (shouldn't happen, but safety net)
  process.on("unhandledRejection", (reason) => {
    app.log.error({ reason }, "Unhandled promise rejection");
  });

  process.on("uncaughtException", (err) => {
    app.log.error({ err }, "Uncaught exception — shutting down");
    process.exit(1);
  });
}
