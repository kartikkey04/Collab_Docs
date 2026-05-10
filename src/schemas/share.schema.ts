import { z } from "zod";

export const createShareTokenSchema = z.object({
  role:      z.enum(["VIEWER", "EDITOR"]).default("VIEWER"),
  expiresIn: z.enum(["1h", "24h", "7d", "30d", "never"]).default("7d"),
});

export type CreateShareTokenInput = z.infer<typeof createShareTokenSchema>;
