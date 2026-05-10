/**
 * presence.service.ts — extended to trigger version snapshots after DB persist.
 *
 * CHANGE: scheduleSave() now accepts userId and calls versionService.createSnapshot()
 * after a successful document persist. This means every debounced save
 * automatically creates a version snapshot — no manual trigger needed.
 */

import { pubClient } from "../../services/redis/redis.js";
import { config } from "../../config/env.js";
import { documentService } from "../document/document.service.js";
import { versionService } from "../version/version.service.js";

const PRESENCE_TTL_SECONDS = 60;

export interface PresenceUser {
  socketId: string;
  userId:   string;
  name:     string;
  color:    string;
}

const COLORS = ["#6366f1","#ec4899","#14b8a6","#f59e0b","#10b981","#3b82f6","#f97316"];

function colorForUser(userId: string): string {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function presenceKey(documentId: string): string {
  return `presence:${documentId}`;
}

export class PresenceService {
  private pendingSaves = new Map<string, NodeJS.Timeout>();

  async join(documentId: string, socketId: string, userId: string, name: string): Promise<PresenceUser[]> {
    const user: PresenceUser = { socketId, userId, name, color: colorForUser(userId) };
    // Store by userId — so same user never appears twice regardless of reconnects
    await pubClient.hSet(presenceKey(documentId), userId, JSON.stringify(user));
    await pubClient.persist(presenceKey(documentId));
    return this.getUsers(documentId);
  }
  
  async leave(socketId: string, documentIds: string[]): Promise<Map<string, PresenceUser[]>> {
    const affected = new Map<string, PresenceUser[]>();
    for (const documentId of documentIds) {
      const key = presenceKey(documentId);
      const all = await pubClient.hGetAll(key);
  
      // Find and remove the entry that belongs to this socketId
      for (const [field, value] of Object.entries(all)) {
        const user = JSON.parse(value) as PresenceUser;
        if (user.socketId === socketId) {
          await pubClient.hDel(key, field);
          break;
        }
      }
  
      const remaining = await this.getUsers(documentId);
      affected.set(documentId, remaining);
      if (remaining.length === 0) {
        await pubClient.expire(key, PRESENCE_TTL_SECONDS);
      }
    }
    return affected;
  }

  async getUsers(documentId: string): Promise<PresenceUser[]> {
    const hash = await pubClient.hGetAll(presenceKey(documentId));
    return Object.values(hash).map((v) => JSON.parse(v) as PresenceUser);
  }

  /**
   * Schedule a debounced DB persist.
   * userId is now required so we can create a version snapshot after saving.
   */
  scheduleSave(documentId: string, content: string, userId: string): void {
    const existing = this.pendingSaves.get(documentId);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(async () => {
      try {
        await documentService.updateContent(documentId, content);
        console.log(`[PresenceService] Persisted document ${documentId}`);

        // Create version snapshot after every successful persist
        await versionService.createSnapshot(documentId, userId);
        console.log(`[PresenceService] Snapshot created for document ${documentId}`);
      } catch (err) {
        console.error(`[PresenceService] Failed to persist ${documentId}:`, err);
      } finally {
        this.pendingSaves.delete(documentId);
      }
    }, config.debounceMs);

    this.pendingSaves.set(documentId, timeout);
  }
}

export const presenceService = new PresenceService();
