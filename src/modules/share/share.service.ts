/**
 * share.service.ts
 *
 * Public share-link tokens.
 *
 * FLOW:
 *   1. Owner creates a ShareToken → gets a URL like /shared/<uuid>
 *   2. Anyone (authed or not) hits GET /shared/:token
 *   3. If token is valid and not expired/revoked, they get the document content
 *      at the specified role (VIEWER = read-only, EDITOR = writable)
 *
 * SECURITY:
 *   - Tokens are UUIDs (128 bits of entropy) — not guessable
 *   - Optional expiry window
 *   - Individual revocation
 *   - Only document owners can create/revoke tokens
 */

import { prisma } from "../../services/db/prisma.js";

const EXPIRY_MAP: Record<string, number | null> = {
  "1h":    60 * 60 * 1000,
  "24h":   24 * 60 * 60 * 1000,
  "7d":    7  * 24 * 60 * 60 * 1000,
  "30d":   30 * 24 * 60 * 60 * 1000,
  "never": null,
};

export class ShareService {
  /** Create a new share token. Only the document owner can call this. */
  async createToken(
    documentId: string,
    ownerUserId: string,
    role: "VIEWER" | "EDITOR",
    expiresIn: "1h" | "24h" | "7d" | "30d" | "never",
  ) {
    // Only owner can create share tokens
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId: ownerUserId },
    });
    if (!doc) return null;

    const msUntilExpiry = EXPIRY_MAP[expiresIn] ?? null;
    const expiresAt = msUntilExpiry ? new Date(Date.now() + msUntilExpiry) : null;

    return prisma.shareToken.create({
      data: {
        documentId,
        role,
        expiresAt,
        createdBy: ownerUserId,
      },
    });
  }

  /** List all active (non-revoked) tokens for a document. */
  async listTokens(documentId: string, ownerUserId: string) {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId: ownerUserId },
    });
    if (!doc) return null;

    return prisma.shareToken.findMany({
      where:   { documentId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id:        true,
        token:     true,
        role:      true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  /** Revoke a specific share token. Only owner can revoke. */
  async revokeToken(tokenId: string, ownerUserId: string) {
    const shareToken = await prisma.shareToken.findFirst({
      where:   { id: tokenId, createdBy: ownerUserId, revokedAt: null },
    });
    if (!shareToken) return null;

    return prisma.shareToken.update({
      where: { id: tokenId },
      data:  { revokedAt: new Date() },
    });
  }

  /**
   * Resolve a share token — validates it and returns the document.
   * Called on the PUBLIC /shared/:token route (no auth required).
   */
  async resolveToken(token: string) {
    const shareToken = await prisma.shareToken.findUnique({
      where:   { token },
      include: {
        document: {
          select: { id: true, title: true, content: true, updatedAt: true },
        },
      },
    });

    if (!shareToken) return { error: "Token not found" as const };
    if (shareToken.revokedAt) return { error: "Token revoked" as const };
    if (shareToken.expiresAt && shareToken.expiresAt < new Date()) {
      return { error: "Token expired" as const };
    }

    return {
      document: shareToken.document,
      role:     shareToken.role,
    };
  }
}

export const shareService = new ShareService();
