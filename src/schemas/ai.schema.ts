import { z } from "zod";

export const aiActionSchema = z.object({
  documentId: z.string().uuid(),
  action:     z.enum(["rewrite", "summarise", "autocomplete", "fix_grammar"]),
  selection:  z.string().min(1).max(10_000),
  instruction: z.string().max(500).optional(),
});

export type AiActionInput = z.infer<typeof aiActionSchema>;
