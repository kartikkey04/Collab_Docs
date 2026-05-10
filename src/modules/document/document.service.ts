/**
 * src/modules/document/document.service.ts
 *
 * All document-related database operations.
 * No knowledge of HTTP, WebSocket, or request/response — pure business logic.
 *
 * METHODS:
 *   create(title, userId)         — new doc owned by authenticated user
 *   findById(id, userId)          — fetch doc, verify ownership
 *   listByUser(userId)            — all docs for a user, recent first
 *   updateContent(id, content)    — called by debounced save (no auth check
 *                                   needed — auth happened at join time)
 *
 * INTERVIEW TALKING POINT — "Why check userId in findById?"
 *   Without it, any authenticated user can GET /documents/:id for any
 *   document they know the UUID of. Even though UUIDs are hard to guess,
 *   security through obscurity is not security. Always enforce ownership
 *   at the data layer, not just the route layer.
 */

import { prisma } from "../../services/db/prisma.js";

export class DocumentService {
  async create(title: string, userId: string) {
    return prisma.document.create({
      data: { title, content: "", userId },
      select: { id: true, title: true, createdAt: true, userId: true },
    });
  }

  async findById(id: string, userId: string) {
    return prisma.document.findFirst({
      where: { id, userId }, // ownership enforced here
    });
  }

  async listByUser(userId: string) {
    return prisma.document.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true, createdAt: true },
    });
  }

  async updateContent(id: string, content: string) {
    return prisma.document.update({
      where: { id },
      data: { content },
    });
  }

  async updateTitle(id: string, userId: string, title: string) {
    const result = await prisma.document.updateMany({
      where: { id, userId },    
      data: { title },
    });
    if (result.count === 0) return null;
    return prisma.document.findUnique({ where: { id } });
  }

  async delete(id: string, userId: string) {
    const doc = await prisma.document.findFirst({ where: { id, userId } });
    if (!doc) return null;
    return prisma.document.delete({ where: { id } });
  }

  // Check if user can access a document (owner OR collaborator)
async canAccess(documentId: string, userId: string): Promise<boolean> {
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      OR: [
        { userId },                                          // owner
        { collaborators: { some: { userId } } },            // collaborator
      ],
    },
  });
  return !!doc;
}

// Check if user can edit (owner OR editor-role collaborator)
async canEdit(documentId: string, userId: string): Promise<boolean> {
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      OR: [
        { userId },
        { collaborators: { some: { userId, role: "EDITOR" } } },
      ],
    },
  });
  return !!doc;
}

// Add a collaborator by email
async addCollaborator(documentId: string, ownerUserId: string, email: string, role: "VIEWER" | "EDITOR") {
  // Only the owner can invite
  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId: ownerUserId },
  });
  if (!doc) return null;

  // Find the user to invite
  const invitee = await prisma.user.findUnique({ where: { email } });
  if (!invitee) return { error: "No account found with that email" };

  // Upsert — update role if already a collaborator
  const collaborator = await prisma.documentCollaborator.upsert({
    where: { documentId_userId: { documentId, userId: invitee.id } },
    update: { role },
    create: { documentId, userId: invitee.id, role },
  });

  return { collaborator, user: { id: invitee.id, name: invitee.name, email: invitee.email } };
}

// List collaborators for a document
async listCollaborators(documentId: string, userId: string) {
  const hasAccess = await this.canAccess(documentId, userId);
  if (!hasAccess) return null;

  return prisma.documentCollaborator.findMany({
    where: { documentId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

// Remove a collaborator (owner only)
async removeCollaborator(documentId: string, ownerUserId: string, collaboratorUserId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId: ownerUserId },
  });
  if (!doc) return null;

  return prisma.documentCollaborator.delete({
    where: { documentId_userId: { documentId, userId: collaboratorUserId } },
  });
}
}

export const documentService = new DocumentService();
