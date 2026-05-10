/**
 * ai.routes.ts
 *
 * POST /ai/action — stream AI writing assistance via Server-Sent Events.
 *
 * REQUEST BODY:
 *   { documentId, action, selection, instruction? }
 *
 * RESPONSE:
 *   Content-Type: text/event-stream
 *   Each chunk: "data: <text>\n\n"
 *   End:         "data: [DONE]\n\n"
 *   Error:       "event: error\ndata: <message>\n\n"
 *
 * CLIENT USAGE:
 *   const es = new EventSource(...)  — not applicable for POST.
 *   Use fetch() + ReadableStream reader instead (see frontend ai.ts).
 *
 * PERMISSION:
 *   User must have access to the document (owner or collaborator).
 *   The document check happens before the Anthropic call starts.
 */

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth.js";
import { streamAiAction } from "./ai.service.js";
import { aiActionSchema } from "../../schemas/ai.schema.js";
import { prisma } from "../../services/db/prisma.js";

export async function aiRoutes(app: FastifyInstance) {
  app.post(
    "/ai/action",
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = aiActionSchema.safeParse(request.body);
      if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

      const { documentId, action, selection, instruction } = result.data;
      const userId = request.user.userId;

      // Check document access before touching Anthropic API
      const doc = await prisma.document.findFirst({
        where: {
          id: documentId,
          OR: [
            { userId },
            { collaborators: { some: { userId } } },
          ],
        },
      });
      if (!doc) return reply.status(404).send({ error: "Document not found" });

      // Set SSE headers
      reply.raw.writeHead(200, {
        "Content-Type":  "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection":    "keep-alive",
        // Allow cross-origin SSE
        "Access-Control-Allow-Origin": request.headers.origin ?? "*",
      });

      try {
        for await (const chunk of streamAiAction(action, selection, instruction)) {
          // SSE format
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        reply.raw.write("data: [DONE]\n\n");
      } catch (err) {
        const message = err instanceof Error ? err.message : "AI service error";
        reply.raw.write(`event: error\ndata: ${JSON.stringify(message)}\n\n`);
      } finally {
        reply.raw.end();
      }
    },
  );
}
