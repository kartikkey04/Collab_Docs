/**
 * src/modules/document/document.routes.ts
 *
 * HTTP routes for documents — thin handlers only.
 *
 * ALL routes (except /health and /) are protected by requireAuth.
 * The authenticated user is available as request.user on every handler.
 *
 * FLOW per request:
 *   1. requireAuth middleware runs → attaches request.user or returns 401
 *   2. Zod schema validates the body/params
 *   3. DocumentService does the DB work
 *   4. Handler sends the response
 */

import type { FastifyInstance } from "fastify";
import { documentService } from "./document.service.js";
import { prisma } from "../../services/db/prisma.js";
import { requireAuth, type TokenPayload } from "../../middleware/auth.js";
import { createDocumentSchema, updateDocumentSchema, inviteCollaboratorSchema } from "../../schemas/document.schema.js";

// Extend FastifyRequest to carry the authenticated user
declare module "fastify" {
  interface FastifyRequest {
    user: TokenPayload;
  }
}

export async function documentRoutes(app: FastifyInstance) {

  // ── Public routes (no auth) ────────────────────────────────────────────────

  // Deep health check — Kubernetes liveness/readiness probe hits this
  app.get("/health", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: "ok", db: "ok", ts: new Date().toISOString() });
    } catch {
      return reply.status(503).send({ status: "error", db: "unreachable" });
    }
  });

  app.get("/", async () => ({ message: "Collaborative docs API running" }));

  // ── Protected routes (requireAuth preHandler) ──────────────────────────────

  // POST /documents — create a new document
  app.post(
    "/documents",
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = createDocumentSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }

      const document = await documentService.create(result.data.title, request.user.userId);
      return reply.status(201).send(document);
    }
  );

  // GET /documents — list all documents for the authenticated user
  app.get(
    "/documents",
    { preHandler: requireAuth },
    async (request, reply) => {
      const documents = await documentService.listByUser(request.user.userId);
      return reply.send(documents);
    }
  );

// GET /documents/:id
app.get<{ Params: { id: string } }>(
  "/documents/:id",
  { preHandler: requireAuth },
  async (request, reply) => {
    // Use canAccess instead of findById so collaborators can open the doc
    const allowed = await documentService.canAccess(
      request.params.id,
      request.user.userId
    );
    if (!allowed) {
      return reply.status(404).send({ error: "Document not found" });
    }

    const document = await prisma.document.findUnique({
      where: { id: request.params.id },
    });
    return reply.send(document);
  }
);

  app.patch<{ Params: { id: string } }>(
    "/documents/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = updateDocumentSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: result.error.flatten() });
      }
  
      const updated = await documentService.updateTitle(
        request.params.id,
        request.user.userId,
        result.data.title,
      );
  
      if (!updated) {
        return reply.status(404).send({ error: "Document not found" });
      }
  
      return reply.send(updated);
    },
  );

  // DELETE /documents/:id — only the owner can delete
app.delete<{ Params: { id: string } }>(
  "/documents/:id",
  { preHandler: requireAuth },
  async (request, reply) => {
    const deleted = await documentService.delete(
      request.params.id,
      request.user.userId
    );

    if (!deleted) {
      return reply.status(404).send({ error: "Document not found" });
    }

    return reply.status(200).send({ message: "Document deleted" });
  }
);

// GET /documents/:id/collaborators — list all collaborators
app.get<{ Params: { id: string } }>(
  "/documents/:id/collaborators",
  { preHandler: requireAuth },
  async (request, reply) => {
    const collaborators = await documentService.listCollaborators(
      request.params.id,
      request.user.userId
    );
    if (!collaborators) {
      return reply.status(404).send({ error: "Document not found" });
    }
    return reply.send(collaborators);
  }
);

// POST /documents/:id/collaborators — invite by email
app.post<{ Params: { id: string } }>(
  "/documents/:id/collaborators",
  { preHandler: requireAuth },
  async (request, reply) => {
    const result = inviteCollaboratorSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() });
    }

    const res = await documentService.addCollaborator(
      request.params.id,
      request.user.userId,
      result.data.email,
      result.data.role
    );

    if (!res) return reply.status(403).send({ error: "Only the document owner can invite collaborators" });
    if ("error" in res) return reply.status(404).send({ error: res.error });

    return reply.status(201).send(res);
  }
);

// DELETE /documents/:id/collaborators/:userId — remove a collaborator
app.delete<{ Params: { id: string; collaboratorId: string } }>(
  "/documents/:id/collaborators/:collaboratorId",
  { preHandler: requireAuth },
  async (request, reply) => {
    const removed = await documentService.removeCollaborator(
      request.params.id,
      request.user.userId,
      request.params.collaboratorId
    );
    if (!removed) return reply.status(403).send({ error: "Not authorized" });
    return reply.send({ message: "Collaborator removed" });
  }
);
}
