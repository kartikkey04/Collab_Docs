/**
 * socket.handler.ts — extended with comment events and version snapshots.
 *
 * NEW EVENTS:
 *   comment:create  — broadcast new thread to all users in room
 *   comment:reply   — broadcast new reply to all users in room
 *   comment:resolve — broadcast thread resolution
 *
 * EXISTING EVENTS (unchanged in behaviour):
 *   document:join, document:update, disconnect
 *
 * VERSION SNAPSHOT:
 *   presenceService.scheduleSave() now calls versionService.createSnapshot()
 *   after persisting to DB (see presence.service.ts).
 */

import type { Server, Socket } from "socket.io";
import { presenceService } from "./presence.service.js";
import { socketRateLimiter, cleanupRateLimiter } from "../../middleware/rateLimiter.js";
import {
  documentUpdateSocketSchema,
  documentJoinSocketSchema,
} from "../../schemas/document.schema.js";
import {
  commentCreateSocketSchema,
  commentReplySocketSchema,
  commentResolveSocketSchema,
} from "../../schemas/comment.schema.js";
import type { TokenPayload } from "../../middleware/auth.js";
import { documentService } from "../document/document.service.js";
import { commentService } from "../comment/comment.service.js";

declare module "socket.io" {
  interface SocketData {
    user:  TokenPayload;
    rooms: Set<string>;
  }
}

export function registerSocketHandlers(io: Server, socket: Socket): void {
  const { userId, email } = socket.data.user;
  const displayName = email.split("@")[0];
  const rateLimiter = socketRateLimiter(socket);

  socket.data.rooms = new Set<string>();

  console.log(`[Socket] Connected: ${socket.id} (user: ${email})`);

  // ── document:join ─────────────────────────────────────────────────────────
  socket.on("document:join", async (payload: unknown) => {
    const result = documentJoinSocketSchema.safeParse(payload);
    if (!result.success) {
      socket.emit("error", { message: "Invalid documentId — must be a UUID" });
      return;
    }

    const documentId = result.data;

    const allowed = await documentService.canAccess(documentId, userId);
    if (!allowed) {
      socket.emit("error", { message: "Access denied" });
      return;
    }

    socket.join(documentId);
    socket.data.rooms.add(documentId);

    const users = await presenceService.join(documentId, socket.id, userId, displayName);
    io.to(documentId).emit("presence:update", users);
  });

  // ── document:update ───────────────────────────────────────────────────────
  socket.on("document:update", async (payload: unknown) => {
    if (!rateLimiter("document:update")) {
      socket.emit("error", { message: "Too many updates — slow down" });
      return;
    }

    const result = documentUpdateSocketSchema.safeParse(payload);
    if (!result.success) {
      socket.emit("error", { message: "Invalid payload", details: result.error.flatten() });
      return;
    }

    const { documentId, content } = result.data;

    // Broadcast to everyone else immediately (low-latency path)
    socket.to(documentId).emit("document:receive", content);

    // Debounced DB persist (presence service handles the timer)
    presenceService.scheduleSave(documentId, content, userId);
  });

  // ── comment:create ────────────────────────────────────────────────────────
  socket.on("comment:create", async (payload: unknown) => {
    if (!rateLimiter("comment:create")) {
      socket.emit("error", { message: "Too many requests" });
      return;
    }

    const result = commentCreateSocketSchema.safeParse(payload);
    if (!result.success) {
      socket.emit("error", { message: "Invalid comment payload" });
      return;
    }

    const { documentId, body, selection } = result.data;

    const thread = await commentService.createThread(documentId, userId, body, selection);
if (!thread) {
  socket.emit("error", { message: "Could not create comment" });
  return;
}

// Re-fetch with full author info so frontend gets populated user objects
const threads = await commentService.listThreads(documentId, userId);
io.to(documentId).emit("comment:new_thread", thread);
io.to(documentId).emit("comments:refresh", threads);
  });

  // ── comment:reply ─────────────────────────────────────────────────────────
  socket.on("comment:reply", async (payload: unknown) => {
    if (!rateLimiter("comment:reply")) {
      socket.emit("error", { message: "Too many requests" });
      return;
    }

    const result = commentReplySocketSchema.safeParse(payload);
    if (!result.success) {
      socket.emit("error", { message: "Invalid reply payload" });
      return;
    }

    const { documentId, threadId, body } = result.data;

    const comment = await commentService.addReply(threadId, userId, documentId, body);
    if (!comment) {
      socket.emit("error", { message: "Thread not found or no access" });
      return;
    }

    const threads = await commentService.listThreads(documentId, userId);
    io.to(documentId).emit("comment:new_reply", { threadId, comment });
    io.to(documentId).emit("comments:refresh", threads);
  });

  // ── comment:resolve ───────────────────────────────────────────────────────
  socket.on("comment:resolve", async (payload: unknown) => {
    const result = commentResolveSocketSchema.safeParse(payload);
    if (!result.success) {
      socket.emit("error", { message: "Invalid resolve payload" });
      return;
    }

    const { documentId, threadId } = result.data;
    const thread = await commentService.resolveThread(threadId, documentId, userId);
    if (!thread) {
      socket.emit("error", { message: "Thread not found or no access" });
      return;
    }

    io.to(documentId).emit("comment:resolved", { threadId, resolvedBy: userId });
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", async () => {
    const joinedRooms: string[] = Array.from(socket.data.rooms ?? new Set<string>());
    const affectedRooms = await presenceService.leave(socket.id, joinedRooms);

    for (const [documentId, users] of affectedRooms.entries()) {
      io.to(documentId).emit("presence:update", users);
    }

    cleanupRateLimiter(socket.id);
    console.log(`[Socket] Disconnected: ${socket.id} (user: ${email})`);
  });
}
