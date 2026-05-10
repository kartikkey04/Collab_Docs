/**
 * version.service.ts
 *
 * Document version history — snapshot-based.
 *
 * STRATEGY:
 *   Snapshots are created:
 *   (a) automatically after every debounced DB save (called by presence.service)
 *   (b) explicitly when a user triggers a restore
 *   NOT on every keystroke — that's what the live socket handles.
 *
 * RETENTION:
 *   Keep the last MAX_VERSIONS snapshots per document.
 *   Pruning runs inside the same transaction as the new snapshot insert.
 */

import { prisma } from "../../services/db/prisma.js";

const MAX_VERSIONS = 50;

export class VersionService {
  /**
   * Create a snapshot of the document's current state.
   * Safe to call multiple times — idempotent from the user's perspective.
   */
  async createSnapshot(documentId: string, userId: string): Promise<void> {
    const doc = await prisma.document.findUnique({
      where:  { id: documentId },
      select: { content: true, title: true },
    });
    if (!doc) return;

    await prisma.$transaction(async (tx) => {
      await tx.documentVersion.create({
        data: { documentId, content: doc.content, title: doc.title, createdBy: userId },
      });

      // Prune old versions — keep only the most recent MAX_VERSIONS
      const old = await tx.documentVersion.findMany({
        where:   { documentId },
        orderBy: { createdAt: "desc" },
        skip:    MAX_VERSIONS,
        select:  { id: true },
      });
      if (old.length > 0) {
        await tx.documentVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } });
      }
    });
  }

  /** List versions (summary only — no content) for the sidebar. */
  async list(documentId: string, userId: string) {
    if (!(await this.canAccess(documentId, userId))) return null;
    return prisma.documentVersion.findMany({
      where:   { documentId },
      orderBy: { createdAt: "desc" },
      select: {
        id:        true,
        title:     true,
        createdAt: true,
        creator:   { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  /** Fetch full content of one version (for preview/diff). */
  async getOne(versionId: string, documentId: string, userId: string) {
    if (!(await this.canAccess(documentId, userId))) return null;
    return prisma.documentVersion.findFirst({ where: { id: versionId, documentId } });
  }

  /**
   * Restore a version.
   * Pre-restore state is snapshotted first so the user can undo the restore.
   */
  async restore(versionId: string, documentId: string, userId: string) {
    if (!(await this.canEdit(documentId, userId))) return null;

    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
    });
    if (!version) return null;

    // Snapshot current state before overwriting
    await this.createSnapshot(documentId, userId);

    return prisma.document.update({
      where: { id: documentId },
      data:  { content: version.content, title: version.title },
    });
  }

  // ── Permission helpers ────────────────────────────────────────────────────

  private async canAccess(documentId: string, userId: string) {
    const doc = await prisma.document.findFirst({
      where: {
        id: documentId,
        OR: [{ userId }, { collaborators: { some: { userId } } }],
      },
    });
    return !!doc;
  }

  private async canEdit(documentId: string, userId: string) {
    const doc = await prisma.document.findFirst({
      where: {
        id: documentId,
        OR: [{ userId }, { collaborators: { some: { userId, role: "EDITOR" } } }],
      },
    });
    return !!doc;
  }
}

export const versionService = new VersionService();
