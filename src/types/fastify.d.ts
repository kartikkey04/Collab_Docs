/**
 * src/types/fastify.d.ts
 *
 * Augments Fastify's Request interface so `request.user` is typed everywhere
 * without needing to cast `request as FastifyRequest & { user: TokenPayload }`.
 */

import type { TokenPayload } from "../middleware/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user: TokenPayload;
  }
}
