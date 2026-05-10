import { z } from "zod";

export const restoreVersionSchema = z.object({
  versionId: z.string().uuid("versionId must be a UUID"),
});

export type RestoreVersionInput = z.infer<typeof restoreVersionSchema>;
