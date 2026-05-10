/**
 * version.routes.ts
 *
 * GET  /documents/:id/versions            — list version history (no content)
 * GET  /documents/:id/versions/:vid       — fetch one version (full content)
 * POST /documents/:id/versions            — manually trigger a snapshot
 * POST /documents/:id/versions/:vid/restore — restore a specific version
 */

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth.js";
import { versionService } from "./version.service.js";

export async function versionRoutes(app: FastifyInstance) {
  // List versions
  app.get<{ Params: { id: string } }>(
    "/documents/:id/versions",
    { preHandler: requireAuth },
    async (request, reply) => {
      const versions = await versionService.list(request.params.id, request.user.userId);
      if (!versions) return reply.status(404).send({ error: "Document not found" });
      return reply.send(versions);
    },
  );

  // Get one version (full content for diff/preview)
  app.get<{ Params: { id: string; vid: string } }>(
    "/documents/:id/versions/:vid",
    { preHandler: requireAuth },
    async (request, reply) => {
      const version = await versionService.getOne(
        request.params.vid,
        request.params.id,
        request.user.userId,
      );
      if (!version) return reply.status(404).send({ error: "Version not found" });
      return reply.send(version);
    },
  );

  // Manual snapshot (called by the frontend "Save version" button)
  app.post<{ Params: { id: string } }>(
    "/documents/:id/versions",
    { preHandler: requireAuth },
    async (request, reply) => {
      await versionService.createSnapshot(request.params.id, request.user.userId);
      return reply.status(201).send({ message: "Snapshot created" });
    },
  );

  // Restore a version
  app.post<{ Params: { id: string; vid: string } }>(
    "/documents/:id/versions/:vid/restore",
    { preHandler: requireAuth },
    async (request, reply) => {
      const updated = await versionService.restore(
        request.params.vid,
        request.params.id,
        request.user.userId,
      );
      if (!updated) return reply.status(403).send({ error: "Cannot restore — no access or version not found" });
      return reply.send(updated);
    },
  );
}
