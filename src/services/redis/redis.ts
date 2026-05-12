/**
 * src/services/redis/redis.ts
 *
 * Redis pub/sub clients used by the Socket.IO Redis adapter.
 * The adapter requires two separate clients: one for publishing,
 * one for subscribing — they cannot share the same connection.
 *
 * Using config/env.ts here instead of hardcoding the URL is what
 * separates a portfolio project from a production-ready one.
 */

import { createClient } from "redis";
import { config } from "../../config/env.js";

export const pubClient = createClient({ url: config.redisUrl });
export const subClient = pubClient.duplicate();
export const redisClient = pubClient.duplicate();

// Helper to connect all clients
export async function connectRedis() {
  await Promise.all([
    pubClient.connect(),
    subClient.connect(),
    redisClient.connect()
  ]);
}
