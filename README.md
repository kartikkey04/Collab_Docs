# Collab Docs — Real-time Collaborative Editing Backend

A production-grade Node.js backend for collaborative document editing, built with:
- **Fastify** — HTTP server
- **Socket.IO** — real-time WebSocket events
- **Redis** — pub/sub adapter for horizontal scaling
- **Prisma** — ORM for PostgreSQL

---

## Project structure

```
src/
├── config/
│   └── env.ts               ← All env vars validated at startup
├── types/
│   └── index.ts             ← Shared TypeScript types
├── services/
│   ├── db/
│   │   └── prisma.ts        ← Prisma singleton
│   └── redis/
│       └── redis.ts         ← Redis pub/sub clients
├── modules/
│   ├── document/
│   │   ├── document.service.ts   ← DB operations (business logic)
│   │   └── document.routes.ts    ← HTTP route handlers (thin)
│   └── websocket/
│       ├── presence.service.ts   ← In-memory presence + debounce
│       └── socket.handler.ts     ← Socket.IO event listeners
└── server.ts                ← App bootstrap only
```

---

## Quick start

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Install dependencies
npm install

# 3. Copy env and run migrations
cp .env.example .env
npm run db:migrate

# 4. Start dev server
npm run dev
```

---

## WebSocket events

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `document:join` | `documentId: string` |
| Client → Server | `document:update` | `{ documentId, content }` |
| Server → Client | `document:receive` | `content: string` |
| Server → Client | `presence:update` | `User[]` |

---

## Architecture decisions (interview talking points)

### Layered architecture
- **Routes** — parse HTTP request, call service, return response. No DB code.
- **Services** — all business logic. No knowledge of HTTP or WebSocket.
- **Infrastructure services** — Prisma + Redis clients as singletons.

This means: you can add GraphQL, gRPC, or a CLI without touching service logic.

### Debounced writes
WebSocket updates fire on every keystroke. Writing to Postgres on every keystroke would cause hundreds of DB writes/second. Instead:
- Broadcast the update immediately (low latency)
- Schedule a DB write that resets every time a new update arrives
- Only write after 2 seconds of silence

This is the "dirty flag + debounce" pattern used in Google Docs and similar apps.

### Redis adapter
Socket.IO's Redis adapter routes events between multiple server instances.
Without it, a user on Server A and a user on Server B editing the same document would never see each other's changes.

### In-memory presence vs Redis presence
Currently, presence (who is online) is in-memory per server. This works on a single instance. For multi-instance horizontal scaling, presence should also live in Redis (e.g. `SADD presence:{documentId} {socketId}` with TTL).

### Fail-fast config
`config/env.ts` validates required env vars at startup and throws immediately if they're missing. This is better than discovering a missing config value at runtime when a user hits an endpoint.

---

## What to add next (for interviews: "what would you improve?")

1. **Input validation** — Add `zod` schemas to route handlers
2. **Authentication** — JWT middleware on HTTP routes + socket handshake
3. **Operational Transforms or CRDTs** — True conflict-free concurrent editing (Y.js)
4. **Redis presence** — Move presence tracking to Redis for multi-instance support
5. **Tests** — Unit tests for services (mock Prisma), integration tests for routes
6. **Rate limiting** — Prevent a single socket from flooding updates
7. **Graceful shutdown** — Drain in-flight saves before process exit
