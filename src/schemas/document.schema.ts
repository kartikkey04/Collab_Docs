/**
 * src/schemas/document.schema.ts
 *
 * Zod schemas for document-related inputs.
 *
 * WHY ZOD?
 *   TypeScript types only exist at compile time — they disappear at runtime.
 *   Zod validates data at runtime, so you can trust what arrives from the
 *   network is actually the shape you expect.
 *
 * PATTERN:
 *   Define the schema once → infer the TypeScript type from it.
 *   Never write the same shape twice (schema + separate interface).
 *
 * INTERVIEW TALKING POINT:
 *   "What happens without input validation?"
 *   A client sends { title: null } — your code does prisma.document.create({ data: { title: null } })
 *   and Postgres throws a constraint violation. Without validation you get
 *   a raw DB error leaking to the client. With Zod you get a clean 400
 *   with exactly which field failed and why.
 */

import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z
    .string({ required_error: "title is required" })
    .trim()
    .min(1, "title cannot be empty")
    .max(255, "title cannot exceed 255 characters"),
});

export const documentUpdateSocketSchema = z.object({
  documentId: z
    .string({ required_error: "documentId is required" })
    .uuid("documentId must be a valid UUID"),
  content: z
    .string({ required_error: "content is required" })
    .max(500_000, "content exceeds maximum size of 500KB"),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(255),
});

export const inviteCollaboratorSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["VIEWER", "EDITOR"]).default("EDITOR"),
});

export const documentJoinSocketSchema = z.string().uuid("documentId must be a valid UUID");

// Inferred types — use these instead of writing manual interfaces
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type DocumentUpdatePayload = z.infer<typeof documentUpdateSocketSchema>;
