/**
 * src/services/db/prisma.ts
 *
 * Exports a single PrismaClient instance (singleton pattern).
 * Never instantiate PrismaClient more than once — it opens a connection pool.
 * This file is the only place that should touch PrismaClient directly.
 */

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["error"],
});
