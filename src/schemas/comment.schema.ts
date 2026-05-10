import { z } from "zod";

const selectionSchema = z.object({
  from: z.number().int().nonnegative(),
  to:   z.number().int().nonnegative(),
  text: z.string().max(500),
}).optional();

export const createThreadSchema = z.object({
  body:      z.string().min(1).max(5000),
  selection: selectionSchema,
});

export const addReplySchema = z.object({
  body: z.string().min(1).max(5000),
});

export const editCommentSchema = z.object({
  body: z.string().min(1).max(5000),
});

// Socket schemas
export const commentCreateSocketSchema = z.object({
  documentId: z.string().uuid(),
  body:       z.string().min(1).max(5000),
  selection:  selectionSchema,
});

export const commentReplySocketSchema = z.object({
  documentId: z.string().uuid(),
  threadId:   z.string().uuid(),
  body:       z.string().min(1).max(5000),
});

export const commentResolveSocketSchema = z.object({
  documentId: z.string().uuid(),
  threadId:   z.string().uuid(),
});

export type CreateThreadInput  = z.infer<typeof createThreadSchema>;
export type AddReplyInput      = z.infer<typeof addReplySchema>;
