/**
 * share.routes.ts
 *
 * POST   /documents/:id/share-tokens       — create a share token (owner only)
 * GET    /documents/:id/share-tokens       — list active tokens (owner only)
 * DELETE /documents/:id/share-tokens/:tid  — revoke a token (owner only)
 * GET    /shared/:token                    — PUBLIC — resolve token → doc
 */

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth.js";
import { shareService } from "./share.service.js";
import { createShareTokenSchema } from "../../schemas/share.schema.js";

export async function shareRoutes(app: FastifyInstance) {
  // Create token
  app.post<{ Params: { id: string } }>(
    "/documents/:id/share-tokens",
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = createShareTokenSchema.safeParse(request.body);
      if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

      const token = await shareService.createToken(
        request.params.id,
        request.user.userId,
        result.data.role,
        result.data.expiresIn,
      );
      if (!token) return reply.status(403).send({ error: "Only the document owner can create share links" });
      return reply.status(201).send(token);
    },
  );

  // List tokens
  app.get<{ Params: { id: string } }>(
    "/documents/:id/share-tokens",
    { preHandler: requireAuth },
    async (request, reply) => {
      const tokens = await shareService.listTokens(request.params.id, request.user.userId);
      if (!tokens) return reply.status(403).send({ error: "Only the document owner can list share links" });
      return reply.send(tokens);
    },
  );

  // Revoke token
  app.delete<{ Params: { id: string; tid: string } }>(
    "/documents/:id/share-tokens/:tid",
    { preHandler: requireAuth },
    async (request, reply) => {
      const revoked = await shareService.revokeToken(request.params.tid, request.user.userId);
      if (!revoked) return reply.status(404).send({ error: "Token not found or already revoked" });
      return reply.send({ message: "Token revoked" });
    },
  );

  // PUBLIC — resolve token (no auth required)
  app.get<{ Params: { token: string } }>(
    "/shared/:token",
    async (request, reply) => {
      const result = await shareService.resolveToken(request.params.token);
      if ("error" in result) {
        const status = result.error === "Token not found" ? 404 : 410;
        return reply.status(status).send({ error: result.error });
      }
      return reply.send(result);
    },
  );
}
