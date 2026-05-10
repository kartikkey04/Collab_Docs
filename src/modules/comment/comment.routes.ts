/**
 * comment.routes.ts
 *
 * GET    /documents/:id/threads                     — list threads (open only)
 * GET    /documents/:id/threads?includeResolved=true — include resolved
 * POST   /documents/:id/threads                     — create thread + opening comment
 * POST   /documents/:id/threads/:tid/replies        — add reply
 * PATCH  /documents/:id/threads/:tid/resolve        — resolve thread
 * PATCH  /documents/:id/threads/:tid/unresolve      — reopen thread
 * PATCH  /comments/:cid                             — edit own comment
 * DELETE /comments/:cid                             — soft-delete comment
 */

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth.js";
import { commentService } from "./comment.service.js";
import { createThreadSchema, addReplySchema, editCommentSchema } from "../../schemas/comment.schema.js";

export async function commentRoutes(app: FastifyInstance) {
  // List threads
  app.get<{ Params: { id: string }; Querystring: { includeResolved?: string } }>(
    "/documents/:id/threads",
    { preHandler: requireAuth },
    async (request, reply) => {
      const includeResolved = request.query.includeResolved === "true";
      const threads = await commentService.listThreads(
        request.params.id,
        request.user.userId,
        includeResolved,
      );
      if (!threads) return reply.status(404).send({ error: "Document not found" });
      return reply.send(threads);
    },
  );

  // Create thread
  app.post<{ Params: { id: string } }>(
    "/documents/:id/threads",
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = createThreadSchema.safeParse(request.body);
      if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

      const thread = await commentService.createThread(
        request.params.id,
        request.user.userId,
        result.data.body,
        result.data.selection,
      );
      if (!thread) return reply.status(403).send({ error: "Access denied" });
      return reply.status(201).send(thread);
    },
  );

  // Add reply
  app.post<{ Params: { id: string; tid: string } }>(
    "/documents/:id/threads/:tid/replies",
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = addReplySchema.safeParse(request.body);
      if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

      const comment = await commentService.addReply(
        request.params.tid,
        request.user.userId,
        request.params.id,
        result.data.body,
      );
      if (!comment) return reply.status(404).send({ error: "Thread not found" });
      return reply.status(201).send(comment);
    },
  );

  // Resolve thread
  app.patch<{ Params: { id: string; tid: string } }>(
    "/documents/:id/threads/:tid/resolve",
    { preHandler: requireAuth },
    async (request, reply) => {
      const thread = await commentService.resolveThread(
        request.params.tid,
        request.params.id,
        request.user.userId,
      );
      if (!thread) return reply.status(404).send({ error: "Thread not found" });
      return reply.send(thread);
    },
  );

  // Unresolve thread
  app.patch<{ Params: { id: string; tid: string } }>(
    "/documents/:id/threads/:tid/unresolve",
    { preHandler: requireAuth },
    async (request, reply) => {
      const thread = await commentService.unresolveThread(
        request.params.tid,
        request.params.id,
        request.user.userId,
      );
      if (!thread) return reply.status(404).send({ error: "Thread not found" });
      return reply.send(thread);
    },
  );

  // Edit comment
  app.patch<{ Params: { cid: string } }>(
    "/comments/:cid",
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = editCommentSchema.safeParse(request.body);
      if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

      const comment = await commentService.editComment(
        request.params.cid,
        request.user.userId,
        result.data.body,
      );
      if (!comment) return reply.status(404).send({ error: "Comment not found or not yours" });
      return reply.send(comment);
    },
  );

  // Soft-delete comment
  app.delete<{ Params: { cid: string } }>(
    "/comments/:cid",
    { preHandler: requireAuth },
    async (request, reply) => {
      const comment = await commentService.deleteComment(request.params.cid, request.user.userId);
      if (!comment) return reply.status(404).send({ error: "Comment not found or not authorized" });
      return reply.send({ message: "Comment deleted" });
    },
  );
}
