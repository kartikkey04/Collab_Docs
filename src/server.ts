/**
 * src/server.ts — updated to register all new route modules.
 *
 * NEW REGISTRATIONS:
 *   versionRoutes, commentRoutes, shareRoutes,
 *   searchRoutes, aiRoutes, userRoutes, passwordResetRoutes
 */

import "dotenv/config";

import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";

import { config } from "./config/env.js";
import { pubClient, subClient, redisClient } from "./services/redis/redis.js";
import { prisma } from "./services/db/prisma.js";

// Routes
import { documentRoutes }    from "./modules/document/document.routes.js";
import { authRoutes, passwordResetRoutes } from "./modules/auth/auth.routes.js";
// Note: passwordResetRoutes exported from auth.routes.ts via the appended block
import { versionRoutes }     from "./modules/version/version.routes.js";
import { commentRoutes }     from "./modules/comment/comment.routes.js";
import { shareRoutes }       from "./modules/share/share.routes.js";
import { searchRoutes }      from "./modules/search/search.routes.js";
import { aiRoutes }          from "./modules/ai/ai.routes.js";
import { userRoutes }        from "./modules/user/user.routes.js";

// Socket
import { registerSocketHandlers } from "./modules/websocket/socket.handler.js";
import { socketAuthMiddleware }   from "./middleware/auth.js";
import { registerHttpRateLimit }  from "./middleware/rateLimiter.js";
import { registerErrorHandler }   from "./middleware/errorHandler.js";

async function bootstrap() {
  const app = Fastify({ logger: true });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      if (!body || (body as string).trim() === "") { done(null, {}); return; }
      try { done(null, JSON.parse(body as string)); } catch (err) { done(err as Error, undefined); }
    },
  );

  // ── Plugins ────────────────────────────────────────────────────────────────
  await app.register(cors, { origin: config.cors.origin });
  await registerHttpRateLimit(app);

  // ── Routes ─────────────────────────────────────────────────────────────────
  await app.register(authRoutes);
  await app.register(passwordResetRoutes);
  await app.register(documentRoutes);
  await app.register(versionRoutes);
  await app.register(commentRoutes);
  await app.register(shareRoutes);
  await app.register(searchRoutes);
  await app.register(aiRoutes);
  await app.register(userRoutes);

  // ── Error handler ──────────────────────────────────────────────────────────
  registerErrorHandler(app);

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  const io = new Server(app.server, {
    cors: { origin: config.cors.origin },
    maxHttpBufferSize: 1e6,
  });

  io.use(socketAuthMiddleware);
  io.on("connection", (socket) => registerSocketHandlers(io, socket));

  // ── Redis ──────────────────────────────────────────────────────────────────
  await pubClient.connect();
  await subClient.connect();
  await redisClient.connect();
  io.adapter(createAdapter(pubClient, subClient));
  app.log.info("Redis adapter connected");

  // ── Start ──────────────────────────────────────────────────────────────────
  await app.listen({ port: config.port, host: config.host });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal} — shutting down`);
    await app.close();
    await io.close();
    await pubClient.quit();
    await subClient.quit();
    await redisClient.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
