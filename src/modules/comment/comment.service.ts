/**
 * comment.service.ts
 *
 * Inline comment threads on documents.
 *
 * STRUCTURE:
 *   CommentThread — anchored to a document, optionally to a text selection.
 *     Each thread holds N Comment replies.
 *     Threads can be resolved (archived) or unresolved.
 *
 * SOFT DELETE:
 *   Comments are soft-deleted (deletedAt set) rather than hard-deleted
 *   so thread context is preserved ("This comment was deleted") rather
 *   than leaving orphaned replies.
 */

import { prisma } from "../../services/db/prisma.js";

// Shape of the selection JSON stored in CommentThread.selection
export interface TextSelection {
  from: number;
  to:   number;
  text: string;
}

export class CommentService {
  /**
   * Create a new comment thread (with the first comment as the opening message).
   * Any user with access to the document can start a thread.
   */
  async createThread(
    documentId: string,
    userId:     string,
    body:       string,
    selection?: TextSelection,
  ) {
    const canAccess = await this.canAccess(documentId, userId);
    if (!canAccess) return null;

    return prisma.commentThread.create({
      data: {
        documentId,
        userId,
        selection: selection ? JSON.stringify(selection) : undefined,
        comments: {
          create: { userId, body },
        },
      },
      include: {
        author:   { select: { id: true, name: true, avatarUrl: true } },
        comments: {
          where:   { deletedAt: null },
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /** Add a reply to an existing thread. */
  async addReply(threadId: string, userId: string, documentId: string, body: string) {
    const thread = await prisma.commentThread.findFirst({
      where: { id: threadId, documentId },
    });
    if (!thread) return null;

    const canAccess = await this.canAccess(documentId, userId);
    if (!canAccess) return null;

    return prisma.comment.create({
      data: { threadId, userId, body },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  /** Edit own comment body. */
  async editComment(commentId: string, userId: string, body: string) {
    const comment = await prisma.comment.findFirst({
      where: { id: commentId, userId, deletedAt: null },
    });
    if (!comment) return null;

    return prisma.comment.update({
      where: { id: commentId },
      data:  { body, editedAt: new Date() },
    });
  }

  /** Soft-delete a comment (own comment, or document owner). */
  async deleteComment(commentId: string, userId: string) {
    const comment = await prisma.comment.findUnique({
      where:   { id: commentId },
      include: { thread: { select: { documentId: true } } },
    });
    if (!comment || comment.deletedAt) return null;

    // Allow if own comment OR document owner
    const isOwner = await prisma.document.findFirst({
      where: { id: comment.thread.documentId, userId },
    });

    if (comment.userId !== userId && !isOwner) return null;

    return prisma.comment.update({
      where: { id: commentId },
      data:  { deletedAt: new Date() },
    });
  }

  /** Mark a thread as resolved. */
  async resolveThread(threadId: string, documentId: string, userId: string) {
    const canAccess = await this.canAccess(documentId, userId);
    if (!canAccess) return null;

    return prisma.commentThread.update({
      where: { id: threadId },
      data:  { resolvedAt: new Date(), resolvedBy: userId },
    });
  }

  /** Re-open a resolved thread. */
  async unresolveThread(threadId: string, documentId: string, userId: string) {
    const canAccess = await this.canAccess(documentId, userId);
    if (!canAccess) return null;

    return prisma.commentThread.update({
      where: { id: threadId },
      data:  { resolvedAt: null, resolvedBy: null },
    });
  }

  /** List all threads for a document (with comments, without deleted ones). */
  async listThreads(documentId: string, userId: string, includeResolved = false) {
    if (!(await this.canAccess(documentId, userId))) return null;

    return prisma.commentThread.findMany({
      where: {
        documentId,
        ...(includeResolved ? {} : { resolvedAt: null }),
      },
      orderBy: { createdAt: "asc" },
      include: {
        author:   { select: { id: true, name: true, avatarUrl: true } },
        comments: {
          where:   { deletedAt: null },
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  // ── Permission helper ─────────────────────────────────────────────────────

  private async canAccess(documentId: string, userId: string) {
    const doc = await prisma.document.findFirst({
      where: {
        id: documentId,
        OR: [{ userId }, { collaborators: { some: { userId } } }],
      },
    });
    return !!doc;
  }
}

export const commentService = new CommentService();
