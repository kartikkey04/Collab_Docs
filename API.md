# CollabDocs API Reference

All HTTP endpoints are prefixed with the server base URL (default `http://localhost:5000`).  
Protected routes require `Authorization: Bearer <jwt>`.

---

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | ✗ | Register a new user |
| POST | `/auth/login` | ✗ | Login, returns JWT |
| POST | `/auth/forgot-password` | ✗ | Send password reset email |
| POST | `/auth/reset-password` | ✗ | Apply reset token + new password |

### POST /auth/register
```json
{ "email": "user@example.com", "name": "Alice", "password": "secret123" }
```
Response `201`: `{ token, user: { id, email, name } }`

### POST /auth/forgot-password
```json
{ "email": "user@example.com" }
```
Always `200` — never reveals if email exists. Reset link logged to console in dev if SMTP not configured.

### POST /auth/reset-password
```json
{ "token": "<uuid from email>", "password": "newpassword123" }
```

---

## Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | ✓ | Get own profile |
| PATCH | `/users/me` | ✓ | Update name / bio / avatarUrl |
| GET | `/users/me/shared` | ✓ | Documents shared with me |

### PATCH /users/me
```json
{ "name": "Alice B.", "bio": "Engineer", "avatarUrl": "https://..." }
```

---

## Documents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/documents` | ✓ | List own documents |
| POST | `/documents` | ✓ | Create document |
| GET | `/documents/:id` | ✓ | Get document (owner or collaborator) |
| PATCH | `/documents/:id` | ✓ | Update title |
| DELETE | `/documents/:id` | ✓ | Delete document (owner only) |
| GET | `/documents/:id/collaborators` | ✓ | List collaborators |
| POST | `/documents/:id/collaborators` | ✓ | Invite collaborator by email |
| DELETE | `/documents/:id/collaborators/:uid` | ✓ | Remove collaborator |

---

## Version History

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/documents/:id/versions` | ✓ | List snapshots (no content) |
| GET | `/documents/:id/versions/:vid` | ✓ | Get full content of one version |
| POST | `/documents/:id/versions` | ✓ | Manually trigger a snapshot |
| POST | `/documents/:id/versions/:vid/restore` | ✓ | Restore version (snapshots current first) |

Snapshots are also created automatically after every debounced save.

---

## Comments & Threads

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/documents/:id/threads` | ✓ | List open threads (add `?includeResolved=true` for all) |
| POST | `/documents/:id/threads` | ✓ | Create thread + opening comment |
| POST | `/documents/:id/threads/:tid/replies` | ✓ | Add reply |
| PATCH | `/documents/:id/threads/:tid/resolve` | ✓ | Resolve thread |
| PATCH | `/documents/:id/threads/:tid/unresolve` | ✓ | Reopen thread |
| PATCH | `/comments/:cid` | ✓ | Edit own comment |
| DELETE | `/comments/:cid` | ✓ | Soft-delete comment |

### POST /documents/:id/threads
```json
{
  "body": "Should we expand this section?",
  "selection": { "from": 120, "to": 145, "text": "selected text" }
}
```

---

## Share Tokens (Public Links)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/documents/:id/share-tokens` | ✓ Owner | Create share link |
| GET | `/documents/:id/share-tokens` | ✓ Owner | List active tokens |
| DELETE | `/documents/:id/share-tokens/:tid` | ✓ Owner | Revoke token |
| GET | `/shared/:token` | ✗ Public | Resolve token → document |

### POST /documents/:id/share-tokens
```json
{ "role": "VIEWER", "expiresIn": "7d" }
```
`expiresIn` values: `"1h"` | `"24h"` | `"7d"` | `"30d"` | `"never"`

### GET /shared/:token (public)
Returns `{ document: { id, title, content, updatedAt }, role }` or an error.

---

## Search

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/search?q=<query>&limit=20` | ✓ | Full-text search across owned + shared docs |

Response: `[{ id, title, updatedAt, rank, headline, isOwner }]`  
`headline` contains `<mark>…</mark>` tags around matching text.

---

## AI Writing Assistant

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/ai/action` | ✓ | Stream AI action via SSE |

### POST /ai/action
```json
{
  "documentId": "<uuid>",
  "action": "rewrite",
  "selection": "The quick brown fox jumps...",
  "instruction": "Make it more formal"
}
```
Actions: `"rewrite"` | `"summarise"` | `"autocomplete"` | `"fix_grammar"`

**Response:** `text/event-stream`
```
data: "The" 
data: " swift"
data: " auburn"
...
data: [DONE]
```

**Frontend usage:**
```typescript
const res = await fetch('/ai/action', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ documentId, action, selection }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  for (const line of chunk.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') return;
    output += JSON.parse(data);
  }
}
```

---

## WebSocket Events (Socket.IO)

Connect with `io(url, { auth: { token: '<jwt>' } })`.

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `document:join` | `documentId: string` | Join a document room |
| `document:update` | `{ documentId, content }` | Broadcast content change |
| `comment:create` | `{ documentId, body, selection? }` | Create comment thread |
| `comment:reply` | `{ documentId, threadId, body }` | Reply to thread |
| `comment:resolve` | `{ documentId, threadId }` | Resolve thread |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `document:receive` | `content: string` | Content update from another user |
| `presence:update` | `PresenceUser[]` | Current users in the document |
| `comment:new_thread` | `CommentThread` | New thread created |
| `comment:new_reply` | `{ threadId, comment }` | New reply added |
| `comment:resolved` | `{ threadId, resolvedBy }` | Thread resolved |
| `error` | `{ message }` | Error from the server |

---

## Error format

All errors follow:
```json
{ "error": "Human-readable message" }
```
Validation errors:
```json
{ "error": { "fieldErrors": { "email": ["Invalid email address"] }, "formErrors": [] } }
```
