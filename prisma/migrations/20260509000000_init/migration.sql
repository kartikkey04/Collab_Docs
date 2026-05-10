-- =============================================================
-- CollabDocs — full baseline migration
-- All tables created in dependency order (no forward references)
-- =============================================================

-- ── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "Role" AS ENUM ('VIEWER', 'EDITOR');

-- ── User ───────────────────────────────────────────────────────────────────

CREATE TABLE "User" (
    "id"           TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl"    TEXT,
    "bio"          TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key"    ON "User"("email");
CREATE INDEX "User_createdAt_idx"       ON "User"("createdAt");

-- ── Document ────────────────────────────────────────────────────────────────

CREATE TABLE "Document" (
    "id"           TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "content"      TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"       TEXT NOT NULL,
    "searchVector" tsvector,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Document_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Document_userId_idx"            ON "Document"("userId");
CREATE INDEX "Document_updatedAt_idx"         ON "Document"("updatedAt" DESC);
CREATE INDEX "Document_userId_updatedAt_idx"  ON "Document"("userId", "updatedAt" DESC);
CREATE INDEX "Document_search_vector_idx"     ON "Document" USING GIN("searchVector");

-- Trigger: keep searchVector in sync with title + content
CREATE OR REPLACE FUNCTION document_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "Document"
  FOR EACH ROW EXECUTE FUNCTION document_search_vector_update();

-- ── DocumentCollaborator ────────────────────────────────────────────────────

CREATE TABLE "DocumentCollaborator" (
    "id"         TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "role"       "Role" NOT NULL DEFAULT 'VIEWER',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentCollaborator_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DocumentCollaborator_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentCollaborator_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DocumentCollaborator_documentId_idx"        ON "DocumentCollaborator"("documentId");
CREATE INDEX "DocumentCollaborator_userId_idx"            ON "DocumentCollaborator"("userId");
CREATE UNIQUE INDEX "DocumentCollaborator_documentId_userId_key"
    ON "DocumentCollaborator"("documentId", "userId");

-- ── DocumentVersion ─────────────────────────────────────────────────────────

CREATE TABLE "DocumentVersion" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "documentId" TEXT NOT NULL,
    "content"    TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"  TEXT NOT NULL,
    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DocumentVersion_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentVersion_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DocumentVersion_documentId_createdAt_idx"
    ON "DocumentVersion"("documentId", "createdAt" DESC);

-- ── CommentThread ────────────────────────────────────────────────────────────

CREATE TABLE "CommentThread" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "documentId" TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "selection"  TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentThread_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommentThread_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentThread_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CommentThread_documentId_createdAt_idx"
    ON "CommentThread"("documentId", "createdAt");

-- ── Comment ──────────────────────────────────────────────────────────────────

CREATE TABLE "Comment" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "threadId"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "editedAt"  TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Comment_threadId_fkey"
        FOREIGN KEY ("threadId") REFERENCES "CommentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Comment_threadId_createdAt_idx" ON "Comment"("threadId", "createdAt");

-- ── ShareToken ───────────────────────────────────────────────────────────────

CREATE TABLE "ShareToken" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "token"      TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "documentId" TEXT NOT NULL,
    "role"       "Role" NOT NULL DEFAULT 'VIEWER',
    "expiresAt"  TIMESTAMP(3),
    "createdBy"  TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt"  TIMESTAMP(3),
    CONSTRAINT "ShareToken_pkey"      PRIMARY KEY ("id"),
    CONSTRAINT "ShareToken_token_key" UNIQUE ("token"),
    CONSTRAINT "ShareToken_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShareToken_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ShareToken_documentId_idx" ON "ShareToken"("documentId");
CREATE INDEX "ShareToken_token_idx"      ON "ShareToken"("token");

-- ── PasswordResetToken ────────────────────────────────────────────────────────

CREATE TABLE "PasswordResetToken" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "token"     TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "userId"    TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey"      PRIMARY KEY ("id"),
    CONSTRAINT "PasswordResetToken_token_key" UNIQUE ("token"),
    CONSTRAINT "PasswordResetToken_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PasswordResetToken_token_idx"  ON "PasswordResetToken"("token");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
