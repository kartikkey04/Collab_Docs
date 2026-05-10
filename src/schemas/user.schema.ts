import { z } from "zod";

export const updateProfileSchema = z.object({
  name:      z.string().trim().min(1).max(100).optional(),
  bio:       z.string().max(500).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
