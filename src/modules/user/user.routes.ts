/**
 * user.routes.ts
 *
 * GET   /users/me          — own profile
 * PATCH /users/me          — update name / bio / avatarUrl
 * GET   /users/me/shared   — documents shared with me
 */

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth.js";
import { userService } from "./user.service.js";
import { updateProfileSchema } from "../../schemas/user.schema.js";

export async function userRoutes(app: FastifyInstance) {
  // Get own profile
  app.get(
    "/users/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const profile = await userService.getProfile(request.user.userId);
      if (!profile) return reply.status(404).send({ error: "User not found" });
      return reply.send(profile);
    },
  );

  // Update profile
  app.patch(
    "/users/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = updateProfileSchema.safeParse(request.body);
      if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

      const updated = await userService.updateProfile(request.user.userId, result.data);
      return reply.send(updated);
    },
  );

  // Documents shared with me
  app.get(
    "/users/me/shared",
    { preHandler: requireAuth },
    async (request, reply) => {
      const docs = await userService.sharedWithMe(request.user.userId);
      return reply.send(docs);
    },
  );
}
