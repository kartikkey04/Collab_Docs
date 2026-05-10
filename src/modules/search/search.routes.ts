/**
 * search.routes.ts
 *
 * GET /search?q=<query>[&limit=20]
 *
 * Full-text search across documents the user owns or collaborates on.
 * Returns ranked results with highlighted snippets.
 */

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth.js";
import { searchService } from "./search.service.js";

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    "/search",
    { preHandler: requireAuth },
    async (request, reply) => {
      const query = (request.query.q ?? "").trim();
      if (!query) return reply.send([]);

      const limit = Math.min(parseInt(request.query.limit ?? "20", 10), 50);
      const results = await searchService.search(request.user.userId, query, limit);
      return reply.send(results);
    },
  );
}
