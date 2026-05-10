/**
 * user.service.ts
 *
 * User profile management and the "shared with me" document list.
 */

import { prisma } from "../../services/db/prisma.js";

export class UserService {
  /** Fetch a user's own profile. */
  async getProfile(userId: string) {
    return prisma.user.findUnique({
      where:  { id: userId },
      select: {
        id:        true,
        email:     true,
        name:      true,
        avatarUrl: true,
        bio:       true,
        createdAt: true,
      },
    });
  }

  /** Update name, bio, or avatarUrl. */
  async updateProfile(
    userId: string,
    data: { name?: string; bio?: string; avatarUrl?: string },
  ) {
    return prisma.user.update({
      where:  { id: userId },
      data,
      select: { id: true, email: true, name: true, avatarUrl: true, bio: true },
    });
  }

  /**
   * Documents shared WITH this user (where they are a collaborator, not owner).
   * This powers the "Shared with me" dashboard tab.
   */
  async sharedWithMe(userId: string) {
    const collabs = await prisma.documentCollaborator.findMany({
      where: { userId },
      include: {
        document: {
          select: {
            id:        true,
            title:     true,
            updatedAt: true,
            createdAt: true,
            user:      { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { document: { updatedAt: "desc" } },
    });

    return collabs.map((c) => ({
      ...c.document,
      role: c.role,
    }));
  }

  /** Look up a user by email (used by invite flow). */
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where:  { email },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
  }
}

export const userService = new UserService();
